// js/cloudSync.js - Worldwide Real-Time Multi-Device Cloud Database Synchronizer
// Enables instant cross-device account creation, cross-network authentication, and live state replication across the globe.

const DEFAULT_CLOUD_OBJECT_ID = "ff8081819ff5b11001a03a11cbb31f8a";
const CLOUD_API_BASE = "https://api.restful-api.dev/objects";

export class CloudSyncEngine {
  constructor() {
    this.cloudObjectId = localStorage.getItem("meetpulse_cloud_id") || DEFAULT_CLOUD_OBJECT_ID;
    this.isOnline = navigator.onLine;
    this.syncInterval = null;
    this.onUpdateCallback = null;
    this.isSyncing = false;
    this.status = "connected"; // 'connected' | 'syncing' | 'offline'
    this.lastLocalUpdateTime = Date.now();
    this.lastRemoteUpdateTime = 0;
    this.pendingPushTimeout = null;
    this.cachedState = null;

    this.initNetworkListeners();
  }

  initNetworkListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.updateStatusBadge("connected", "Online (Global Cloud Connected)");
      this.fetchFullState();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.updateStatusBadge("offline", "Offline (Cached Mode)");
    });
  }

  updateStatusBadge(status, message) {
    this.status = status;
    const badge = document.getElementById("cloudSyncStatusBadge");
    const textEl = document.getElementById("cloudSyncStatusText");
    const dot = document.getElementById("cloudSyncPulseDot");

    if (badge) {
      badge.setAttribute("title", message || "Global Cloud Database Connected");
    }
    if (textEl) {
      textEl.textContent = status === "connected" ? "Cloud DB: Online" : status === "syncing" ? "Syncing..." : "Cloud DB: Offline";
    }
    if (dot) {
      dot.className = `live-pulse-dot ${status === "connected" ? "pulse-green" : status === "syncing" ? "pulse-yellow" : "pulse-red"}`;
    }
  }

  // Create a new cloud object if ID is missing or expired (auto-healing)
  async ensureCloudObject(initialState = null) {
    try {
      const stateToStore = initialState || {
        users: [
          {
            id: "user-admin-1",
            email: "admin@meetpulse.ai",
            password: "admin123",
            name: "Administrator",
            role: "Administrator",
            avatar: "AD",
            department: "Executive Operations",
            isAdmin: true,
            activeTasks: 0,
            reliabilityScore: 100
          }
        ],
        chat: [],
        tasks: { tasks: [], inbox: [] },
        emails: [],
        updatedAt: Date.now()
      };

      const res = await fetch(CLOUD_API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "meetpulse_global_cloud_db_v2",
          data: stateToStore
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.id) {
          this.cloudObjectId = json.id;
          localStorage.setItem("meetpulse_cloud_id", json.id);
          console.log("Created new Global Cloud DB Object:", json.id);
          return json.id;
        }
      }
    } catch (e) {
      console.warn("Could not provision new cloud object:", e);
    }
    return this.cloudObjectId;
  }

  // 1. Fetch Users from Global Cloud DB with Fallbacks
  async fetchUsers() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${CLOUD_API_BASE}/${this.cloudObjectId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 404) {
        await this.ensureCloudObject();
      } else if (res.ok) {
        const json = await res.json();
        const users = json?.data?.users;
        if (Array.isArray(users) && users.length > 0) {
          localStorage.setItem("meetpulse_users_db", JSON.stringify(users));
          this.updateStatusBadge("connected", "Synced with Global Cloud Database");
          return users;
        }
      }
    } catch (e) {
      console.warn("Global Cloud fetch users warning:", e);
    }

    // Secondary fallback to serverless / Python server /api/users
    try {
      const apiRes = await fetch("/api/users");
      if (apiRes.ok) {
        const apiUsers = await apiRes.json();
        if (Array.isArray(apiUsers) && apiUsers.length > 0) {
          localStorage.setItem("meetpulse_users_db", JSON.stringify(apiUsers));
          return apiUsers;
        }
      }
    } catch (e) {}

    // Tertiary fallback: localStorage
    try {
      const stored = localStorage.getItem("meetpulse_users_db");
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    return null;
  }

  // 2. Fetch Full Global Workspace State (Users, Chat, Tasks, Emails)
  async fetchFullState() {
    if (this.isSyncing) return this.cachedState;
    this.isSyncing = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${CLOUD_API_BASE}/${this.cloudObjectId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 404) {
        await this.ensureCloudObject();
      } else if (res.ok) {
        const json = await res.json();
        const data = json?.data;
        if (data && typeof data === "object") {
          this.cachedState = data;
          this.lastRemoteUpdateTime = data.updatedAt || Date.now();
          this.updateStatusBadge("connected", "Global Cloud Synchronized");
          return data;
        }
      }
    } catch (e) {
      console.warn("Cloud DB fetch state warning:", e);
    } finally {
      this.isSyncing = false;
    }

    // Secondary: try /api/live-sync
    try {
      const localRes = await fetch("/api/live-sync");
      if (localRes.ok) {
        const localData = await localRes.json();
        this.cachedState = localData;
        return localData;
      }
    } catch (e) {}

    return this.cachedState;
  }

  // 3. Save User Account to Global Cloud DB
  async saveUser(user) {
    if (!user || !user.email) return;

    this.updateStatusBadge("syncing", "Broadcasting new account to Global Cloud DB...");

    try {
      let state = this.cachedState;
      if (!state || !Array.isArray(state.users)) {
        state = await this.fetchFullState();
      }

      if (!state || !Array.isArray(state.users)) {
        state = {
          users: [],
          chat: [],
          tasks: { tasks: [], inbox: [] },
          emails: []
        };
      }

      const email = user.email.trim().toLowerCase();
      const idx = state.users.findIndex(u => u.email && u.email.toLowerCase() === email);
      if (idx !== -1) {
        state.users[idx] = { ...state.users[idx], ...user };
      } else {
        state.users.push(user);
      }
      state.updatedAt = Date.now();
      this.lastLocalUpdateTime = state.updatedAt;
      this.cachedState = state;

      await this.executePush(state);
    } catch (e) {
      console.error("Failed to save user to Global Cloud DB:", e);
    }

    // Also notify serverless / Python server if available
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
      });
    } catch (e) {}
  }

  // 4. Delete User Account from Global Cloud DB
  async deleteUser(userId) {
    if (!userId) return;

    this.updateStatusBadge("syncing", "Removing account across cloud nodes...");

    try {
      let state = this.cachedState;
      if (!state || !Array.isArray(state.users)) {
        state = await this.fetchFullState();
      }

      if (state && Array.isArray(state.users)) {
        const target = String(userId).toLowerCase();
        state.users = state.users.filter(u => {
          const uid = String(u.id || "").toLowerCase();
          const uemail = String(u.email || "").toLowerCase();
          return uid !== target && uemail !== target;
        });
        state.updatedAt = Date.now();
        this.lastLocalUpdateTime = state.updatedAt;
        this.cachedState = state;

        await this.executePush(state);
        this.updateStatusBadge("connected", "Account removed globally");
      }
    } catch (e) {
      console.error("Failed to delete user from Global Cloud DB:", e);
    }

    // Also notify serverless / Python server
    try {
      await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (e) {}
  }

  // 5. Broadcast State Update (Chat, Tasks, Emails, Users) to Global Cloud DB
  async pushFullState(state) {
    if (!state) return;

    state.updatedAt = Date.now();
    this.lastLocalUpdateTime = state.updatedAt;
    this.cachedState = state;

    // Debounce rapid calls (e.g. batch approvals or rapid clicks)
    if (this.pendingPushTimeout) {
      clearTimeout(this.pendingPushTimeout);
    }

    this.pendingPushTimeout = setTimeout(() => {
      this.executePush(this.cachedState);
    }, 150);
  }

  async executePush(state) {
    if (!state) return;

    this.updateStatusBadge("syncing", "Saving updates to cloud...");

    try {
      const payload = {
        name: "meetpulse_global_cloud_db_v2",
        data: {
          users: state.users || [],
          chat: state.chat || [],
          tasks: state.tasks || { tasks: [], inbox: [] },
          emails: state.emails || [],
          updatedAt: state.updatedAt || Date.now()
        }
      };

      const res = await fetch(`${CLOUD_API_BASE}/${this.cloudObjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.status === 404) {
        await this.ensureCloudObject(payload.data);
      } else if (res.ok) {
        this.updateStatusBadge("connected", "Synced worldwide");
      }
    } catch (e) {
      console.warn("Cloud state broadcast warning:", e);
    }

    // Also push to /api/live-sync
    try {
      await fetch("/api/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      });
    } catch (e) {}
  }

  // 6. Start Continuous Real-Time Synchronization Loop
  startSyncLoop(intervalMs = 3000, callback = null) {
    this.onUpdateCallback = callback;

    if (this.syncInterval) clearInterval(this.syncInterval);

    const performSync = async () => {
      // Don't overwrite if local state was updated in the last 1.5s
      if (Date.now() - this.lastLocalUpdateTime < 1500) return;

      const remoteState = await this.fetchFullState();
      if (remoteState && this.onUpdateCallback) {
        this.onUpdateCallback(remoteState);
      }
    };

    // Initial immediate fetch
    performSync();

    this.syncInterval = setInterval(performSync, intervalMs);

    // Sync immediately whenever the tab is focused or becomes visible
    window.addEventListener("focus", performSync);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) performSync();
    });
  }

  stopSyncLoop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const globalCloudSync = new CloudSyncEngine();
