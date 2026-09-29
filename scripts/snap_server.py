#!/usr/bin/env python3
"""本地落盘小服务：接收页面里 canvas 导出的无损 PNG（或任意二进制）。

  POST /__snap?name=hero.png   body = PNG 原始字节 或 "data:image/png;base64,...."
  GET  /                      健康检查

启动：setsid nohup python3 snap_server.py > snap_server.log 2>&1 < /dev/null &
默认端口 8765，落盘目录 ./snaps/
"""
import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("SNAP_PORT", "8765"))
OUT = os.environ.get("SNAP_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "snaps"))
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        body = b"snap server up\n"
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = os.path.basename((q.get("name") or ["snap.png"])[0]) or "snap.png"
        n = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(n) if n else b""
        if data[:5] == b"data:" and b";base64," in data[:64]:
            data = base64.b64decode(data.split(b";base64,", 1)[1])
        path = os.path.join(OUT, name)
        with open(path, "wb") as f:
            f.write(data)
        try:
            from PIL import Image
            im = Image.open(path)
            info = "%s %s" % (im.size, im.format)
        except Exception:
            info = "?"
        sys.stdout.write("[snap] %-24s %8d B  %s\n" % (name, len(data), info))
        sys.stdout.flush()
        body = b"ok %d\n" % len(data)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("snap server on 127.0.0.1:%d -> %s" % (PORT, OUT), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
