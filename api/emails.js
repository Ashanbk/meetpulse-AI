// api/emails.js - Serverless function for Scheduled Emails and Notification Dispatch
let emailsDB = [];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json(emailsDB);
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (Array.isArray(data)) {
      emailsDB = data;
    } else if (data && typeof data === 'object') {
      emailsDB.unshift(data);
      if (emailsDB.length > 150) emailsDB = emailsDB.slice(0, 150);
    }
    return res.status(200).json({ success: true, emails: emailsDB });
  }

  res.status(405).json({ error: "Method not allowed" });
}
