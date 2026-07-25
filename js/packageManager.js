window.PackageManager = class PackageManager {
    constructor({ apps, desktop, taskbar, notifications }) {
        this.apps = apps;
        this.desktop = desktop;
        this.taskbar = taskbar;
        this.notifications = notifications;
        this.db = null;
        this.ready = this.openDatabase();
    }

    async openDatabase() {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open("TulipPackages", 1);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("packages")) db.createObjectStore("packages", { keyPath: "id" });
            };
            request.onsuccess = event => { this.db = event.target.result; resolve(); };
            request.onerror = () => reject(new Error("Unable to open package registry"));
        });
    }

    async getInstalledList() {
        await this.ready;
        return new Promise((resolve, reject) => {
            const request = this.db.transaction("packages").objectStore("packages").getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Unable to read installed packages"));
        });
    }

    async getPackage(id) {
        return (await this.getInstalledList()).find(pkg => pkg.id === id) || null;
    }

    validateManifest(manifest) {
        if (window.TulipAppManifest) return window.TulipAppManifest.validate(manifest);
        if (!manifest || typeof manifest !== "object") return { valid: false, error: "Manifest is missing." };
        const required = ["id", "name", "version", "entry"];
        if (required.some(key => !String(manifest[key] || "").trim())) return { valid: false, error: "Manifest is missing required fields." };
        if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) return { valid: false, error: "Version must use major.minor.patch." };
        if (!Array.isArray(manifest.permissions || [])) return { valid: false, error: "Permissions must be an array." };
        return { valid: true };
    }

    async install(manifest, { confirmPermissions } = {}) {
        const validation = this.validateManifest(manifest);
        if (!validation.valid) throw new Error(validation.error);
        const installed = await this.getPackage(manifest.id);
        if (installed) return this.update(manifest);
        if (confirmPermissions && !(await confirmPermissions(manifest))) return false;
        await this.savePackage({ ...manifest, installedVersion: manifest.version, installedAt: Date.now(), pinned: false });
        this.appRegistry?.register(manifest);
        this.registerShortcut(manifest);
        this.notifications.show(`${manifest.name} installed`);
        return true;
    }

    async installTapp(input, { confirmPermissions } = {}) {
        let payload = input;
        if (typeof input === "string") {
            try { payload = JSON.parse(input.startsWith("data:") ? atob(input.split(",")[1]) : input); } catch { throw new Error("This .tapp package is corrupted or is not a readable Tulip package."); }
        }
        if (!payload?.manifest && payload?.["app.json"]) payload = { manifest: payload["app.json"], files: payload };
        const manifest = typeof payload?.manifest === "string" ? JSON.parse(payload.manifest) : payload?.manifest;
        const result = this.validateManifest(manifest);
        if (!result.valid) throw new Error(result.error);
        const files = payload.files || {};
        const entry = files[manifest.entry] || manifest.code;
        if (!entry) throw new Error("The package is missing its entry file.");
        return this.install({ ...manifest, files, code: entry }, { confirmPermissions });
    }

    async installFromManifest(manifestUrl, options = {}) {
        const response = await fetch(manifestUrl);
        if (!response.ok) throw new Error("Manifest could not be loaded.");
        return this.install(await response.json(), options);
    }

    async uninstall(id) {
        const pkg = await this.getPackage(id);
        if (!pkg) return false;
        await this.removePackage(id);
        delete this.apps[id];
        this.appRegistry?.unregister(id);
        this.desktop.render();
        this.taskbar.refreshApps();
        this.notifications.show(`${pkg.name} uninstalled`);
        return true;
    }

    async update(manifest) {
        const installed = await this.getPackage(manifest.id);
        if (!installed) return this.install(manifest);
        if (this.compareVersions(manifest.version, installed.installedVersion) <= 0) return false;
        await this.savePackage({ ...installed, ...manifest, installedVersion: manifest.version, updatedAt: Date.now() });
        this.appRegistry?.register(manifest);
        this.registerShortcut(manifest);
        this.notifications.show(`${manifest.name} updated to ${manifest.version}`);
        return true;
    }

    async checkUpdates(catalog) {
        const installed = await this.getInstalledList();
        return catalog.filter(app => {
            const pkg = installed.find(item => item.id === app.id);
            return pkg && this.compareVersions(app.version, pkg.installedVersion) > 0;
        });
    }

    async updateAll(catalog) {
        const updates = await this.checkUpdates(catalog);
        for (const manifest of updates) await this.update(manifest);
        return updates.length;
    }

    compareVersions(left, right) {
        const a = String(left).split(".").map(Number);
        const b = String(right).split(".").map(Number);
        for (let i = 0; i < 3; i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
        return 0;
    }

    async hydrate() {
        for (const pkg of await this.getInstalledList()) this.registerShortcut(pkg);
    }

    async ensureInstalled(manifests) {
        const installed = new Set((await this.getInstalledList()).map(pkg => pkg.id));
        for (const manifest of manifests) {
            if (installed.has(manifest.id)) continue;
            await this.savePackage({ ...manifest, installedVersion: manifest.version, installedAt: Date.now(), builtIn: true, pinned: false });
            this.registerShortcut(manifest);
        }
    }

    registerShortcut(manifest) {
        this.apps[manifest.id] = { name: manifest.name, icon: manifest.icon || "📦", package: true };
        this.desktop.render();
        this.taskbar.refreshApps();
    }

    savePackage(pkg) {
        return this.write("put", pkg);
    }

    removePackage(id) {
        return this.write("delete", id);
    }

    write(action, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("packages", "readwrite");
            tx.objectStore("packages")[action](value);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error("Unable to update package registry"));
        });
    }
};
