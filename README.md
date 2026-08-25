# Meetpulse AI — Meeting & Communication Commitment Intelligence

> **Never drop a promise again.** Meetpulse listens to team meetings, client calls, emails, and chat discussions to automatically detect commitments, assign owners, extract deadlines, and track deliverables to completion.

---

## ⚡ Core Value Proposition

Modern teams discuss dozens of commitments across Zoom calls, Google Meet sessions, client emails, and Slack channels every day. Over 40% of conversational action items get forgotten without being entered into formal project management tools.

**Meetpulse AI solves this by acting as a passive commitment listener:**
1. **Real-time Detection**: Extracts promises, deadlines, and assigned owners from meeting audio transcripts, client emails, and Slack streams.
2. **Human-in-the-Loop Review**: Surfaces detected commitments in an Action Item Queue for 1-click confirmation or editing.
3. **Interactive Deliverables Board**: Automatically converts approved commitments into Kanban tasks (*To Do*, *In Progress*, *In Review*, *Completed*).
4. **Milestone Risk Radar**: Proactively alerts teams to approaching deadlines and overdue commitments with automated reminder nudges.
5. **Team Reliability Metrics**: Quantifies follow-through rates and delivery punctuality.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5 Semantic Structure, Custom CSS3 Design System with Pitch Black (OLED) Luxury Aesthetics and zero emojis.
- **Charts & Visualizations**: Chart.js 4.4.0 for real-time conversion and punctuality metrics.
- **AI & NLP Engine**: Built-in high-speed rule-based heuristic extraction engine + optional Google Gemini 1.5 Flash API integration.
- **Server**: Lightweight Python HTTP server (`server.py`) and Vercel serverless functions (`api/analyze.js`).
- **Role-Based Authentication**: Dedicated sessions for **Administrator** and **Employee** with persistent state.

---

## 🚀 Quickstart Guide

### 1. Start the Local Server

```bash
python server.py
```

Open your browser to:
👉 **`http://localhost:5000`**

### 2. Sign In

- **Sign in as Administrator** (`admin@meetpulse.ai`) for full system controls.
- **Sign in as Employee** (`alex@meetpulse.ai`) for staff deliverable tracking.

### 3. Usage & Features

1. **Live Meeting Stream**: Transcribe meeting audio or paste conversation logs. Click **"Scan & Extract Action Items"** to view interactive commitment cards directly in the stream.
2. **Action Item Queue**: Review extracted deliverables with AI confidence scores and click **"Approve Deliverable"**.
3. **Deliverables Board**: View Kanban sprint columns, drag and drop cards to update status, and trigger automated reminder nudges.
4. **Milestone Risk Radar**: Monitor high-risk deliverables approaching cutoff dates.
5. **Team Reliability**: Review team member reliability scores and add new members dynamically.
6. **Plans & ROI Calculator**: Calculate monthly operational hours saved by preventing lost deliverables.

---

## 📦 Project Structure

```
├── api/
│   └── analyze.js           # Vercel serverless function for AI extraction
├── css/
│   └── styles.css           # Pitch Black luxury dark theme design system
├── js/
│   ├── app.js               # Main application orchestrator & auth manager
│   ├── commitmentEngine.js  # NLP heuristic parser & Gemini LLM caller
│   ├── inboxManager.js      # Action item queue manager
│   ├── mockCommsData.js     # Default accounts & starter meeting streams
│   └── taskManager.js       # Kanban board & milestone risk engine
├── index.html               # Main application viewport & modals
├── server.py                # Local development HTTP server
└── README.md                # Project documentation
```

---

## 🔒 Security & Privacy

Meetpulse operates with a client-side first architecture. Meeting audio and communication data can be processed entirely offline using local NLP heuristics or via secure, encrypted calls to Google Gemini.
