# Meetpulse AI — Real-Time Meeting & Communication Commitment Intelligence

> **Never drop a promise again.** Meetpulse listens to team meetings, client calls, emails, and chat discussions to automatically detect commitments, assign owners, extract deadlines, and track deliverables to completion with live multi-device synchronization worldwide.

---

## ⚡ Core Capabilities

1. **Real-Time Detection**: Extracts promises, deadlines, and assigned owners from live transcripts, emails, and chat streams.
2. **Multi-Device Live Sync**: Admin & employee accounts, chat stream communication, Kanban tasks, and email notifications sync live across all connected devices worldwide.
3. **Interactive Deliverables Board**: Converts approved commitments into Kanban tasks (*To Do*, *In Progress*, *In Review*, *Completed*).
4. **Milestone Risk Radar**: Proactively alerts teams to approaching cutoff dates with automated reminder triggers.
5. **Role-Based Workspaces**: Dedicated privileges for **Administrator** and **Employee** members.

---

## 👥 Registered Workspace Accounts

| Account | Email Address | Password | Role | Privileges |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator (Root)** | `admin@meetpulse.ai` | `admin123` | Administrator | Full Admin, Employee Account Creation & Global Broadcast |

*All employee accounts created by the Administrator are synchronized across the world in real time to the Global Cloud Database and can log in instantly from any device.*

---

## 🌐 Deployment & Live Hosting Options (Worldwide Access)

### Option 1: Instant Worldwide Public HTTPS Live Link (Zero-Config)
To get an instant live HTTPS URL to share with teammates anywhere in the world on mobile data or any Wi-Fi right now:
```bash
python tunnel.py
```
*Or with npm:*
```bash
npm run tunnel
```
Share the generated public HTTPS URL (e.g. `https://meetpulse-ai.loca.lt`) with anyone globally!

---

### Option 2: Deploy Free to Vercel (Cloud Serverless)
1. Install Vercel CLI (or push to GitHub and import into [vercel.com](https://vercel.com)):
   ```bash
   npx vercel
   ```
2. Deploy to production:
   ```bash
   npx vercel --prod
   ```
*All `/api/*` endpoints (`/api/live-sync`, `/api/chat`, `/api/tasks`, `/api/emails`, `/api/users`, `/api/login`, `/api/analyze`, `/api/health`) are fully configured in `vercel.json`.*

---

### Option 3: Deploy Free to Render / Railway / Heroku
1. Push repository to GitHub.
2. Link your GitHub repository in [render.com](https://render.com) or [railway.app](https://railway.app).
3. Render automatically detects `render.yaml` and `Procfile` and launches the live web service with persistent JSON storage.

---

### Option 4: Local Network / Wi-Fi Access
Run on your local computer:
```bash
python server.py
```
- **Local Browser**: `http://localhost:5000`
- **Other Devices on Wi-Fi/LAN**: `http://<YOUR_IP>:5000` (printed in terminal)

---

## 📦 Architecture & Project Structure

```
├── api/
│   ├── analyze.js           # Serverless AI commitment extraction (Gemini / NLP)
│   ├── chat.js              # Serverless real-time chat & stream broadcast
│   ├── emails.js            # Serverless automated notification dispatch
│   ├── health.js            # API health check endpoint
│   ├── live-sync.js         # Full multi-device workspace sync endpoint
│   ├── login.js             # Authentication endpoint
│   ├── tasks.js             # Kanban board & inbox state endpoint
│   └── users.js             # User directory & credential management
├── css/
│   └── styles.css           # Design system & responsive layout styles
├── data/
│   └── users.json           # Central user credential store
├── js/
│   ├── app.js               # Main orchestrator & real-time live sync loop
│   ├── commitmentEngine.js  # Heuristic NLP parser & Gemini LLM caller
│   ├── inboxManager.js      # Action item queue manager
│   ├── mockCommsData.js     # Default user schemas & initial state
│   └── taskManager.js       # Kanban sprint board & risk radar engine
├── index.html               # Main SPA viewport, modals & mobile nav dock
├── server.py                # Central multi-device live sync server
├── tunnel.py                # 1-click worldwide public live tunnel
├── Procfile                 # Cloud container start definition
├── render.yaml              # Render 1-click deploy blueprint
├── vercel.json              # Vercel serverless routing configuration
└── README.md                # Documentation & quickstart guide
```
