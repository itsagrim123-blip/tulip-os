window.Taskbar = class Taskbar {
    constructor({ root, startButton, startMenu, apps, onLaunch }) {
        this.root = root;
        this.startButton = startButton;
        this.startMenu = startMenu;
        this.apps = apps;
        this.onLaunch = onLaunch;
        this.records = new Map();
        try { this.pinned = new Set(JSON.parse(localStorage.getItem("tulip.pinnedApps") || "[\"explorer\",\"browser\"]")); } catch { this.pinned = new Set(["explorer", "browser"]); }
        this.pinnedArea = document.createElement("div");
        this.pinnedArea.className = "taskbar-pinned";
        this.runningArea = document.createElement("div");
        this.runningArea.className = "taskbar-running";
        root.replaceChildren(this.pinnedArea, this.runningArea);
        this.renderPinned();
        this.renderStartMenu();
        startButton.addEventListener("click", event => {
            event.stopPropagation();
            startMenu.classList.toggle("hidden");
        });
        startMenu.addEventListener("click", event => {
            const button = event.target.closest("[data-app]");
            if (!button) return;
            startMenu.classList.add("hidden");
            this.onLaunch(button.dataset.app);
        });
        document.addEventListener("pointerdown", event => {
            if (!startMenu.contains(event.target) && event.target !== startButton) startMenu.classList.add("hidden");
        });
    }

    renderPinned() {
        this.pinnedArea.replaceChildren(...[...this.pinned].map(id => {
            const button = this.createButton(id, "pinned");
            const record = this.records.get(id);
            button.classList.toggle("is-running", Boolean(record));
            button.classList.toggle("is-focused", Boolean(record?.focused));
            button.classList.toggle("is-minimized", Boolean(record?.minimized));
            return button;
        }));
    }

    renderStartMenu() {
        const appList = this.startMenu.querySelector(".start-apps");
        if (!appList) return;
        appList.replaceChildren(...Object.entries(this.apps).map(([id, app]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "start-app";
            button.dataset.app = id;
            button.textContent = `${app.icon} ${app.name}`;
            return button;
        }));
    }

    refreshApps() {
        for (const id of [...this.pinned]) if (!this.apps[id]) this.pinned.delete(id);
        try { localStorage.setItem("tulip.pinnedApps", JSON.stringify([...this.pinned])); } catch { /* Pinning remains available for this session. */ }
        this.renderPinned();
        this.renderStartMenu();
        this.renderRunning();
    }

    createButton(id, kind) {
        const record = this.records.get(id);
        const app = this.apps[id] || { name: record?.title || id, icon: "◻" };
        const button = document.createElement("button");
        button.type = "button";
        button.className = `taskbar-app taskbar-${kind}`;
        button.dataset.app = id;
        button.title = app.name;
        button.textContent = app.icon;
        button.addEventListener("click", () => {
            const record = this.records.get(id);
            if (record) record.minimized ? record.restore() : record.focus();
            else this.onLaunch(id);
        });
        return button;
    }

    register(record) {
        this.records.set(record.appId, record);
        this.renderRunning();
    }

    unregister(record) {
        if (this.records.get(record.appId) === record) this.records.delete(record.appId);
        this.renderRunning();
    }

    update(record) {
        if (this.records.get(record.appId) === record) this.renderRunning();
    }

    renderRunning() {
        this.renderPinned();
        this.runningArea.replaceChildren(...[...this.records.values()].filter(record => !this.pinned.has(record.appId)).map(record => {
            const button = this.createButton(record.appId, "running");
            button.classList.toggle("is-focused", record.focused);
            button.classList.toggle("is-minimized", record.minimized);
            return button;
        }));
    }
}
