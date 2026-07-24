
const byId = id => document.getElementById(id);

(async () => {
    await window.TulipFS.init();

    await window.TulipFS.create("/Desktop", "folder");
    await window.TulipFS.create("/Recycle Bin", "folder");
    await window.TulipFS.create("/Desktop/Projects", "folder");
    await window.TulipFS.create(
        "/Desktop/Projects/readme.txt",
        "file",
        "Welcome to Tulip OS!"
    );
    await window.TulipFS.create(
        "/Desktop/Notes.txt",
        "file",
        "Welcome to Tulip OS!"
    );

    console.log(await window.TulipFS.list());
})();

const apps = {
    explorer: { name: "Explorer", icon: "📁" },
    paint: { name: "Paint", icon: "🎨" },
    notepad: { name: "Notepad", icon: "📝" },
    calculator: { name: "Calculator", icon: "🧮" },
    browser: { name: "Browser", icon: "🌐" },
    settings: { name: "Settings", icon: "⚙️" }
};

const notifications = new Notifications();
const wallpaper = new WallpaperController(byId("desktop"), notifications);
const lockScreen = new LockScreen(byId("lockScreen"), byId("unlock-button"));
let launcher;
const taskbar = new Taskbar({
    root: byId("task-center"), startButton: byId("start-button"), startMenu: byId("start-menu"), apps,
    onLaunch: appId => launcher.open(appId)
});
const windowManager = new WindowManager(byId("windows"), taskbar);

const desktopController = new DesktopController({
    iconsRoot: byId("desktop-icons"), desktop: byId("desktop"), menu: byId("desktopMenu"), apps,
    onLaunch: appId => launcher.open(appId), onWallpaper: () => wallpaper.choose(), onLock: () => lockScreen.lock()
});

const applicationInstances = {
    browser: new BrowserApp(windowManager, notifications),
    paint: new PaintApp(windowManager, notifications),
    calculator: new CalculatorApp(windowManager, notifications),
    notepad: new NotepadApp(windowManager, notifications),
    settings: new SettingsApp(windowManager, wallpaper, desktopController)
};

window.openFileExplorer = async (path = "/") => {
    let app = applicationInstances.explorer;
    if (!app && window.FileExplorerApp) {
        app = new window.FileExplorerApp(windowManager, notifications);
        applicationInstances.explorer = app;
    }
    if (!app) return;
    app.open();
    await app.loadFolder(path);
};

launcher = {
    open(appId) {
        let app = applicationInstances[appId];
        if (!app && appId === "explorer") {
            const ExplorerClass = window.FileExplorerApp;
            if (ExplorerClass) {
                app = new ExplorerClass(windowManager, notifications);
                applicationInstances[appId] = app;
            }
        }
        if (!app) return notifications.show("Application is unavailable", "error");
        app.open();
    }
};

const clock = byId("clock");
const updateClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
updateClock();
window.setInterval(updateClock, 1000);
wallpaper.restore();
desktopController.loadDesktop();

new BootController({ screen: byId("boot-screen"), desktop: byId("desktop"), progress: byId("boot-progress"), status: byId("boot-status") }).start();
