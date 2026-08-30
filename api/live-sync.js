// api/live-sync.js - Serverless function for Live Multi-Device Sync
// Central data state across cloud sessions (Root Admin Initial State)

let serverState = {
  users: [
    {
      id: "user-admin-1",
      email: "admin@meetpulse.ai",
      password: "admin123",
      name: "Administrator",
      role: "Administrator",
      avatar: "AD",
      department: "Executive Operations",
      isAdmin: true,
      activeTasks: 0,
      reliabilityScore: 100
    }
  ],
  chat: [],
  tasks: { tasks: [], inbox: [] },
  emails: []
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      users: serverState.users,
      chat: serverState.chat,
      tasks: serverState.tasks,
      emails: serverState.emails,
      serverTime: Date.now()
    });
  }

  if (req.method === 'POST') {
    const data = req.body || {};
    if (data.users && Array.isArray(data.users)) serverState.users = data.users;
    if (data.chat && Array.isArray(data.chat)) serverState.chat = data.chat;
    if (data.tasks) serverState.tasks = data.tasks;
    if (data.emails && Array.isArray(data.emails)) serverState.emails = data.emails;
    return res.status(200).json({ success: true, message: "Synchronized", state: serverState });
  }

  res.status(405).json({ error: "Method not allowed" });
}
