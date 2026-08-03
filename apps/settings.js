window.SettingsApp = class SettingsApp {
    constructor(windowManager, wallpaper, desktop, services) {
        this.windowManager = windowManager;
        this.wallpaper = wallpaper;
        this.desktop = desktop;
        this.apps = services.apps;
        this.notifications = services.notifications;
        this.packageManager = services.packageManager;
        this.users = services.users;
        this.appRegistry = services.appRegistry;
        this.preferenceKey = "tulip.settings";
        this.preferences = this.loadPreferences();
        this.applyPreferences();
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (this.preferences.theme === "auto") this.applyTheme();
        });
    }

    loadPreferences() {
        try {
            return {
                theme: "auto", accent: "#8b78ff", iconSize: "medium", taskbarPosition: "bottom", animations: true,
                ...JSON.parse(localStorage.getItem(this.preferenceKey) || "{}")
            };
        } catch {
            return { theme: "auto", accent: "#8b78ff", iconSize: "medium", taskbarPosition: "bottom", animations: true };
        }
    }

    savePreferences() {
        localStorage.setItem(this.preferenceKey, JSON.stringify(this.preferences));
    }

    applyPreferences() {
        this.applyTheme();
        document.documentElement.style.setProperty("--tulip-accent", this.preferences.accent);
        document.body.dataset.iconSize = this.preferences.iconSize;
        document.body.classList.toggle("taskbar-top", this.preferences.taskbarPosition === "top");
        document.body.classList.toggle("animations-disabled", !this.preferences.animations);
    }

    applyTheme() {
        const isDark = this.preferences.theme === "dark" || (this.preferences.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.body.classList.toggle("tulip-light", !isDark);
        document.body.classList.toggle("tulip-dark", isDark);
    }

    open() {
        const record = this.windowManager.create({
            appId: "settings",
            title: "⚙ Tulip Settings",
            className: "settings-window",
            content: this.createView(),
            onMount: current => this.bind(current),
            onClose: current => window.removeEventListener("tulip:wallpaperchange", current.wallpaperListener)
        });
        this.record = record;
        this.refreshSystemInfo();
    }

    createView() {
        const root = document.createElement("div");
        root.className = "settings-app";
        root.innerHTML = `
            <aside class="settings-sidebar"><div class="settings-brand"><span>🌷</span><div><strong>Tulip Settings</strong><small>Personalize your workspace</small></div></div><nav><button type="button" class="active" data-section="appearance">Appearance</button><button type="button" data-section="wallpaper">Wallpaper</button><button type="button" data-section="personalization">Personalization</button><button type="button" data-section="system">System</button><button type="button" data-section="notifications">Notifications</button><button type="button" data-section="about">About</button></nav></aside>
            <main class="settings-main"><section class="settings-section active" data-panel="appearance"><p class="settings-eyebrow">LOOK AND FEEL</p><h2>Appearance</h2><p class="settings-intro">Choose how Tulip OS looks across your desktop.</p><div class="settings-card"><h3>Theme</h3><div class="choice-grid" data-role="themes"><button type="button" data-theme="light">☀ Light</button><button type="button" data-theme="dark">◐ Dark</button><button type="button" data-theme="auto">◑ Auto</button></div></div><div class="settings-card settings-row"><div><h3>Accent color</h3><p>Used for controls and highlights.</p></div><label class="accent-picker"><input type="color" data-role="accent" aria-label="Accent color"><span data-role="accent-value"></span></label></div></section>
            <section class="settings-section" data-panel="wallpaper"><p class="settings-eyebrow">DESKTOP</p><h2>Wallpaper</h2><p class="settings-intro">Open the dedicated Wallpaper Manager to upload, organize, and apply wallpapers.</p><div class="settings-card"><h3>Wallpaper workspace</h3><p>Use the dedicated manager for all wallpaper actions, including uploads, renaming, removal, and quick selection.</p><button type="button" class="settings-primary" data-action="open-wallpaper-manager">Open Wallpaper Manager</button></div></section>
            <section class="settings-section" data-panel="personalization"><p class="settings-eyebrow">WORKSPACE</p><h2>Personalization</h2><div class="settings-card"><h3>Desktop icon size</h3><div class="choice-grid compact" data-role="icon-size"><button type="button" data-icon-size="small">Small</button><button type="button" data-icon-size="medium">Medium</button><button type="button" data-icon-size="large">Large</button></div></div><div class="settings-card"><h3>Taskbar position</h3><div class="choice-grid compact" data-role="taskbar-position"><button type="button" data-taskbar-position="bottom">Bottom</button><button type="button" data-taskbar-position="top">Top</button></div></div><label class="settings-card toggle-row"><span><h3>Window animations</h3><p>Use smooth transitions throughout Tulip OS.</p></span><input type="checkbox" data-role="animations"><i></i></label></section>
            <section class="settings-section" data-panel="system"><p class="settings-eyebrow">DEVICE</p><h2>System</h2><p class="settings-intro">A quick overview of this Tulip OS session.</p><dl class="system-list" data-role="system-info"><div><dt>Tulip OS version</dt><dd>9.0.0</dd></div><div><dt>Storage usage</dt><dd>Calculating…</dd></div><div><dt>Installed applications</dt><dd>Calculating…</dd></div><div><dt>Memory information</dt><dd>Calculating…</dd></div><div><dt>Browser</dt><dd>Calculating…</dd></div></dl></section>
            <section class="settings-section" data-panel="notifications"><p class="settings-eyebrow">ALERTS</p><h2>Notifications</h2><div class="settings-card toggle-row"><span><h3>Enable notifications</h3><p>Show Tulip OS messages in this browser.</p></span><input type="checkbox" data-role="notifications"><i></i></label><div class="settings-card"><h3>Test notification</h3><p>Confirm that desktop messages are working.</p><button type="button" class="settings-primary" data-action="test-notification">Send test notification</button></div></section>
            <section class="settings-section" data-panel="about"><p class="settings-eyebrow">TULIP OS</p><div class="about-hero"><span>🌷</span><div><h2>Tulip OS</h2><p>Version 9.0.0</p></div></div><div class="settings-card about-details"><div><span>Developer</span><strong>Agrim</strong></div><div><span>License</span><strong>MIT License</strong></div></div><a class="settings-primary github-link" href="https://github.com/itsagrim123-blip/tulip-os" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a></section>
            </main>`;
        const nav = root.querySelector(".settings-sidebar nav");
        const accountButton = document.createElement("button"); accountButton.type = "button"; accountButton.dataset.section = "accounts"; accountButton.textContent = "Accounts"; nav.insertBefore(accountButton, nav.lastElementChild);
        const developerButton = document.createElement("button"); developerButton.type = "button"; developerButton.dataset.section = "developer"; developerButton.textContent = "Developer Mode"; nav.append(developerButton);
        const panel = document.createElement("section"); panel.className = "settings-section"; panel.dataset.panel = "accounts";
        panel.innerHTML = '<p class="settings-eyebrow">USERS</p><h2>Accounts</h2><p class="settings-intro">Manage the active Tulip OS account and its isolated home folder.</p><div class="settings-card" data-role="account-list"></div><div class="settings-card"><h3>Create account</h3><p><input data-role="new-user" placeholder="Username"> <input data-role="new-name" placeholder="Display name"> <input data-role="new-password" type="password" placeholder="Password (optional)"></p><button type="button" class="settings-primary" data-action="create-user">Create user</button><button type="button" class="settings-primary" data-action="guest-user">Guest login</button></div><div class="settings-card"><h3>Active account</h3><p data-role="active-user"></p><button type="button" class="settings-primary" data-action="lock-user">Lock session</button><button type="button" class="settings-primary" data-action="logout-user">Log out</button></div>';
        root.querySelector(".settings-main").append(panel);
        const developer = document.createElement("section"); developer.className = "settings-section"; developer.dataset.panel = "developer";
        developer.innerHTML = '<p class="settings-eyebrow">APP SDK</p><h2>Developer Mode</h2><p class="settings-intro">Inspect and reload SDK applications without restarting Tulip OS.</p><label class="settings-card toggle-row"><span><h3>Enable Developer Mode</h3><p>Show application diagnostics and hot reload tools.</p></span><input type="checkbox" data-role="developer-mode"><i></i></label><div class="settings-card developer-actions"><button type="button" class="settings-primary" data-action="reload-apps">Reload applications</button><button type="button" class="settings-primary" data-action="reload-sdk">Reload SDK</button><button type="button" class="settings-primary" data-action="clear-sdk-cache">Clear cache</button><button type="button" class="settings-primary" data-action="open-console">Developer Console</button></div><div class="settings-card"><h3>Installed manifests</h3><div data-role="manifest-list"></div></div>';
        root.querySelector(".settings-main").append(developer);
        return root;
    }

    bind(record) {
        const root = record.content.querySelector(".settings-app");
        root.addEventListener("click", event => this.handleClick(event, root));
        root.addEventListener("input", event => {
            if (event.target.matches("[data-role=accent]")) {
                this.preferences.accent = event.target.value;
                this.savePreferences(); this.applyPreferences();
                root.querySelector("[data-role=accent-value]").textContent = event.target.value.toUpperCase();
            }
        });
        root.addEventListener("change", event => {
            if (event.target.matches("[data-role=animations]")) this.updatePreference("animations", event.target.checked, root);
            if (event.target.matches("[data-role=notifications]")) localStorage.setItem("tulip.notifications", String(event.target.checked));
            if (event.target.matches("[data-role=developer-mode]")) { this.appRegistry?.setDeveloperMode(event.target.checked); this.notifications.show(`Developer Mode ${event.target.checked ? "enabled" : "disabled"}`); }
        });
        record.wallpaperListener = () => {};
        window.addEventListener("tulip:wallpaperchange", record.wallpaperListener);
        this.syncControls(root);
        this.renderAccounts(root);
        this.renderDeveloper(root);
    }

    async handleClick(event, root) {
        const section = event.target.closest("[data-section]");
        if (section) { this.showSection(section.dataset.section, root); return; }
        const theme = event.target.closest("[data-theme]");
        if (theme) return this.updatePreference("theme", theme.dataset.theme, root);
        const iconSize = event.target.closest("[data-icon-size]");
        if (iconSize) return this.updatePreference("iconSize", iconSize.dataset.iconSize, root);
        const taskbar = event.target.closest("[data-taskbar-position]");
        if (taskbar) return this.updatePreference("taskbarPosition", taskbar.dataset.taskbarPosition, root);
        if (event.target.closest("[data-action=open-wallpaper-manager]")) { this.launchWallpaperManager(); return; }
        const wallpaper = event.target.closest("[data-wallpaper]");
        if (wallpaper) { await this.selectWallpaper(wallpaper.dataset.wallpaper, root); return; }
        if (event.target.closest("[data-action=test-notification]")) {
            if (localStorage.getItem("tulip.notifications") === "false") return;
            await this.notifications.requestPermission();
            this.notifications.show("Tulip OS notifications are working.");
        }
        if (event.target.closest("[data-action=create-user]")) {
            try { await this.users.create({ username: root.querySelector("[data-role=new-user]").value, displayName: root.querySelector("[data-role=new-name]").value, password: root.querySelector("[data-role=new-password]").value }); this.renderAccounts(root); } catch (error) { this.notifications.show(error.message, "error"); }
        }
        if (event.target.closest("[data-action=guest-user]")) { await this.users.guest(); this.renderAccounts(root); }
        if (event.target.closest("[data-action=lock-user]")) this.users.lock();
        if (event.target.closest("[data-action=logout-user]")) { await this.users.logout(); this.renderAccounts(root); }
        if (event.target.closest("[data-action=reload-apps]")) { await this.appRegistry?.reloadAll(); this.notifications.show("Applications reloaded"); }
        if (event.target.closest("[data-action=reload-sdk]")) { this.appRegistry?.log("sdk-reloaded"); this.notifications.show("SDK reloaded"); }
        if (event.target.closest("[data-action=clear-sdk-cache]")) { this.appRegistry?.clearLogs(); this.notifications.show("SDK cache cleared"); this.renderDeveloper(root); }
        if (event.target.closest("[data-action=open-console]")) this.openDeveloperConsole();
        const resetPermissions = event.target.closest("[data-reset-permissions]");
        if (resetPermissions) { this.appRegistry?.permissions.revokeApp(resetPermissions.dataset.resetPermissions); this.notifications.show("App permissions reset"); this.renderDeveloper(root); }
        const switchUser = event.target.closest("[data-user-switch]");
        if (switchUser) { try { const target = this.users.list().find(user => user.username === switchUser.dataset.userSwitch); const password = target?.password ? prompt(`Password for ${target.displayName}:`) : ""; await this.users.switch(switchUser.dataset.userSwitch, password || ""); this.renderAccounts(root); } catch (error) { this.notifications.show(error.message, "error"); } }
    }

    updatePreference(key, value, root) {
        this.preferences[key] = value;
        this.savePreferences(); this.applyPreferences(); this.syncControls(root);
    }

    renderDeveloper(root) {
        const toggle = root.querySelector("[data-role=developer-mode]"); if (toggle) toggle.checked = Boolean(this.appRegistry?.isDeveloperMode());
        const list = root.querySelector("[data-role=manifest-list]"); if (!list) return;
        list.replaceChildren(...(this.appRegistry?.getInstalled() || []).map(app => { const item = document.createElement("p"); const states = (app.permissions || []).map(permission => `${permission}: ${this.appRegistry.permissions.get(app.id, permission)}`).join(", ") || "no permissions"; item.innerHTML = `<strong>${app.id}</strong> · ${app.version} · ${states} <button type="button" class="settings-primary" data-reset-permissions="${app.id}">Reset</button>`; return item; }));
    }

    openDeveloperConsole() {
        const registry = this.appRegistry; if (!registry) return;
        const content = document.createElement("div"); content.className = "developer-console";
        content.innerHTML = '<div class="console-toolbar"><input placeholder="Search logs" data-role="console-search"><button data-action="clear-console">Clear logs</button></div><pre data-role="console-output"></pre>';
        const render = () => { content.querySelector("[data-role=console-output]").textContent = registry.getLogs(content.querySelector("[data-role=console-search]").value).map(log => `[${log.time}] ${log.event} ${log.appId} ${log.detail}`).join("\n") || "No SDK logs."; };
        content.addEventListener("input", render); content.addEventListener("click", event => { if (event.target.closest("[data-action=clear-console]")) { registry.clearLogs(); render(); } }); render();
        this.windowManager.create({ appId: "developer-console", title: "Developer Console", className: "developer-console-window", content });
    }

    showSection(section, root) {
        root.querySelectorAll("[data-section]").forEach(button => button.classList.toggle("active", button.dataset.section === section));
        root.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === section));
        if (section === "system") this.refreshSystemInfo();
    }

    syncControls(root) {
        root.querySelectorAll("[data-theme]").forEach(button => button.classList.toggle("selected", button.dataset.theme === this.preferences.theme));
        root.querySelectorAll("[data-icon-size]").forEach(button => button.classList.toggle("selected", button.dataset.iconSize === this.preferences.iconSize));
        root.querySelectorAll("[data-taskbar-position]").forEach(button => button.classList.toggle("selected", button.dataset.taskbarPosition === this.preferences.taskbarPosition));
        const accent = root.querySelector("[data-role=accent]");
        accent.value = this.preferences.accent;
        root.querySelector("[data-role=accent-value]").textContent = this.preferences.accent.toUpperCase();
        root.querySelector("[data-role=animations]").checked = this.preferences.animations;
        root.querySelector("[data-role=notifications]").checked = localStorage.getItem("tulip.notifications") !== "false";
    }

    launchWallpaperManager() {
        if (this.appRegistry?.launch) {
            this.appRegistry.launch("wallpaper-manager").catch(error => this.notifications?.show(error.message || "Unable to open Wallpaper Manager", "error"));
            return;
        }
        this.windowManager?.create?.({
            appId: "wallpaper-manager",
            title: "🖼 Wallpaper Manager",
            className: "wallpaper-manager-window",
            content: document.createElement("div")
        });
    }

    renderAccounts(root) {
        if (!this.users) return;
        const list = root.querySelector("[data-role=account-list]"); const active = root.querySelector("[data-role=active-user]"); if (!list || !active) return;
        const current = this.users.getActive(); active.textContent = `${current.avatar} ${current.displayName} (${current.role}) · /home/${current.username}`;
        list.replaceChildren(...this.users.list().map(user => { const button = document.createElement("button"); button.type = "button"; button.className = "settings-primary"; button.dataset.userSwitch = user.username; button.textContent = `${user.avatar} ${user.displayName}${user.username === current.username ? " (active)" : ""}`; return button; }));
    }

    async selectWallpaper(url, root) {
        if (!url) return;
        await this.wallpaper.apply(url, true);
        this.notifications?.show("Wallpaper updated");
    }

    async refreshSystemInfo() {
        const root = this.record?.content.querySelector(".settings-app");
        if (!root) return;
        const values = root.querySelectorAll("[data-role=system-info] dd");
        let storage = "Unavailable";
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            storage = `${this.formatBytes(estimate.usage || 0)} used of ${this.formatBytes(estimate.quota || 0)}`;
        }
        let installed = Object.keys(this.apps).length;
        if (this.packageManager?.getInstalledList) installed += (await this.packageManager.getInstalledList()).length;
        const memory = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB JS heap` : "Browser-managed memory";
        values[0].textContent = "9.0.0"; values[1].textContent = storage; values[2].textContent = `${installed} applications`; values[3].textContent = memory; values[4].textContent = navigator.userAgent;
    }

    formatBytes(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
    }
}
