// api/chat.js - Serverless function for Live Meeting Stream & Chat Broadcast
let chatDB = [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(chatDB);
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (Array.isArray(data)) {
      chatDB = data;
    } else if (data && typeof data === 'object') {
      chatDB.push(data);
      if (chatDB.length > 200) chatDB = chatDB.slice(-200);
    }
    return res.status(200).json({ success: true, chat: chatDB });
  }

  res.status(405).json({ error: "Method not allowed" });
}
