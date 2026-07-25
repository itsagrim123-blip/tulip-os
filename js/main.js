
const byId = id => document.getElementById(id);

const initializeFileSystem = (async () => {
    await window.TulipFS.init();

    const existingPaths = new Set((await window.TulipFS.list()).map(entry => entry.path));
    const createIfMissing = async (path, type, content = "") => {
        if (!existingPaths.has(path)) await window.TulipFS.create(path, type, content);
    };

    await createIfMissing("/Desktop", "folder");
    await createIfMissing("/Recycle Bin", "folder");
    await createIfMissing("/Desktop/Projects", "folder");
    await createIfMissing(
        "/Desktop/Projects/readme.txt",
        "file",
        "Welcome to Tulip OS!"
    );
    await createIfMissing(
        "/Desktop/Notes.txt",
        "file",
        "Welcome to Tulip OS!"
    );
})();

const apps = {
    explorer: { name: "Explorer", icon: "📁" },
    paint: { name: "Paint", icon: "🎨" },
    notepad: { name: "Notepad", icon: "📝" },
    calculator: { name: "Calculator", icon: "🧮" },
    browser: { name: "Browser", icon: "🌐" },
    settings: { name: "Settings", icon: "⚙️" },
    terminal: { name: "Terminal", icon: "⌘" },
    "task-manager": { name: "Task Manager", icon: "▦" },
    "tulip-store": { name: "Tulip Store", icon: "🛍️" }
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
const packageManager = new PackageManager({ apps, desktop: desktopController, taskbar, notifications });

const applicationInstances = {
    browser: new BrowserApp(windowManager, notifications),
    paint: new PaintApp(windowManager, notifications),
    calculator: new CalculatorApp(windowManager, notifications),
    notepad: new NotepadApp(windowManager, notifications),
    terminal: new TerminalApp(windowManager, notifications),
    "task-manager": new TaskManagerApp(windowManager, notifications, apps),
    settings: new SettingsApp(windowManager, wallpaper, desktopController, { apps, notifications, packageManager }),
    "tulip-store": new TulipStoreApp(windowManager, notifications, packageManager)
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
        if (!app && apps[appId]?.package) {
            windowManager.create({
                appId,
                title: `${apps[appId].icon} ${apps[appId].name}`,
                className: "package-window",
                content: `<div class="settings"><h2>${apps[appId].name}</h2><p>This locally installed Tulip package is ready to use.</p><p>Package functionality will load from <code>${appId}</code>.</p></div>`
            });
            return;
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
initializeFileSystem
    .then(async () => {
        await desktopController.loadDesktop();
        await packageManager.hydrate();
    })
    .catch(error => {
        console.error("Unable to initialize the filesystem", error);
        notifications.show("Unable to initialize the filesystem", "error");
    });

new BootController({ screen: byId("boot-screen"), desktop: byId("desktop"), progress: byId("boot-progress"), status: byId("boot-status") }).start();
