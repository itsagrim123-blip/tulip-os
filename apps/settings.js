window.SettingsApp = class SettingsApp {
    constructor(windowManager, wallpaper, desktop, services) {
        this.windowManager = windowManager;
        this.wallpaper = wallpaper;
        this.desktop = desktop;
        this.apps = services.apps;
        this.notifications = services.notifications;
        this.packageManager = services.packageManager;
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
            onMount: current => this.bind(current)
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
            <section class="settings-section" data-panel="wallpaper"><p class="settings-eyebrow">DESKTOP</p><h2>Wallpaper</h2><p class="settings-intro">Select a wallpaper to apply it immediately.</p><div class="wallpaper-grid" data-role="wallpapers"></div></section>
            <section class="settings-section" data-panel="personalization"><p class="settings-eyebrow">WORKSPACE</p><h2>Personalization</h2><div class="settings-card"><h3>Desktop icon size</h3><div class="choice-grid compact" data-role="icon-size"><button type="button" data-icon-size="small">Small</button><button type="button" data-icon-size="medium">Medium</button><button type="button" data-icon-size="large">Large</button></div></div><div class="settings-card"><h3>Taskbar position</h3><div class="choice-grid compact" data-role="taskbar-position"><button type="button" data-taskbar-position="bottom">Bottom</button><button type="button" data-taskbar-position="top">Top</button></div></div><label class="settings-card toggle-row"><span><h3>Window animations</h3><p>Use smooth transitions throughout Tulip OS.</p></span><input type="checkbox" data-role="animations"><i></i></label></section>
            <section class="settings-section" data-panel="system"><p class="settings-eyebrow">DEVICE</p><h2>System</h2><p class="settings-intro">A quick overview of this Tulip OS session.</p><dl class="system-list" data-role="system-info"><div><dt>Tulip OS version</dt><dd>9.0.0</dd></div><div><dt>Storage usage</dt><dd>Calculating…</dd></div><div><dt>Installed applications</dt><dd>Calculating…</dd></div><div><dt>Memory information</dt><dd>Calculating…</dd></div><div><dt>Browser</dt><dd>Calculating…</dd></div></dl></section>
            <section class="settings-section" data-panel="notifications"><p class="settings-eyebrow">ALERTS</p><h2>Notifications</h2><div class="settings-card toggle-row"><span><h3>Enable notifications</h3><p>Show Tulip OS messages in this browser.</p></span><input type="checkbox" data-role="notifications"><i></i></label><div class="settings-card"><h3>Test notification</h3><p>Confirm that desktop messages are working.</p><button type="button" class="settings-primary" data-action="test-notification">Send test notification</button></div></section>
            <section class="settings-section" data-panel="about"><p class="settings-eyebrow">TULIP OS</p><div class="about-hero"><span>🌷</span><div><h2>Tulip OS</h2><p>Version 9.0.0</p></div></div><div class="settings-card about-details"><div><span>Developer</span><strong>Agrim</strong></div><div><span>License</span><strong>MIT License</strong></div></div><a class="settings-primary github-link" href="https://github.com/itsagrim123-blip/tulip-os" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a></section>
            </main>`;
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
        });
        this.syncControls(root);
        this.renderWallpapers(root);
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
        const wallpaper = event.target.closest("[data-wallpaper]");
        if (wallpaper) { this.selectWallpaper(wallpaper.dataset.wallpaper, root); return; }
        if (event.target.closest("[data-action=test-notification]")) {
            if (localStorage.getItem("tulip.notifications") === "false") return;
            await this.notifications.requestPermission();
            this.notifications.show("Tulip OS notifications are working.");
        }
    }

    updatePreference(key, value, root) {
        this.preferences[key] = value;
        this.savePreferences(); this.applyPreferences(); this.syncControls(root);
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

    renderWallpapers(root) {
        const selected = localStorage.getItem("tulip.wallpaper") || "";
        root.querySelector("[data-role=wallpapers]").replaceChildren(...window.TULIP_WALLPAPERS.map(wallpaper => {
            const button = document.createElement("button");
            button.type = "button"; button.className = "wallpaper-option"; button.dataset.wallpaper = wallpaper.url;
            button.classList.toggle("selected", wallpaper.url === selected);
            button.innerHTML = `<img alt="${wallpaper.name} wallpaper" src="${wallpaper.url}"><span>${wallpaper.name}</span>`;
            return button;
        }));
    }

    selectWallpaper(url, root) {
        if (!url) return;
        this.wallpaper.apply(url, true);
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
