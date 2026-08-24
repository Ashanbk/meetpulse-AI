// commitmentEngine.js - Advanced NLP Commitment Detection & Entity Extractor

export class CommitmentEngine {
  constructor() {
    this.geminiApiKey = localStorage.getItem("commitpulse_gemini_key") || "";
  }

  setApiKey(key) {
    this.geminiApiKey = key.trim();
    if (this.geminiApiKey) {
      localStorage.setItem("commitpulse_gemini_key", this.geminiApiKey);
    } else {
      localStorage.removeItem("commitpulse_gemini_key");
    }
  }

  getApiKey() {
    return this.geminiApiKey;
  }

  // Parse natural language deadline string into ISO date & human readable format
  parseNaturalDeadline(text) {
    const lower = text.toLowerCase();
    const now = new Date();
    let targetDate = new Date();
    let label = "End of Sprint";

    if (lower.includes("today")) {
      label = "Today, 5:00 PM";
      targetDate.setHours(17, 0, 0, 0);
    } else if (lower.includes("tomorrow")) {
      targetDate.setDate(now.getDate() + 1);
      targetDate.setHours(17, 0, 0, 0);
      label = lower.includes("noon") ? "Tomorrow, 12:00 PM" : "Tomorrow, 5:00 PM";
    } else if (lower.includes("friday")) {
      const day = now.getDay();
      const diff = (5 - day + 7) % 7 || 7;
      targetDate.setDate(now.getDate() + diff);
      targetDate.setHours(17, 0, 0, 0);
      label = "Friday, 5:00 PM";
    } else if (lower.includes("wednesday")) {
      const day = now.getDay();
      const diff = (3 - day + 7) % 7 || 7;
      targetDate.setDate(now.getDate() + diff);
      targetDate.setHours(18, 0, 0, 0);
      label = "Wednesday, 6:00 PM";
    } else if (lower.includes("thursday")) {
      const day = now.getDay();
      const diff = (4 - day + 7) % 7 || 7;
      targetDate.setDate(now.getDate() + diff);
      targetDate.setHours(15, 0, 0, 0);
      label = "Thursday, 3:00 PM";
    } else if (lower.includes("monday") || lower.includes("next week")) {
      const day = now.getDay();
      const diff = (1 - day + 7) % 7 || 7;
      targetDate.setDate(now.getDate() + diff);
      targetDate.setHours(10, 0, 0, 0);
      label = "Next Monday, 10:00 AM";
    } else if (lower.includes("eod") || lower.includes("end of day")) {
      label = "Today EOD (6:00 PM)";
      targetDate.setHours(18, 0, 0, 0);
    } else {
      targetDate.setDate(now.getDate() + 3);
      label = `In 3 Days (${targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`;
    }

    return {
      label,
      iso: targetDate.toISOString(),
      daysRemaining: Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24))
    };
  }

  // Assess commitment confidence based on linguistic structure
  calculateConfidence(sentence, hasOwner, hasDeadline, hasActionVerb) {
    let score = 65;
    if (hasActionVerb) score += 15;
    if (hasOwner) score += 10;
    if (hasDeadline) score += 8;
    if (sentence.length > 30 && sentence.length < 160) score += 4;
    return Math.min(99, Math.max(70, score));
  }

  // Analyze communication text (Email / Slack / Meeting / Paste)
  async analyzeCommunication({ text, sourceType = "Slack", sourceChannel = "#general", sender = "Team Member" }) {
    if (this.geminiApiKey) {
      try {
        const geminiResult = await this.callGeminiAPI({ text, sourceType, sourceChannel, sender });
        if (geminiResult && geminiResult.length > 0) return geminiResult;
      } catch (err) {
        console.warn("Gemini API call failed, falling back to local NLP heuristics engine:", err);
      }
    }

    return this.analyzeLocally({ text, sourceType, sourceChannel, sender });
  }

  // Local NLP Heuristic Engine
  analyzeLocally({ text, sourceType, sourceChannel, sender }) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const commitments = [];
    let idCounter = Date.now();

    const teamNames = [
      { name: "Rahul Verma", alias: ["rahul", "rahul v", "@rahul"], role: "Sales Lead", avatar: "👨‍💻" },
      { name: "Priya Patel", alias: ["priya", "priya p", "@priya"], role: "Senior UI/UX Designer", avatar: "👩‍🎨" },
      { name: "Aarav Sharma", alias: ["aarav", "aarav s", "@aarav"], role: "Head of Product", avatar: "👨‍💼" },
      { name: "Marcus Vance", alias: ["marcus", "marcus v", "@marcus"], role: "Backend Engineer", avatar: "👨‍🔧" },
      { name: "Elena Rostova", alias: ["elena", "elena r", "@elena"], role: "SRE / DevOps", avatar: "👩‍🚀" },
      { name: "Vikram Malhotra", alias: ["vikram", "vikram m", "@vikram"], role: "Cloud Architect", avatar: "👨‍🔬" },
      { name: "David Kim", alias: ["david", "david k", "@david"], role: "Product Manager", avatar: "👔" }
    ];

    const commitmentPatterns = [
      /(?:i will|i'll|i am going to|i'll take|i will take|i'm on it|i will handle)\s+([^.!?]+)/i,
      /(?:please|can you|could you|make sure to|kindly)\s+([^.!?]+)/i,
      /(?:need to|we must|has to be|scheduled to)\s+([^.!?]+)/i,
      /(?:update|send|deliver|check with|provide|draft|configure|review|finish|complete|verify)\s+([^.!?]+)/i
    ];

    const noisePatterns = [
      /order lunch|pizza|coffee|weekend|weather|how are you|haha|lol|bye guys|see you|good morning/i
    ];

    for (const rawLine of lines) {
      let speaker = sender;
      let lineText = rawLine;

      // Check speaker prefix "Aarav: ..." or "From: ..."
      const speakerMatch = rawLine.match(/^([A-Za-z\s.-]+?):\s*(.+)$/);
      if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        lineText = speakerMatch[2].trim();
      }

      // Check if pure noise
      let isNoise = false;
      for (const np of noisePatterns) {
        if (np.test(lineText)) {
          isNoise = true;
          break;
        }
      }
      if (isNoise) continue;

      // Check for commitment match
      let isCommitment = false;
      for (const cp of commitmentPatterns) {
        if (cp.test(lineText)) {
          isCommitment = true;
          break;
        }
      }

      if (isCommitment || lineText.toLowerCase().includes("by ") || lineText.toLowerCase().includes("tomorrow") || lineText.toLowerCase().includes("friday")) {
        // Detect owner
        let matchedOwner = teamNames.find(t => lineText.toLowerCase().includes(t.name.toLowerCase()) || t.alias.some(a => lineText.toLowerCase().includes(a)));
        
        // If first-person promise ("I will..."), speaker is the owner
        if (lineText.match(/^(i will|i'll|i am|i'm on it)/i)) {
          matchedOwner = teamNames.find(t => speaker.toLowerCase().includes(t.name.toLowerCase()) || t.alias.some(a => speaker.toLowerCase().includes(a))) || {
            name: speaker,
            role: "Team Member",
            avatar: "👤"
          };
        } else if (!matchedOwner) {
          matchedOwner = {
            name: speaker !== sender ? speaker : "Assignee Needed",
            role: "Team Member",
            avatar: "👤"
          };
        }

        const deadlineInfo = this.parseNaturalDeadline(lineText);
        const priority = lineText.match(/(urgent|asap|critical|immediately|today)/i) ? "Urgent"
                       : lineText.match(/(high|important|blocker|eod)/i) ? "High" : "Medium";

        // Clean action task title
        let actionTitle = lineText.replace(/^(rahul,|priya,|aarav,|marcus,|elena,|david,|alex,|hey team,|team,)/i, "").trim();
        actionTitle = actionTitle.replace(/^(please|can you|could you|i will|i'll|kindly)\s+/i, "").trim();
        actionTitle = actionTitle.charAt(0).toUpperCase() + actionTitle.slice(1);
        if (actionTitle.length > 75) actionTitle = actionTitle.substring(0, 72) + "...";

        const confidence = this.calculateConfidence(lineText, matchedOwner.name !== "Assignee Needed", true, true);

        commitments.push({
          id: `com-${idCounter++}`,
          taskTitle: actionTitle,
          owner: matchedOwner.name,
          ownerAvatar: matchedOwner.avatar,
          ownerRole: matchedOwner.role,
          requester: speaker !== matchedOwner.name ? speaker : "Self-committed",
          deadline: deadlineInfo.label,
          deadlineISO: deadlineInfo.iso,
          priority: priority,
          confidence: confidence,
          sourceType: sourceType,
          sourceChannel: sourceChannel,
          originalSnippet: lineText,
          status: "pending",
          urgencyDays: deadlineInfo.daysRemaining
        });
      }
    }

    // Fallback if none matched
    if (commitments.length === 0 && lines.length > 0) {
      const sampleLine = lines[0];
      const deadlineInfo = this.parseNaturalDeadline(sampleLine);
      commitments.push({
        id: `com-${idCounter++}`,
        taskTitle: sampleLine.length > 70 ? sampleLine.substring(0, 67) + "..." : sampleLine,
        owner: sender || "Rahul Verma",
        ownerAvatar: "👨‍💻",
        ownerRole: "Team Member",
        requester: sender || "Team Member",
        deadline: deadlineInfo.label,
        deadlineISO: deadlineInfo.iso,
        priority: "Medium",
        confidence: 82,
        sourceType: sourceType,
        sourceChannel: sourceChannel,
        originalSnippet: sampleLine,
        status: "pending",
        urgencyDays: deadlineInfo.daysRemaining
      });
    }

    return commitments;
  }

  // Call Gemini REST API if configured
  async callGeminiAPI({ text, sourceType, sourceChannel, sender }) {
    const prompt = `You are CommitPulse AI, a hidden work commitment detector.
Extract all work commitments from this text.
Text:
${text}

Return a JSON array of objects with:
- "taskTitle": concise action item
- "owner": person responsible (e.g. Rahul Verma)
- "requester": who requested it
- "deadline": human readable deadline (e.g. Friday, 5:00 PM)
- "priority": Urgent, High, Medium, or Low
- "confidence": number between 75 and 99
- "originalSnippet": exact sentence containing the commitment

Return strictly JSON format without markdown code fences.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error("Gemini API Error");
    const data = await response.json();
    const parsedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (parsedText) {
      const items = JSON.parse(parsedText);
      let idCounter = Date.now();
      return items.map(item => ({
        id: `com-${idCounter++}`,
        taskTitle: item.taskTitle,
        owner: item.owner || sender,
        ownerAvatar: "👤",
        ownerRole: "Team Member",
        requester: item.requester || sender,
        deadline: item.deadline || "Friday, 5:00 PM",
        deadlineISO: new Date(Date.now() + 3 * 86400000).toISOString(),
        priority: item.priority || "Medium",
        confidence: item.confidence || 92,
        sourceType: sourceType,
        sourceChannel: sourceChannel,
        originalSnippet: item.originalSnippet || text,
        status: "pending",
        urgencyDays: 3
      }));
    }
    return null;
  }
}
