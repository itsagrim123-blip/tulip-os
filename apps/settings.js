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
        this.pendingWallpaper = null;
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
            <section class="settings-section" data-panel="wallpaper"><p class="settings-eyebrow">DESKTOP</p><h2>Wallpaper</h2><p class="settings-intro">Select a wallpaper to apply it immediately or upload your own.</p><div class="settings-card wallpaper-upload-card"><div class="wallpaper-actions"><button type="button" class="settings-primary" data-action="upload-wallpaper">➕ Upload Wallpaper</button><span>JPG, JPEG, PNG, WEBP, GIF · up to 20MB</span></div><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" hidden data-role="wallpaper-file"><div class="wallpaper-preview-card" data-role="wallpaper-preview" hidden><div class="wallpaper-preview-image"><img alt="Wallpaper preview" data-role="wallpaper-preview-image" loading="lazy" decoding="async"></div><div class="wallpaper-preview-details"><h3 data-role="wallpaper-preview-name">No image selected</h3><p data-role="wallpaper-preview-meta">Choose an image to preview it.</p><div class="wallpaper-preview-actions"><button type="button" class="settings-primary" data-action="apply-preview">Apply</button><button type="button" class="settings-primary" data-action="cancel-preview">Cancel</button><button type="button" class="settings-primary" data-action="remove-selected-wallpaper">Remove</button></div></div></div></div><div class="wallpaper-gallery-stack"><div class="wallpaper-group"><h3>Default Wallpapers</h3><div class="wallpaper-grid" data-role="default-wallpapers"></div></div><div class="wallpaper-group"><h3>Uploaded Wallpapers</h3><div class="wallpaper-grid" data-role="uploaded-wallpapers"></div></div></div></section>
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
            if (event.target.matches("[data-role=wallpaper-file]")) this.handleWallpaperUpload(event, root);
        });
        record.wallpaperListener = () => this.renderWallpapers(root);
        window.addEventListener("tulip:wallpaperchange", record.wallpaperListener);
        this.syncControls(root);
        this.renderWallpapers(root);
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
        if (event.target.closest("[data-action=upload-wallpaper]")) { root.querySelector("[data-role=wallpaper-file]").click(); return; }
        if (event.target.closest("[data-action=apply-preview]")) { await this.applyPendingWallpaper(root); return; }
        if (event.target.closest("[data-action=cancel-preview]")) { this.pendingWallpaper = null; this.renderWallpaperPreview(root); return; }
        if (event.target.closest("[data-action=remove-selected-wallpaper]")) { await this.removeActiveWallpaper(root); return; }
        if (event.target.closest("[data-action=apply-wallpaper]")) { const action = event.target.closest("[data-action=apply-wallpaper]"); await this.selectWallpaper(action.dataset.wallpaperId, root); return; }
        if (event.target.closest("[data-action=rename-wallpaper]")) { const action = event.target.closest("[data-action=rename-wallpaper]"); await this.renameWallpaper(action.dataset.wallpaperId, root); return; }
        if (event.target.closest("[data-action=delete-wallpaper]")) { const action = event.target.closest("[data-action=delete-wallpaper]"); await this.deleteWallpaper(action.dataset.wallpaperId, root); return; }
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

    async renderWallpapers(root) {
        await this.wallpaper.ensureCustomWallpapersLoaded?.();
        const selected = this.wallpaper.getSavedWallpaper();
        const defaultGrid = root.querySelector("[data-role=default-wallpapers]");
        const uploadedGrid = root.querySelector("[data-role=uploaded-wallpapers]");
        if (!defaultGrid || !uploadedGrid) return;
        const createCard = wallpaper => {
            const card = document.createElement("div");
            card.className = "wallpaper-option-card";
            const button = document.createElement("button");
            button.type = "button"; button.className = "wallpaper-option"; button.dataset.wallpaper = wallpaper.id;
            button.classList.toggle("selected", wallpaper.id === selected.id);
            button.innerHTML = `<img alt="${wallpaper.name} wallpaper" src="${wallpaper.url}" loading="lazy" decoding="async"><span>${wallpaper.name}</span>`;
            card.append(button);
            if (wallpaper.isCustom) {
                const actions = document.createElement("div");
                actions.className = "wallpaper-option-actions";
                const apply = document.createElement("button"); apply.type = "button"; apply.className = "wallpaper-action"; apply.dataset.action = "apply-wallpaper"; apply.dataset.wallpaperId = wallpaper.id; apply.textContent = "Apply";
                const rename = document.createElement("button"); rename.type = "button"; rename.className = "wallpaper-action"; rename.dataset.action = "rename-wallpaper"; rename.dataset.wallpaperId = wallpaper.id; rename.textContent = "Rename";
                const remove = document.createElement("button"); remove.type = "button"; remove.className = "wallpaper-action"; remove.dataset.action = "delete-wallpaper"; remove.dataset.wallpaperId = wallpaper.id; remove.textContent = "Delete";
                actions.append(apply, rename, remove);
                card.append(actions);
            }
            return card;
        };
        defaultGrid.replaceChildren(...window.TULIP_WALLPAPERS.map(createCard));
        const customWallpapers = this.wallpaper.getCustomWallpapers?.() || [];
        uploadedGrid.replaceChildren(...(customWallpapers.length ? customWallpapers.map(createCard) : [this.createEmptyWallpaperNotice()]));
        this.renderWallpaperPreview(root);
    }

    createEmptyWallpaperNotice() {
        const notice = document.createElement("div");
        notice.className = "wallpaper-empty-state";
        notice.innerHTML = "<p>No uploaded wallpapers yet.</p>";
        return notice;
    }

    renderWallpaperPreview(root) {
        const preview = root.querySelector("[data-role=wallpaper-preview]");
        const image = root.querySelector("[data-role=wallpaper-preview-image]");
        const name = root.querySelector("[data-role=wallpaper-preview-name]");
        const meta = root.querySelector("[data-role=wallpaper-preview-meta]");
        if (!preview || !image || !name || !meta) return;
        if (!this.pendingWallpaper) {
            preview.hidden = true;
            return;
        }
        preview.hidden = false;
        image.src = this.pendingWallpaper.url;
        image.alt = this.pendingWallpaper.name;
        name.textContent = this.pendingWallpaper.name;
        meta.textContent = `${this.pendingWallpaper.width || "?"}×${this.pendingWallpaper.height || "?"} · ${this.formatBytes(this.pendingWallpaper.size || 0)}`;
    }

    async handleWallpaperUpload(event, root) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const preview = await this.wallpaper.createWallpaperPreview(file);
            this.pendingWallpaper = preview;
            this.renderWallpaperPreview(root);
            this.notifications.show(`Preview ready: ${preview.name}`);
        } catch (error) {
            this.pendingWallpaper = null;
            this.renderWallpaperPreview(root);
            this.notifications.show(error.message || "Unable to prepare wallpaper.", "error");
        }
    }

    async applyPendingWallpaper(root) {
        if (!this.pendingWallpaper) return;
        try {
            const wallpaper = await this.wallpaper.saveWallpaperPreview(this.pendingWallpaper);
            this.pendingWallpaper = null;
            await this.renderWallpapers(root);
            this.notifications.show(`${wallpaper.name} added to your wallpaper gallery`);
        } catch (error) {
            this.notifications.show(error.message || "Unable to save wallpaper.", "error");
        }
    }

    async removeActiveWallpaper(root) {
        const active = this.wallpaper.getSavedWallpaper();
        if (!active?.isCustom) {
            this.pendingWallpaper = null;
            this.renderWallpaperPreview(root);
            this.notifications.show("No uploaded wallpaper is currently active.", "error");
            return;
        }
        await this.deleteWallpaper(active.id, root);
    }

    async deleteWallpaper(id, root) {
        const deleted = await this.wallpaper.removeWallpaper(id);
        if (!deleted) {
            this.notifications.show("The selected wallpaper could not be removed.", "error");
            return;
        }
        this.pendingWallpaper = null;
        await this.renderWallpapers(root);
        this.renderWallpaperPreview(root);
        this.notifications.show("Wallpaper removed");
    }

    async renameWallpaper(id, root) {
        const target = this.wallpaper.getCustomWallpapers?.().find(wallpaper => wallpaper.id === id);
        if (!target) return;
        const next = await window.TulipPrompt("Rename wallpaper", target.name || "Wallpaper");
        if (!next) return;
        const updated = await this.wallpaper.renameWallpaper(id, next);
        if (!updated) {
            this.notifications.show("The wallpaper could not be renamed.", "error");
            return;
        }
        await this.renderWallpapers(root);
        this.notifications.show(`Renamed to ${updated.name}`);
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
        this.renderWallpapers(root);
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
