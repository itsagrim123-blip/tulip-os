(() => {
    "use strict";
    const PACKAGE_DB = "TulipPackages";
    const PACKAGE_STORE = "packages";
    const sameOriginUrl = value => {
        try {
            const url = new URL(value, document.baseURI);
            return url.origin === location.origin || (url.protocol === "file:" && location.protocol === "file:") ? url : null;
        } catch { return null; }
    };

    window.PackageManager = class PackageManager {
        constructor({ apps, desktop, taskbar, notifications }) {
            this.apps = apps; this.desktop = desktop; this.taskbar = taskbar; this.notifications = notifications;
            this.db = null; this.memoryPackages = new Map(); this.invalidPackages = new Map(); this.ready = this.openDatabase();
        }
        async openDatabase() {
            if (!window.indexedDB) return;
            await new Promise(resolve => {
                const request = indexedDB.open(PACKAGE_DB, 1);
                request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains(PACKAGE_STORE)) db.createObjectStore(PACKAGE_STORE, { keyPath: "id" }); };
                request.onsuccess = event => { this.db = event.target.result; this.db.onversionchange = () => this.db?.close(); resolve(); };
                request.onerror = request.onblocked = () => resolve();
            });
        }
        async getInstalledList() {
            await this.ready;
            if (!this.db) return [...this.memoryPackages.values()];
            return new Promise((resolve, reject) => { const request = this.db.transaction(PACKAGE_STORE).objectStore(PACKAGE_STORE).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(new Error("Unable to read installed packages.")); });
        }
        async getPackage(id) { return (await this.getInstalledList()).find(pkg => pkg.id === id) || null; }
        validateManifest(manifest) {
            if (window.TulipAppManifest) return window.TulipAppManifest.validate(manifest);
            if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { valid: false, error: "Manifest is missing." };
            const required = ["id", "name", "version", "entry"];
            if (required.some(key => typeof manifest[key] !== "string" || !manifest[key].trim())) return { valid: false, error: "Manifest is missing required fields." };
            if (!/^[a-z][a-z0-9._-]{1,63}$/i.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) return { valid: false, error: "Manifest contains an invalid id or version." };
            return { valid: true, manifest: { ...manifest } };
        }
        async materialize(manifest) {
            const validation = this.validateManifest(manifest);
            if (!validation.valid) throw new Error(validation.error);
            const normalized = { ...(validation.manifest || manifest), files: { ...(manifest.files || {}) } };
            const existing = typeof normalized.code === "string" && normalized.code.trim() ? normalized.code : normalized.files[normalized.entry];
            if (typeof existing === "string" && existing.trim()) return { ...normalized, code: existing };
            if (!normalized.entryUrl) throw new Error(`Package entry file is missing: ${normalized.entry}`);
            const url = sameOriginUrl(normalized.entryUrl);
            if (!url) throw new Error("Package entry files must be hosted by this Tulip OS deployment.");
            let response;
            try { response = await fetch(url, { headers: { Accept: "text/javascript, application/javascript" } }); } catch { throw new Error("Package entry file could not be downloaded."); }
            if (!response.ok) throw new Error(`Package entry file is unavailable (${response.status}).`);
            const code = await response.text();
            if (!code.trim()) throw new Error("Package entry file is empty.");
            normalized.files[normalized.entry] = code;
            return { ...normalized, code, entryUrl: url.href };
        }
        hasEntry(manifest) { const entry = manifest?.entry; return Boolean(typeof entry === "string" && entry.trim() && ((typeof manifest.code === "string" && manifest.code.trim()) || (typeof manifest.files?.[entry] === "string" && manifest.files[entry].trim()))); }
        async validateInstalled() {
            const valid = []; const invalid = [];
            for (const pkg of await this.getInstalledList()) {
                const validation = this.validateManifest(pkg);
                if (validation.valid && this.hasEntry(pkg)) { valid.push(pkg); this.invalidPackages.delete(pkg.id); }
                else { const error = validation.error || `Package entry file is missing: ${pkg.entry || "unknown"}`; invalid.push({ pkg, error }); this.invalidPackages.set(pkg.id, error); if (this.apps[pkg.id]?.package) delete this.apps[pkg.id]; }
            }
            return { valid, invalid };
        }
        async install(manifest, { confirmPermissions } = {}) {
            const prepared = await this.materialize(manifest);
            const installed = await this.getPackage(prepared.id);
            if (installed) return this.update(prepared, { confirmPermissions });
            if (confirmPermissions && !(await confirmPermissions(prepared))) return false;
            await this.savePackage({ ...prepared, installedVersion: prepared.version, installedAt: Date.now(), pinned: false });
            this.invalidPackages.delete(prepared.id); this.appRegistry?.register(prepared); this.registerShortcut(prepared); this.notifications?.show(`${prepared.name} installed`);
            return true;
        }
        async installTapp(input, { confirmPermissions } = {}) {
            let payload = input;
            if (typeof input === "string") { try { payload = JSON.parse(input.startsWith("data:") ? atob(input.split(",")[1] || "") : input); } catch { throw new Error("This .tapp package is corrupted or unreadable."); } }
            if (!payload?.manifest && payload?.["app.json"]) payload = { manifest: payload["app.json"], files: payload };
            const manifest = typeof payload?.manifest === "string" ? safeParse(payload.manifest) : payload?.manifest;
            if (!manifest) throw new Error("This .tapp package has no valid manifest.");
            return this.install({ ...manifest, files: payload.files || manifest.files || {}, code: manifest.code }, { confirmPermissions });
        }
        async installFromManifest(manifestUrl, options = {}) {
            const url = sameOriginUrl(manifestUrl); if (!url) throw new Error("Manifest must be hosted by this Tulip OS deployment.");
            const response = await fetch(url, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error("Manifest could not be loaded.");
            const manifest = await response.json(); if (manifest.entryUrl) manifest.entryUrl = new URL(manifest.entryUrl, url).href;
            return this.install(manifest, options);
        }
        async uninstall(id) {
            const pkg = await this.getPackage(id); if (!pkg) return false;
            await this.removePackage(id); this.invalidPackages.delete(id); this.appRegistry?.unregister(id); if (this.apps[id]?.package) delete this.apps[id]; this.desktop.render(); this.taskbar.refreshApps(); this.notifications?.show(`${pkg.name} uninstalled`); return true;
        }
        async update(manifest, { confirmPermissions } = {}) {
            const prepared = this.hasEntry(manifest) ? manifest : await this.materialize(manifest);
            const installed = await this.getPackage(prepared.id); if (!installed) return this.install(prepared, { confirmPermissions });
            if (!this.hasEntry(installed)) {
                await this.savePackage({ ...installed, ...prepared, installedVersion: prepared.version, repairedAt: Date.now() });
                this.invalidPackages.delete(prepared.id); this.appRegistry?.register(prepared); this.registerShortcut(prepared); this.notifications?.show(`${prepared.name} repaired`); return true;
            }
            if (this.compareVersions(prepared.version, installed.installedVersion || installed.version) <= 0) return false;
            if (confirmPermissions && !(await confirmPermissions(prepared))) return false;
            await this.savePackage({ ...installed, ...prepared, installedVersion: prepared.version, updatedAt: Date.now() }); this.invalidPackages.delete(prepared.id); this.appRegistry?.register(prepared); this.registerShortcut(prepared); this.notifications?.show(`${prepared.name} updated to ${prepared.version}`); return true;
        }
        compareVersions(left, right) { const a = String(left || "0.0.0").split(".").map(Number), b = String(right || "0.0.0").split(".").map(Number); for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0); return 0; }
        async checkUpdates(catalog) { const installed = await this.getInstalledList(); return catalog.filter(app => this.isCatalogInstallable(app) && installed.some(pkg => pkg.id === app.id && this.compareVersions(app.version, pkg.installedVersion) > 0)); }
        async updateAll(catalog) { const updates = await this.checkUpdates(catalog); for (const manifest of updates) await this.update(manifest); return updates.length; }
        isCatalogInstallable(manifest) { return Boolean(this.validateManifest(manifest).valid && (this.hasEntry(manifest) || typeof manifest?.entryUrl === "string")); }
        async hydrate() { const { valid, invalid } = await this.validateInstalled(); for (const pkg of valid) this.registerShortcut(pkg); if (invalid.length) this.notifications?.show(`${invalid.length} invalid package${invalid.length === 1 ? " was" : "s were"} skipped.`, "error"); return valid; }
        async ensureInstalled(manifests) { for (const manifest of manifests) { if (!manifest.installed || !this.isCatalogInstallable(manifest) || await this.getPackage(manifest.id)) continue; try { const prepared = await this.materialize(manifest); await this.savePackage({ ...prepared, installedVersion: prepared.version, installedAt: Date.now(), builtIn: true, pinned: false }); this.registerShortcut(prepared); } catch { /* Catalog validation surfaces unavailable apps without creating broken shortcuts. */ } } }
        registerShortcut(manifest) { if (!this.hasEntry(manifest)) return false; this.apps[manifest.id] = { name: manifest.name, icon: manifest.icon || "📦", package: true, manifest }; this.desktop.render(); this.taskbar.refreshApps(); return true; }
        savePackage(pkg) { return this.write("put", pkg); }
        removePackage(id) { return this.write("delete", id); }
        write(action, value) { if (!this.db) { if (action === "put") this.memoryPackages.set(value.id, { ...value }); else this.memoryPackages.delete(value); return Promise.resolve(); } return new Promise((resolve, reject) => { const tx = this.db.transaction(PACKAGE_STORE, "readwrite"); tx.objectStore(PACKAGE_STORE)[action](value); tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error("Unable to update package registry.")); }); }
    };
    function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }
})();
