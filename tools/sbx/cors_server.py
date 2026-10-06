"""Serves this card's folder with CORS (and private-network) headers, so the live sandbox shell on
project0.city can load a locally built bundle: python tools/sbx/cors_server.py [port]"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class H(SimpleHTTPRequestHandler):
    # /exp/ is the experience folder, with the local bundle (tools/sbx/bundle.js) at /exp/bundle.js
    def translate_path(self, path):
        if path.split('?')[0] == '/exp/bundle.js':
            path = '/tools/sbx/bundle.js'
        elif path.startswith('/exp/'):
            path = '/experience/' + path[5:]
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8384), H).serve_forever()
