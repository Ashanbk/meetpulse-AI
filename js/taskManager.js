// taskManager.js - Confirmed Tasks, Kanban Board, and Forgotten-Work Alert Engine

export class TaskManager {
  constructor(kanbanContainerId, listContainerId, alertBannerId, onTaskStateChange) {
    this.kanbanContainer = document.getElementById(kanbanContainerId);
    this.listContainer = document.getElementById(listContainerId);
    this.alertBannerContainer = document.getElementById(alertBannerId);
    this.tasks = [];
    this.auditHistory = [];
    this.onTaskStateChange = onTaskStateChange;

    this.currentViewMode = "kanban"; // "kanban" or "list"
    this.filterOwner = "all";
    this.filterPriority = "all";
    this.filterSource = "all";
    this.searchQuery = "";
    this.draggedTaskId = null;
  }

  setTasks(initialTasks) {
    this.tasks = Array.isArray(initialTasks) ? [...initialTasks] : [];
    this.generateAuditHistoryFromTasks();
    this.render();
    this.renderAlerts();
    if (this.onTaskStateChange) this.onTaskStateChange(this.getStats());
  }

  addTask(task) {
    this.tasks.unshift(task);
    this.auditHistory.unshift({
      id: `audit-${Date.now()}`,
      taskId: task.id,
      title: task.title,
      owner: task.owner,
      sourceType: task.sourceType,
      sourceChannel: task.sourceChannel,
      action: "Created from Commitment",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
    });
    this.render();
    this.renderAlerts();
    if (this.onTaskStateChange) this.onTaskStateChange(this.getStats());
  }

  updateTask(updatedTask) {
    const idx = this.tasks.findIndex(t => t.id === updatedTask.id);
    if (idx !== -1) {
      this.tasks[idx] = { ...this.tasks[idx], ...updatedTask };
      this.auditHistory.unshift({
        id: `audit-${Date.now()}`,
        taskId: updatedTask.id,
        title: updatedTask.title,
        owner: updatedTask.owner,
        sourceType: updatedTask.sourceType,
        sourceChannel: updatedTask.sourceChannel,
        action: `Updated (Status: ${updatedTask.status.toUpperCase()})`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
      });
      this.render();
      this.renderAlerts();
      if (this.onTaskStateChange) this.onTaskStateChange(this.getStats());
    }
  }

  deleteTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.render();
    this.renderAlerts();
    if (this.onTaskStateChange) this.onTaskStateChange(this.getStats());
  }

  moveTaskStatus(taskId, newStatus) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      if (newStatus === "done") {
        task.isForgottenRisk = false;
      }
      this.auditHistory.unshift({
        id: `audit-${Date.now()}`,
        taskId: task.id,
        title: task.title,
        owner: task.owner,
        sourceType: task.sourceType,
        sourceChannel: task.sourceChannel,
        action: `Status moved to ${newStatus.toUpperCase()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
      });
      this.render();
      this.renderAlerts();
      if (this.onTaskStateChange) this.onTaskStateChange(this.getStats());
    }
  }

  getTasks() {
    return this.tasks;
  }

  getAuditHistory() {
    return this.auditHistory;
  }

  getStats() {
    const total = this.tasks.length;
    const todo = this.tasks.filter(t => t.status === "todo").length;
    const inProgress = this.tasks.filter(t => t.status === "in-progress").length;
    const waiting = this.tasks.filter(t => t.status === "waiting").length;
    const done = this.tasks.filter(t => t.status === "done").length;
    const overdue = this.tasks.filter(t => t.deadline.toLowerCase().includes("overdue") || t.deadline.toLowerCase().includes("yesterday")).length;
    const forgottenRisks = this.tasks.filter(t => t.isForgottenRisk && t.status !== "done").length;

    return { total, todo, inProgress, waiting, done, overdue, forgottenRisks };
  }

  generateAuditHistoryFromTasks() {
    this.auditHistory = this.tasks.map((t, idx) => ({
      id: `audit-${idx + 1}`,
      taskId: t.id,
      title: t.title,
      owner: t.owner,
      sourceType: t.sourceType,
      sourceChannel: t.sourceChannel,
      action: t.status === "done" ? "Completed" : "Confirmed & Tracked",
      timestamp: t.confirmedAt || "Aug 24, 2026"
    }));
  }

  setFilters({ owner, priority, source, search }) {
    if (owner !== undefined) this.filterOwner = owner;
    if (priority !== undefined) this.filterPriority = priority;
    if (source !== undefined) this.filterSource = source;
    if (search !== undefined) this.searchQuery = search.toLowerCase();
    this.render();
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    this.render();
  }

  filterTasks() {
    return this.tasks.filter(t => {
      const matchOwner = this.filterOwner === "all" || t.owner === this.filterOwner;
      const matchPriority = this.filterPriority === "all" || t.priority.toLowerCase() === this.filterPriority.toLowerCase();
      const matchSource = this.filterSource === "all" || t.sourceType.toLowerCase() === this.filterSource.toLowerCase();
      const matchSearch = !this.searchQuery ||
        t.title.toLowerCase().includes(this.searchQuery) ||
        t.owner.toLowerCase().includes(this.searchQuery) ||
        t.id.toLowerCase().includes(this.searchQuery) ||
        (t.notes && t.notes.toLowerCase().includes(this.searchQuery));
      return matchOwner && matchPriority && matchSource && matchSearch;
    });
  }

  render() {
    const filtered = this.filterTasks();

    if (this.currentViewMode === "kanban") {
      if (this.kanbanContainer) this.kanbanContainer.style.display = "grid";
      if (this.listContainer) this.listContainer.style.display = "none";
      this.renderKanban(filtered);
    } else {
      if (this.kanbanContainer) this.kanbanContainer.style.display = "none";
      if (this.listContainer) this.listContainer.style.display = "block";
      this.renderList(filtered);
    }
  }

  renderKanban(filtered) {
    if (!this.kanbanContainer) return;

    const columns = [
      { id: "todo", title: "To Do", icon: "📋", color: "var(--color-todo)" },
      { id: "in-progress", title: "In Progress", icon: "⚡", color: "var(--color-progress)" },
      { id: "waiting", title: "Waiting / Blocked", icon: "⏳", color: "var(--color-waiting)" },
      { id: "done", title: "Completed", icon: "✅", color: "var(--color-done)" }
    ];

    let html = "";
    columns.forEach(col => {
      const colTasks = filtered.filter(t => t.status === col.id);
      html += `
        <div class="kanban-column" ondragover="event.preventDefault(); this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="window.commitPulseApp.handleDrop(event, '${col.id}')">
          <div class="kanban-col-header">
            <div class="kanban-col-title-wrap">
              <span class="kanban-col-dot" style="background: ${col.color}"></span>
              <span class="kanban-col-title">${col.icon} ${col.title}</span>
            </div>
            <span class="kanban-col-count">${colTasks.length}</span>
          </div>

          <div class="kanban-cards-list">
      `;

      if (colTasks.length === 0) {
        html += `<div style="text-align: center; color: var(--text-muted); font-size: 0.825rem; padding: 2.5rem 0.5rem; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">No tasks in this stage</div>`;
      } else {
        colTasks.forEach(task => {
          const isOverdue = task.deadline.toLowerCase().includes("overdue") || task.deadline.toLowerCase().includes("yesterday");
          const sourceIcon = task.sourceType === "Slack" ? "💬" : task.sourceType === "Email" ? "✉️" : "🎙️";

          html += `
            <div class="kanban-card ${task.isForgottenRisk && task.status !== 'done' ? 'risk-card' : ''}" draggable="true" ondragstart="window.commitPulseApp.handleDragStart(event, '${task.id}')" onclick="window.commitPulseApp.openTaskModal('${task.id}')">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span class="task-id-badge">${task.id}</span>
                <span class="priority-badge priority-${task.priority.toLowerCase()}">${task.priority}</span>
              </div>

              <h4 class="task-card-title">${task.title}</h4>

              <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-muted);">
                <span>${sourceIcon} ${task.sourceType}</span>
                <span>•</span>
                <span>${task.sourceChannel}</span>
              </div>

              ${task.isForgottenRisk && task.status !== "done" ? `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: var(--radius-xs); padding: 4px 8px; font-size: 0.75rem; font-weight: 700; color: #f87171;">
                  <span>${isOverdue ? '🚨 OVERDUE' : '🟠 Risk'}</span>
                  <span>${task.deadline}</span>
                </div>
              ` : `
                <div style="font-size: 0.775rem; color: var(--text-secondary); font-family: var(--font-mono);">
                  📅 Due: <strong>${task.deadline}</strong>
                </div>
              `}

              <div class="task-card-footer">
                <div class="owner-pill" title="Assigned to ${task.owner}" style="font-size: 0.8rem;">
                  <span>${task.ownerAvatar || '👤'}</span>
                  <span>${task.owner}</span>
                </div>
                <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.75rem; border-color: rgba(54, 197, 240, 0.3); color: var(--color-slack);" title="Send Instant Slack Reminder" onclick="event.stopPropagation(); window.commitPulseApp.sendNudge('${task.id}')">
                  🔔 Nudge
                </button>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;
    });

    this.kanbanContainer.innerHTML = html;
  }

  renderList(filtered) {
    if (!this.listContainer) return;

    if (filtered.length === 0) {
      this.listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 3.5rem;">No confirmed tasks found matching filters.</div>`;
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="tasks-table">
          <thead>
            <tr>
              <th>Task ID & Action</th>
              <th>Owner</th>
              <th>Source</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Target Deadline</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    filtered.forEach(t => {
      const sourceIcon = t.sourceType === "Slack" ? "💬" : t.sourceType === "Email" ? "✉️" : "🎙️";
      const isOverdue = t.deadline.toLowerCase().includes("overdue") || t.deadline.toLowerCase().includes("yesterday");

      html += `
        <tr onclick="window.commitPulseApp.openTaskModal('${t.id}')" style="cursor: pointer;">
          <td>
            <div style="font-weight: 700; color: var(--color-primary); font-size: 0.8rem; font-family: var(--font-mono);">${t.id}</div>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.925rem;">${t.title}</div>
            <div style="font-size: 0.775rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">“${t.originalSnippet?.substring(0, 60)}...”</div>
          </td>
          <td>
            <div class="owner-pill">
              <span>${t.ownerAvatar || '👤'}</span>
              <span>${t.owner}</span>
            </div>
          </td>
          <td>
            <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${sourceIcon} ${t.sourceType}</span>
          </td>
          <td>
            <span class="priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
          </td>
          <td>
            <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: var(--radius-xs); background: rgba(255,255,255,0.06);">${t.status.toUpperCase()}</span>
          </td>
          <td>
            <span style="font-size: 0.825rem; font-family: var(--font-mono); color: ${isOverdue ? 'var(--color-danger)' : 'var(--text-primary)'}; font-weight: 600;">⏱️ ${t.deadline}</span>
          </td>
          <td onclick="event.stopPropagation();">
            <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.sendNudge('${t.id}')">🔔 Nudge</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    this.listContainer.innerHTML = html;
  }

  // Render Forgotten-Work Radar Alert Banner
  renderAlerts() {
    if (!this.alertBannerContainer) return;

    const riskyTasks = this.tasks.filter(t => t.isForgottenRisk && t.status !== "done");
    if (riskyTasks.length === 0) {
      this.alertBannerContainer.style.display = "none";
      return;
    }

    this.alertBannerContainer.style.display = "flex";
    const topRisk = riskyTasks[0];
    const isOverdue = topRisk.deadline.toLowerCase().includes("overdue") || topRisk.deadline.toLowerCase().includes("yesterday");

    this.alertBannerContainer.innerHTML = `
      <div class="radar-pulse-icon">${isOverdue ? '🚨' : '🟠'}</div>
      <div style="flex: 1;">
        <div style="font-weight: 800; font-size: 0.95rem; color: ${isOverdue ? '#fca5a5' : '#fde047'};">
          ${isOverdue ? 'CRITICAL OVERDUE COMMITMENT DETECTED' : 'FORGOTTEN WORK RISK RADAR'} (${riskyTasks.length} Commitments at Risk)
        </div>
        <div style="font-size: 0.85rem; color: #e2e8f0; margin-top: 3px; line-height: 1.45;">
          <strong>${topRisk.owner}</strong> promised: <em>"${topRisk.title}"</em> • Due <strong>${topRisk.deadline}</strong> in ${topRisk.sourceType} (${topRisk.sourceChannel})
        </div>
      </div>
      <div style="display: flex; gap: 0.6rem; align-items: center;">
        <button class="btn btn-sm btn-danger" onclick="window.commitPulseApp.sendNudge('${topRisk.id}')">
          ⚡ Instant Slack Nudge
        </button>
        <button class="btn btn-sm btn-secondary" onclick="window.commitPulseApp.openTaskModal('${topRisk.id}')">
          View Details
        </button>
      </div>
    `;
  }
}
