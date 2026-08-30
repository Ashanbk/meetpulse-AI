# tunnel.py - Instant 1-Click Worldwide Public HTTPS Access for Meetpulse AI
# Shares your workspace with anyone across the globe on mobile data or any Wi-Fi.

import subprocess
import sys
import time
import os
import urllib.request

PORT = 5000

def check_server():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=2) as res:
            return res.status == 200
    except Exception:
        return False

def main():
    print("=" * 70)
    print("  MEETPULSE AI — WORLDWIDE PUBLIC LIVE ONLINE ACCESS")
    print("=" * 70)

    server_process = None
    if not check_server():
        print(f"[*] Starting local Meetpulse server on port {PORT}...")
        server_process = subprocess.Popen([sys.executable, "server.py"], cwd=os.path.dirname(os.path.abspath(__file__)))
        time.sleep(2)
    else:
        print(f"[*] Local server is already running on port {PORT}.")

    print("[*] Generating instant public HTTPS tunnel for remote teammates...")
    print("[*] Command: npx localtunnel --port 5000")
    print("-" * 70)
    print("Share the public URL below with anyone across the globe on any device:")
    print("-" * 70)

    try:
        tunnel_process = subprocess.Popen(["npx", "-y", "localtunnel", "--port", str(PORT)], shell=True)
        tunnel_process.wait()
    except KeyboardInterrupt:
        print("\n[*] Stopping tunnel...")
    finally:
        if server_process:
            server_process.terminate()

if __name__ == "__main__":
    main()
