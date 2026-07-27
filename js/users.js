window.UserManager = class UserManager {
    constructor(notifications) { this.notifications = notifications; this.key = "tulip.users"; this.sessionKey = "tulip.activeUser"; this.users = this.load(); try { this.active = localStorage.getItem(this.sessionKey) || "admin"; } catch { this.active = "admin"; } }
    load() {
        try { const stored = JSON.parse(localStorage.getItem(this.key) || "[]"); if (Array.isArray(stored) && stored.length) return stored; } catch { /* start safely */ }
        const users = [{ username: "admin", displayName: "Administrator", role: "admin", password: "", avatar: "🌷", created: Date.now() }]; localStorage.setItem(this.key, JSON.stringify(users)); return users;
    }
    save() { localStorage.setItem(this.key, JSON.stringify(this.users)); }
    getActive() { return this.users.find(user => user.username === this.active) || this.users[0]; }
    list() { return [...this.users]; }
    sanitize(name) { return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24); }
    async create({ username, displayName, password = "", role = "user", avatar = "🙂" }) {
        username = this.sanitize(username || displayName); if (!username) throw new Error("Choose a username using letters or numbers."); if (this.users.some(user => user.username === username)) throw new Error("That username already exists.");
        const user = { username, displayName: String(displayName || username).trim(), password, role: role === "admin" ? "admin" : "user", avatar, created: Date.now() }; this.users.push(user); this.save(); await window.TulipFS.ensureUserHome(username); await this.seedHome(username); this.notifications?.show(`User ${user.displayName} was created.`); return user;
    }
    async seedHome(username) { const previous = window.TulipFS.activeUser; window.TulipFS.setActiveUser(username); for (const path of ["/Desktop", "/Documents", "/Downloads", "/Pictures", "/Pictures/Camera", "/AppData", "/Recycle Bin"]) if (!(await window.TulipFS.get(path))) await window.TulipFS.create(path, "folder"); window.TulipFS.setActiveUser(previous); }
    async switch(username, password = "") { const user = this.users.find(candidate => candidate.username === username); if (!user) throw new Error("Unknown user."); if (user.password && user.password !== password) throw new Error("Incorrect password."); this.active = username; localStorage.setItem(this.sessionKey, username); window.TulipFS.setActiveUser(username); await window.TulipFS.ensureUserHome(username); await this.seedHome(username); this.notifications?.show(`Switched to ${user.displayName}.`); window.dispatchEvent(new CustomEvent("tulip:userchange", { detail: { user } })); return user; }
    async guest() { let guest = this.users.find(user => user.username === "guest"); if (!guest) guest = await this.create({ username: "guest", displayName: "Guest", role: "guest", avatar: "👤" }); return this.switch(guest.username); }
    delete(username) { const user = this.users.find(candidate => candidate.username === username); if (!user || user.username === "admin") throw new Error("The administrator account cannot be deleted."); this.users = this.users.filter(candidate => candidate.username !== username); this.save(); if (this.active === username) return this.switch("admin"); this.notifications?.show(`User ${user.displayName} was deleted.`); }
    rename(username, displayName) { const user = this.users.find(candidate => candidate.username === username); if (!user) throw new Error("Unknown user."); user.displayName = String(displayName || "").trim() || user.displayName; this.save(); return user; }
    updateActive(values) { Object.assign(this.getActive(), values); this.save(); window.dispatchEvent(new CustomEvent("tulip:userchange", { detail: { user: this.getActive() } })); }
    lock() { document.getElementById("lockScreen")?.removeAttribute("hidden"); }
    logout() { return this.switch("admin"); }
};
