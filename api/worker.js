const SUPPORTED_DOMAINS = [
  "terabox.com",
  "1024terabox.com",
  "teraboxapp.com",
  "teraboxlink.com",
  "terasharelink.com",
  "terafileshare.com",
  "www.1024tera.com",
  "1024tera.com",
  "1024tera.cn",
  "teraboxdrive.com",
  "dubox.com"
];

const COOKIES = {
  'ndut_fmt': '082E0D57C65BDC31F6FF293F5D23164958B85D6952CCB6ED5D8A3870CB302BE7',
  'ndus': 'Y-wWXKyteHuigAhC03Fr4bbee-QguZ4JC6UAdqap',
  '__bid_n': '196ce76f980a5dfe624207',
  '__stripe_mid': '148f0bd1-59b1-4d4d-8034-6275095fc06f99e0e6',
  '__stripe_sid': '7b425795-b445-47da-b9db-5f12ec8c67bf085e26',
  'browserid': 'veWFJBJ9hgVgY0eI9S7yzv66aE28f3als3qUXadSjEuICKF1WWBh4inG3KAWJsAYMkAFpH2FuNUum87q',
  'csrfToken': 'wlv_WNcWCjBtbNQDrHSnut2h',
  'lang': 'en',
  'PANWEB': '1',
  'ab_sr': '1.0.1_NjA1ZWE3ODRiYjJiYjZkYjQzYjU4NmZkZGVmOWYxNDg4MjU3ZDZmMTg0Nzg4MWFlNzQzZDMxZWExNmNjYzliMGFlYjIyNWUzYzZiODQ1Nzg3NWM0MzIzNWNiYTlkYTRjZTc0ZTc5ODRkNzg4NDhiMTljOGRiY2I4MzY4ZmYyNTU5ZDE5NDczZmY4NjJhMDgyNjRkZDI2MGY5M2Q5YzIyMg=='
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Priority': 'u=0, i',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function formatCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function formatFileSize(bytes) {
  if (!bytes) return "Unknown";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(2) + ' KB';
  return bytes + ' B';
}

function extractTokens(html) {
  // Extract jsToken
  const tokenMatch = /fn\(["'](.*?)["']\)/.exec(html) || /fn%28%22(.*?)%22%29/.exec(html);
  if (!tokenMatch) throw new Error('jsToken extraction failed');
  const jsToken = tokenMatch[1];
  
  // Extract log_id
  const logIdMatch = /dp-logid=([^&'"]+)/.exec(html);
  if (!logIdMatch) throw new Error('log_id extraction failed');
  const logId = logIdMatch[1];
  
  return { jsToken, logId };
}

function getSurl(url) {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split('/');
  
  // Try to find surl in path
  const sIndex = pathParts.indexOf('s');
  if (sIndex !== -1 && sIndex < pathParts.length - 1) {
    return pathParts[sIndex + 1];
  }
  
  // Try to find sharing/link pattern
  const sharingIndex = pathParts.indexOf('sharing');
  if (sharingIndex !== -1 && 
      sharingIndex < pathParts.length - 2 && 
      pathParts[sharingIndex + 1] === 'link') {
    return pathParts[sharingIndex + 2];
  }
  
  // Try to extract from query params
  const surlParam = parsed.searchParams.get('surl');
  if (surlParam) return surlParam;
  
  throw new Error('surl extraction failed');
}

async function getDirectLink(url) {
  try {
    const headResp = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Cookie': formatCookieHeader(COOKIES),
        ...HEADERS
      },
      redirect: 'manual'
    });
    
    if (headResp.status >= 300 && headResp.status < 400) {
      return headResp.headers.get('Location') || url;
    }
    return url;
  } catch (e) {
    return url;
  }
}

async function handleAPIRequest(request) {
  try {
    const url = new URL(request.url);
    const teraboxUrl = url.searchParams.get('url');
    
    if (!teraboxUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate domain
    const domainValid = SUPPORTED_DOMAINS.some(domain => 
      new URL(teraboxUrl).hostname.includes(domain)
    );
    
    if (!domainValid) {
      return new Response(JSON.stringify({ 
        error: 'Unsupported domain',
        supported_domains: SUPPORTED_DOMAINS 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Fetch initial page with cookies
    const response = await fetch(teraboxUrl, {
      headers: {
        ...HEADERS,
        'Cookie': formatCookieHeader(COOKIES)
      }
    });
    
    if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`);
    
    const html = await response.text();
    
    // Step 2: Extract tokens
    const { jsToken, logId } = extractTokens(html);
    
    // Step 3: Extract surl
    const surl = getSurl(response.url);
    
    // Step 4: Prepare API parameters
    const apiParams = new URLSearchParams({
      'app_id': '250528',
      'web': '1',
      'channel': 'dubox',
      'clienttype': '0',
      'jsToken': jsToken,
      'dplogid': logId,
      'page': '1',
      'num': '20',
      'order': 'time',
      'desc': '1',
      'site_referer': response.url,
      'shorturl': surl,
      'root': '1'
    });
    
    // Step 5: Fetch file list from API
    const apiUrl = `https://www.1024tera.com/share/list?${apiParams.toString()}`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        ...HEADERS,
        'Cookie': formatCookieHeader(COOKIES),
        'Referer': response.url
      }
    });
    
    if (!apiResponse.ok) throw new Error(`API request failed: ${apiResponse.status}`);
    
    const apiData = await apiResponse.json();
    if (!apiData.list || apiData.list.length === 0) {
      throw new Error('No files found in shared link');
    }
    
    // Handle folders (only process first file for simplicity)
    let fileData = apiData.list[0];
    if (fileData.isdir === "1") {
      // Fetch folder contents
      const folderParams = new URLSearchParams(apiParams);
      folderParams.set('dir', fileData.path);
      folderParams.set('order', 'asc');
      folderParams.set('by', 'name');
      folderParams.delete('desc');
      folderParams.delete('root');
      
      const folderApiUrl = `https://www.1024tera.com/share/list?${folderParams.toString()}`;
      const folderResponse = await fetch(folderApiUrl, {
        headers: {
          ...HEADERS,
          'Cookie': formatCookieHeader(COOKIES),
          'Referer': response.url
        }
      });
      
      if (!folderResponse.ok) throw new Error('Folder request failed');
      const folderData = await folderResponse.json();
      
      if (!folderData.list || folderData.list.length === 0) {
        throw new Error('No files in folder');
      }
      
      // Get first file in folder
      fileData = folderData.list.find(item => item.isdir !== "1") || folderData.list[0];
    }
    
    // Get direct download link
    const directDownloadUrl = await getDirectLink(fileData.dlink);
    
    // Create worker endpoints
    const workerUrl = new URL(request.url);
    
    workerUrl.pathname = '/proxy';
    workerUrl.search = `?url=${encodeURIComponent(directDownloadUrl)}&file_name=${encodeURIComponent(fileData.server_filename)}`;
    const proxyUrl = workerUrl.toString();
    
    workerUrl.pathname = '/stream';
    const streamUrl = workerUrl.toString();
    
    // Prepare response
    const sizeBytes = parseInt(fileData.size) || 0;
    
    const result = {
      file_name: fileData.server_filename,
      file_size: formatFileSize(sizeBytes),
      size_bytes: sizeBytes,
      download_link: directDownloadUrl,
      thumbnail: fileData.thumbs?.url1 || fileData.thumbs?.url2 || fileData.thumbs?.url3 || '',
      proxy_url: proxyUrl,
      streaming_url: streamUrl,
      status: "✅ Successfully",
      developer: "WOODcraft"
    };
    
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      status: "❌ Failed",
      error: error.message,
      developer: "WOODcraft"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleProxyRequest(request) {
  try {
    const url = new URL(request.url);
    const fileUrl = decodeURIComponent(url.searchParams.get('url'));
    const fileName = decodeURIComponent(url.searchParams.get('file_name') || 'download');
    
    if (!fileUrl) throw new Error('Missing URL parameter');
    
    const response = await fetch(fileUrl, {
      headers: {
        ...HEADERS,
        'Cookie': formatCookieHeader(COOKIES),
        'Referer': 'https://www.1024tera.com/'
      }
    });
    
    if (!response.ok) throw new Error(`File fetch failed: ${response.status}`);
    
    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.delete('Content-Security-Policy');
    
    return new Response(response.body, {
      status: response.status,
      headers
    });
    
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}

async function handleStreamRequest(request) {
  try {
    const url = new URL(request.url);
    const fileUrl = decodeURIComponent(url.searchParams.get('url'));
    const fileName = decodeURIComponent(url.searchParams.get('file_name') || 'stream');
    
    if (!fileUrl) throw new Error('Missing URL parameter');
    
    // Handle range requests
    const headers = { 
      ...HEADERS,
      'Cookie': formatCookieHeader(COOKIES),
      'Referer': 'https://www.1024tera.com/'
    };
    
    const range = request.headers.get('Range');
    if (range) headers['Range'] = range;
    
    const response = await fetch(fileUrl, { headers });
    
    if (!response.ok) throw new Error(`Stream fetch failed: ${response.status}`);
    
    const resHeaders = new Headers(response.headers);
    resHeaders.set('Content-Disposition', `inline; filename="${fileName}"`);
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.delete('Content-Security-Policy');
    
    // Handle partial content
    if (response.status === 206) {
      resHeaders.set('Content-Range', response.headers.get('Content-Range'));
    }
    
    return new Response(response.body, {
      status: response.status,
      headers: resHeaders
    });
    
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Route requests
    if (url.pathname === '/api') {
      return handleAPIRequest(request);
    }
    
    if (url.pathname === '/proxy') {
      return handleProxyRequest(request);
    }
    
    if (url.pathname === '/stream') {
      return handleStreamRequest(request);
    }
    
    // Default response
    return new Response(JSON.stringify({
      message: 'Terabox API Worker',
      endpoints: {
        metadata: '/api?url=TERABOX_SHARE_URL',
        proxy: '/proxy?url=FILE_URL&file_name=FILENAME',
        stream: '/stream?url=FILE_URL&file_name=FILENAME'
      },
      developer: "WOODcraft"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
