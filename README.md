# ⚡ CommitPulse AI — "AI That Finds the Work Hiding Inside Your Conversations"

> **An AI-powered platform that detects hidden work commitments inside everyday company communication—emails, chats, and meeting transcripts—and converts confirmed commitments into trackable tasks before they get forgotten.**

---

## 🎯 The Problem

Employees constantly make informal promises in daily communications:
- *“I’ll send the report tomorrow.”*
- *“Can you check with the supplier?”*
- *“Please update this by Friday.”*

Many of these commitments never become formal tasks in Jira, Linear, or Trello, and are therefore **forgotten, delayed, or lost** inside Slack channels, email chains, and call recordings.

---

## 💡 The Solution & Core Value

**CommitPulse AI** acts as an intelligent commitment-detection layer that:
1. **Listens & Scans**: Ingests everyday communication from Slack, Microsoft Teams, Gmail, Outlook, and Zoom transcripts.
2. **Extracts with NLP**: Automatically extracts the **Task / Action**, **Person Responsible (Owner)**, **Target Deadline**, **Priority**, and **AI Confidence Score (e.g. 96%)**.
3. **Human Confirmation (AI Inbox)**: Puts the employee in the driver's seat (`Create Task` / `Edit` / `Delegate` / `Ignore`). Only confirmed commitments enter the task tracking system.
4. **Progress & Forgotten-Work Radar**: Tracks deadlines and proactively warns when a commitment is at risk of being delayed or forgotten (*"🟠 Sales report was due today at 5:00 PM"*).

---

## 🚀 Key Modules & Pages

- 📊 **Dashboard**: High-level KPIs, Forgotten-Work Radar banner, and live communication listener/simulator.
- 📥 **AI Inbox (The Core Innovation)**: Pending detected commitments awaiting human confirmation with confidence badges and exact quote snippets.
- 📋 **My Tasks (Kanban & List)**: Confirmed commitments tracked on an interactive Kanban board (*To Do*, *In Progress*, *Waiting*, *Done*) with instant Slack Reminder Nudges.
- 📜 **Commitment History & Audit Trail**: Full traceability connecting every task back to the original message/email and conversion timeline.
- 📈 **Team Analytics**: Team reliability index and commitment-to-task conversion rate.
- 💎 **SaaS Pricing & ROI Calculator**: Free (₹0), Pro (₹299/user/mo), Team (₹599/user/mo), and Enterprise tiers, plus interactive ROI calculator.

---

## 🏁 Quickstart Guide

### 1. Launch the Server

Run the Python server in this directory:

```bash
python server.py
```

Open your browser to:
👉 **`http://localhost:5000`**

### 2. Immediate Testing

1. On the **Dashboard**, click **"✨ Scan & Extract Commitments to AI Inbox"**.
2. Switch between **Slack**, **Gmail**, and **Zoom** communication presets or paste your own message.
3. In the **AI Inbox**, review the detected commitments and click **"✅ Create Task"** or **"🔄 Delegate"**.
4. In **My Tasks**, view your confirmed tasks on the Kanban board and test the **"🔔 Nudge"** reminder button!
5. Check the **Pricing Plans** tab and slide the ROI calculator to see how much money your team saves by eliminating dropped balls.
# meetpulse-AI
