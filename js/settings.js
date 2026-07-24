window.SettingsApp = class SettingsApp {
    constructor(windowManager, wallpaper, desktop) {
        this.windowManager = windowManager;
        this.wallpaper = wallpaper;
        this.desktop = desktop;
    }

    open() {
        this.windowManager.create({ appId: "settings", title: "⚙ Tulip Settings", className: "settings-window", content: `<div class="settings"><h2>Personalization</h2><p>Customize your Tulip OS desktop.</p><button type="button" data-action="wallpaper">🖼 Change Wallpaper</button><button type="button" data-action="layout">▦ Toggle Free Icon Layout</button><button type="button" data-action="reset-layout">↺ Reset Icon Layout</button></div>`, onMount: record => record.content.addEventListener("click", event => {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "wallpaper") this.wallpaper.choose();
            if (action === "layout") this.desktop.setMode(this.desktop.layout.mode === "grid" ? "free" : "grid");
            if (action === "reset-layout") { localStorage.removeItem("tulip.desktopLayout"); location.reload(); }
        }) });
    }
}
