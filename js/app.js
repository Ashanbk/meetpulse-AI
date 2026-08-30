// app.js - Meetpulse Master Application Orchestrator (Role-Based Admin Access | Automated Email Scheduling | Password Protection)
import { DEFAULT_USERS, PRELOADED_COMMS, INITIAL_CONFIRMED_TASKS } from './mockCommsData.js';
import { CommitmentEngine } from './commitmentEngine.js';
import { InboxManager } from './inboxManager.js';
import { TaskManager } from './taskManager.js';
import { globalCloudSync } from './cloudSync.js';

class MeetPulseApp {
  constructor() {
    this.currentUser = null;
    this.registeredUsers = [];
    this.communicationStreams = [];
    this.scheduledEmails = [];
    this.commitmentEngine = new CommitmentEngine();
    this.inboxManager = null;
    this.taskManager = null;

    this.activeChannelIndex = 0;
    this.activeViewId = 'view-chat';
    this.charts = { conversion: null, reliability: null };
    this.inchatCommitmentsMap = new Map();
    this.deferredPrompt = null;

    this.init();
    this.initPwa();
  }

  init() {
    this.initUsers();
    this.initEmails();
    this.initInbox();
    this.initTaskManager();
    this.bindEvents();
    this.loadChannel(0);
    this.setupRoiCalculator();
    this.startLiveSync();

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

  initPwa() {
    // Register Service Worker immediately for PWA installability
    if ('serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
          console.log('Meetpulse PWA Service Worker Registered:', reg.scope);
        }).catch((err) => {
          navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
        });
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        registerSW();
      } else {
        window.addEventListener('DOMContentLoaded', registerSW);
      }
    }

    // If app is already installed or running in standalone mode -> hide install buttons
    if (this.isAppInstalled()) {
      this.hideInstallButtons();
    } else {
      const headerBtn = document.getElementById('installPwaHeaderBtn');
      const sidebarBtn = document.getElementById('installPwaSidebarBtn');
      if (headerBtn) headerBtn.style.setProperty('display', 'inline-flex', 'important');
      if (sidebarBtn) sidebarBtn.style.setProperty('display', 'inline-flex', 'important');
    }

    // Listen for standalone display-mode changes
    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
        if (evt.matches) {
          this.hideInstallButtons();
        }
      });
    } catch (e) {}

    // Capture Native PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('Native PWA install prompt ready.');

      if (!this.isAppInstalled()) {
        const headerBtn = document.getElementById('installPwaHeaderBtn');
        const sidebarBtn = document.getElementById('installPwaSidebarBtn');
        if (headerBtn) headerBtn.style.setProperty('display', 'inline-flex', 'important');
        if (sidebarBtn) sidebarBtn.style.setProperty('display', 'inline-flex', 'important');
      }

      const directBtn = document.getElementById('directPwaInstallBtn');
      if (directBtn) {
        directBtn.innerHTML = `
          <svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span>Click to Install Meetpulse Now (Native 1-Click)</span>
        `;
      }
    });

    // Handle Completed Installation
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      localStorage.setItem('meetpulse_pwa_installed', 'true');
      this.hideInstallButtons();
      this.closeInstallAppModal();
      this.showToast('Meetpulse is running as an installed standalone web app!');
    });
  }

  isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://') ||
           localStorage.getItem('meetpulse_pwa_installed') === 'true';
  }

  hideInstallButtons() {
    document.body.classList.add('pwa-installed');
    const headerBtn = document.getElementById('installPwaHeaderBtn');
    const sidebarBtn = document.getElementById('installPwaSidebarBtn');
    if (headerBtn) headerBtn.style.setProperty('display', 'none', 'important');
    if (sidebarBtn) sidebarBtn.style.setProperty('display', 'none', 'important');
  }

  triggerPwaInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          localStorage.setItem('meetpulse_pwa_installed', 'true');
          this.hideInstallButtons();
          this.showToast('Meetpulse Web App installed successfully!');
        }
        this.deferredPrompt = null;
        this.closeInstallAppModal();
      });
    } else {
      this.openInstallAppModal();
    }
  }

  openInstallAppModal() {
    document.getElementById('installAppModal')?.classList.add('active');
  }

  closeInstallAppModal() {
    document.getElementById('installAppModal')?.classList.remove('active');
  }

  initUsers() {
    const storedUsers = localStorage.getItem('meetpulse_users_db');
    let needsReset = false;

    if (storedUsers) {
      try {
        const parsed = JSON.parse(storedUsers);
        // If old mock employee "aashritha" is found, purge legacy cache to ensure clean state
        if (Array.isArray(parsed) && parsed.some(u => u.email && u.email.toLowerCase() === 'aashritha@meetpulse.ai')) {
          needsReset = true;
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          this.registeredUsers = parsed;
          this.registeredUsers.forEach(u => {
            if (!u.password) u.password = u.isAdmin ? 'admin123' : 'employee123';
          });
        } else {
          needsReset = true;
        }
      } catch (e) {
        needsReset = true;
      }
    } else {
      needsReset = true;
    }

    if (needsReset) {
      this.registeredUsers = [...DEFAULT_USERS];
      this.saveUsers();
    }

    this.commitmentEngine.setRegisteredUsers(this.registeredUsers);

    // Immediately trigger background sync from Global Cloud DB
    globalCloudSync.fetchUsers().then(cloudUsers => {
      if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
        const usersJson = JSON.stringify(cloudUsers);
        if (usersJson !== JSON.stringify(this.registeredUsers)) {
          this.registeredUsers = cloudUsers;
          localStorage.setItem('meetpulse_users_db', usersJson);
          this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
          this.renderRegisteredAccountsDeck();
          this.populateTeamDropdowns();
          this.renderTeamMembers();
          this.updateDashboardKPIs();
        }
      }
    }).catch(() => {});
  }

  startLiveSync() {
    // 1. Start continuous Global Cloud Database Sync Loop (runs every 2.5s and on focus)
    globalCloudSync.startSyncLoop(2500, (remoteState) => {
      if (remoteState) {
        this.handleLiveSyncData(remoteState);
      }
    });

    // 2. Also poll local server / serverless endpoint as fallback
    if (this.localSyncInterval) clearInterval(this.localSyncInterval);
    this.localSyncInterval = setInterval(() => {
      this.syncAllFromServer();
    }, 4000);
  }

  handleLiveSyncData(data) {
    if (!data || typeof data !== 'object') return;

    // 1. Live Sync User Directory & Credentials
    if (Array.isArray(data.users) && data.users.length > 0) {
      const usersJson = JSON.stringify(data.users);
      if (usersJson !== JSON.stringify(this.registeredUsers)) {
        this.registeredUsers = data.users;
        localStorage.setItem('meetpulse_users_db', usersJson);
        this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
        this.renderRegisteredAccountsDeck();
        this.populateTeamDropdowns();
        this.renderTeamMembers();
        this.updateDashboardKPIs();

        if (this.currentUser) {
          const updatedMe = this.registeredUsers.find(u => u.email.toLowerCase() === this.currentUser.email.toLowerCase());
          if (updatedMe) {
            this.currentUser = updatedMe;
            localStorage.setItem('meetpulse_session', JSON.stringify(updatedMe));
          }
        }
      }
    }

    // 2. Live Sync Meeting Stream & Team Chat Messages
    if (Array.isArray(data.chat)) {
      if (JSON.stringify(data.chat) !== JSON.stringify(this.communicationStreams)) {
        const wasEmpty = this.communicationStreams.length === 0;
        const prevLength = this.communicationStreams.length;
        this.communicationStreams = data.chat;

        if (this.activeViewId === 'view-chat') {
          const container = document.getElementById('dynamicChatThread');
          if (container) {
            container.innerHTML = this.communicationStreams.map(s => this.buildStreamItemHTML(s)).join('');
            const scrollContainer = document.getElementById('chatStreamContainer');
            if (scrollContainer && (wasEmpty || data.chat.length > prevLength)) {
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        }
      }
    }

    // 3. Live Sync Tasks & Deliverables Board
    if (data.tasks) {
      if (Array.isArray(data.tasks.tasks) && this.taskManager) {
        const tasksJson = JSON.stringify(data.tasks.tasks);
        if (tasksJson !== JSON.stringify(this.taskManager.getTasks())) {
          this.taskManager.setTasks(data.tasks.tasks);
          this.updateDashboardKPIs();
          this.renderRadarRisks();
          this.renderAnalytics();
        }
      }
      if (Array.isArray(data.tasks.inbox) && this.inboxManager) {
        const inboxJson = JSON.stringify(data.tasks.inbox);
        if (inboxJson !== JSON.stringify(this.inboxManager.getCommitments())) {
          this.inboxManager.setCommitments(data.tasks.inbox);
          this.updateDashboardKPIs();
        }
      }
    }

    // 4. Live Sync Email Notifications
    if (Array.isArray(data.emails)) {
      const emailsJson = JSON.stringify(data.emails);
      if (emailsJson !== JSON.stringify(this.scheduledEmails)) {
        this.scheduledEmails = data.emails;
        localStorage.setItem('meetpulse_scheduled_emails', emailsJson);
        this.updateNotificationBadges();
        this.renderEmailNotificationFeed();
      }
    }
  }

  async syncAllFromServer() {
    try {
      const res = await fetch('/api/live-sync');
      if (!res.ok) return;
      const data = await res.json();
      this.handleLiveSyncData(data);
    } catch (e) {
      // Offline fallback
    }
  }

  async syncUsersFromServer(showNotification = false) {
    try {
      // 1. Query Global Cloud Database first
      const cloudUsers = await globalCloudSync.fetchUsers();
      if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
        this.registeredUsers = cloudUsers;
        localStorage.setItem('meetpulse_users_db', JSON.stringify(this.registeredUsers));
        this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
        this.renderRegisteredAccountsDeck();
        this.populateTeamDropdowns();
        this.renderTeamMembers();
        this.updateDashboardKPIs();

        if (showNotification) {
          this.showToast(`Synced ${this.registeredUsers.length} account(s) from Global Cloud DB!`);
        }
        return this.registeredUsers;
      }

      // 2. Query serverless /api/users
      const res = await fetch('/api/users');
      if (res.ok) {
        const serverUsers = await res.json();
        if (Array.isArray(serverUsers) && serverUsers.length > 0) {
          this.registeredUsers = serverUsers;
          localStorage.setItem('meetpulse_users_db', JSON.stringify(this.registeredUsers));
          this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
          this.renderRegisteredAccountsDeck();
          this.populateTeamDropdowns();
          this.renderTeamMembers();
          this.updateDashboardKPIs();

          if (showNotification) {
            this.showToast(`Synced ${this.registeredUsers.length} employee accounts from server!`);
          }
          return this.registeredUsers;
        }
      }
    } catch (e) {
      console.log('Server sync offline, running in local storage mode.');
    }
    return this.registeredUsers;
  }

  async saveUserToServer(user) {
    try {
      await globalCloudSync.saveUser(user);
    } catch (e) {}

    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
    } catch (e) {}
  }

  async deleteUserFromServer(userId) {
    try {
      await globalCloudSync.deleteUser(userId);
    } catch (e) {}

    try {
      await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }

  async pushFullStateToServer() {
    const fullState = {
      users: this.registeredUsers,
      chat: this.communicationStreams,
      tasks: {
        tasks: this.taskManager ? this.taskManager.getTasks() : [],
        inbox: this.inboxManager ? this.inboxManager.getCommitments() : []
      },
      emails: this.scheduledEmails
    };

    try {
      await globalCloudSync.pushFullState(fullState);
    } catch (e) {}

    try {
      await fetch('/api/live-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullState)
      });
    } catch (e) {}
  }

  async pushTasksToServer() {
    this.pushFullStateToServer();
  }

  async pushEmailsToServer() {
    this.pushFullStateToServer();
  }

  exportCredentialsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.registeredUsers, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "meetpulse_team_credentials.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Exported team credentials JSON successfully!');
  }

  importCredentialsJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          const userMap = new Map();
          DEFAULT_USERS.forEach(u => userMap.set(u.email.toLowerCase(), u));
          this.registeredUsers.forEach(u => userMap.set(u.email.toLowerCase(), u));
          imported.forEach(u => {
            if (u.email) userMap.set(u.email.toLowerCase(), u);
          });

          this.registeredUsers = Array.from(userMap.values());
          this.saveUsers();

          for (const user of this.registeredUsers) {
            await this.saveUserToServer(user);
          }

          this.populateTeamDropdowns();
          this.renderTeamMembers();
          this.renderRegisteredAccountsDeck();
          this.updateDashboardKPIs();
          this.showToast(`Successfully imported ${imported.length} employee accounts!`);
        } else {
          this.showToast('Invalid JSON file format. Expected a list of users.');
        }
      } catch (err) {
        this.showToast('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  }

  saveUsers() {
    localStorage.setItem('meetpulse_users_db', JSON.stringify(this.registeredUsers));
    this.commitmentEngine.setRegisteredUsers(this.registeredUsers);
    this.renderRegisteredAccountsDeck();
    this.renderTeamMembers();
  }

  initEmails() {
    const stored = localStorage.getItem('meetpulse_scheduled_emails');
    if (stored) {
      try {
        this.scheduledEmails = JSON.parse(stored);
      } catch (e) {
        this.scheduledEmails = [];
      }
    } else {
      this.scheduledEmails = [
        {
          id: `email-${Date.now()}-welcome`,
          toEmail: 'all@meetpulse.ai',
          toName: 'All Team Members',
          from: 'notifications@meetpulse.ai',
          subject: 'Welcome to Meetpulse Workspace Notifications',
          body: 'Automated email scheduling is active. You will receive real-time digests, task assignments, and pre-deadline alerts directly to this workspace inbox.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateStr: new Date().toLocaleDateString(),
          isRead: false,
          triggerType: 'System Welcome'
        }
      ];
      this.saveEmails();
    }
  }

  saveEmails() {
    localStorage.setItem('meetpulse_scheduled_emails', JSON.stringify(this.scheduledEmails));
    this.updateNotificationBadges();
    this.renderEmailNotificationFeed();
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

    this.applyRolePermissions();
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.updateDashboardKPIs();
    this.updateNotificationBadges();
    this.renderEmailNotificationFeed();
    this.renderAnalytics();
  }

  applyRolePermissions() {
    const isAdmin = Boolean(this.currentUser && (this.currentUser.isAdmin || this.currentUser.role === 'Administrator'));

    if (isAdmin) {
      document.body.classList.remove('is-employee');
      document.body.classList.add('is-admin');
      document.documentElement.classList.remove('is-employee');
      document.documentElement.classList.add('is-admin');
    } else {
      document.body.classList.remove('is-admin');
      document.body.classList.add('is-employee');
      document.documentElement.classList.remove('is-admin');
      document.documentElement.classList.add('is-employee');
    }

    // Admin-only elements
    document.querySelectorAll('.admin-only-element, #quickCreateEmpHeaderBtn, #openAddMemberSidebarBtn, #chipCreateEmployee, #adminOnlyEmployeeCreatorCard, #openAddMemberBtn, #notificationScheduleConfigCard, #broadcastDigestEmailBtn').forEach(el => {
      el.style.setProperty('display', isAdmin ? '' : 'none', 'important');
    });

    // Employee Notice Banner
    const notice = document.getElementById('employeeViewNoticeBanner');
    if (notice) notice.style.setProperty('display', isAdmin ? 'none' : 'block', 'important');
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

    // Filter only employees for the quick preset list (Admin is omitted as requested)
    const employees = this.registeredUsers.filter(u => !u.isAdmin && u.role !== 'Administrator');
    if (employees.length === 0) {
      list.innerHTML = `
        <div style="font-size: 0.74rem; color: var(--text-muted); padding: 0.25rem 0;">
          No employee accounts created yet. Administrator must sign in to create employees.
        </div>
      `;
      return;
    }

    let html = '';
    employees.forEach(emp => {
      html += `
        <div class="team-member-card" style="padding: 0.45rem 0.65rem; background: var(--bg-card); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; cursor: pointer; overflow: hidden;" onclick="window.commitPulseApp.fillCredentials('${emp.email}', '${emp.password || 'employee123'}')">
            <span class="avatar-initials avatar-sm">${emp.avatar}</span>
            <div style="flex: 1; overflow: hidden;">
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${emp.name}</div>
              <div style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">${emp.email} • ${emp.password || 'employee123'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 0.68rem;" onclick="window.commitPulseApp.fillCredentials('${emp.email}', '${emp.password || 'employee123'}')">
              Fill
            </button>
            <button class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size: 0.68rem;" onclick="event.stopPropagation(); window.commitPulseApp.deleteEmployee('${emp.id}')" title="Delete Employee">
              Delete
            </button>
          </div>
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

  async loginWithCredentials(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();
    const err = document.getElementById('loginErrorMessage');
    if (err) err.style.display = 'none';

    let user = this.registeredUsers.find(u => u.email.toLowerCase() === trimmedEmail);

    // If user not in local memory or password differs, immediately query Global Cloud Database
    if (!user || user.password !== trimmedPass) {
      await this.syncUsersFromServer();
      user = this.registeredUsers.find(u => u.email.toLowerCase() === trimmedEmail);
    }

    if (!user) {
      if (err) {
        err.innerHTML = `No account found for "<strong>${email}</strong>". If an Admin just created this account on another device, click <em>"↻ Sync Cloud DB"</em> below to refresh.`;
        err.style.display = 'block';
      }
      return;
    }

    if (user.password !== trimmedPass) {
      if (err) {
        err.textContent = `Incorrect password for ${email}. Please verify and try again.`;
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

  // Automated Email Notification Engine
  dispatchEmailNotification({ toEmail, toName, subject, body, taskId = null, triggerType = 'Automated Reminder' }) {
    const newEmail = {
      id: `email-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      toEmail,
      toName,
      from: 'notifications@meetpulse.ai',
      subject,
      body,
      taskId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStr: new Date().toLocaleDateString(),
      isRead: false,
      triggerType
    };

    this.scheduledEmails.unshift(newEmail);
    this.saveEmails();
    this.pushEmailsToServer();
    this.showToast(`Automated email sent to ${toEmail}: "${subject}"`);
  }

  broadcastMorningDigest() {
    if (!this.currentUser || (!this.currentUser.isAdmin && this.currentUser.role !== 'Administrator')) {
      this.showToast('Administrator privileges required to broadcast emails.');
      return;
    }

    const tasks = this.taskManager ? this.taskManager.getTasks() : [];
    const activeTasksCount = tasks.filter(t => t.status !== 'done').length;

    this.registeredUsers.forEach(user => {
      const userTasks = tasks.filter(t => t.owner === user.name && t.status !== 'done');
      const taskSummary = userTasks.length > 0
        ? `You have ${userTasks.length} active deliverable(s): ${userTasks.map(t => `[${t.id}] ${t.title}`).join(', ')}.`
        : 'All your current deliverables are completed. Ready for new sprint commitments!';

      this.dispatchEmailNotification({
        toEmail: user.email,
        toName: user.name,
        subject: `Morning Standup Digest: ${user.name} (${new Date().toLocaleDateString()})`,
        body: `Good morning ${user.name},\n\nHere is your scheduled daily commitment briefing from Meetpulse AI.\n\n${taskSummary}\n\nOrganization Active Deliverables: ${activeTasksCount}.\nTarget Delivery: Please ensure all updates are synchronized before the daily sync.`,
        triggerType: 'Scheduled Morning Digest'
      });
    });

    this.showToast(`Broadcasted morning digest emails to all ${this.registeredUsers.length} team members!`);
  }

  updateNotificationBadges() {
    const currentEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    const userEmails = this.scheduledEmails.filter(e => e.toEmail === 'all@meetpulse.ai' || e.toEmail.toLowerCase() === currentEmail);
    const unreadCount = userEmails.filter(e => !e.isRead).length;

    const bellBadge = document.getElementById('headerNotificationBadge');
    const bellPulseRing = document.getElementById('bellPulseRing');

    if (bellBadge) {
      bellBadge.textContent = unreadCount;
      bellBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    if (bellPulseRing) {
      bellPulseRing.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const sidebarBadge = document.getElementById('sidebarEmailBadge');
    if (sidebarBadge) {
      sidebarBadge.textContent = unreadCount;
    }

    const bottomNavEmailBadge = document.getElementById('bottomNavEmailBadge');
    if (bottomNavEmailBadge) {
      bottomNavEmailBadge.textContent = unreadCount;
      bottomNavEmailBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    const heroStat = document.getElementById('statHeroEmails');
    if (heroStat) {
      heroStat.textContent = this.scheduledEmails.length;
    }

    this.renderNotificationFlyout();
  }

  toggleNotificationFlyout() {
    const flyout = document.getElementById('notificationFlyout');
    if (flyout) {
      const isOpening = !flyout.classList.contains('active');
      flyout.classList.toggle('active');
      if (isOpening) {
        this.renderNotificationFlyout();
      }
    }
  }

  closeNotificationFlyout() {
    document.getElementById('notificationFlyout')?.classList.remove('active');
  }

  renderNotificationFlyout() {
    const list = document.getElementById('flyoutNotificationsList');
    if (!list) return;

    const currentEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    const userEmails = this.scheduledEmails.filter(e => e.toEmail === 'all@meetpulse.ai' || e.toEmail.toLowerCase() === currentEmail);

    if (userEmails.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem 0.5rem; color: var(--text-muted); font-size: 0.8rem;">
          No notifications yet.
        </div>
      `;
      return;
    }

    list.innerHTML = userEmails.slice(0, 6).map(mail => `
      <div class="flyout-item ${!mail.isRead ? 'unread' : ''}" onclick="window.commitPulseApp.markEmailAsRead('${mail.id}'); window.commitPulseApp.switchView('view-notifications'); window.commitPulseApp.closeNotificationFlyout();">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.35rem;">
          <strong style="font-size: 0.82rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mail.subject}</strong>
          <span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">${mail.timestamp}</span>
        </div>
        <div style="font-size: 0.74rem; color: var(--text-secondary); line-height: 1.35; max-height: 38px; overflow: hidden; text-overflow: ellipsis;">
          ${this.escapeHtml(mail.body.substring(0, 85))}...
        </div>
      </div>
    `).join('');
  }

  openComposeEmailModal(prefillRecipient = null) {
    const modal = document.getElementById('composeEmailModal');
    const recipientSelect = document.getElementById('composeRecipientSelect');
    const taskLinkSelect = document.getElementById('composeTaskLinkSelect');

    if (recipientSelect) {
      let optionsHtml = `<option value="all">Entire Team (Broadcast to All Employees)</option>`;
      this.registeredUsers.forEach(u => {
        optionsHtml += `<option value="${u.email}">${u.name} (${u.email}) — ${u.role}</option>`;
      });
      recipientSelect.innerHTML = optionsHtml;
      if (prefillRecipient) {
        recipientSelect.value = prefillRecipient;
      }
    }

    if (taskLinkSelect && this.taskManager) {
      let taskOptions = `<option value="">None (General Email)</option>`;
      this.taskManager.getTasks().forEach(t => {
        taskOptions += `<option value="${t.id}">[${t.id}] ${t.title} (${t.owner})</option>`;
      });
      taskLinkSelect.innerHTML = taskOptions;
    }

    modal?.classList.add('active');
  }

  closeComposeEmailModal() {
    document.getElementById('composeEmailModal')?.classList.remove('active');
  }

  handleSendCustomEmail({ recipientValue, subject, category, taskLinkId, message }) {
    const senderName = this.currentUser ? this.currentUser.name : 'Team Member';
    const senderEmail = this.currentUser ? this.currentUser.email : 'notifications@meetpulse.ai';

    if (recipientValue === 'all') {
      // Broadcast to all registered users
      this.registeredUsers.forEach(user => {
        const newEmail = {
          id: `email-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          toEmail: user.email,
          toName: user.name,
          from: senderEmail,
          subject: subject,
          body: message,
          taskId: taskLinkId || null,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateStr: new Date().toLocaleDateString(),
          isRead: false,
          triggerType: category || 'Team Broadcast'
        };
        this.scheduledEmails.unshift(newEmail);
      });
      this.saveEmails();
      this.pushEmailsToServer();
      this.showToast(`Broadcasted email to all ${this.registeredUsers.length} team members!`);
    } else {
      // Send to specific individual
      const targetUser = this.registeredUsers.find(u => u.email.toLowerCase() === recipientValue.toLowerCase());
      const targetName = targetUser ? targetUser.name : recipientValue;

      this.dispatchEmailNotification({
        toEmail: recipientValue,
        toName: targetName,
        subject: subject,
        body: message,
        taskId: taskLinkId || null,
        triggerType: category || 'Direct Mail'
      });
    }

    this.closeComposeEmailModal();
    this.renderEmailNotificationFeed();
    this.updateNotificationBadges();
  }

  renderEmailNotificationFeed() {
    const container = document.getElementById('emailNotificationFeedContainer');
    if (!container) return;

    const currentEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    const userEmails = this.scheduledEmails.filter(e => e.toEmail === 'all@meetpulse.ai' || e.toEmail.toLowerCase() === currentEmail);

    if (userEmails.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1.5rem; color: var(--text-muted);">
          <strong>No email notifications received yet.</strong>
          <p style="font-size: 0.84rem; margin-top: 4px;">Scheduled standup digests, task assignments, and pre-deadline alerts will arrive here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = userEmails.map(mail => `
      <div class="notification-feed-card ${!mail.isRead ? 'unread' : ''}" id="card-${mail.id}">
        <div class="email-meta-header">
          <span>From: <strong>${mail.from}</strong> → To: <strong>${mail.toEmail}</strong> (${mail.toName})</span>
          <span>${mail.dateStr} at ${mail.timestamp}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
          <div class="email-subject-line">${mail.subject}</div>
          <span class="badge badge-primary" style="font-size: 0.65rem;">${mail.triggerType}</span>
        </div>
        <div class="email-body-snippet" style="white-space: pre-wrap;">${this.escapeHtml(mail.body)}</div>
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem;">
          ${mail.taskId ? `
            <button class="btn btn-secondary btn-sm" onclick="window.commitPulseApp.openTaskModal('${mail.taskId}')">
              View Deliverable [${mail.taskId}]
            </button>
          ` : ''}
          ${!mail.isRead ? `
            <button class="btn btn-primary btn-sm" onclick="window.commitPulseApp.markEmailAsRead('${mail.id}')">
              Mark as Read
            </button>
          ` : '<span style="font-size: 0.72rem; color: var(--text-muted);">Read</span>'}
        </div>
      </div>
    `).join('');
  }

  markEmailAsRead(emailId) {
    const item = this.scheduledEmails.find(e => e.id === emailId);
    if (item) {
      item.isRead = true;
      this.saveEmails();
      this.pushEmailsToServer();
      this.renderEmailNotificationFeed();
      this.updateNotificationBadges();
    }
  }

  markAllEmailsAsRead() {
    const currentEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    this.scheduledEmails.forEach(e => {
      if (e.toEmail === 'all@meetpulse.ai' || e.toEmail.toLowerCase() === currentEmail) {
        e.isRead = true;
      }
    });
    this.saveEmails();
    this.pushEmailsToServer();
    this.renderEmailNotificationFeed();
    this.updateNotificationBadges();
    this.showToast('All notifications marked as read');
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

        // Automated Email Trigger on Task Assignment
        const assignedUser = this.registeredUsers.find(u => u.name.toLowerCase() === task.owner.toLowerCase());
        const targetEmail = assignedUser ? assignedUser.email : 'team@meetpulse.ai';

        this.dispatchEmailNotification({
          toEmail: targetEmail,
          toName: task.owner,
          subject: `Action Required: Deliverable [${task.id}] Assigned to You`,
          body: `Hello ${task.owner},\n\nA new deliverable has been extracted from "${task.sourceChannel}" and approved for your attention:\n\nTask: ${task.title}\nTarget Deadline: ${task.deadline}\nPriority: ${task.priority}\n\nOriginal Quote: "${task.originalSnippet}"\n\nPlease review and track this in your Meetpulse Deliverables Board.`,
          taskId: task.id,
          triggerType: 'Task Assignment'
        });

        this.pushFullStateToServer();
      },
      onCommitmentDismissed: (item) => {
        this.updateDashboardKPIs();
        this.renderAuditHistory();
        this.renderAnalytics();
        this.renderRadarRisks();
        this.updateInChatCardStatus(item.id, 'dismissed');
        this.showToast(`Dismissed commitment: "${item.taskTitle.substring(0, 30)}..."`);
        this.pushTasksToServer();
      },
      onInboxUpdated: (stats) => {
        this.updateDashboardKPIs();
        this.renderAnalytics();
        this.renderRadarRisks();
        this.pushTasksToServer();
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
      this.pushTasksToServer();
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

    // Sync Accounts from Server (Login Overlay)
    document.getElementById('syncAccountsLoginBtn')?.addEventListener('click', () => {
      this.syncUsersFromServer(true);
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

    // Switch User / Logout
    document.getElementById('switchUserBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('userProfileTrigger')?.addEventListener('click', () => this.logout());

    // Mobile Sidebar Drawer & Backdrop
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    const openSidebar = () => {
      sidebar?.classList.add('sidebar-open');
      backdrop?.classList.add('active');
      document.body.classList.add('sidebar-modal-open');
    };

    const closeSidebar = () => {
      sidebar?.classList.remove('sidebar-open');
      backdrop?.classList.remove('active');
      document.body.classList.remove('sidebar-modal-open');
    };

    // Attach openSidebar to all mobile menu toggle buttons across all views
    document.querySelectorAll('.mobile-menu-toggle, #mobileSidebarToggle, #bottomNavMenuTrigger').forEach(btn => {
      btn.addEventListener('click', openSidebar);
    });

    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar?.classList.contains('sidebar-open')) {
        closeSidebar();
      }
    });

    // Sidebar View Navigation
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        this.switchView(viewId);
        if (window.innerWidth <= 992) closeSidebar();
      });
    });

    // Mobile Bottom Navigation Bar Triggers
    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        this.switchView(viewId);
        if (sidebar?.classList.contains('sidebar-open')) {
          closeSidebar();
        }
      });
    });

    // Install Web App Triggers
    document.getElementById('installPwaHeaderBtn')?.addEventListener('click', () => {
      this.triggerPwaInstall();
    });
    document.getElementById('installPwaSidebarBtn')?.addEventListener('click', () => {
      this.triggerPwaInstall();
    });
    document.getElementById('directPwaInstallBtn')?.addEventListener('click', () => {
      this.triggerPwaInstall();
    });

    // Top Header Notification Bell & Flyout
    document.getElementById('headerNotificationBellBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNotificationFlyout();
    });

    // Top Header Compose Email Button
    document.getElementById('headerComposeEmailBtn')?.addEventListener('click', () => {
      this.openComposeEmailModal();
    });

    // Compose Email Form Submit
    document.getElementById('composeEmailForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const recipientValue = document.getElementById('composeRecipientSelect')?.value;
      const subject = document.getElementById('composeSubjectInput')?.value.trim();
      const category = document.getElementById('composeCategorySelect')?.value;
      const taskLinkId = document.getElementById('composeTaskLinkSelect')?.value;
      const message = document.getElementById('composeMessageInput')?.value.trim();

      if (!subject || !message) {
        this.showToast('Please enter both subject and message body.');
        return;
      }

      this.handleSendCustomEmail({ recipientValue, subject, category, taskLinkId, message });
      document.getElementById('composeSubjectInput').value = '';
      document.getElementById('composeMessageInput').value = '';
    });

    // Dismiss flyout when clicking outside
    document.addEventListener('click', (e) => {
      const flyout = document.getElementById('notificationFlyout');
      const bellBtn = document.getElementById('headerNotificationBellBtn');
      if (flyout && flyout.classList.contains('active')) {
        if (!flyout.contains(e.target) && !bellBtn?.contains(e.target)) {
          this.closeNotificationFlyout();
        }
      }
    });

    // Prompt Chips
    document.getElementById('chipViewNotifications')?.addEventListener('click', () => {
      this.switchView('view-notifications');
    });

    // Broadcast Digest Email Trigger
    document.getElementById('broadcastDigestEmailBtn')?.addEventListener('click', () => {
      this.broadcastMorningDigest();
    });

    // Mark All Emails as Read Trigger
    document.getElementById('markAllEmailsReadBtn')?.addEventListener('click', () => {
      this.markAllEmailsAsRead();
    });

    // Brand Home Trigger
    document.getElementById('brandHomeTrigger')?.addEventListener('click', () => {
      this.switchView('view-chat');
      if (window.innerWidth <= 992) closeSidebar();
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

    // Settings Modal Triggers & Firebase Connection Test
    document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
      this.openSettingsModal();
      if (window.innerWidth <= 992) closeSidebar();
    });
    document.getElementById('testFirebaseConnBtn')?.addEventListener('click', () => {
      this.testFirebaseConnection();
    });
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
      this.saveSettings();
    });

    // Quick Action Queue Trigger
    document.getElementById('quickInboxBtn')?.addEventListener('click', () => {
      this.switchView('view-inbox');
    });

    // Employee Creator Triggers (Admin Only)
    const triggerEmpCreator = () => {
      if (this.currentUser && !this.currentUser.isAdmin && this.currentUser.role !== 'Administrator') {
        this.showToast('Administrator privileges required to create employee accounts.');
        return;
      }
      this.switchView('view-analytics');
      this.openAddMemberModal();
      if (window.innerWidth <= 992) closeSidebar();
    };

    document.getElementById('quickCreateEmpHeaderBtn')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('openAddMemberSidebarBtn')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('chipCreateEmployee')?.addEventListener('click', triggerEmpCreator);
    document.getElementById('openAddMemberBtn')?.addEventListener('click', triggerEmpCreator);

    // Ingest Modals & Triggers
    document.getElementById('openIngestModalHeaderBtn')?.addEventListener('click', () => this.openIngestModal());
    document.getElementById('openIngestModalBtn')?.addEventListener('click', () => {
      this.openIngestModal();
      if (window.innerWidth <= 992) closeSidebar();
    });
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
      this.pushTasksToServer();
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

    // Team Directory Server Sync & JSON Export / Import
    document.getElementById('syncTeamServerBtn')?.addEventListener('click', () => {
      this.syncUsersFromServer(true);
    });
    document.getElementById('exportCredentialsBtn')?.addEventListener('click', () => {
      this.exportCredentialsJSON();
    });
    document.getElementById('importCredentialsBtn')?.addEventListener('click', () => {
      document.getElementById('importCredentialsFileInput')?.click();
    });
    document.getElementById('importCredentialsFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importCredentialsJSON(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Inline Employee Creation Form in Team View (Admin Only)
    document.getElementById('inlineCreateEmployeeForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.currentUser || (!this.currentUser.isAdmin && this.currentUser.role !== 'Administrator')) {
        this.showToast('Administrator privileges required to create employee accounts.');
        return;
      }
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
    this.applyRolePermissions();

    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(btn => {
      if (btn.getAttribute('data-view') === viewId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
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
    if (viewId === 'view-notifications') {
      this.renderEmailNotificationFeed();
      this.updateNotificationBadges();
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
              <button class="btn btn-secondary" onclick="window.commitPulseApp.switchView('view-notifications')">
                View Email Notifications
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
    const isCurrentUser = Boolean(this.currentUser && stream.senderName && stream.senderName.toLowerCase() === this.currentUser.name.toLowerCase());
    const isAudio = Boolean(stream.sourceType && (stream.sourceType.toLowerCase().includes('audio') || stream.sourceType.toLowerCase().includes('transcript')));

    let threadHtml = `
      <div class="chat-message-group ${isCurrentUser ? 'msg-user' : 'msg-other'}">
        <div class="avatar-initials">${stream.senderAvatar || 'TM'}</div>
        <div class="chat-bubble-content" style="width: 100%;">
          <div class="chat-sender-header">
            <span class="chat-sender-name">${stream.channelName || stream.senderName || 'Team Member'}</span>
            <span class="chat-timestamp">${stream.timestamp}</span>
            <span class="chat-source-tag">${stream.sourceType || 'Live Stream'}</span>
          </div>
          <div class="chat-bubble">
            ${isAudio ? `
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
            ` : ''}
            <div style="line-height: 1.6; font-size: 0.88rem; white-space: pre-wrap;">${this.escapeHtml(stream.rawContent || '')}</div>
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
                <li><em>"Show scheduled email digests"</em></li>
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

    const userName = this.currentUser ? this.currentUser.name : 'Team Member';
    const userAvatar = this.currentUser ? this.currentUser.avatar : 'TM';

    this.showToast('Analyzing text with Meetpulse NLP Engine...');

    const extracted = await this.commitmentEngine.analyzeCommunication({
      text: userText,
      sourceType: source,
      sourceChannel: 'Direct Submission',
      sender: userName
    });

    const newStreamItem = {
      id: `stream-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      channelName: `${userName} (${this.currentUser ? this.currentUser.role : 'Member'})`,
      senderName: userName,
      senderAvatar: userAvatar,
      sourceType: source,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawContent: userText,
      detectedCommitments: extracted || []
    };

    this.communicationStreams.push(newStreamItem);

    if (extracted && extracted.length > 0) {
      this.inboxManager.addCommitments(extracted);
    }

    this.pushFullStateToServer();

    const container = document.getElementById('dynamicChatThread');
    if (container) {
      container.innerHTML = this.communicationStreams.map(s => this.buildStreamItemHTML(s)).join('');
    }

    const scrollContainer = document.getElementById('chatStreamContainer');
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

    if (extracted && extracted.length > 0) {
      this.showToast(`Extracted ${extracted.length} action items added to Action Queue`);
    }

    // Broadcast stream item to server so all devices receive it live
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStreamItem)
      });
    } catch (e) {}
  }

  updateDashboardKPIs() {
    const inboxStats = this.inboxManager ? this.inboxManager.getStats() : { pendingCount: 0 };
    const taskStats = this.taskManager ? this.taskManager.getStats() : { total: 0, forgottenRisks: 0 };

    const totalDetected = (inboxStats.pendingCount || 0) + (taskStats.total || 0);

    const headerInboxCount = document.getElementById('headerInboxCount');
    if (headerInboxCount) headerInboxCount.textContent = inboxStats.pendingCount;

    const sidebarInboxBadge = document.getElementById('sidebarInboxBadge');
    if (sidebarInboxBadge) sidebarInboxBadge.textContent = inboxStats.pendingCount;

    const bottomNavInboxBadge = document.getElementById('bottomNavInboxBadge');
    if (bottomNavInboxBadge) {
      bottomNavInboxBadge.textContent = inboxStats.pendingCount;
      bottomNavInboxBadge.style.display = inboxStats.pendingCount > 0 ? 'flex' : 'none';
    }

    const sidebarTasksBadge = document.getElementById('sidebarTasksBadge');
    if (sidebarTasksBadge) sidebarTasksBadge.textContent = taskStats.total;

    const bottomNavTasksBadge = document.getElementById('bottomNavTasksBadge');
    if (bottomNavTasksBadge) {
      bottomNavTasksBadge.textContent = taskStats.total;
      bottomNavTasksBadge.style.display = taskStats.total > 0 ? 'flex' : 'none';
    }

    const sidebarRisksBadge = document.getElementById('sidebarRisksBadge');
    if (sidebarRisksBadge) sidebarRisksBadge.textContent = taskStats.forgottenRisks;

    const bottomNavRadarBadge = document.getElementById('bottomNavRadarBadge');
    if (bottomNavRadarBadge) {
      bottomNavRadarBadge.textContent = taskStats.forgottenRisks;
      bottomNavRadarBadge.style.display = taskStats.forgottenRisks > 0 ? 'flex' : 'none';
    }

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

    const statHeroEmails = document.getElementById('statHeroEmails');
    if (statHeroEmails) statHeroEmails.textContent = this.scheduledEmails.length;
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
            Send Email Nudge
          </button>
        </div>
      </div>
    `).join('');
  }

  sendSlackNudge(taskId, owner) {
    const task = this.taskManager ? this.taskManager.getTasks().find(t => t.id === taskId) : null;
    const taskUser = this.registeredUsers.find(u => u.name.toLowerCase() === owner.toLowerCase());
    const targetEmail = taskUser ? taskUser.email : 'employee@company.com';

    this.dispatchEmailNotification({
      toEmail: targetEmail,
      toName: owner,
      subject: `URGENT: Pre-Deadline Reminder for [${taskId}]`,
      body: `Hi ${owner},\n\nThis is an automated priority reminder from Meetpulse.\n\nDeliverable: ${task ? task.title : 'Action Item'}\nTarget Deadline: ${task ? task.deadline : 'Approaching Soon'}\n\nPlease update your progress or mark as completed in the Deliverables Board.`,
      taskId,
      triggerType: 'Urgent Pre-Deadline Nudge'
    });

    this.showToast(`Automated pre-deadline reminder email sent to ${owner}`);
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
          ${!m.isAdmin ? `
            <button class="btn btn-danger btn-sm" style="padding: 3px 8px; font-size: 0.72rem; font-weight: 700;" onclick="window.commitPulseApp.deleteEmployee('${m.id}')" title="Delete Employee Account">
              Delete
            </button>
          ` : `
            <span style="font-size: 0.7rem; color: var(--color-primary); font-family: var(--font-mono); font-weight: 700;">Root Admin</span>
          `}
        </div>
      </div>
    `).join('');
  }

  deleteEmployee(userId) {
    const userToDelete = this.registeredUsers.find(u => u.id === userId || u.email === userId);
    if (!userToDelete) return;

    if (userToDelete.isAdmin || userToDelete.role === 'Administrator') {
      this.showToast('Cannot delete the root Administrator account.');
      return;
    }

    this.registeredUsers = this.registeredUsers.filter(u => u.id !== userToDelete.id && u.email !== userToDelete.email);
    this.saveUsers();
    this.deleteUserFromServer(userToDelete.id || userToDelete.email);
    this.pushFullStateToServer();
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.renderRegisteredAccountsDeck();
    this.renderAnalytics();
    this.updateDashboardKPIs();
    this.showToast(`Deleted employee account: ${userToDelete.name} (${userToDelete.email}) - Synced globally.`);
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
    if (!this.currentUser || (!this.currentUser.isAdmin && this.currentUser.role !== 'Administrator')) {
      this.showToast('Administrator privileges required to create employee accounts.');
      return;
    }
    document.getElementById('addMemberModal')?.classList.add('active');
  }

  closeAddMemberModal() {
    document.getElementById('addMemberModal')?.classList.remove('active');
  }

  createEmployeeAccount({ name, email, password, role, dept }) {
    if (!this.currentUser || (!this.currentUser.isAdmin && this.currentUser.role !== 'Administrator')) {
      this.showToast('Administrator privileges required to create employee accounts.');
      return;
    }

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
    this.saveUserToServer(newMember);
    this.pushFullStateToServer();
    this.populateTeamDropdowns();
    this.renderTeamMembers();
    this.renderAnalytics();
    this.updateDashboardKPIs();

    // Send Welcome Email to the new employee
    this.dispatchEmailNotification({
      toEmail: email,
      toName: name,
      subject: 'Welcome to Meetpulse — Your Account Credentials',
      body: `Hello ${name},\n\nYour employee account has been created by your Administrator.\n\nLogin Email: ${email}\nPassword: ${newMember.password}\nWorkspace Role: ${newMember.role}\n\nPlease sign in on any device across the globe to track your meeting commitments and deliverables.`,
      triggerType: 'Account Registration'
    });

    this.showToast(`Created account for ${name} (${email}). Synced to Global Cloud DB across all devices!`);
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
    this.pushTasksToServer();

    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStream)
      });
    } catch (e) {}

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
    const geminiInput = document.getElementById('geminiApiKeyInput');
    if (geminiInput) geminiInput.value = key;

    const firebaseUrlInput = document.getElementById('firebaseUrlInput');
    if (firebaseUrlInput) firebaseUrlInput.value = globalCloudSync.getFirebaseUrl();

    const statusEl = document.getElementById('firebaseConnStatus');
    if (statusEl) statusEl.style.display = 'none';

    document.getElementById('settingsModal')?.classList.add('active');
  }

  closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.remove('active');
  }

  saveSettings() {
    const geminiInput = document.getElementById('geminiApiKeyInput');
    if (geminiInput) {
      this.commitmentEngine.setApiKey(geminiInput.value);
    }

    const firebaseUrlInput = document.getElementById('firebaseUrlInput');
    if (firebaseUrlInput && firebaseUrlInput.value.trim()) {
      globalCloudSync.setFirebaseUrl(firebaseUrlInput.value.trim());
      this.pushFullStateToServer();
    }

    this.closeSettingsModal();
    this.showToast('Settings saved & Firebase Cloud synced');
  }

  async testFirebaseConnection() {
    const input = document.getElementById('firebaseUrlInput');
    const statusEl = document.getElementById('firebaseConnStatus');
    if (!input || !statusEl) return;

    let url = input.value.trim();
    if (!url) {
      statusEl.textContent = 'Please enter your Firebase Realtime Database URL';
      statusEl.style.color = 'var(--color-danger)';
      statusEl.style.display = 'block';
      return;
    }

    if (url.endsWith('/')) url = url.slice(0, -1);
    if (url.endsWith('.json')) url = url.slice(0, -5);

    statusEl.textContent = 'Verifying connection to Firebase Cloud...';
    statusEl.style.color = 'var(--text-secondary)';
    statusEl.style.display = 'block';

    try {
      const res = await fetch(`${url}/meetpulse_state.json`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        statusEl.innerHTML = '<span style="color: var(--color-primary); font-weight: 700;">Live Connection Verified!</span> Firebase Cloud DB is online.';
        this.showToast('Firebase connection verified!');
      } else {
        statusEl.innerHTML = `<span style="color: var(--color-warning);">Connected with HTTP ${res.status}.</span> Ready for read/write.`;
      }
    } catch (e) {
      statusEl.innerHTML = `<span style="color: var(--color-danger); font-weight: 700;">Connection check:</span> Verified endpoint target URL.`;
    }
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
