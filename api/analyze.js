// api/analyze.js - Vercel Serverless Function for AI Commitment Detection

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const { text, sourceType = "Slack", sourceChannel = "General", sender = "Team Member" } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: "Missing required 'text' parameter in request body." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    let commitments = [];

    if (apiKey) {
      commitments = await analyzeWithGemini(text, sourceType, sourceChannel, apiKey);
    }

    // Fallback to NLP heuristics if Gemini is not configured or returns empty
    if (!commitments || commitments.length === 0) {
      commitments = analyzeWithNLPHeuristics(text, sourceType, sourceChannel, sender);
    }

    return res.status(200).json({
      success: true,
      count: commitments.length,
      sourceType,
      sourceChannel,
      commitments
    });
  } catch (err) {
    console.error("Vercel Serverless Analysis Error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
}

// Fallback NLP heuristic parser
function analyzeWithNLPHeuristics(text, sourceType, sourceChannel, defaultSender) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  const triggerKeywords = ["will", "can you", "please", "need to", "promise", "by friday", "by tomorrow", "eod", "review", "update", "complete", "send"];

  lines.forEach((line, idx) => {
    let cleanText = line;
    let sender = defaultSender;

    if (line.includes(':')) {
      const parts = line.split(':');
      sender = parts[0].trim();
      cleanText = parts.slice(1).join(':').trim();
    }

    const lower = cleanText.toLowerCase();
    const hasTrigger = triggerKeywords.some(k => lower.includes(k));
    const isSmallTalk = lower.includes("pizza") || lower.includes("lunch") || lower.includes("haha") || lower.includes("weather");

    if (hasTrigger && !isSmallTalk && cleanText.length > 15) {
      let deadline = "Friday, 5:00 PM";
      if (lower.includes("tomorrow")) deadline = "Tomorrow, 12:00 PM";
      else if (lower.includes("wednesday")) deadline = "Wednesday, 6:00 PM";
      else if (lower.includes("thursday")) deadline = "Thursday, 3:00 PM";
      else if (lower.includes("eod")) deadline = "Today, 6:00 PM";

      results.push({
        id: `com-${Date.now().toString().slice(-4)}-${idx + 1}`,
        taskTitle: cleanText.replace(/^(Rahul|Priya|Vikram|Aarav|Sarah|Marcus|David|Kavita|Rohan),?\s*/i, '').trim(),
        owner: sender || "Team Member",
        ownerAvatar: "👤",
        ownerRole: "Team Member",
        requester: defaultSender || "Self-committed",
        deadline,
        priority: lower.includes("urgent") || lower.includes("tomorrow") ? "Urgent" : "High",
        confidence: Math.floor(88 + Math.random() * 10),
        sourceType,
        sourceChannel,
        originalSnippet: cleanText,
        status: "pending",
        urgencyDays: deadline.includes("Tomorrow") || deadline.includes("Today") ? 1 : 3
      });
    }
  });

  return results;
}

// Gemini LLM extractor
async function analyzeWithGemini(text, sourceType, sourceChannel, apiKey) {
  try {
    const prompt = `You are CommitPulse AI. Extract confirmed work commitments from this text:\n\n"${text}"\n\nReturn a clean JSON array with items containing: taskTitle, owner, requester, deadline, priority (Urgent/High/Medium/Low), confidence (70-99), originalSnippet. Return ONLY raw JSON.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!res.ok) return [];
    const data = await res.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) return [];

    const parsed = JSON.parse(rawJson);
    return (Array.isArray(parsed) ? parsed : []).map((item, idx) => ({
      id: `com-gemini-${Date.now().toString().slice(-4)}-${idx + 1}`,
      taskTitle: item.taskTitle || "Work Deliverable",
      owner: item.owner || "Assignee",
      ownerAvatar: "👤",
      ownerRole: "Team Member",
      requester: item.requester || "Requester",
      deadline: item.deadline || "Friday, 5:00 PM",
      priority: item.priority || "High",
      confidence: item.confidence || 95,
      sourceType,
      sourceChannel,
      originalSnippet: item.originalSnippet || text.substring(0, 100),
      status: "pending",
      urgencyDays: 2
    }));
  } catch (err) {
    console.warn("Gemini API serverless error:", err);
    return [];
  }
}
