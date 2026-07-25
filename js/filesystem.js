class TulipFS {
    constructor() { this.db = null; this.activeUser = "admin"; }

    async init() {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open("TulipOS", 2);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "path" });
            };
            request.onsuccess = event => { this.db = event.target.result; resolve(); };
            request.onerror = () => reject(new Error("Failed to initialize TulipFS"));
        });
    }

    setActiveUser(username) { this.activeUser = username || "admin"; }
    home(username = this.activeUser) { return `/home/${username}`; }
    normalize(path = "/") {
        const parts = [];
        String(path).replace(/\\/g, "/").split("/").forEach(part => { if (!part || part === ".") return; if (part === "..") parts.pop(); else parts.push(part); });
        return `/${parts.join("/")}`;
    }
    storagePath(path, username = this.activeUser) {
        const normalized = this.normalize(path);
        return normalized === "/" ? this.home(username) : `${this.home(username)}${normalized}`;
    }
    visiblePath(path, username = this.activeUser) {
        const home = this.home(username);
        return path === home ? "/" : path.startsWith(`${home}/`) ? path.slice(home.length) : null;
    }
    async rawList() { return this.request("readonly", store => store.getAll()); }
    request(mode, action) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files", mode); const request = action(tx.objectStore("files"));
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("TulipFS operation failed"));
            tx.onerror = () => reject(new Error("TulipFS operation failed"));
        });
    }
    async ensureUserHome(username = this.activeUser) {
        const path = this.home(username);
        if (!(await this.request("readonly", store => store.get(path)))) await this.request("readwrite", store => store.put({ path, type: "folder", content: "", created: Date.now(), modified: Date.now() }));
    }
    async create(path, type = "file", content = "", position = { x: 120, y: 180 }) {
        await this.ensureUserHome(); const actual = this.storagePath(path);
        return this.request("readwrite", store => store.put({ path: actual, type, content, created: Date.now(), modified: Date.now(), position, originalPath: path }));
    }
    async get(path) {
        const actual = this.storagePath(path); const item = await this.request("readonly", store => store.get(actual));
        return item ? { ...item, path: this.visiblePath(item.path), originalPath: this.visiblePath(item.path) } : null;
    }
    async list() {
        await this.ensureUserHome(); const home = this.home(); const items = await this.rawList();
        return items.filter(item => item.path === home || item.path.startsWith(`${home}/`)).map(item => ({ ...item, path: this.visiblePath(item.path), originalPath: this.visiblePath(item.path) }));
    }
    async rename(oldPath, newPath) {
        const from = this.normalize(oldPath), to = this.normalize(newPath);
        if (from === "/" || !newPath || from === to) return false;
        const entries = await this.list(); const affected = entries.filter(item => item.path === from || item.path.startsWith(`${from}/`));
        if (!affected.length || entries.some(item => item.path === to || item.path.startsWith(`${to}/`))) return false;
        await this.ensureUserHome();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files", "readwrite"), store = tx.objectStore("files");
            affected.forEach(item => { const oldActual = this.storagePath(item.path), visible = `${to}${item.path.slice(from.length)}`; store.delete(oldActual); store.put({ ...item, path: this.storagePath(visible), originalPath: visible, modified: Date.now() }); });
            tx.oncomplete = () => resolve(true); tx.onerror = () => reject(new Error("Failed to rename file entry"));
        });
    }
    async move(oldPath, newPath) { return this.rename(oldPath, newPath); }
    async copy(oldPath, newPath) {
        const from = this.normalize(oldPath), to = this.normalize(newPath), entries = await this.list();
        const affected = entries.filter(item => item.path === from || item.path.startsWith(`${from}/`));
        if (!affected.length || entries.some(item => item.path === to || item.path.startsWith(`${to}/`))) return false;
        for (const item of affected) await this.create(`${to}${item.path.slice(from.length)}`, item.type, item.content, item.position);
        return true;
    }
    async delete(path, recursive = false) {
        const visible = this.normalize(path); if (visible === "/") return false;
        const entries = await this.list(), affected = entries.filter(item => item.path === visible || item.path.startsWith(`${visible}/`));
        if (!affected.length || (!recursive && affected.length > 1)) return false;
        return new Promise((resolve, reject) => { const tx = this.db.transaction("files", "readwrite"), store = tx.objectStore("files"); affected.forEach(item => store.delete(this.storagePath(item.path))); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(new Error("Failed to delete file entry")); });
    }
}
window.TulipFS = new TulipFS();
