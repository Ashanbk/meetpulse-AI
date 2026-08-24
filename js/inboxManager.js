// inboxManager.js - AI Inbox & Human-in-the-Loop Confirmation Management

export class InboxManager {
  constructor(containerId, { onTaskConfirmed, onCommitmentDismissed, onInboxUpdated }) {
    this.container = document.getElementById(containerId);
    this.pendingCommitments = [];
    this.dismissedCommitments = [];
    this.onTaskConfirmed = onTaskConfirmed;
    this.onCommitmentDismissed = onCommitmentDismissed;
    this.onInboxUpdated = onInboxUpdated;
    this.sourceFilter = "all";
    this.confidenceFilter = "all";
  }

  setCommitments(commitments) {
    this.pendingCommitments = Array.isArray(commitments) ? [...commitments] : [];
    this.render();
    if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
  }

  addCommitments(newItems) {
    if (Array.isArray(newItems)) {
      this.pendingCommitments.unshift(...newItems);
    } else {
      this.pendingCommitments.unshift(newItems);
    }
    this.render();
    if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
  }

  getCommitments() {
    return this.pendingCommitments;
  }

  getStats() {
    return {
      pendingCount: this.pendingCommitments.length,
      dismissedCount: this.dismissedCommitments.length
    };
  }

  confirmCommitment(commitmentId) {
    const idx = this.pendingCommitments.findIndex(c => c.id === commitmentId);
    if (idx !== -1) {
      const item = this.pendingCommitments.splice(idx, 1)[0];
      const confirmedTask = {
        id: `TASK-${Math.floor(100 + Math.random() * 900)}`,
        title: item.taskTitle,
        owner: item.owner,
        ownerAvatar: item.ownerAvatar,
        ownerRole: item.ownerRole,
        requester: item.requester,
        deadline: item.deadline,
        deadlineISO: item.deadlineISO,
        priority: item.priority,
        status: "todo",
        sourceType: item.sourceType,
        sourceChannel: item.sourceChannel,
        originalSnippet: item.originalSnippet,
        confidence: item.confidence,
        confirmedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isForgottenRisk: item.urgencyDays <= 1,
        notes: `Confirmed from ${item.sourceType} (${item.sourceChannel}).`
      };

      if (this.onTaskConfirmed) this.onTaskConfirmed(confirmedTask);
      this.render();
      if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
      return confirmedTask;
    }
    return null;
  }

  confirmAll() {
    const all = [...this.pendingCommitments];
    this.pendingCommitments = [];
    all.forEach(item => {
      const confirmedTask = {
        id: `TASK-${Math.floor(100 + Math.random() * 900)}`,
        title: item.taskTitle,
        owner: item.owner,
        ownerAvatar: item.ownerAvatar,
        ownerRole: item.ownerRole,
        requester: item.requester,
        deadline: item.deadline,
        deadlineISO: item.deadlineISO,
        priority: item.priority,
        status: "todo",
        sourceType: item.sourceType,
        sourceChannel: item.sourceChannel,
        originalSnippet: item.originalSnippet,
        confidence: item.confidence,
        confirmedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isForgottenRisk: item.urgencyDays <= 1,
        notes: `Batch confirmed from ${item.sourceType}.`
      };
      if (this.onTaskConfirmed) this.onTaskConfirmed(confirmedTask);
    });
    this.render();
    if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
  }

  dismissCommitment(commitmentId) {
    const idx = this.pendingCommitments.findIndex(c => c.id === commitmentId);
    if (idx !== -1) {
      const dismissed = this.pendingCommitments.splice(idx, 1)[0];
      this.dismissedCommitments.push(dismissed);
      if (this.onCommitmentDismissed) this.onCommitmentDismissed(dismissed);
      this.render();
      if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
    }
  }

  updateCommitment(updatedItem) {
    const idx = this.pendingCommitments.findIndex(c => c.id === updatedItem.id);
    if (idx !== -1) {
      this.pendingCommitments[idx] = { ...this.pendingCommitments[idx], ...updatedItem };
      this.render();
      if (this.onInboxUpdated) this.onInboxUpdated(this.getStats());
    }
  }

  setFilters({ source, confidence }) {
    if (source !== undefined) this.sourceFilter = source;
    if (confidence !== undefined) this.confidenceFilter = confidence;
    this.render();
  }

  filterList() {
    return this.pendingCommitments.filter(c => {
      const matchSource = this.sourceFilter === "all" || c.sourceType.toLowerCase() === this.sourceFilter.toLowerCase();
      let matchConf = true;
      if (this.confidenceFilter === "high") matchConf = c.confidence >= 90;
      else if (this.confidenceFilter === "medium") matchConf = c.confidence >= 80;
      return matchSource && matchConf;
    });
  }

  render() {
    if (!this.container) return;

    const filtered = this.filterList();
    if (filtered.length === 0) {
      this.container.innerHTML = `
        <div class="inbox-empty-card">
          <div style="font-size: 3.5rem; margin-bottom: 0.75rem;">🎉</div>
          <h3 style="font-family: var(--font-heading); font-size: 1.35rem; font-weight: 800; color: var(--text-primary);">All Caught Up in AI Inbox!</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem; max-width: 480px; margin: 0.5rem auto 1.5rem auto; line-height: 1.5;">
            No pending commitments waiting for confirmation. CommitPulse is actively monitoring your communications for hidden work promises.
          </p>
          <button class="btn btn-primary" onclick="window.commitPulseApp.triggerDemoSim()">
            ✨ Ingest Sample Corporate Communication
          </button>
        </div>
      `;
      return;
    }

    let html = `<div class="inbox-cards-grid">`;

    filtered.forEach(c => {
      const sourceIcon = c.sourceType === "Slack" ? "💬" : c.sourceType === "Email" ? "✉️" : "🎙️";
      const sourceClass = `source-${c.sourceType.toLowerCase()}`;
      const confColor = c.confidence >= 90 ? "var(--color-primary)" : c.confidence >= 80 ? "var(--color-accent)" : "var(--color-warning)";
      
      // Calculate SVG stroke offset for 24px circle (r=9, circumference = 2 * PI * 9 ~= 56.5)
      const circumference = 56.54;
      const strokeOffset = circumference - (c.confidence / 100) * circumference;

      html += `
        <div class="inbox-card" id="card-${c.id}">
          <div class="inbox-card-top">
            <div class="source-tag ${sourceClass}">
              <span>${sourceIcon}</span>
              <span>${c.sourceType}: <strong>${c.sourceChannel}</strong></span>
            </div>

            <div class="confidence-meter-chip" title="AI Extraction Confidence Score">
              <svg class="radial-meter-svg" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2.5"></circle>
                <circle cx="12" cy="12" r="9" fill="none" stroke="${confColor}" stroke-width="2.5" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeOffset}" stroke-linecap="round"></circle>
              </svg>
              <span style="color: ${confColor};">${c.confidence}% Match</span>
            </div>
          </div>

          <div class="inbox-quote-box">
            <span class="quote-icon">“</span>
            <span class="quote-text">${c.originalSnippet}</span>
          </div>

          <div class="extracted-details-deck">
            <div class="extracted-item">
              <span class="extracted-label">🎯 Action Item:</span>
              <span class="extracted-value title-val">${c.taskTitle}</span>
            </div>

            <div class="extracted-row">
              <div class="extracted-item">
                <span class="extracted-label">👤 Responsible Owner:</span>
                <div class="owner-pill">
                  <span>${c.ownerAvatar || '👤'}</span>
                  <strong>${c.owner}</strong>
                  <span class="owner-sub">(${c.ownerRole || 'Member'})</span>
                </div>
              </div>

              <div class="extracted-item">
                <span class="extracted-label">📅 Target Deadline:</span>
                <span class="deadline-pill">⏱️ ${c.deadline}</span>
              </div>
            </div>

            <div class="extracted-row" style="margin-top: 0.25rem;">
              <div class="extracted-item">
                <span class="extracted-label">🗣️ Requester:</span>
                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">${c.requester}</span>
              </div>
              <div class="extracted-item">
                <span class="extracted-label">⚡ Priority:</span>
                <span class="priority-badge priority-${c.priority.toLowerCase()}">${c.priority}</span>
              </div>
            </div>
          </div>

          <div class="inbox-actions-row">
            <button class="btn btn-primary btn-confirm-task" onclick="window.commitPulseApp.confirmCommitment('${c.id}')" title="Approve and promote to formal task tracking">
              ✅ Create Task
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openEditCommitmentModal('${c.id}')" title="Edit owner, deadline, or title before creating">
              ✏️ Edit
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openDelegateModal('${c.id}')" title="Reassign task to another team member">
              🔄 Delegate
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.dismissCommitment('${c.id}')" title="Ignore - Not a formal commitment" style="margin-left: auto; color: var(--text-muted);">
              ✕ Ignore
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.container.innerHTML = html;
  }
}
