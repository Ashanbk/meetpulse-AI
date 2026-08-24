// api/health.js - Vercel Serverless Function Health Check
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    status: "online",
    service: "CommitPulse AI Serverless API",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    engine: "CommitPulse NLP + Gemini Flash"
  });
}
