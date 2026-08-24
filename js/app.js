// app.js - Main Application Orchestrator for CommitPulse AI
import { PRELOADED_COMMS, INITIAL_CONFIRMED_TASKS, TEAM_MEMBERS } from './mockCommsData.js';
import { CommitmentEngine } from './commitmentEngine.js';
import { InboxManager } from './inboxManager.js';
import { TaskManager } from './taskManager.js';

class CommitPulseApp {
  constructor() {
    this.commitmentEngine = new CommitmentEngine();
    this.inboxManager = null;
    this.taskManager = null;
    this.teamMembers = [...TEAM_MEMBERS];

    this.activeChannelIndex = 0;
    this.charts = { conversion: null, reliability: null };
    this.draggedTaskId = null;

    this.init();
  }

  init() {
    this.initInbox();
    this.initTaskManager();
    this.bindEvents();
    this.loadChannelPreview(PRELOADED_COMMS[0]);
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.updateDashboardKPIs();
    this.setupRoiCalculator();

    // Attach to global window for inline HTML handlers
    window.commitPulseApp = this;
  }

  initInbox() {
    const initialCommitments = [];
    PRELOADED_COMMS.forEach(c => {
      if (c.detectedCommitments) {
        initialCommitments.push(...c.detectedCommitments);
      }
    });

    this.inboxManager = new InboxManager('inboxContainer', {
      onTaskConfirmed: (task) => {
        this.taskManager.addTask(task);
        this.updateDashboardKPIs();
        this.renderAuditHistory();
        this.renderAnalytics();
        this.showToast(`✅ Created Task [${task.id}] for @${task.owner}!`);
      },
      onCommitmentDismissed: (item) => {
        this.updateDashboardKPIs();
        this.renderAuditHistory();
        this.renderAnalytics();
        this.showToast(`❌ Dismissed commitment: "${item.taskTitle.substring(0, 30)}..."`);
      },
      onInboxUpdated: (stats) => {
        this.updateDashboardKPIs();
        this.renderAnalytics();
      }
    });

    this.inboxManager.setCommitments(initialCommitments);
  }

  initTaskManager() {
    this.taskManager = new TaskManager('kanbanBoardContainer', 'tasksListContainer', 'forgottenRadarBanner', (stats) => {
      this.updateDashboardKPIs();
      this.renderAuditHistory();
      this.renderAnalytics();
    });

    this.taskManager.setTasks(INITIAL_CONFIRMED_TASKS);
    this.renderAuditHistory();
  }

  bindEvents() {
    // Tab Navigation
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add('active');

        if (tabId === 'tab-analytics') {
          setTimeout(() => this.renderAnalytics(), 80);
        }
        if (tabId === 'tab-history') {
          this.renderAuditHistory();
        }
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
        themeBtn.textContent = newTheme === 'dark' ? '🌓' : '☀️';
        this.renderAnalytics();
      });
    }

    // Channel Preset Buttons
    document.querySelectorAll('.channel-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeChannelIndex = idx;
        this.loadChannelPreview(PRELOADED_COMMS[idx]);
      });
    });

    // Run Detection Button on Simulator Deck
    const scanBtn = document.getElementById('runDetectionBtn');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        const activeComm = PRELOADED_COMMS[this.activeChannelIndex];
        this.showToast(`🧠 Scanning ${activeComm.channelName} with NLP engine...`);
        
        const extracted = await this.commitmentEngine.analyzeCommunication({
          text: activeComm.rawContent,
          sourceType: activeComm.channelType === "slack" ? "Slack" : activeComm.channelType === "email" ? "Email" : "Meeting",
          sourceChannel: activeComm.channelName,
          sender: activeComm.sender
        });

        this.inboxManager.addCommitments(extracted);
        this.showToast(`🎉 Detected ${extracted.length} commitments added to AI Inbox!`);
        
        setTimeout(() => {
          document.querySelector('[data-tab="tab-inbox"]')?.click();
        }, 400);
      });
    }

    // AI Inbox Filters
    document.getElementById('inboxSourceFilter')?.addEventListener('change', (e) => {
      this.inboxManager.setFilters({ source: e.target.value });
    });
    document.getElementById('inboxConfidenceFilter')?.addEventListener('change', (e) => {
      this.inboxManager.setFilters({ confidence: e.target.value });
    });
    document.getElementById('inboxConfirmAllBtn')?.addEventListener('click', () => {
      this.inboxManager.confirmAll();
      this.showToast('✅ Confirmed all pending commitments to My Tasks!');
    });

    // Task Filters & Search
    document.getElementById('taskOwnerFilter')?.addEventListener('change', (e) => {
      this.taskManager.setFilters({ owner: e.target.value });
    });
    document.getElementById('taskPriorityFilter')?.addEventListener('change', (e) => {
      this.taskManager.setFilters({ priority: e.target.value });
    });
    document.getElementById('taskSourceFilter')?.addEventListener('change', (e) => {
      this.taskManager.setFilters({ source: e.target.value });
    });
    document.getElementById('taskSearchInput')?.addEventListener('input', (e) => {
      this.taskManager.setFilters({ search: e.target.value });
    });

    // Task View Mode Switcher
    const kanbanBtn = document.getElementById('viewKanbanBtn');
    const listBtn = document.getElementById('viewListBtn');
    if (kanbanBtn && listBtn) {
      kanbanBtn.addEventListener('click', () => {
        kanbanBtn.style.background = 'rgba(16,185,129,0.15)';
        kanbanBtn.style.color = 'var(--color-primary)';
        kanbanBtn.style.borderColor = 'rgba(16,185,129,0.3)';
        listBtn.style.background = 'var(--bg-card)';
        listBtn.style.color = 'var(--text-primary)';
        listBtn.style.borderColor = 'var(--border-subtle)';
        this.taskManager.setViewMode('kanban');
      });
      listBtn.addEventListener('click', () => {
        listBtn.style.background = 'rgba(16,185,129,0.15)';
        listBtn.style.color = 'var(--color-primary)';
        listBtn.style.borderColor = 'rgba(16,185,129,0.3)';
        kanbanBtn.style.background = 'var(--bg-card)';
        kanbanBtn.style.color = 'var(--text-primary)';
        kanbanBtn.style.borderColor = 'var(--border-subtle)';
        this.taskManager.setViewMode('list');
      });
    }

    // Ingest Modal Triggers
    document.getElementById('openIngestModalBtn')?.addEventListener('click', () => this.openIngestModal());
    document.getElementById('runCustomIngestBtn')?.addEventListener('click', () => this.handleCustomIngest());

    // Settings Modal Triggers
    document.getElementById('openSettingsBtn')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());

    // Edit Commitment Save
    document.getElementById('saveEditCommitmentBtn')?.addEventListener('click', () => this.saveEditCommitment());

    // Delegate Commitment Save
    document.getElementById('saveDelegateBtn')?.addEventListener('click', () => this.saveDelegation());

    // Task Detail Save & Delete
    document.getElementById('modalSaveTaskBtn')?.addEventListener('click', () => this.saveTaskModal());
    document.getElementById('modalDeleteTaskBtn')?.addEventListener('click', () => this.deleteTaskModal());
    document.getElementById('addNewTaskManualBtn')?.addEventListener('click', () => this.openNewTaskModal());

    // Export Audit Log CSV
    document.getElementById('exportAuditCsvBtn')?.addEventListener('click', () => this.exportAuditCSV());

    // Pricing Billing Toggle
    const billingToggle = document.getElementById('pricingBillingToggle');
    if (billingToggle) {
      billingToggle.addEventListener('change', (e) => {
        const isAnnual = e.target.checked;
        document.getElementById('proPriceDisplay').textContent = isAnnual ? '₹239' : '₹299';
        document.getElementById('teamPriceDisplay').textContent = isAnnual ? '₹479' : '₹599';
      });
    }
  }

  loadChannelPreview(comm) {
    const badge = document.getElementById('activeChannelBadge');
    const timestamp = document.getElementById('activeChannelTimestamp');
    const feedContainer = document.getElementById('richChannelFeed');

    if (badge) {
      badge.textContent = `${comm.channelIcon} Channel: ${comm.channelName}`;
      badge.style.color = comm.channelType === 'slack' ? 'var(--color-slack)' : comm.channelType === 'email' ? 'var(--color-email)' : 'var(--color-zoom)';
    }
    if (timestamp) timestamp.textContent = comm.timestamp;

    if (feedContainer) {
      feedContainer.innerHTML = this.formatRichFeed(comm);
    }
  }

  formatRichFeed(comm) {
    if (comm.channelType === "slack") {
      const lines = comm.rawContent.split('\n');
      const avatarMap = {
        'Aarav': '👨‍💼',
        'Rahul': '👨‍💻',
        'Priya': '👩‍🎨',
        'Vikram': '👨‍🔧',
        'Neha': '👩‍💼'
      };

      return lines.map(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return `<div class="chat-text">${line}</div>`;
        const sender = line.substring(0, colonIdx).trim();
        const text = line.substring(colonIdx + 1).trim();
        const avatar = avatarMap[sender] || '👤';
        const isCommitment = text.includes('please send') || text.includes('will complete') || text.includes('check with') || text.includes('review the');

        return `
          <div class="chat-bubble-row">
            <div class="chat-avatar">${avatar}</div>
            <div class="chat-msg-body">
              <div class="chat-msg-meta">
                <span class="chat-sender-name">${sender}</span>
                <span class="chat-timestamp">10:42 AM</span>
                ${isCommitment ? '<span style="font-size: 0.7rem; background: rgba(16,185,129,0.15); color: var(--color-primary); padding: 1px 6px; border-radius: 4px; font-weight: 700;">⚡ Commitment Detected</span>' : ''}
              </div>
              <div class="chat-text ${isCommitment ? 'chat-commitment-highlight' : ''}">${text}</div>
            </div>
          </div>
        `;
      }).join('');
    } else if (comm.channelType === "email") {
      return `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.15rem; font-size: 0.875rem;">
          <div style="display: grid; grid-template-columns: 80px 1fr; gap: 0.4rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.85rem; font-size: 0.825rem;">
            <strong style="color: var(--text-muted);">From:</strong> <span>Sarah Jenkins &lt;sjenkins@apexfin.com&gt;</span>
            <strong style="color: var(--text-muted);">To:</strong> <span>dev-leads@company.com</span>
            <strong style="color: var(--text-muted);">Subject:</strong> <span style="font-weight: 700; color: var(--text-primary);">Re: Production Database Migration Timeline & SLA</span>
          </div>
          <div style="line-height: 1.6; color: #e2e8f0; white-space: pre-wrap;">Hi Team,

We need confirmation on the database failover SLA before signing the master service agreement.
<span class="chat-commitment-highlight">Could someone from backend please provide the updated RPO/RTO benchmark document by tomorrow EOD?</span>
<span class="chat-commitment-highlight">Also, please update the staging environment with sanitized data by Thursday.</span>

Best regards,
Sarah Jenkins (VP Tech, Apex Financial)</div>
        </div>
      `;
    } else {
      // Zoom Meeting Transcript
      return `
        <div>
          <div class="audio-waveform-deck" title="Live Zoom Audio Stream Transcribed">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-zoom); margin-right: 6px;">🎙️ Audio Transcript:</span>
            <div class="waveform-bar" style="animation-delay: 0.1s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.3s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.15s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.45s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.25s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.5s;"></div>
            <div class="waveform-bar" style="animation-delay: 0.2s;"></div>
          </div>
          <div style="font-size: 0.875rem; line-height: 1.7; color: #cbd5e1; white-space: pre-wrap; margin-top: 0.5rem;">[00:14:10] <strong>David Chen (VP Eng):</strong> "We need the API rate limiter merged before the mobile release on Monday."
[00:14:32] <strong>Kavita Rao (Lead Dev):</strong> "<span class="chat-commitment-highlight">I will optimize the Redis cache layer and push the pull request by Friday 3 PM.</span>"
[00:15:05] <strong>David Chen:</strong> "<span class="chat-commitment-highlight">Great. Rohan, can you verify the load testing benchmarks by Friday evening?</span>"
[00:15:20] <strong>Rohan Mehta (QA):</strong> "Understood, will complete the load tests on staging."</div>
        </div>
      `;
    }
  }

  updateDashboardKPIs() {
    const inboxStats = this.inboxManager ? this.inboxManager.getStats() : { pendingCount: 4 };
    const taskStats = this.taskManager ? this.taskManager.getStats() : { total: 5, forgottenRisks: 2 };

    const totalDetected = inboxStats.pendingCount + taskStats.total;
    document.getElementById('statDetectedCount').textContent = totalDetected;
    document.getElementById('statPendingCount').textContent = inboxStats.pendingCount;
    document.getElementById('statActiveCount').textContent = taskStats.total;
    document.getElementById('statRisksCount').textContent = taskStats.forgottenRisks;

    // Badges in Header Tabs
    const inboxBadge = document.getElementById('navInboxBadge');
    if (inboxBadge) inboxBadge.textContent = inboxStats.pendingCount;
    const tasksBadge = document.getElementById('navTasksBadge');
    if (tasksBadge) tasksBadge.textContent = taskStats.total;
  }

  populateTeamDropdowns() {
    const ownerFilter = document.getElementById('taskOwnerFilter');
    const delegateSelect = document.getElementById('delegateMemberSelect');

    if (ownerFilter) {
      ownerFilter.innerHTML = `<option value="all">👥 All Team Owners</option>` +
        this.teamMembers.map(m => `<option value="${m.name}">${m.avatar} ${m.name}</option>`).join('');
    }

    if (delegateSelect) {
      delegateSelect.innerHTML = this.teamMembers.map(m => 
        `<option value="${m.name}">${m.avatar} ${m.name} (${m.role})</option>`
      ).join('');
    }
  }

  renderTeamMembers() {
    const container = document.getElementById('teamMembersGrid');
    if (!container) return;

    container.innerHTML = this.teamMembers.map(m => `
      <div class="member-card">
        <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
          <div class="member-avatar">
            ${m.avatar}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); font-family: var(--font-heading);">${m.name}</div>
            <div style="font-size: 0.775rem; color: var(--text-secondary);">${m.role} • ${m.department}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 1.15rem; color: var(--color-primary); font-family: var(--font-heading);">${m.reliabilityScore}%</div>
          <div style="font-size: 0.725rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Reliability</div>
        </div>
      </div>
    `).join('');
  }

  renderAuditHistory() {
    const tableBody = document.getElementById('auditHistoryTableBody');
    if (!tableBody || !this.taskManager) return;

    const history = this.taskManager.getAuditHistory();
    if (history.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No audit logs recorded yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = history.slice(0, 15).map(h => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.775rem; color: var(--text-muted);">${h.timestamp}</td>
        <td>
          <span style="font-weight: 700; color: var(--color-primary); font-family: var(--font-mono); font-size: 0.75rem;">${h.taskId}</span>
          <div style="font-weight: 600; font-size: 0.875rem;">${h.title}</div>
        </td>
        <td><strong>${h.owner}</strong></td>
        <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${h.sourceType || 'Direct'} (${h.sourceChannel || 'General'})</span></td>
        <td><span style="background: rgba(16,185,129,0.15); color: var(--color-primary); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">${h.action}</span></td>
      </tr>
    `).join('');
  }

  renderAnalytics() {
    const confirmedCount = this.taskManager ? this.taskManager.getTasks().length : 5;
    const pendingCount = this.inboxManager ? this.inboxManager.getCommitments().length : 4;
    const dismissedCount = this.inboxManager ? this.inboxManager.getStats().dismissedCount : 1;

    // Conversion Doughnut Chart
    const convCanvas = document.getElementById('conversionDoughnutChart');
    if (convCanvas && window.Chart) {
      if (this.charts.conversion) this.charts.conversion.destroy();
      this.charts.conversion = new window.Chart(convCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Confirmed Tasks', 'Pending Review', 'Dismissed / Non-Tasks'],
          datasets: [{
            data: [confirmedCount, pendingCount, Math.max(1, dismissedCount)],
            backgroundColor: ['#10b981', '#f59e0b', '#64748b'],
            borderColor: '#070a13',
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12, weight: 600 } }
            }
          },
          cutout: '68%'
        }
      });
    }

    // Reliability Bar Chart
    const relCanvas = document.getElementById('reliabilityBarChart');
    if (relCanvas && window.Chart) {
      if (this.charts.reliability) this.charts.reliability.destroy();
      this.charts.reliability = new window.Chart(relCanvas, {
        type: 'bar',
        data: {
          labels: this.teamMembers.map(m => m.name.split(' ')[0]),
          datasets: [{
            label: 'Reliability Index %',
            data: this.teamMembers.map(m => m.reliabilityScore),
            backgroundColor: '#06b6d4',
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 70,
              max: 100,
              ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } },
              grid: { color: 'rgba(255,255,255,0.06)' }
            },
            x: {
              ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', weight: 600 } },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }

  setupRoiCalculator() {
    const empSlider = document.getElementById('roiEmployeesSlider');
    const forgSlider = document.getElementById('roiForgottenSlider');

    const updateRoi = () => {
      const emps = parseInt(empSlider.value, 10);
      const forg = parseInt(forgSlider.value, 10);

      document.getElementById('roiEmployeesCount').textContent = emps;
      document.getElementById('roiForgottenCount').textContent = forg;

      const monthlySaved = emps * forg * 750; // ~₹750 value per preserved commitment / deadline
      document.getElementById('roiSavedAmount').textContent = `₹${monthlySaved.toLocaleString('en-IN')}`;
    };

    if (empSlider && forgSlider) {
      empSlider.addEventListener('input', updateRoi);
      forgSlider.addEventListener('input', updateRoi);
      updateRoi();
    }
  }

  // Confirm / Dismiss Handlers from AI Inbox
  confirmCommitment(id) {
    this.inboxManager.confirmCommitment(id);
  }

  dismissCommitment(id) {
    this.inboxManager.dismissCommitment(id);
  }

  // Edit Modal Handlers
  openEditCommitmentModal(id) {
    const c = this.inboxManager.getCommitments().find(item => item.id === id);
    if (!c) return;

    document.getElementById('editCommitmentId').value = c.id;
    document.getElementById('editCommitmentTitle').value = c.taskTitle;
    document.getElementById('editCommitmentOwner').value = c.owner;
    document.getElementById('editCommitmentDeadline').value = c.deadline;
    document.getElementById('editCommitmentPriority').value = c.priority;

    document.getElementById('editCommitmentModal')?.classList.add('active');
  }

  closeEditCommitmentModal() {
    document.getElementById('editCommitmentModal')?.classList.remove('active');
  }

  saveEditCommitment() {
    const id = document.getElementById('editCommitmentId').value;
    const taskTitle = document.getElementById('editCommitmentTitle').value;
    const owner = document.getElementById('editCommitmentOwner').value;
    const deadline = document.getElementById('editCommitmentDeadline').value;
    const priority = document.getElementById('editCommitmentPriority').value;

    this.inboxManager.updateCommitment({
      id,
      taskTitle,
      owner,
      deadline,
      priority
    });

    this.closeEditCommitmentModal();
    this.showToast('✅ Updated commitment details!');
  }

  // Delegate Modal Handlers
  openDelegateModal(id) {
    document.getElementById('delegateCommitmentId').value = id;
    document.getElementById('delegateModal')?.classList.add('active');
  }

  closeDelegateModal() {
    document.getElementById('delegateModal')?.classList.remove('active');
  }

  saveDelegation() {
    const id = document.getElementById('delegateCommitmentId').value;
    const newOwnerName = document.getElementById('delegateMemberSelect').value;
    const member = this.teamMembers.find(m => m.name === newOwnerName) || { avatar: '👤', role: 'Team Member' };

    this.inboxManager.updateCommitment({
      id,
      owner: newOwnerName,
      ownerAvatar: member.avatar,
      ownerRole: member.role
    });

    this.closeDelegateModal();
    this.showToast(`🔄 Delegated commitment to @${newOwnerName}`);
  }

  // Custom Ingest Modal Handlers
  openIngestModal() {
    document.getElementById('ingestModal')?.classList.add('active');
  }

  closeIngestModal() {
    document.getElementById('ingestModal')?.classList.remove('active');
  }

  async handleCustomIngest() {
    const sourceType = document.getElementById('customIngestSource').value;
    const sourceChannel = document.getElementById('customIngestChannel').value || "General Feed";
    const text = document.getElementById('customIngestText').value;

    if (!text.trim()) {
      this.showToast('⚠️ Please enter communication text.');
      return;
    }

    this.closeIngestModal();
    this.showToast('✨ NLP engine scanning communication for commitments...');

    const extracted = await this.commitmentEngine.analyzeCommunication({
      text,
      sourceType,
      sourceChannel,
      sender: "Team Member"
    });

    this.inboxManager.addCommitments(extracted);
    this.showToast(`🎉 Detected ${extracted.length} commitments in AI Inbox!`);
    document.querySelector('[data-tab="tab-inbox"]')?.click();
  }

  // Trigger Demo Simulator
  triggerDemoSim() {
    const randomComm = PRELOADED_COMMS[Math.floor(Math.random() * PRELOADED_COMMS.length)];
    this.inboxManager.addCommitments(randomComm.detectedCommitments);
    this.showToast(`📥 Ingested commitments from ${randomComm.channelName}!`);
  }

  // Task Details Modal Handlers
  openTaskModal(taskId) {
    const task = this.taskManager.getTasks().find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('taskDetailModalTitle').textContent = `Task Details: ${task.id}`;
    document.getElementById('modalTaskId').value = task.id;
    document.getElementById('modalTaskTitle').value = task.title;
    document.getElementById('modalTaskOwner').value = task.owner;
    document.getElementById('modalTaskStatus').value = task.status;
    document.getElementById('modalTaskDeadline').value = task.deadline;
    document.getElementById('modalTaskOriginalSnippet').textContent = task.originalSnippet || "Directly confirmed task.";

    document.getElementById('taskDetailModal')?.classList.add('active');
  }

  closeTaskModal() {
    document.getElementById('taskDetailModal')?.classList.remove('active');
  }

  saveTaskModal() {
    const id = document.getElementById('modalTaskId').value;
    const title = document.getElementById('modalTaskTitle').value;
    const owner = document.getElementById('modalTaskOwner').value;
    const status = document.getElementById('modalTaskStatus').value;
    const deadline = document.getElementById('modalTaskDeadline').value;

    this.taskManager.updateTask({
      id,
      title,
      owner,
      status,
      deadline
    });

    this.closeTaskModal();
    this.showToast(`✅ Updated Task ${id}`);
  }

  deleteTaskModal() {
    const id = document.getElementById('modalTaskId').value;
    if (confirm(`Delete task ${id}?`)) {
      this.taskManager.deleteTask(id);
      this.closeTaskModal();
      this.showToast(`🗑️ Deleted task ${id}`);
    }
  }

  openNewTaskModal() {
    const newId = `TASK-${Math.floor(100 + Math.random() * 900)}`;
    const newTask = {
      id: newId,
      title: "New Manual Action Item",
      owner: this.teamMembers[0].name,
      ownerAvatar: this.teamMembers[0].avatar,
      ownerRole: this.teamMembers[0].role,
      requester: "Manual Entry",
      deadline: "Friday, 5:00 PM",
      priority: "Medium",
      status: "todo",
      sourceType: "Direct",
      sourceChannel: "Manual",
      originalSnippet: "Directly added commitment.",
      confidence: 100,
      confirmedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isForgottenRisk: false
    };

    this.taskManager.addTask(newTask);
    this.showToast(`✅ Created Task ${newId}`);
    this.openTaskModal(newId);
  }

  // Kanban Drag and Drop
  handleDragStart(event, taskId) {
    this.draggedTaskId = taskId;
    event.dataTransfer.setData('text/plain', taskId);
  }

  handleDrop(event, columnId) {
    event.preventDefault();
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
    if (this.draggedTaskId) {
      this.taskManager.moveTaskStatus(this.draggedTaskId, columnId);
      this.showToast(`📋 Moved ${this.draggedTaskId} to ${columnId.toUpperCase()}`);
      this.draggedTaskId = null;
    }
  }

  // Slack Nudge Reminder Simulation
  sendNudge(taskId) {
    const task = this.taskManager.getTasks().find(t => t.id === taskId);
    if (!task) return;

    this.showToast(`🔔 Slack Reminder sent to @${task.owner}: "Reminder: '${task.title}' is due ${task.deadline}."`);
  }

  // Export Audit CSV
  exportAuditCSV() {
    const history = this.taskManager.getAuditHistory();
    const headers = ["Timestamp", "Task ID", "Summary", "Owner", "Source Channel", "Action"];
    const rows = history.map(h => [
      `"${h.timestamp}"`,
      `"${h.taskId}"`,
      `"${(h.title || '').replace(/"/g, '""')}"`,
      `"${h.owner}"`,
      `"${h.sourceType} (${h.sourceChannel})"`,
      `"${h.action}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commitpulse_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    this.showToast('⬇️ Downloaded Audit Trail CSV');
  }

  // AI Settings Modal
  openSettingsModal() {
    const keyInput = document.getElementById('geminiApiKeyInput');
    if (keyInput) keyInput.value = this.commitmentEngine.getApiKey();
    document.getElementById('settingsModal')?.classList.add('active');
  }

  closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.remove('active');
  }

  saveSettings() {
    const key = document.getElementById('geminiApiKeyInput')?.value || '';
    this.commitmentEngine.setApiKey(key);
    this.closeSettingsModal();
    this.showToast(key ? '✅ Gemini API Key Saved!' : 'ℹ️ Using Built-in NLP Engine');
  }

  // Toast Notification
  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px) scale(0.95)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => {
        if (toast.parentNode) container.removeChild(toast);
      }, 300);
    }, 3200);
  }
}

// Start Application on Load
document.addEventListener('DOMContentLoaded', () => {
  new CommitPulseApp();
});
