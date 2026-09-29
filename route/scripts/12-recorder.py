#!/usr/bin/env python3
"""FPV 录制专用本地服务：静态托管 app.html（让页面里的相对 fetch('/__snap') 能落到本地）+
   接收离屏帧上传。

  GET  /fpv/app.html           → 静态文件（根目录 /var/minis/workspace）
  POST /__snap?name=f_00001.jpg → 帧落盘到 FRAMES 目录
启动：setsid nohup python3 fpv_server.py > fpv_server.log 2>&1 < /dev/null &
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

PORT = int(os.environ.get("FPV_PORT", "8766"))
ROOT = os.environ.get("FPV_ROOT", "/var/minis/workspace")
FRAMES = os.environ.get("FPV_DIR", "/var/minis/workspace/fpv/frames")
os.makedirs(FRAMES, exist_ok=True)

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg", ".png": "image/png", ".npy": "application/octet-stream",
        ".mp4": "video/mp4"}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, HEAD")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def do_HEAD(self):
        self._serve(head=True)

    def do_GET(self):
        p = unquote(urlparse(self.path).path)
        if p in ("/", "/health"):
            body = b"fpv server up\n"
            self.send_response(200); self._cors(); self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body))); self.end_headers()
            self.wfile.write(body)
            return
        self._serve()

    def _serve(self, head=False):
        p = unquote(urlparse(self.path).path).lstrip("/")
        path = os.path.normpath(os.path.join(ROOT, p))
        if not path.startswith(ROOT) or not os.path.isfile(path):
            self.send_response(404); self._cors(); self.send_header("Content-Length", "0"); self.end_headers()
            return
        size = os.path.getsize(path)
        ext = os.path.splitext(path)[1].lower()
        self.send_response(200); self._cors()
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if head:
            return
        with open(path, "rb") as f:
            while True:
                b = f.read(1 << 20)
                if not b:
                    break
                try:
                    self.wfile.write(b)
                except Exception:
                    return

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = os.path.basename((q.get("name") or ["frame.jpg"])[0]) or "frame.jpg"
        n = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(n) if n else b""
        with open(os.path.join(FRAMES, name), "wb") as f:
            f.write(data)
        if not name.endswith(("_probe.jpg", "_test.jpg")):
            sys.stdout.write("[frame] %-18s %8d B\n" % (name, len(data)))
            sys.stdout.flush()
        body = b"ok\n"
        self.send_response(200); self._cors()
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("fpv server on 127.0.0.1:%d  root=%s  frames=%s" % (PORT, ROOT, FRAMES), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
