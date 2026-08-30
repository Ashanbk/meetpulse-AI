// js/cloudSync.js - Worldwide Real-Time Firebase Cloud Database Synchronizer & SDK Engine
// Supports Official Firebase SDK (v10) + Server-Sent Events (SSE) + REST Realtime Sync

const DEFAULT_FIREBASE_URL = "https://meetpulse-ai-cloud-default-rtdb.firebaseio.com";

export class CloudSyncEngine {
  constructor() {
    this.firebaseConfig = null;
    this.firebaseUrl = DEFAULT_FIREBASE_URL;
    this.dbRef = null;
    this.firebaseApp = null;
    this.eventSource = null;
    this.syncInterval = null;
    this.onUpdateCallback = null;
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.status = "connected"; // 'connected' | 'syncing' | 'offline'
    this.lastLocalUpdateTime = Date.now();
    this.pendingPushTimeout = null;
    this.cachedState = null;

    this.loadStoredConfig();
    this.initNetworkListeners();
    this.initFirebase();
  }

  loadStoredConfig() {
    const raw = localStorage.getItem("meetpulse_firebase_config") || localStorage.getItem("meetpulse_firebase_url") || "";
    this.parseAndSetConfig(raw);
  }

  parseAndSetConfig(rawInput) {
    if (!rawInput || !rawInput.trim()) {
      this.firebaseUrl = DEFAULT_FIREBASE_URL;
      this.firebaseConfig = null;
      return;
    }

    const input = rawInput.trim();

    // 1. Check if input is a JSON object or JS snippet (const firebaseConfig = { ... })
    if (input.includes("{") && input.includes("}")) {
      try {
        let jsonStr = input;
        // Strip JS variable assignment if present (e.g. const firebaseConfig = { ... };)
        const match = input.match(/\{[\s\S]*\}/);
        if (match) {
          jsonStr = match[0];
        }
        // Convert JS object keys without quotes to valid JSON
        jsonStr = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"');
        const parsed = JSON.parse(jsonStr);

        if (parsed && typeof parsed === "object") {
          this.firebaseConfig = parsed;
          if (parsed.databaseURL) {
            this.firebaseUrl = this.sanitizeUrl(parsed.databaseURL);
          } else if (parsed.projectId) {
            this.firebaseUrl = `https://${parsed.projectId}-default-rtdb.firebaseio.com`;
          }
          localStorage.setItem("meetpulse_firebase_config", JSON.stringify(parsed));
          return;
        }
      } catch (e) {
        // Fallback to regex extraction
        const dbUrlMatch = input.match(/databaseURL\s*:\s*["']([^"']+)["']/i);
        const projIdMatch = input.match(/projectId\s*:\s*["']([^"']+)["']/i);
        const apiKeyMatch = input.match(/apiKey\s*:\s*["']([^"']+)["']/i);

        if (dbUrlMatch || projIdMatch) {
          this.firebaseConfig = {
            apiKey: apiKeyMatch ? apiKeyMatch[1] : "",
            projectId: projIdMatch ? projIdMatch[1] : "",
            databaseURL: dbUrlMatch ? dbUrlMatch[1] : (projIdMatch ? `https://${projIdMatch[1]}-default-rtdb.firebaseio.com` : "")
          };
          this.firebaseUrl = this.sanitizeUrl(this.firebaseConfig.databaseURL);
          localStorage.setItem("meetpulse_firebase_config", JSON.stringify(this.firebaseConfig));
          return;
        }
      }
    }

    // 2. Otherwise treat input as raw Database URL
    this.firebaseUrl = this.sanitizeUrl(input);
    localStorage.setItem("meetpulse_firebase_url", this.firebaseUrl);
  }

  sanitizeUrl(url) {
    if (!url) return DEFAULT_FIREBASE_URL;
    let clean = url.trim();
    if (clean.endsWith("/")) clean = clean.slice(0, -1);
    if (clean.endsWith(".json")) clean = clean.slice(0, -5);
    if (clean.endsWith("/meetpulse_state")) clean = clean.slice(0, -16);
    return clean;
  }

  setFirebaseConfigOrUrl(input) {
    this.parseAndSetConfig(input);
    this.initFirebase();
    this.fetchFullState();
  }

  getConfigOrUrlDisplay() {
    if (this.firebaseConfig) {
      return JSON.stringify(this.firebaseConfig, null, 2);
    }
    return this.firebaseUrl || DEFAULT_FIREBASE_URL;
  }

  initNetworkListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.updateStatusBadge("connected", "Online (Firebase Cloud Connected)");
      this.initFirebase();
      this.fetchFullState();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.updateStatusBadge("offline", "Offline (Local Cache Mode)");
      this.closeListeners();
    });
  }

  updateStatusBadge(status, message) {
    this.status = status;
    const badge = document.getElementById("cloudSyncStatusBadge");
    const textEl = document.getElementById("cloudSyncStatusText");
    const dot = document.getElementById("cloudSyncPulseDot");

    if (badge) {
      badge.setAttribute("title", message || "Firebase Realtime Cloud Database Connected");
    }
    if (textEl) {
      textEl.textContent = status === "connected" ? "Firebase: Live" : status === "syncing" ? "Syncing..." : "Firebase: Offline";
    }
    if (dot) {
      dot.className = `live-pulse-dot ${status === "connected" ? "pulse-green" : status === "syncing" ? "pulse-yellow" : "pulse-red"}`;
    }
  }

  // Initialize Firebase (SDK WebSocket if config available, else SSE Stream)
  initFirebase() {
    this.closeListeners();

    // 1. Try initializing Official Firebase SDK
    if (window.FirebaseSDK && this.firebaseConfig && this.firebaseConfig.apiKey) {
      try {
        const { initializeApp, getApps, getDatabase, ref, onValue } = window.FirebaseSDK;
        const apps = getApps();
        this.firebaseApp = apps.length > 0 ? apps[0] : initializeApp(this.firebaseConfig);
        const db = getDatabase(this.firebaseApp);
        this.dbRef = ref(db, "meetpulse_state");

        onValue(this.dbRef, (snapshot) => {
          const data = snapshot.val();
          if (data && typeof data === "object") {
            if (!data.updatedAt || data.updatedAt >= this.lastLocalUpdateTime - 500) {
              this.cachedState = data;
              if (this.onUpdateCallback) {
                this.onUpdateCallback(data);
              }
              this.updateStatusBadge("connected", "Firebase Realtime SDK Live");
            }
          }
        }, (error) => {
          console.warn("Firebase SDK onValue note:", error);
          this.initSseStream();
        });

        console.log("Firebase Official SDK Initialized successfully");
        this.updateStatusBadge("connected", "Firebase SDK Connected");
        return;
      } catch (err) {
        console.warn("Firebase SDK init fallback to SSE:", err);
      }
    }

    // 2. Fallback to SSE Stream over REST
    this.initSseStream();
  }

  initSseStream() {
    if (!window.EventSource || !this.firebaseUrl) return;

    try {
      const streamUrl = `${this.firebaseUrl}/meetpulse_state.json`;
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.addEventListener("put", (e) => {
        try {
          const payload = JSON.parse(e.data);
          const data = payload?.data;
          if (data && typeof data === "object") {
            if (!data.updatedAt || data.updatedAt >= this.lastLocalUpdateTime - 500) {
              this.cachedState = data;
              if (this.onUpdateCallback) {
                this.onUpdateCallback(data);
              }
              this.updateStatusBadge("connected", "Firebase Real-time Stream Active");
            }
          }
        } catch (err) {}
      });

      this.eventSource.addEventListener("patch", (e) => {
        try {
          const payload = JSON.parse(e.data);
          const patchData = payload?.data;
          if (patchData && this.cachedState) {
            this.cachedState = { ...this.cachedState, ...patchData };
            if (this.onUpdateCallback) {
              this.onUpdateCallback(this.cachedState);
            }
          }
        } catch (err) {}
      });

      this.eventSource.onerror = () => {
        this.updateStatusBadge("connected", "Firebase REST Sync Active");
      };
    } catch (e) {
      console.warn("Firebase SSE stream note:", e);
    }
  }

  closeListeners() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // Fetch Users from Firebase Cloud DB with Multi-Tier Fallback
  async fetchUsers() {
    // 1. Try Firebase SDK
    if (window.FirebaseSDK && this.firebaseApp) {
      try {
        const { getDatabase, ref, get } = window.FirebaseSDK;
        const db = getDatabase(this.firebaseApp);
        const snapshot = await get(ref(db, "meetpulse_state/users"));
        if (snapshot.exists()) {
          const users = snapshot.val();
          if (Array.isArray(users) && users.length > 0) {
            localStorage.setItem("meetpulse_users_db", JSON.stringify(users));
            return users;
          }
        }
      } catch (e) {}
    }

    // 2. Try REST Endpoint
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.firebaseUrl}/meetpulse_state/users.json`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const users = await res.json();
        if (Array.isArray(users) && users.length > 0) {
          localStorage.setItem("meetpulse_users_db", JSON.stringify(users));
          this.updateStatusBadge("connected", "Synced with Firebase Cloud DB");
          return users;
        }
      }
    } catch (e) {}

    // 3. Fallback to /api/users
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

    // 4. LocalStorage
    try {
      const stored = localStorage.getItem("meetpulse_users_db");
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    return null;
  }

  // Fetch Full Global Workspace State
  async fetchFullState() {
    if (this.isSyncing) return this.cachedState;
    this.isSyncing = true;

    // 1. Try Firebase SDK
    if (window.FirebaseSDK && this.firebaseApp) {
      try {
        const { getDatabase, ref, get } = window.FirebaseSDK;
        const db = getDatabase(this.firebaseApp);
        const snapshot = await get(ref(db, "meetpulse_state"));
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data && typeof data === "object") {
            this.cachedState = data;
            this.isSyncing = false;
            this.updateStatusBadge("connected", "Firebase Cloud Synchronized");
            return data;
          }
        }
      } catch (e) {}
    }

    // 2. Try REST
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.firebaseUrl}/meetpulse_state.json`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          this.cachedState = data;
          this.updateStatusBadge("connected", "Firebase Cloud Synchronized");
          return data;
        }
      }
    } catch (e) {} finally {
      this.isSyncing = false;
    }

    // 3. Fallback to /api/live-sync
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

  // Save User Account
  async saveUser(user) {
    if (!user || !user.email) return;

    this.updateStatusBadge("syncing", "Saving account to Firebase Cloud...");

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
      console.error("Failed to save user to Firebase Cloud DB:", e);
    }

    // Also notify serverless / Python server
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
      });
    } catch (e) {}
  }

  // Delete User Account
  async deleteUser(userId) {
    if (!userId) return;

    this.updateStatusBadge("syncing", "Removing account from Firebase Cloud...");

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
      console.error("Failed to delete user from Firebase Cloud DB:", e);
    }

    try {
      await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
    } catch (e) {}
  }

  // Broadcast Full State Update to Firebase
  async pushFullState(state) {
    if (!state) return;

    state.updatedAt = Date.now();
    this.lastLocalUpdateTime = state.updatedAt;
    this.cachedState = state;

    if (this.pendingPushTimeout) {
      clearTimeout(this.pendingPushTimeout);
    }

    this.pendingPushTimeout = setTimeout(() => {
      this.executePush(this.cachedState);
    }, 120);
  }

  async executePush(state) {
    if (!state) return;

    this.updateStatusBadge("syncing", "Saving updates to Firebase...");

    const payload = {
      users: state.users || [],
      chat: state.chat || [],
      tasks: state.tasks || { tasks: [], inbox: [] },
      emails: state.emails || [],
      updatedAt: state.updatedAt || Date.now()
    };

    // 1. Try Firebase SDK set()
    if (window.FirebaseSDK && this.firebaseApp) {
      try {
        const { getDatabase, ref, set } = window.FirebaseSDK;
        const db = getDatabase(this.firebaseApp);
        await set(ref(db, "meetpulse_state"), payload);
        this.updateStatusBadge("connected", "Firebase Synced Live Worldwide");
        return;
      } catch (e) {
        console.warn("Firebase SDK set fallback to REST:", e);
      }
    }

    // 2. Try REST PUT
    try {
      const res = await fetch(`${this.firebaseUrl}/meetpulse_state.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.updateStatusBadge("connected", "Firebase Synced Live Worldwide");
      }
    } catch (e) {
      console.warn("Firebase state broadcast note:", e);
    }

    // Also notify /api/live-sync
    try {
      await fetch("/api/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  // Continuous Synchronization Loop
  startSyncLoop(intervalMs = 3500, callback = null) {
    this.onUpdateCallback = callback;

    if (this.syncInterval) clearInterval(this.syncInterval);

    const performSync = async () => {
      if (Date.now() - this.lastLocalUpdateTime < 1500) return;

      const remoteState = await this.fetchFullState();
      if (remoteState && this.onUpdateCallback) {
        this.onUpdateCallback(remoteState);
      }
    };

    performSync();
    this.syncInterval = setInterval(performSync, intervalMs);

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
    this.closeListeners();
  }
}

export const globalCloudSync = new CloudSyncEngine();
