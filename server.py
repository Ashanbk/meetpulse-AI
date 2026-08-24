# server.py - Lightweight HTTP server for CommitPulse AI
import http.server
import socketserver
import os
import sys

PORT = 5000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def run_server(port=PORT):
    candidate_ports = [port, 5001, 8000, 8080, 3000]
    httpd = None
    actual_port = None

    for p in candidate_ports:
        try:
            httpd = socketserver.TCPServer(("", p), Handler)
            actual_port = p
            break
        except OSError:
            continue

    if not httpd:
        print("[!] Error: Could not bind to any available port.")
        sys.exit(1)

    print(f"[*] CommitPulse AI Server running at http://localhost:{actual_port}")
    print(f"[*] Serving directory: {DIRECTORY}")
    print("Press Ctrl+C to stop the server.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped gracefully.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
