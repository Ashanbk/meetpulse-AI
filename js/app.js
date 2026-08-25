// app.js - Meetpulse Master Application Orchestrator (Password-Protected Auth | INR Pricing | Mobile Responsive)
import { DEFAULT_USERS, PRELOADED_COMMS, INITIAL_CONFIRMED_TASKS } from './mockCommsData.js';
import { CommitmentEngine } from './commitmentEngine.js';
import { InboxManager } from './inboxManager.js';
import { TaskManager } from './taskManager.js';

class MeetPulseApp {
  constructor() {
    this.currentUser = null;
    this.registeredUsers = [];
    this.communicationStreams = [];
    this.commitmentEngine = new CommitmentEngine();
    this.inboxManager = null;
    this.taskManager = null;

    this.activeChannelIndex = 0;
    this.activeViewId = 'view-chat';
    this.charts = { conversion: null, reliability: null };
    this.inchatCommitmentsMap = new Map();

    this.init();
  }

  init() {
    this.initUsers();
    this.initInbox();
    this.initTaskManager();
    this.bindEvents();
    this.loadChannel(0);
    this.setupRoiCalculator();

    window.commitPulseApp = this;

    // Check stored session
    const storedSession = localStorage.getItem('meetpulse_session');
    if (storedSession) {
      try {
        const user = JSON.parse(storedSession);
        const valid = this.registeredUsers.find(u => u.email.toLowerCase() === user.email.toLowerCase());
        if (valid) {
          this.setCurrentUser(valid);
          this.closeAuthOverlay();
        } else {
          this.openAuthOverlay();
        }
      } catch (e) {
        this.openAuthOverlay();
      }
    } else {
      this.openAuthOverlay();
    }
  }

  initUsers() {
    const storedUsers = localStorage.getItem('meetpulse_users_db');
    if (storedUsers) {
      try {
        this.registeredUsers = JSON.parse(storedUsers);
        // Ensure all existing users have a password
        this.registeredUsers.forEach(u => {
          if (!u.password) u.password = u.isAdmin ? 'admin123' : 'employee123';
        });
      } catch (e) {
        this.registeredUsers = [...DEFAULT_USERS];
      }
    } else {
      this.registeredUsers = [...DEFAULT_USERS];
      this.saveUsers();
    }

    this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
  }

  saveUsers() {
    localStorage.setItem('meetpulse_users_db', JSON.stringify(this.registeredUsers));
    this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
    this.renderRegisteredAccountsDeck();
    this.renderTeamMembers();
  }

  setCurrentUser(user) {
    this.currentUser = user;
    localStorage.setItem('meetpulse_session', JSON.stringify(user));

    const avatarEl = document.getElementById('sidebarUserAvatar');
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    const roleBadgeEl = document.getElementById('sidebarUserRoleBadge');

    if (avatarEl) avatarEl.textContent = user.avatar || user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = user.role;
    if (roleBadgeEl) {
      if (user.isAdmin || user.role === 'Administrator') {
        roleBadgeEl.textContent = 'ADMIN';
        roleBadgeEl.style.background = 'var(--color-primary-light)';
        roleBadgeEl.style.color = 'var(--color-primary)';
      } else {
        roleBadgeEl.textContent = 'EMPLOYEE';
        roleBadgeEl.style.background = 'var(--color-accent-light)';
        roleBadgeEl.style.color = 'var(--color-accent)';
      }
    }

    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.updateDashboardKPIs();
    this.renderAnalytics();
  }

  openAuthOverlay() {
    document.getElementById('authOverlay')?.classList.add('active');
    this.renderRegisteredAccountsDeck();
  }

  closeAuthOverlay() {
    document.getElementById('authOverlay')?.classList.remove('active');
    const err = document.getElementById('loginErrorMessage');
    if (err) err.style.display = 'none';
  }

  renderRegisteredAccountsDeck() {
    const list = document.getElementById('employeePresetsList');
    if (!list) return;

    const employees = this.registeredUsers.filter(u => !u.isAdmin && u.role !== 'Administrator');
    if (employees.length === 0) {
      list.innerHTML = `
        <div style="font-size: 0.74rem; color: var(--text-muted); padding: 0.25rem 0;">
          No employee accounts created yet.
        </div>
      `;
      return;
    }

    let html = '';
    employees.forEach(emp => {
      html += `
        <div class="team-member-card" style="padding: 0.45rem 0.65rem; cursor: pointer; background: var(--bg-card);" onclick="window.commitPulseApp.fillCredentials('${emp.email}', '${emp.password || 'employee123'}')">
          <span class="avatar-initials avatar-sm">${emp.avatar}</span>
          <div style="flex: 1; overflow: hidden;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${emp.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">${emp.email} • ${emp.password || 'employee123'}</div>
          </div>
          <span style="font-size: 0.7rem; color: var(--color-primary); font-weight: 700;">Fill →</span>
        </div>
      `;
    });

    list.innerHTML = html;
  }

  fillCredentials(email, password) {
    const emailInput = document.getElementById('loginEmailInput');
    const passInput = document.getElementById('loginPasswordInput');
    if (emailInput) emailInput.value = email;
    if (passInput) passInput.value = password;
    this.showToast(`Autofilled credentials for ${email}`);
  }

  loginWithCredentials(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();

    const user = this.registeredUsers.find(u => u.email.toLowerCase() === trimmedEmail);
    const err = document.getElementById('loginErrorMessage');

    if (!user) {
      if (err) {
        err.textContent = `No account found for "${email}". Please verify your email or sign in as Administrator to create this employee.`;
        err.style.display = 'block';
      }
      return;
    }

    if (user.password !== trimmedPass) {
      if (err) {
        err.textContent = `Incorrect password for ${email}. Please check and try again.`;
        err.style.display = 'block';
      }
      return;
    }

    // Success
    this.setCurrentUser(user);
    this.closeAuthOverlay();
    this.showToast(`Signed in successfully as ${user.name} (${user.role})`);
  }

  logout() {
    localStorage.removeItem('meetpulse_session');
    this.currentUser = null;
    this.openAuthOverlay();
    this.showToast('Signed out of workspace');
  }

  initInbox() {
    this.inboxManager = new InboxManager('inboxContainer', {
      onTaskConfirmed: (task) => {
        this.taskManager.addTask(task);
        this.updateDashboardKPIs();
        this.renderAuditHistory();
        this.renderAnalytics();
        this.renderRadarRisks();
        this.updateInChatCardStatus(task.id, 'confirmed', task.id);
        this.showToast(`Approved Deliverable [${task.id}] for ${task.owner}`);
      },
      onCommitmentDismissed: (item) => {
        this.updateDashboardKPIs();
        this.renderAuditHistory();
        this.renderAnalytics();
        this.renderRadarRisks();
        this.updateInChatCardStatus(item.id, 'dismissed');
        this.showToast(`Dismissed commitment: "${item.taskTitle.substring(0, 30)}..."`);
      },
      onInboxUpdated: (stats) => {
        this.updateDashboardKPIs();
        this.renderAnalytics();
        this.renderRadarRisks();
      }
    });

    this.inboxManager.setCommitments([]);
  }

  initTaskManager() {
    this.taskManager = new TaskManager('kanbanBoardContainer', 'tasksListContainer', 'forgottenRadarBanner', (stats) => {
      this.updateDashboardKPIs();
      this.renderAuditHistory();
      this.renderAnalytics();
      this.renderRadarRisks();
    });

    this.taskManager.setTasks([]);
    this.renderAuditHistory();
  }

  bindEvents() {
    // Password-Protected Sign In Form
    document.getElementById('secureLoginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmailInput')?.value;
      const password = document.getElementById('loginPasswordInput')?.value;
      this.loginWithCredentials(email, password);
    });

    // Password Visibility Toggle
    const togglePassBtn = document.getElementById('toggleLoginPasswordBtn');
    const passInput = document.getElementById('loginPasswordInput');
    if (togglePassBtn && passInput) {
      togglePassBtn.addEventListener('click', () => {
        const isPassword = passInput.getAttribute('type') === 'password';
        passInput.setAttribute('type', isPassword ? 'text' : 'password');
        togglePassBtn.style.color = isPassword ? 'var(--color-primary)' : 'var(--text-muted)';
      });
    }

    // 1-Click Fast Admin Sign In Fill
    document.getElementById('quickLoginAdminBtn')?.addEventListener('click', () => {
      this.fillCredentials('admin@meetpulse.ai', 'admin123');
      this.loginWithCredentials('admin@meetpulse.ai', 'admin123');
    });
    
    // Quick create employee from login screen
    document.getElementById('quickCreateEmpFromLoginBtn')?.addEventListener('click', () => {
      this.fillCredentials('admin@meetpulse.ai', 'admin123');
      this.loginWithCredentials('admin@meetpulse.ai', 'admin123');
      this.switchView('view-analytics');
      this.openAddMemberModal();
    });

    // Switch User / Logout
    document.getElementById('switchUserBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('userProfileTrigger')?.addEventListener('click', () => this.logout());

    // Mobile Sidebar Drawer & Backdrop
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    const openSidebar = () => {
      sidebar?.classList.add('sidebar-open');
      backdrop?.classList.add('active');
    };

    const closeSidebar = () => {
      sidebar?.classList.remove('sidebar-open');
      backdrop?.classList.remove('active');
    };

    if (mobileToggle) mobileToggle.addEventListener('click', openSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // Sidebar View Navigation
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        this.switchView(viewId);
        if (window.innerWidth <= 992) closeSidebar();
      });
    });

    // Brand Home Trigger
    document.getElementById('brandHomeTrigger')?.addEventListener('click', () => {
      this.switchView('view-chat');
    });

    // Sidebar Channel Switcher
    document.querySelectorAll('#channelList .sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-channel-idx'), 10);
        document.querySelectorAll('#channelList .sidebar-item').forEach(b => b.classList.remove('active'));
        item.classList.add('active');
        this.loadChannel(idx);
        this.switchView('view-chat');
        if (window.innerWidth <= 992) closeSidebar();
      });
    });

    // Theme Toggle (Dark: Black & Green | Light: White & Blue)
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
        this.showToast(`Switched to ${newTheme.toUpperCase()} theme (${newTheme === 'dark' ? 'Black & Green' : 'White & Blue'})`);
        this.renderAnalytics();
      });
    }

    // Quick Action Queue Trigger
    document.getElementById('quickInboxBtn')?.addEventListener('click', () => {
      this.switchView('view-inbox');
    });

    // Employee Creator Triggers (Everywhere in the UI)
    const triggerEmpCreator = () => {
      if (this.currentUser && !this.currentUser.isAdmin && this.currentUser.role !== 'Administrator') {
        this.showToast('Administrator privileges required to create employee accounts.');
        return;
      }
      this.switchView('view-analytics');
      this.openAddMemberModal();
    };

    document.getElementById('quickCreateEmpHeaderBtn')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('openAddMemberSidebarBtn')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('chipCreateEmployee')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('chipManageEmployees')?.addEventListener('click', () => this.switchView('view-analytics'));
    document.getElementById('openAddMemberBtn')?.addEventListener('click', triggerEmpCreator);

    // Ingest Modals & Triggers
    document.getElementById('openIngestModalHeaderBtn')?.addEventListener('click', () => this.openIngestModal());
    document.getElementById('openIngestModalBtn')?.addEventListener('click', () => this.openIngestModal());
    document.getElementById('chipIngestMeeting')?.addEventListener('click', () => this.openIngestModal());
    document.getElementById('chipCheckRadar')?.addEventListener('click', () => this.switchView('view-radar'));
    document.getElementById('chipCustomPromise')?.addEventListener('click', () => {
      const input = document.getElementById('chatInputText');
      if (input) {
        input.value = 'Please review and deploy the new authentication update by Friday 5:00 PM.';
        input.focus();
      }
    });

    // Chat Send & Scan Input
    const sendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInputText');
    if (sendBtn && chatInput) {
      sendBtn.addEventListener('click', () => this.handleSendMessage());
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }

    // Action Queue Filters
    document.getElementById('inboxSourceFilter')?.addEventListener('change', (e) => {
      this.inboxManager.setFilters({ source: e.target.value });
    });
    document.getElementById('inboxConfidenceFilter')?.addEventListener('change', (e) => {
      this.inboxManager.setFilters({ confidence: e.target.value });
    });
    document.getElementById('inboxConfirmAllBtn')?.addEventListener('click', () => {
      this.inboxManager.confirmAll();
      this.showToast('Approved all pending commitments to Deliverables Board');
    });

    // Task Filters & Search
    document.getElementById('taskOwnerFilter')?.addEventListener('change', (e) => {
      this.taskManager.setFilters({ owner: e.target.value });
    });
    document.getElementById('taskPriorityFilter')?.addEventListener('change', (e) => {
      this.taskManager.setFilters({ priority: e.target.value });
    });
    document.getElementById('taskSearchInput')?.addEventListener('input', (e) => {
      this.taskManager.setFilters({ search: e.target.value });
    });

    // Task View Switcher (Kanban vs List)
    const kanbanBtn = document.getElementById('viewKanbanBtn');
    const listBtn = document.getElementById('viewListBtn');
    if (kanbanBtn && listBtn) {
      kanbanBtn.addEventListener('click', () => {
        kanbanBtn.style.background = 'var(--color-primary-light)';
        kanbanBtn.style.color = 'var(--color-primary)';
        kanbanBtn.style.borderColor = 'var(--border-glow)';
        listBtn.style.background = 'var(--bg-card)';
        listBtn.style.color = 'var(--text-primary)';
        listBtn.style.borderColor = 'var(--border-medium)';
        this.taskManager.setViewMode('kanban');
      });
      listBtn.addEventListener('click', () => {
        listBtn.style.background = 'var(--color-primary-light)';
        listBtn.style.color = 'var(--color-primary)';
        listBtn.style.borderColor = 'var(--border-glow)';
        kanbanBtn.style.background = 'var(--bg-card)';
        kanbanBtn.style.color = 'var(--text-primary)';
        kanbanBtn.style.borderColor = 'var(--border-medium)';
        this.taskManager.setViewMode('list');
      });
    }

    // Modals & Forms
    document.getElementById('runCustomIngestBtn')?.addEventListener('click', () => this.handleCustomIngest());
    document.getElementById('openSettingsBtn')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('saveEditCommitmentBtn')?.addEventListener('click', () => this.saveEditCommitment());
    document.getElementById('saveDelegateBtn')?.addEventListener('click', () => this.saveDelegation());
    document.getElementById('modalSaveTaskBtn')?.addEventListener('click', () => this.saveTaskModal());
    document.getElementById('modalDeleteTaskBtn')?.addEventListener('click', () => this.deleteTaskModal());
    document.getElementById('addNewTaskManualBtn')?.addEventListener('click', () => this.openNewTaskModal());
    document.getElementById('exportAuditCsvBtn')?.addEventListener('click', () => this.exportAuditCSV());
    document.getElementById('saveAddMemberBtn')?.addEventListener('click', () => this.saveAddMember());

    // Inline Employee Creation Form in Team View
    document.getElementById('inlineCreateEmployeeForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('inlineEmpName')?.value.trim();
      const email = document.getElementById('inlineEmpEmail')?.value.trim().toLowerCase();
      const password = document.getElementById('inlineEmpPassword')?.value.trim();
      const role = document.getElementById('inlineEmpRole')?.value.trim() || 'Software Engineer';
      const dept = 'Engineering';
      this.createEmployeeAccount({ name, email, password, role, dept });
      document.getElementById('inlineEmpName').value = '';
      document.getElementById('inlineEmpEmail').value = '';
      document.getElementById('inlineEmpPassword').value = '';
      document.getElementById('inlineEmpRole').value = '';
    });

    // SaaS Pricing Billing Toggle (INR ₹)
    const billingToggle = document.getElementById('pricingBillingToggle');
    if (billingToggle) {
      billingToggle.addEventListener('change', (e) => {
        const isAnnual = e.target.checked;
        const proPrice = document.getElementById('proPriceDisplay');
        const teamPrice = document.getElementById('teamPriceDisplay');
        if (proPrice) proPrice.textContent = isAnnual ? '₹249' : '₹299';
        if (teamPrice) teamPrice.textContent = isAnnual ? '₹649' : '₹799';
      });
    }
  }

  switchView(viewId) {
    this.activeViewId = viewId;

    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    document.querySelectorAll('.view-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById(viewId);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    if (viewId === 'view-analytics') {
      setTimeout(() => this.renderAnalytics(), 80);
    }
    if (viewId === 'view-history') {
      this.renderAuditHistory();
    }
    if (viewId === 'view-radar') {
      this.renderRadarRisks();
    }
  }

  loadChannel(index) {
    this.activeChannelIndex = index;

    if (index === 1) {
      this.renderCopilotView();
      return;
    }

    const headerIcon = document.getElementById('headerChannelIcon');
    const headerTitle = document.getElementById('headerChannelTitle');
    const headerType = document.getElementById('headerChannelType');
    const headerMeta = document.getElementById('headerChannelMeta');

    if (headerIcon) headerIcon.textContent = 'MS';
    if (headerTitle) headerTitle.textContent = 'Active Meeting Stream';
    if (headerType) headerType.textContent = 'Real-time NLP';
    if (headerMeta) headerMeta.textContent = 'Ready to extract commitments, deadlines, and deliverables';

    const container = document.getElementById('dynamicChatThread');
    if (container) {
      if (this.communicationStreams.length === 0) {
        container.innerHTML = `
          <div class="empty-stream-card">
            <h3 class="empty-stream-title">No Meeting Stream Ingested Yet</h3>
            <p class="empty-stream-desc">
              Paste meeting audio transcripts, client emails, or team chat logs. Meetpulse will automatically extract promises, assign responsible owners, and set deadlines.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
              <button class="btn btn-primary" onclick="window.commitPulseApp.openIngestModal()">
                Ingest Meeting Audio / Notes
              </button>
              <button class="btn btn-secondary" onclick="window.commitPulseApp.switchView('view-analytics')">
                + Create Employee Account
              </button>
            </div>
          </div>
        `;
      } else {
        container.innerHTML = this.communicationStreams.map(s => this.buildStreamItemHTML(s)).join('');
      }
    }
  }

  buildStreamItemHTML(stream) {
    let threadHtml = `
      <div class="chat-message-group msg-other">
        <div class="avatar-initials">${stream.senderAvatar || 'MS'}</div>
        <div class="chat-bubble-content" style="width: 100%;">
          <div class="chat-sender-header">
            <span class="chat-sender-name">${stream.channelName}</span>
            <span class="chat-timestamp">${stream.timestamp}</span>
            <span class="chat-source-tag">${stream.sourceType}</span>
          </div>
          <div class="chat-bubble">
            <div class="audio-waveform-deck">
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--color-primary);">Audio Stream Recorded:</span>
              <div class="waveform-bars">
                <div class="waveform-bar" style="animation-delay: 0.1s;"></div>
                <div class="waveform-bar" style="animation-delay: 0.3s;"></div>
                <div class="waveform-bar" style="animation-delay: 0.2s;"></div>
                <div class="waveform-bar" style="animation-delay: 0.4s;"></div>
                <div class="waveform-bar" style="animation-delay: 0.15s;"></div>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: auto;">Duration: 18m 40s</span>
            </div>
            <div style="line-height: 1.6; font-size: 0.88rem; white-space: pre-wrap;">${this.escapeHtml(stream.rawContent)}</div>
          </div>
        </div>
      </div>
    `;

    if (stream.detectedCommitments && stream.detectedCommitments.length > 0) {
      threadHtml += `
        <div class="chat-message-group msg-ai" style="margin-top: 1rem;">
          <div class="avatar-initials">MP</div>
          <div class="chat-bubble-content" style="width: 100%;">
            <div class="chat-sender-header">
              <span class="chat-sender-name" style="color: var(--color-primary);">Meetpulse AI</span>
              <span class="chat-timestamp">Extraction Verified</span>
              <span class="chat-source-tag">${stream.detectedCommitments.length} Deliverables</span>
            </div>
            <div class="chat-bubble">
              <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 0.5rem;">
                Extracted ${stream.detectedCommitments.length} deliverable(s). Click <strong>Approve Deliverable</strong> to confirm:
              </div>
              <div class="inchat-commitment-deck">
                ${stream.detectedCommitments.map(item => this.buildInChatCommitmentCardHTML(item)).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return threadHtml;
  }

  buildInChatCommitmentCardHTML(item) {
    this.inchatCommitmentsMap.set(item.id, item);
    const priorityBadge = item.priority === 'Urgent' ? 'badge-urgent' : item.priority === 'High' ? 'badge-high' : 'badge-medium';

    return `
      <div class="inchat-commitment-card" id="inchat-card-${item.id}">
        <div class="inchat-card-top">
          <div class="inchat-task-title">${item.taskTitle}</div>
          <div class="inchat-badges-row">
            <span class="badge ${priorityBadge}">${item.priority}</span>
            <span class="badge badge-confidence">${item.confidence}% Match</span>
          </div>
        </div>

        <div class="inchat-meta-grid">
          <div class="inchat-meta-item">
            <span class="inchat-meta-lbl">Responsible Member</span>
            <span class="inchat-meta-val">
              <span class="avatar-initials avatar-sm">${item.ownerAvatar || 'ST'}</span>
              ${item.owner}
            </span>
          </div>
          <div class="inchat-meta-item">
            <span class="inchat-meta-lbl">Target Deadline</span>
            <span class="inchat-meta-val" style="color: var(--color-warning);">${item.deadline}</span>
          </div>
          <div class="inchat-meta-item">
            <span class="inchat-meta-lbl">Context</span>
            <span class="inchat-meta-val">${item.sourceChannel}</span>
          </div>
        </div>

        <div class="inchat-quote-box">
          "${item.originalSnippet}"
        </div>

        <div class="inchat-card-actions" id="inchat-actions-${item.id}">
          <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openEditCommitmentModal('${item.id}')">
            Edit
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openDelegateModal('${item.id}')">
            Reassign
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.commitPulseApp.inboxManager.dismissCommitment('${item.id}')">
            Dismiss
          </button>
          <button class="btn btn-primary btn-sm" onclick="window.commitPulseApp.inboxManager.confirmCommitment('${item.id}')">
            Approve Deliverable
          </button>
        </div>
      </div>
    `;
  }

  updateInChatCardStatus(commitmentId, status, taskId = '') {
    const actionsContainer = document.getElementById(`inchat-actions-${commitmentId}`);
    const card = document.getElementById(`inchat-card-${commitmentId}`);
    if (actionsContainer && card) {
      if (status === 'confirmed') {
        actionsContainer.innerHTML = `
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary); display: inline-flex; align-items: center; gap: 0.35rem;">
            Approved Deliverable [${taskId}] Added to Deliverables Board
          </span>
        `;
        card.style.borderColor = 'var(--color-primary)';
      } else if (status === 'dismissed') {
        actionsContainer.innerHTML = `
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Dismissed from action item queue.
          </span>
        `;
        card.style.opacity = '0.5';
      }
    }
  }

  renderCopilotView() {
    const headerIcon = document.getElementById('headerChannelIcon');
    const headerTitle = document.getElementById('headerChannelTitle');
    const headerType = document.getElementById('headerChannelType');
    const headerMeta = document.getElementById('headerChannelMeta');

    if (headerIcon) headerIcon.textContent = 'MP';
    if (headerTitle) headerTitle.textContent = 'Meetpulse Copilot';
    if (headerType) headerType.textContent = 'Universal Assistant';
    if (headerMeta) headerMeta.textContent = 'Query deliverables, check deadlines, or extract action items.';

    const container = document.getElementById('dynamicChatThread');
    if (container) {
      container.innerHTML = `
        <div class="chat-message-group msg-ai">
          <div class="avatar-initials">MP</div>
          <div class="chat-bubble-content">
            <div class="chat-sender-header">
              <span class="chat-sender-name" style="color: var(--color-primary);">Meetpulse Copilot</span>
              <span class="chat-timestamp">Online</span>
            </div>
            <div class="chat-bubble">
              <p>Welcome to <strong>Meetpulse AI</strong>. I monitor team discussions and meeting streams to automatically extract commitments and track deliverables.</p>
              <p style="margin-top: 0.5rem;">Sample queries you can input:</p>
              <ul style="margin-left: 1.25rem; margin-top: 0.35rem; font-size: 0.84rem; color: var(--text-secondary);">
                <li><em>"Please deploy the database backup script by Friday 5:00 PM"</em></li>
                <li><em>"I will finalize the API documentation tomorrow before noon"</em></li>
                <li><em>"What deliverables are currently at risk?"</em></li>
                <li><em>"Show team punctuality scores"</em></li>
              </ul>
            </div>
          </div>
        </div>
      `;
    }
  }

  async handleSendMessage() {
    const input = document.getElementById('chatInputText');
    const sourceSelect = document.getElementById('chatSourceSelect');
    if (!input || !input.value.trim()) return;

    const userText = input.value.trim();
    const source = sourceSelect ? sourceSelect.value : 'Direct Entry';
    input.value = '';

    const container = document.getElementById('dynamicChatThread');
    if (!container) return;

    const emptyCard = container.querySelector('.empty-stream-card');
    if (emptyCard) emptyCard.remove();

    const userName = this.currentUser ? this.currentUser.name : 'Team Member';
    const userAvatar = this.currentUser ? this.currentUser.avatar : 'TM';

    const userMsgHTML = `
      <div class="chat-message-group msg-user">
        <div class="avatar-initials">${userAvatar}</div>
        <div class="chat-bubble-content">
          <div class="chat-sender-header">
            <span class="chat-sender-name">${userName}</span>
            <span class="chat-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="chat-source-tag">${source}</span>
          </div>
          <div class="chat-bubble">${this.escapeHtml(userText)}</div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', userMsgHTML);

    const scrollContainer = document.getElementById('chatStreamContainer');
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

    this.showToast('Analyzing text with Meetpulse NLP Engine...');

    const extracted = await this.commitmentEngine.analyzeCommunication({
      text: userText,
      sourceType: source,
      sourceChannel: 'Direct Submission',
      sender: userName
    });

    if (extracted && extracted.length > 0) {
      this.inboxManager.addCommitments(extracted);

      setTimeout(() => {
        const aiResponseHTML = `
          <div class="chat-message-group msg-ai">
            <div class="avatar-initials">MP</div>
            <div class="chat-bubble-content" style="width: 100%;">
              <div class="chat-sender-header">
                <span class="chat-sender-name" style="color: var(--color-primary);">Meetpulse AI</span>
                <span class="chat-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="chat-source-tag">Detected ${extracted.length} Action Items</span>
              </div>
              <div class="chat-bubble">
                <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 0.5rem;">
                  Detected ${extracted.length} commitment(s) from your input. Click <strong>Approve Deliverable</strong> to confirm:
                </div>
                <div class="inchat-commitment-deck">
                  ${extracted.map(item => this.buildInChatCommitmentCardHTML(item)).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', aiResponseHTML);
        if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
        this.showToast(`Extracted ${extracted.length} action items added to Action Queue`);
      }, 400);

    } else {
      setTimeout(() => {
        const aiResponseHTML = `
          <div class="chat-message-group msg-ai">
            <div class="avatar-initials">MP</div>
            <div class="chat-bubble-content">
              <div class="chat-sender-header">
                <span class="chat-sender-name" style="color: var(--color-primary);">Meetpulse AI</span>
                <span class="chat-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div class="chat-bubble">
                <p>Scanned your message. No explicit action items, deadlines, or deliverables detected. Try phrases like <em>"Please deliver..."</em> or <em>"I will complete by Friday"</em>.</p>
              </div>
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', aiResponseHTML);
        if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }, 350);
    }
  }

  updateDashboardKPIs() {
    const inboxStats = this.inboxManager ? this.inboxManager.getStats() : { pendingCount: 0 };
    const taskStats = this.taskManager ? this.taskManager.getStats() : { total: 0, forgottenRisks: 0 };

    const totalDetected = (inboxStats.pendingCount || 0) + (taskStats.total || 0);

    const headerInboxCount = document.getElementById('headerInboxCount');
    if (headerInboxCount) headerInboxCount.textContent = inboxStats.pendingCount;

    const sidebarInboxBadge = document.getElementById('sidebarInboxBadge');
    if (sidebarInboxBadge) sidebarInboxBadge.textContent = inboxStats.pendingCount;

    const sidebarTasksBadge = document.getElementById('sidebarTasksBadge');
    if (sidebarTasksBadge) sidebarTasksBadge.textContent = taskStats.total;

    const sidebarRisksBadge = document.getElementById('sidebarRisksBadge');
    if (sidebarRisksBadge) sidebarRisksBadge.textContent = taskStats.forgottenRisks;

    const sidebarEmployeesCount = document.getElementById('sidebarEmployeesCount');
    if (sidebarEmployeesCount) sidebarEmployeesCount.textContent = this.registeredUsers.length;

    const rosterBadge = document.getElementById('rosterCountBadge');
    if (rosterBadge) rosterBadge.textContent = `${this.registeredUsers.length} Account${this.registeredUsers.length > 1 ? 's' : ''} Registered`;

    const statHeroDetected = document.getElementById('statHeroDetected');
    if (statHeroDetected) statHeroDetected.textContent = totalDetected;

    const statHeroPending = document.getElementById('statHeroPending');
    if (statHeroPending) statHeroPending.textContent = inboxStats.pendingCount;

    const statHeroActive = document.getElementById('statHeroActive');
    if (statHeroActive) statHeroActive.textContent = taskStats.total;

    const statHeroEmployees = document.getElementById('statHeroEmployees');
    if (statHeroEmployees) statHeroEmployees.textContent = this.registeredUsers.length;
  }

  renderRadarRisks() {
    const container = document.getElementById('radarRiskItemsContainer');
    if (!container || !this.taskManager) return;

    const tasks = this.taskManager.getTasks();
    const risks = tasks.filter(t => t.isForgottenRisk && t.status !== 'done');

    if (risks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <strong>No high-risk deliverables detected</strong>
          <p style="font-size: 0.85rem; margin-top: 4px;">All commitments are progressing on schedule.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = risks.map(r => `
      <div style="background: var(--bg-card); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: var(--radius-md); padding: 1.15rem; margin-bottom: 0.85rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-urgent">Deadline Risk</span>
            <span style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">[${r.id}] ${r.title}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.35rem;">
            Member: <strong>${r.owner}</strong> • Deadline: <strong style="color: var(--color-danger);">${r.deadline}</strong> • Context: ${r.sourceChannel}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openTaskModal('${r.id}')">
            Details
          </button>
          <button class="btn btn-primary btn-sm" onclick="window.commitPulseApp.sendSlackNudge('${r.id}', '${r.owner}')">
            Send Nudge
          </button>
        </div>
      </div>
    `).join('');
  }

  sendSlackNudge(taskId, owner) {
    this.showToast(`Automated reminder nudge sent to ${owner} for [${taskId}]`);
  }

  renderAnalytics() {
    const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    const textColor = isDark ? '#a1a1aa' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const primaryColor = isDark ? '#10b981' : '#2563eb';
    const accentColor = isDark ? '#34d399' : '#0284c7';

    const ctx1 = document.getElementById('conversionDoughnutChart');
    if (ctx1) {
      if (this.charts.conversion) this.charts.conversion.destroy();
      const stats = this.taskManager ? this.taskManager.getStats() : { done: 0, inProgress: 0, todo: 0 };
      const inboxStats = this.inboxManager ? this.inboxManager.getStats() : { pendingCount: 0 };

      this.charts.conversion = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Completed', 'In Progress / Todo', 'Action Queue Pending'],
          datasets: [{
            data: [stats.done || 1, (stats.inProgress + stats.todo) || 1, inboxStats.pendingCount || 1],
            backgroundColor: [primaryColor, accentColor, '#71717a'],
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 12 } }
            }
          },
          cutout: '70%'
        }
      });
    }

    const ctx2 = document.getElementById('reliabilityBarChart');
    if (ctx2) {
      if (this.charts.reliability) this.charts.reliability.destroy();
      this.charts.reliability = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: this.registeredUsers.map(m => m.name.split(' ')[0]),
          datasets: [{
            label: 'Reliability Score (%)',
            data: this.registeredUsers.map(m => m.reliabilityScore || 100),
            backgroundColor: primaryColor,
            borderRadius: 6,
            barThickness: 28
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 70,
              max: 100,
              grid: { color: gridColor },
              ticks: { color: textColor, font: { family: 'JetBrains Mono' } }
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }

  renderTeamMembers() {
    const grid = document.getElementById('teamMembersGrid');
    if (!grid) return;

    grid.innerHTML = this.registeredUsers.map(m => `
      <div class="team-member-card">
        <div class="avatar-initials" style="width: 38px; height: 38px; font-size: 0.85rem;">${m.avatar || 'ST'}</div>
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
            <strong style="font-size: 0.88rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</strong>
            <span class="badge ${m.isAdmin ? 'badge-primary' : 'badge-confidence'}" style="font-size: 0.65rem;">${m.isAdmin ? 'ADMIN' : 'EMPLOYEE'}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--color-primary); font-family: var(--font-mono); margin-top: 2px;">${m.email}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${m.role} • ${m.department || 'Operations'}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 0.7rem;" onclick="window.commitPulseApp.fillCredentials('${m.email}', '${m.password || (m.isAdmin ? 'admin123' : 'employee123')}')" title="Autofill Login Credentials">
            Autofill
          </button>
          ${!m.isAdmin ? `
            <button class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.7rem;" onclick="window.commitPulseApp.deleteEmployee('${m.id}')" title="Delete Employee Account">
              Delete
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  deleteEmployee(userId) {
    if (this.currentUser && !this.currentUser.isAdmin && this.currentUser.role !== 'Administrator') {
      this.showToast('Administrator privileges required to delete employee accounts.');
      return;
    }

    const userToDelete = this.registeredUsers.find(u => u.id === userId);
    if (!userToDelete) return;

    if (userToDelete.isAdmin || userToDelete.role === 'Administrator') {
      this.showToast('Cannot delete the root Administrator account.');
      return;
    }

    this.registeredUsers = this.registeredUsers.filter(u => u.id !== userId);
    this.saveUsers();
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.renderAnalytics();
    this.updateDashboardKPIs();
    this.showToast(`Deleted employee account for ${userToDelete.name} (${userToDelete.email})`);
  }

  renderAuditHistory() {
    const tbody = document.getElementById('auditHistoryTableBody');
    if (!tbody || !this.taskManager) return;

    const history = this.taskManager.getAuditHistory();
    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No audit records logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = history.map(item => `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">${item.timestamp}</td>
        <td><strong>[${item.taskId}]</strong> ${item.title}</td>
        <td>${item.owner}</td>
        <td>${item.sourceType} (${item.sourceChannel})</td>
        <td><span class="badge" style="background: var(--color-primary-light); color: var(--color-primary);">${item.action}</span></td>
      </tr>
    `).join('');
  }

  populateTeamDropdowns() {
    const taskOwnerSelect = document.getElementById('taskOwnerFilter');
    const delegateSelect = document.getElementById('delegateMemberSelect');

    if (taskOwnerSelect) {
      taskOwnerSelect.innerHTML = '<option value="all">All Team Members</option>';
      this.registeredUsers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.role})`;
        taskOwnerSelect.appendChild(opt);
      });
    }

    if (delegateSelect) {
      delegateSelect.innerHTML = '';
      this.registeredUsers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.role})`;
        delegateSelect.appendChild(opt);
      });
    }
  }

  openAddMemberModal() {
    document.getElementById('addMemberModal')?.classList.add('active');
  }

  closeAddMemberModal() {
    document.getElementById('addMemberModal')?.classList.remove('active');
  }

  createEmployeeAccount({ name, email, password, role, dept }) {
    if (!name || !email) {
      this.showToast('Please enter employee name and email ID');
      return;
    }

    const exists = this.registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      this.showToast(`Account with email ${email} already exists.`);
      return;
    }

    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'EM';
    const newMember = {
      id: `user-${Date.now()}`,
      email,
      password: password || 'employee123',
      name,
      role: role || 'Software Engineer',
      avatar,
      department: dept || 'Engineering',
      isAdmin: false,
      activeTasks: 0,
      reliabilityScore: 100
    };

    this.registeredUsers.push(newMember);
    this.saveUsers();
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.renderAnalytics();
    this.updateDashboardKPIs();
    this.showToast(`Created account for ${name} (${email}). Password: ${newMember.password}`);
  }

  saveAddMember() {
    const name = document.getElementById('newMemberName')?.value.trim();
    const email = document.getElementById('newMemberEmail')?.value.trim().toLowerCase();
    const password = document.getElementById('newMemberPassword')?.value.trim() || 'employee123';
    const role = document.getElementById('newMemberRole')?.value.trim() || 'Software Engineer';
    const dept = document.getElementById('newMemberDept')?.value.trim() || 'Engineering';

    this.createEmployeeAccount({ name, email, password, role, dept });
    this.closeAddMemberModal();

    document.getElementById('newMemberName').value = '';
    document.getElementById('newMemberEmail').value = '';
    document.getElementById('newMemberPassword').value = '';
    document.getElementById('newMemberRole').value = '';
    document.getElementById('newMemberDept').value = '';
  }

  setupRoiCalculator() {
    const empSlider = document.getElementById('roiEmployeesSlider');
    const forgSlider = document.getElementById('roiForgottenSlider');
    const empCount = document.getElementById('roiEmployeesCount');
    const forgCount = document.getElementById('roiForgottenCount');
    const savedAmount = document.getElementById('roiSavedAmount');
    const hoursDesc = document.getElementById('roiHoursDesc');

    const updateRoi = () => {
      if (!empSlider || !forgSlider) return;
      const employees = parseInt(empSlider.value, 10);
      const forgotten = parseInt(forgSlider.value, 10);

      if (empCount) empCount.textContent = employees;
      if (forgCount) forgCount.textContent = forgotten;

      const monthlyHoursSaved = employees * forgotten * 1.5;
      const financialSavedINR = Math.round(monthlyHoursSaved * 500);

      if (savedAmount) {
        savedAmount.textContent = `₹${financialSavedINR.toLocaleString('en-IN')} Saved`;
      }
      if (hoursDesc) {
        hoursDesc.textContent = `Based on ~${employees * forgotten} dropped commitments prevented and ~${Math.round(monthlyHoursSaved)} follow-up hours saved per month.`;
      }
    };

    empSlider?.addEventListener('input', updateRoi);
    forgSlider?.addEventListener('input', updateRoi);
  }

  openIngestModal() {
    document.getElementById('ingestModal')?.classList.add('active');
  }

  closeIngestModal() {
    document.getElementById('ingestModal')?.classList.remove('active');
  }

  async handleCustomIngest() {
    const source = document.getElementById('customIngestSource')?.value || 'Meeting Transcript';
    const channel = document.getElementById('customIngestChannel')?.value || 'Architecture Review Sync';
    const text = document.getElementById('customIngestText')?.value || '';

    if (!text.trim()) {
      this.showToast('Please paste transcript or discussion text');
      return;
    }

    this.closeIngestModal();
    this.showToast('Analyzing stream with Meetpulse NLP Engine...');

    const senderName = this.currentUser ? this.currentUser.name : 'Team Member';

    const extracted = await this.commitmentEngine.analyzeCommunication({
      text,
      sourceType: source,
      sourceChannel: channel,
      sender: senderName
    });

    const newStream = {
      id: `stream-${Date.now()}`,
      channelName: channel,
      sourceType: source,
      sender: senderName,
      senderAvatar: this.currentUser ? this.currentUser.avatar : 'MS',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawContent: text,
      detectedCommitments: extracted
    };

    this.communicationStreams.unshift(newStream);
    this.inboxManager.addCommitments(extracted);

    this.loadChannel(0);
    this.showToast(`Extracted ${extracted.length} action items added to Action Queue`);
    this.switchView('view-chat');
  }

  openEditCommitmentModal(commitmentId) {
    const commitments = this.inboxManager.getCommitments();
    const item = commitments.find(c => c.id === commitmentId) || this.inchatCommitmentsMap.get(commitmentId);
    if (!item) return;

    document.getElementById('editCommitmentId').value = item.id;
    document.getElementById('editCommitmentTitle').value = item.taskTitle;
    document.getElementById('editCommitmentOwner').value = item.owner;
    document.getElementById('editCommitmentDeadline').value = item.deadline;
    document.getElementById('editCommitmentPriority').value = item.priority;

    document.getElementById('editCommitmentModal')?.classList.add('active');
  }

  closeEditCommitmentModal() {
    document.getElementById('editCommitmentModal')?.classList.remove('active');
  }

  saveEditCommitment() {
    const id = document.getElementById('editCommitmentId').value;
    const title = document.getElementById('editCommitmentTitle').value;
    const owner = document.getElementById('editCommitmentOwner').value;
    const deadline = document.getElementById('editCommitmentDeadline').value;
    const priority = document.getElementById('editCommitmentPriority').value;

    const commitments = this.inboxManager.getCommitments();
    const item = commitments.find(c => c.id === id);
    if (item) {
      item.taskTitle = title;
      item.owner = owner;
      item.deadline = deadline;
      item.priority = priority;
      this.inboxManager.render();
    }

    this.closeEditCommitmentModal();
    this.showToast(`Updated deliverable: "${title}"`);
  }

  openDelegateModal(commitmentId) {
    document.getElementById('delegateCommitmentId').value = commitmentId;
    document.getElementById('delegateModal')?.classList.add('active');
  }

  closeDelegateModal() {
    document.getElementById('delegateModal')?.classList.remove('active');
  }

  saveDelegation() {
    const id = document.getElementById('delegateCommitmentId').value;
    const newOwner = document.getElementById('delegateMemberSelect').value;

    const commitments = this.inboxManager.getCommitments();
    const item = commitments.find(c => c.id === id);
    if (item) {
      item.owner = newOwner;
      const tm = this.registeredUsers.find(m => m.name === newOwner);
      if (tm) item.ownerAvatar = tm.avatar;
      this.inboxManager.render();
    }

    this.closeDelegateModal();
    this.showToast(`Reassigned deliverable to ${newOwner}`);
  }

  openTaskModal(taskId) {
    const tasks = this.taskManager.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('modalTaskId').value = task.id;
    document.getElementById('modalTaskTitle').value = task.title;
    document.getElementById('modalTaskOwner').value = task.owner;
    document.getElementById('modalTaskStatus').value = task.status;
    document.getElementById('modalTaskDeadline').value = task.deadline;
    document.getElementById('modalTaskOriginalSnippet').textContent = `"${task.originalSnippet}" — from ${task.sourceType} (${task.sourceChannel})`;

    document.getElementById('taskDetailModalTitle').textContent = `Deliverable Details [${task.id}]`;
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

    this.taskManager.updateTask({ id, title, owner, status, deadline });
    this.closeTaskModal();
    this.showToast(`Updated deliverable [${id}]`);
  }

  deleteTaskModal() {
    const id = document.getElementById('modalTaskId').value;
    this.taskManager.deleteTask(id);
    this.closeTaskModal();
    this.showToast(`Deleted deliverable [${id}]`);
  }

  openNewTaskModal() {
    const id = `TASK-${Math.floor(100 + Math.random() * 900)}`;
    const creatorName = this.currentUser ? this.currentUser.name : 'Team Member';
    const creatorAvatar = this.currentUser ? this.currentUser.avatar : 'TM';
    const creatorRole = this.currentUser ? this.currentUser.role : 'Staff Member';

    const newTask = {
      id,
      title: 'New Project Deliverable',
      owner: creatorName,
      ownerAvatar: creatorAvatar,
      ownerRole: creatorRole,
      requester: 'Manual Entry',
      deadline: 'Tomorrow, 5:00 PM',
      deadlineISO: new Date(Date.now() + 86400000).toISOString(),
      priority: 'High',
      status: 'todo',
      sourceType: 'Direct Entry',
      sourceChannel: 'Workspace Dashboard',
      originalSnippet: 'Created manually by team member.',
      confidence: 100,
      confirmedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isForgottenRisk: false,
      notes: 'Directly added from deliverable manager.'
    };

    this.taskManager.addTask(newTask);
    this.openTaskModal(id);
  }

  openSettingsModal() {
    const key = this.commitmentEngine.getApiKey();
    const input = document.getElementById('geminiApiKeyInput');
    if (input) input.value = key;
    document.getElementById('settingsModal')?.classList.add('active');
  }

  closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.remove('active');
  }

  saveSettings() {
    const input = document.getElementById('geminiApiKeyInput');
    if (input) {
      this.commitmentEngine.setApiKey(input.value);
    }
    this.closeSettingsModal();
    this.showToast('Settings saved successfully');
  }

  exportAuditCSV() {
    const history = this.taskManager.getAuditHistory();
    let csv = 'Timestamp,Task ID,Title,Owner,Source Type,Source Channel,Action\n';
    history.forEach(h => {
      csv += `"${h.timestamp}","${h.taskId}","${h.title.replace(/"/g, '""')}","${h.owner}","${h.sourceType}","${h.sourceChannel}","${h.action}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `meetpulse_audit_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Audit log exported (CSV)');
  }

  confirmCommitment(id) {
    return this.inboxManager.confirmCommitment(id);
  }

  dismissCommitment(id) {
    return this.inboxManager.dismissCommitment(id);
  }

  handleDragStart(e, taskId) {
    this.draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', taskId);
  }

  handleDrop(e, status) {
    e.preventDefault();
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
    const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;
    if (taskId) {
      this.taskManager.moveTaskStatus(taskId, status);
      this.showToast(`Moved [${taskId}] to ${status.toUpperCase()}`);
    }
  }

  sendNudge(taskId) {
    const task = this.taskManager.getTasks().find(t => t.id === taskId);
    const owner = task ? task.owner : 'Team Member';
    this.sendSlackNudge(taskId, owner);
  }

  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.96)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MeetPulseApp();
});
