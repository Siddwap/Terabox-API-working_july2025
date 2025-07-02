from flask import Flask, request, jsonify, redirect
import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urlparse, parse_qs

app = Flask(__name__)

# Your cookies (update periodically)
COOKIES = {
    "csrfToken": "JB6Qt1KavdeEijUoFsAawyIg",
    "browserid": "J1DNiX8018NdK2YzF1tRQtkJxfyBKt1szzKTR7JOJFaqgiVCtC1KSjcFY-s=",
    "lang": "en",
    "TSID": "r2KqDt3T2K1wUXGw28rV5uljFul78D8a",
    "__bid_n": "197b008c53344f9fde4207",
    "ndus": "YQhUH3CteHui30e3PSkYpUbfvDBILTdVQqYbPzaz",
    "ndut_fmt": "0328C7D65A77EDE42D5163C381DE13C8FC7B0A69C332B7FC6FD35534F574FECB"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": " https://www.google.com/ ",
}


def get_direct_link(tera_share_url):
    session = requests.Session()
    res = session.get(tera_share_url, headers=HEADERS, cookies=COOKIES)

    if res.status_code != 200:
        return None, f"Failed with status {res.status_code}"

    # --- Extract File Name ---
    filename_match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', res.text)
    file_name = filename_match.group(1).strip() if filename_match else "Unknown_File"

    # --- Extract Direct Link Parameters ---
    fid_match = re.search(r'fid\s*:\s*"([^"]+)"', res.text)
    expires_match = re.search(r'expires\s*:\s*"([^"]+)"', res.text)
    sign_match = re.search(r'sign\s*:\s*"([^"]+)"', res.text)
    timestamp_match = re.search(r'timestamp\s*:\s*"([^"]+)"', res.text)

    if not all([fid_match, expires_match, sign_match]):
        return None, "Could not extract required parameters"

    fid = fid_match.group(1)
    expires = expires_match.group(1)
    sign = sign_match.group(1)
    timestamp = timestamp_match.group(1) if timestamp_match else ""

    # Build final direct download/stream link
    direct_link = (
        f"https://d.terabox.app/file/849134d8580a8b98f8dbc08fb340e564?"
        f"fid={fid}&dstime={timestamp}&rt=sh&sign={sign}&expires={expires}"
    )

    # --- Get File Size from HEAD Request ---
    try:
        head_res = session.head(direct_link, allow_redirects=True)
        file_size = int(head_res.headers.get('Content-Length', 0))
    except:
        file_size = 0

    return {
        "file_name": file_name,
        "direct_link": direct_link,
        "file_size": file_size,
        "formatted_size": format_size(file_size),
        "stream_url": direct_link  # same as direct link for now
    }, "Success"


def format_size(size_bytes):
    """Convert bytes to human-readable format"""
    if size_bytes <= 0:
        return "0 B"
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    i = 0
    while size_bytes >= 1024:
        size_bytes /= 1024
        i += 1
    return f"{size_bytes:.2f} {units[i]}"


@app.route("/web")
def web_view():
    tera_share_url = request.args.get("link")

    if not tera_share_url:
        return "Missing 'link' parameter", 400

    result, msg = get_direct_link(tera_share_url)

    if not result:
        return f"<h2>Error: {msg}</h2>", 500

    return f"""
    <html>
      <body style="font-family:sans-serif;padding:2em;">
        <h1>📄 File Details</h1>
        <div style="background:#f4f4f4;padding:1em;border-radius:8px;margin-bottom:1em;">
          <strong>File Name:</strong> {result['file_name']}<br/>
          <strong>File Size:</strong> {result['formatted_size']}<br/>
        </div>
        <h2>🔗 Direct Download Link</h2>
        <div style="background:#f4f4f4;padding:1em;border-radius:8px;word-break:break-all;">
          <a href="{result['direct_link']}" target="_blank">{result['direct_link']}</a>
        </div>
      </body>
    </html>
    """


@app.route("/link")
def api_view():
    tera_share_url = request.args.get("link")

    if not tera_share_url:
        return jsonify({"error": "Missing 'link' parameter"}), 400

    result, msg = get_direct_link(tera_share_url)

    if not result:
        return jsonify({"error": msg}), 500

    # Optional redirect
    if request.args.get("redirect") == "1":
        return redirect(result["direct_link"])

    return jsonify({
        "file_name": result["file_name"],
        "file_size": result["file_size"],
        "formatted_size": result["formatted_size"],
        "direct_link": result["direct_link"],
        "stream_url": result["stream_url"],
        "status": "success"
    })


if __name__ == "__main__":
    app.run(debug=True)
