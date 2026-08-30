# server.py - Central HTTP & Live Real-Time Multi-Device Sync Server for Meetpulse AI
# Enables live cross-device user sync, meeting stream communication, kanban tasks, and email notifications.

import http.server
import socketserver
import os
import sys
import json
import socket
import urllib.parse
import time

PORT = int(os.environ.get('PORT', 5000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, 'data')

USERS_FILE = os.path.join(DATA_DIR, 'users.json')
CHAT_FILE = os.path.join(DATA_DIR, 'chat.json')
TASKS_FILE = os.path.join(DATA_DIR, 'tasks.json')
INBOX_FILE = os.path.join(DATA_DIR, 'inbox.json')
EMAILS_FILE = os.path.join(DATA_DIR, 'emails.json')

os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_USERS = [
    {
        "id": "user-admin-1",
        "email": "admin@meetpulse.ai",
        "password": "admin123",
        "name": "Administrator",
        "role": "Administrator",
        "avatar": "AD",
        "department": "Executive Operations",
        "isAdmin": True,
        "activeTasks": 0,
        "reliabilityScore": 100
    }
]

def load_json_file(filepath, default):
    if not os.path.exists(filepath):
        save_json_file(filepath, default)
        return default
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[!] Error loading {filepath}: {e}")
        return default

def save_json_file(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[!] Error saving {filepath}: {e}")
        return False

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class MeetpulseLiveHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def send_json_response(self, data, status_code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/health':
            self.send_json_response({
                "status": "online",
                "service": "Meetpulse Real-Time Live Sync Engine",
                "version": "2.2.0",
                "timestamp": time.time()
            })
            return

        if path == '/api/users':
            users = load_json_file(USERS_FILE, DEFAULT_USERS)
            self.send_json_response(users)
            return

        if path == '/api/chat':
            chat = load_json_file(CHAT_FILE, [])
            self.send_json_response(chat)
            return

        if path == '/api/tasks':
            tasks = load_json_file(TASKS_FILE, [])
            inbox = load_json_file(INBOX_FILE, [])
            self.send_json_response({"tasks": tasks, "inbox": inbox})
            return

        if path == '/api/emails':
            emails = load_json_file(EMAILS_FILE, [])
            self.send_json_response(emails)
            return

        if path == '/api/sync' or path == '/api/live-sync':
            users = load_json_file(USERS_FILE, DEFAULT_USERS)
            chat = load_json_file(CHAT_FILE, [])
            tasks = load_json_file(TASKS_FILE, [])
            inbox = load_json_file(INBOX_FILE, [])
            emails = load_json_file(EMAILS_FILE, [])
            self.send_json_response({
                "users": users,
                "chat": chat,
                "tasks": tasks,
                "inbox": inbox,
                "emails": emails,
                "serverTime": time.time()
            })
            return

        # Serve static web application files
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'

        try:
            req_data = json.loads(post_data)
        except Exception:
            req_data = {}

        if path == '/api/auth/login':
            email = (req_data.get('email') or '').strip().lower()
            password = (req_data.get('password') or '').strip()

            users = load_json_file(USERS_FILE, DEFAULT_USERS)
            user = next((u for u in users if u.get('email', '').strip().lower() == email), None)

            if not user:
                self.send_json_response({"success": False, "message": f"No account found for '{email}'"}, 401)
                return

            if user.get('password') != password:
                self.send_json_response({"success": False, "message": "Incorrect password"}, 401)
                return

            self.send_json_response({"success": True, "user": user})
            return

        if path == '/api/users':
            users = load_json_file(USERS_FILE, DEFAULT_USERS)
            new_user = req_data

            if not new_user.get('email'):
                self.send_json_response({"error": "Email is required"}, 400)
                return

            email = new_user['email'].strip().lower()
            idx = next((i for i, u in enumerate(users) if u.get('email', '').strip().lower() == email), None)

            if idx is not None:
                users[idx].update(new_user)
            else:
                users.append(new_user)

            save_json_file(USERS_FILE, users)
            print(f"[+] Synced user account across devices: {new_user.get('name')} <{email}>")
            self.send_json_response({"success": True, "users": users, "user": new_user})
            return

        if path == '/api/chat':
            chat = load_json_file(CHAT_FILE, [])
            if isinstance(req_data, list):
                chat = req_data
            elif isinstance(req_data, dict) and req_data:
                chat.append(req_data)
                # Keep last 200 messages in stream
                if len(chat) > 200:
                    chat = chat[-200:]
            save_json_file(CHAT_FILE, chat)
            self.send_json_response({"success": True, "chat": chat})
            return

        if path == '/api/tasks':
            if 'tasks' in req_data and isinstance(req_data['tasks'], list):
                save_json_file(TASKS_FILE, req_data['tasks'])
            if 'inbox' in req_data and isinstance(req_data['inbox'], list):
                save_json_file(INBOX_FILE, req_data['inbox'])
            self.send_json_response({"success": True})
            return

        if path == '/api/emails':
            emails = load_json_file(EMAILS_FILE, [])
            if isinstance(req_data, list):
                emails = req_data
            elif isinstance(req_data, dict) and req_data:
                emails.unshift(req_data) if hasattr(emails, 'unshift') else emails.insert(0, req_data)
                if len(emails) > 150:
                    emails = emails[:150]
            save_json_file(EMAILS_FILE, emails)
            self.send_json_response({"success": True, "emails": emails})
            return

        if path == '/api/sync':
            if 'users' in req_data and isinstance(req_data['users'], list):
                save_json_file(USERS_FILE, req_data['users'])
            if 'chat' in req_data and isinstance(req_data['chat'], list):
                save_json_file(CHAT_FILE, req_data['chat'])
            if 'tasks' in req_data and isinstance(req_data['tasks'], list):
                save_json_file(TASKS_FILE, req_data['tasks'])
            if 'inbox' in req_data and isinstance(req_data['inbox'], list):
                save_json_file(INBOX_FILE, req_data['inbox'])
            if 'emails' in req_data and isinstance(req_data['emails'], list):
                save_json_file(EMAILS_FILE, req_data['emails'])
            self.send_json_response({"success": True, "message": "Synchronized"})
            return

        self.send_json_response({"error": "Endpoint not found"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/users/'):
            user_id = path.split('/api/users/')[1].strip()
            users = load_json_file(USERS_FILE, DEFAULT_USERS)
            filtered = [u for u in users if u.get('id') != user_id and u.get('email') != user_id]

            if len(filtered) < len(users):
                save_json_file(USERS_FILE, filtered)
                print(f"[-] Deleted user account across devices: {user_id}")
                self.send_json_response({"success": True, "users": filtered})
            else:
                self.send_json_response({"error": "User not found"}, 404)
            return

        self.send_json_response({"error": "Endpoint not found"}, 404)

def run_server(port=PORT):
    candidate_ports = [port, 5001, 8000, 8080, 3000]
    httpd = None
    actual_port = None

    for p in candidate_ports:
        try:
            httpd = socketserver.TCPServer(("0.0.0.0", p), MeetpulseLiveHandler)
            actual_port = p
            break
        except OSError:
            continue

    if not httpd:
        print("[!] Error: Could not bind to any available port.")
        sys.exit(1)

    local_ip = get_local_ip()
    print("=" * 70)
    print("  MEETPULSE LIVE MULTI-DEVICE ONLINE COLLABORATION SERVER")
    print("=" * 70)
    print(f"[*] Local Access:       http://localhost:{actual_port}")
    print(f"[*] Other Devices (LAN): http://{local_ip}:{actual_port}  <-- USE ON OTHER PHONES/PCs")
    print(f"[*] User Database:      {USERS_FILE}")
    print("=" * 70)
    print("Real-time live sync is ACTIVE for users, chat stream, tasks, and emails.")
    print("Press Ctrl+C to stop the server.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped gracefully.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
