
const byId = id => document.getElementById(id);

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
    explorer: new ExplorerApp(windowManager, notifications),
    browser: new BrowserApp(windowManager, notifications),
    paint: new PaintApp(windowManager, notifications),
    calculator: new CalculatorApp(windowManager, notifications),
    notepad: new NotepadApp(windowManager, notifications),
    settings: new SettingsApp(windowManager, wallpaper, desktopController)
};

launcher = {
    open(appId) {
        const app = applicationInstances[appId];
        if (!app) return notifications.show("Application is unavailable", "error");
        app.open();
    }
};

const clock = byId("clock");
const updateClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
updateClock();
window.setInterval(updateClock, 1000);
wallpaper.restore();

new BootController({ screen: byId("boot-screen"), desktop: byId("desktop"), progress: byId("boot-progress"), status: byId("boot-status") }).start();
