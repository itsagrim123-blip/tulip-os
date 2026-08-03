(function () {
    const PERMISSIONS = ["filesystem", "notifications", "clipboard", "settings", "wallpaper", "terminal", "window", "storage"];
    const LOG_KEY = "tulip.sdk.logs";
    const PERMISSION_KEY = "tulip.sdk.permissions";
    const DEV_KEY = "tulip.developerMode";

    class ManifestValidator {
        static validate(manifest) {
            if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { valid: false, error: "app.json is missing or invalid." };
            const required = ["id", "name", "version", "entry"];
            const missing = required.filter(key => typeof manifest[key] !== "string" || !manifest[key].trim());
            if (missing.length) return { valid: false, error: `Manifest is missing: ${missing.join(", ")}.` };
            if (!/^[a-z][a-z0-9._-]{1,63}$/i.test(manifest.id)) return { valid: false, error: "App IDs may contain letters, numbers, dots, hyphens, and underscores." };
            if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) return { valid: false, error: "Version must use major.minor.patch." };
            if (manifest.permissions !== undefined && (!Array.isArray(manifest.permissions) || manifest.permissions.some(permission => typeof permission !== "string"))) return { valid: false, error: "Permissions must be an array of names." };
            const unknown = (manifest.permissions || []).filter(permission => !PERMISSIONS.includes(permission));
            if (unknown.length) return { valid: false, error: `Unsupported permission: ${unknown[0]}.` };
            return { valid: true, manifest: { ...manifest, permissions: [...new Set(manifest.permissions || [])] } };
        }
    }

    class PermissionManager {
        constructor(notifications) { this.notifications = notifications; this.decisions = this.read(); }
        read() { try { return JSON.parse(localStorage.getItem(PERMISSION_KEY) || "{}"); } catch { return {}; } }
        save() { try { localStorage.setItem(PERMISSION_KEY, JSON.stringify(this.decisions)); } catch { /* Permissions remain valid for the active session. */ } }
        get(appId, permission) { return this.decisions[appId]?.[permission] || "prompt"; }
        list(appId) { return { ...(this.decisions[appId] || {}) }; }
        set(appId, permission, decision) { this.decisions[appId] ||= {}; this.decisions[appId][permission] = decision; this.save(); window.dispatchEvent(new CustomEvent("tulip:permissionchange", { detail: { appId, permission, decision } })); }
        revokeApp(appId) { delete this.decisions[appId]; this.save(); }
        async request(appId, manifest, permission, prompt) {
            const current = this.get(appId, permission);
            if (current !== "prompt") return current === "allow";
            const result = await prompt({ appId, appName: manifest.name, permission });
            const allowed = typeof result === "object" ? result.allowed : result;
            if (typeof result !== "object" || result.remember !== false) this.set(appId, permission, allowed ? "allow" : "deny");
            this.notifications?.show(`${allowed ? "Permission granted" : "Permission denied"}: ${permission}`);
            return Boolean(allowed);
        }
        async requestAll(appId, manifest, prompt) {
            for (const permission of manifest.permissions || []) if (!(await this.request(appId, manifest, permission, prompt))) return false;
            return true;
        }
    }

    class AppRegistry {
        constructor({ apps, packageManager, notifications, windowManager, launcher }) {
            this.apps = apps; this.packageManager = packageManager; this.notifications = notifications; this.windowManager = windowManager; this.launcher = launcher;
            this.loaded = new Map(); this.logs = this.readLogs(); this.permissions = new PermissionManager(notifications);
        }
        readLogs() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; } }
        log(event, appId = "system", detail = "") { this.logs.push({ time: new Date().toISOString(), event, appId, detail }); if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500); try { localStorage.setItem(LOG_KEY, JSON.stringify(this.logs)); } catch { /* Diagnostics are retained in memory. */ } window.dispatchEvent(new CustomEvent("tulip:sdkevent", { detail: { event, appId, detail } })); }
        getLogs(search = "") { const term = String(search).toLowerCase(); return this.logs.filter(item => !term || JSON.stringify(item).toLowerCase().includes(term)); }
        clearLogs() { this.logs = []; localStorage.removeItem(LOG_KEY); }
        async loadInstalled() { const packages = await this.packageManager.getInstalledList(); const executable = packages.filter(pkg => this.isExecutable(pkg)); for (const pkg of executable) { try { this.register(pkg); } catch (error) { this.log("registration-skipped", pkg.id, error.message); } } return executable; }
        isExecutable(manifest) { return Boolean(manifest?.entry && ((typeof manifest.code === "string" && manifest.code.trim()) || (typeof manifest.files?.[manifest.entry] === "string" && manifest.files[manifest.entry].trim()))); }
        register(manifest) { const result = ManifestValidator.validate(manifest); if (!result.valid) throw new Error(result.error); if (this.apps[manifest.id] && !this.apps[manifest.id].package) throw new Error(`The app ID “${manifest.id}” is already reserved.`); this.apps[manifest.id] = { name: manifest.name, icon: manifest.icon || "📦", package: true, manifest }; this.log("registered", manifest.id); return manifest; }
        unregister(id) { if (!this.apps[id]?.package) return false; delete this.apps[id]; this.loaded.delete(id); this.permissions.revokeApp(id); this.log("unregistered", id); return true; }
        getInstalled() { return Object.entries(this.apps).filter(([, app]) => app.package).map(([id, app]) => ({ id, ...app.manifest, name: app.name, icon: app.icon })); }
        search(query = "") { const term = query.toLowerCase(); return this.getInstalled().filter(app => `${app.id} ${app.name} ${app.author || ""}`.toLowerCase().includes(term)); }
        getSDK(id, argument) { const app = this.apps[id]; if (!app?.package) throw new Error("Only installed SDK apps can create an SDK context."); return new SdkAppInstance(this, app.manifest || app, argument).api(); }
        async launch(id, argument) {
            const app = this.apps[id]; if (!app) throw new Error("Application is not installed.");
            this.log("launch", id); if (!app.package) return this.launcher.open(id, argument);
            const manifest = app.manifest || app; const allowed = await this.permissions.requestAll(id, manifest, request => this.permissionDialog(request)); if (!allowed) throw new Error("Application permissions were denied.");
            if (this.loaded.has(id)) { this.loaded.get(id).resume(); return this.loaded.get(id); }
            const instance = new SdkAppInstance(this, manifest, argument); await instance.load(); this.loaded.set(id, instance); return instance;
        }
        async permissionDialog({ appName, permission }) {
            return new Promise(resolve => {
                const overlay = document.createElement("div"); overlay.className = "sdk-permission-overlay";
                overlay.innerHTML = `<div class="sdk-permission-dialog"><p>APPLICATION PERMISSION</p><h3></h3><p>Allow this app to use <strong></strong>?</p><label><input type="checkbox"> Remember this decision</label><div><button data-result="deny">Deny</button><button data-result="allow">Allow</button></div></div>`;
                overlay.querySelector("h3").textContent = appName; overlay.querySelector("strong").textContent = permission;
                overlay.addEventListener("click", event => { const result = event.target.closest("[data-result]")?.dataset.result; if (!result) return; overlay.remove(); resolve({ allowed: result === "allow", remember: overlay.querySelector("input").checked }); }); document.body.append(overlay);
            });
        }
        async reload(id) { const instance = this.loaded.get(id); if (instance) await instance.restart(); else await this.launch(id); this.log("reload", id); }
        async reloadAll() { for (const id of this.loaded.keys()) await this.reload(id); }
        close(id) { const instance = this.loaded.get(id); if (!instance) return; instance.close(); this.loaded.delete(id); this.log("close", id); }
        setDeveloperMode(enabled) { localStorage.setItem(DEV_KEY, String(Boolean(enabled))); this.log(enabled ? "developer-mode-enabled" : "developer-mode-disabled"); }
        isDeveloperMode() { return localStorage.getItem(DEV_KEY) === "true"; }
    }

    class SdkAppInstance {
        constructor(registry, manifest, argument) { this.registry = registry; this.manifest = manifest; this.argument = argument; this.records = []; this.state = "created"; }
        api() {
            const registry = this.registry, manifest = this.manifest, has = permission => registry.permissions.get(manifest.id, permission) === "allow";
            const requirePermission = permission => { if (!has(permission)) throw new Error(`Permission denied: ${permission}`); };
            return Object.freeze({
                app: Object.freeze({ id: manifest.id, name: manifest.name, version: manifest.version, argument: this.argument }),
                filesystem: Object.freeze({ list: async () => { requirePermission("filesystem"); return window.TulipFS.list(); }, read: async path => { requirePermission("filesystem"); return window.TulipFS.get(path); }, create: async (path, type, content) => { requirePermission("filesystem"); return window.TulipFS.create(path, type, content); } }),
                notifications: Object.freeze({ show: message => { requirePermission("notifications"); registry.notifications.show(String(message)); } }),
                windowManager: Object.freeze({ create: options => { const record = registry.windowManager.create({ ...options, appId: `${manifest.id}:${Date.now()}`, singleton: false }); this.records.push(record); return Object.freeze({ close: () => record.close(), minimize: () => record.minimize(), restore: () => record.restore(), focus: () => record.focus() }); } }),
                dialogs: Object.freeze({ alert: message => window.alert(String(message)), confirm: message => Promise.resolve(window.confirm(String(message))) }),
                settings: Object.freeze({ get: key => { requirePermission("settings"); return localStorage.getItem(`tulip.${key}`); }, set: (key, value) => { requirePermission("settings"); localStorage.setItem(`tulip.${key}`, String(value)); } }),
                storage: Object.freeze({ get: key => { requirePermission("storage"); return localStorage.getItem(`tulip.${manifest.id}.${key}`); }, set: (key, value) => { requirePermission("storage"); localStorage.setItem(`tulip.${manifest.id}.${key}`, String(value)); }, remove: key => { requirePermission("storage"); localStorage.removeItem(`tulip.${manifest.id}.${key}`); } }),
                clipboard: Object.freeze({ read: async () => { requirePermission("clipboard"); return navigator.clipboard?.readText() || ""; }, write: async value => { requirePermission("clipboard"); return navigator.clipboard?.writeText(String(value)); } }),
                theme: Object.freeze({ get: () => document.body.classList.contains("tulip-light") ? "light" : "dark" }),
                wallpaper: Object.freeze({ get: () => { requirePermission("wallpaper"); return localStorage.getItem("tulip.wallpaper") || ""; } }),
                terminal: Object.freeze({ open: () => { requirePermission("terminal"); return registry.launcher.open("terminal"); } })
            });
        }
        async load() { this.state = "loading"; this.registry.log("load", this.manifest.id); const code = this.manifest.code || this.manifest.files?.[this.manifest.entry] || ""; if (!code) throw new Error("Entry file is missing from the package."); const run = new Function("TulipSDK", "argument", `${code}\n//# sourceURL=${this.manifest.id}/${this.manifest.entry}`); run(this.api(), this.argument); this.state = "running"; this.registry.log("loaded", this.manifest.id); return this; }
        suspend() { this.state = "suspended"; this.registry.log("suspend", this.manifest.id); }
        resume() { this.state = "running"; this.registry.log("resume", this.manifest.id); }
        close() { this.records.forEach(record => record.close()); this.records = []; this.state = "closed"; }
        async restart() { this.close(); this.state = "restarting"; await this.load(); }
    }

    class TappInstaller {
        constructor(packageManager, notifications) { this.packageManager = packageManager; this.notifications = notifications; }
        open(content) {
            const overlay = document.createElement("div"); overlay.className = "sdk-permission-overlay";
            overlay.innerHTML = '<div class="sdk-permission-dialog"><p> TULIP PACKAGE INSTALLER</p><h3>Application package</h3><pre></pre><div><button data-result="cancel">Cancel</button><button data-result="install">Install</button></div></div>';
            const pre = overlay.querySelector("pre"); let payload;
            try { payload = JSON.parse(atob(String(content).split(",")[1] || "")); const manifest = typeof payload.manifest === "string" ? JSON.parse(payload.manifest) : payload.manifest; pre.textContent = `${manifest.name}\nVersion ${manifest.version}\nBy ${manifest.author || "Unknown author"}\nPermissions: ${(manifest.permissions || []).join(", ") || "None"}`; } catch { pre.textContent = "Invalid or corrupted .tapp package."; overlay.querySelector('[data-result="install"]').disabled = true; }
            overlay.addEventListener("click", async event => { const result = event.target.closest("[data-result]")?.dataset.result; if (!result) return; if (result === "cancel") { overlay.remove(); return; } try { await this.packageManager.installTapp(content, { confirmPermissions: manifest => window.__tulipAppRegistry?.permissions.requestAll(manifest.id, manifest, request => window.__tulipAppRegistry.permissionDialog(request)) }); this.notifications.show("Application installed"); } catch (error) { this.notifications.show(error.message, "error"); } overlay.remove(); });
            document.body.append(overlay);
        }
    }

    window.TulipAppManifest = ManifestValidator;
    window.TulipAppRegistry = AppRegistry;
    window.TulipTappInstaller = TappInstaller;
    window.TulipSDK = Object.freeze({ version: "1.0.0", permissions: [...PERMISSIONS], forApp: () => { throw new Error("Tulip SDK is not ready."); } });
})();
