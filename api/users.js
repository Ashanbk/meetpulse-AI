// api/users.js - Serverless function for users API
// Central storage for cloud serverless deployments (Root Admin Initial State)

let usersDB = [
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
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(usersDB);
  }

  if (req.method === 'POST') {
    const newUser = req.body;
    if (!newUser || !newUser.email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const idx = usersDB.findIndex(u => u.email.toLowerCase() === newUser.email.toLowerCase());
    if (idx !== -1) {
      usersDB[idx] = { ...usersDB[idx], ...newUser };
    } else {
      usersDB.push(newUser);
    }
    return res.status(200).json({ success: true, users: usersDB });
  }

  if (req.method === 'DELETE') {
    const userId = req.query?.id || req.body?.id;
    if (userId) {
      usersDB = usersDB.filter(u => u.id !== userId && u.email !== userId);
    }
    return res.status(200).json({ success: true, users: usersDB });
  }

  res.status(405).json({ error: "Method not allowed" });
}
