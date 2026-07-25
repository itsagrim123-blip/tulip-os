(() => {
    const byId = id => document.getElementById(id);
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

    const requiredModules = [
        "TulipFS", "Notifications", "WallpaperController", "LockScreen", "Taskbar", "WindowManager",
        "DesktopController", "PackageManager", "BrowserApp", "PaintApp", "CalculatorApp", "NotepadApp",
        "TerminalApp", "TaskManagerApp", "SettingsApp", "TulipStoreApp", "FileExplorerApp"
    ];

    async function initializeFileSystem() {
        await window.TulipFS.init();
        const existingPaths = new Set((await window.TulipFS.list()).map(entry => entry.path));
        const createIfMissing = async (path, type, content = "") => {
            if (!existingPaths.has(path)) await window.TulipFS.create(path, type, content);
        };

        await createIfMissing("/Desktop", "folder");
        await createIfMissing("/Recycle Bin", "folder");
        await createIfMissing("/Desktop/Projects", "folder");
        await createIfMissing("/Desktop/Projects/readme.txt", "file", "Welcome to Tulip OS!");
        await createIfMissing("/Desktop/Notes.txt", "file", "Welcome to Tulip OS!");
    }

    async function initializeSystem() {
        const missing = requiredModules.filter(name => !window[name]);
        if (missing.length) throw new Error(`Required system modules are unavailable: ${missing.join(", ")}`);

        const desktop = byId("desktop");
        const notifications = new window.Notifications();
        const wallpaper = new window.WallpaperController(desktop, notifications);
        const lockScreen = new window.LockScreen(byId("lockScreen"), byId("unlock-button"));
        let launcher;
        const taskbar = new window.Taskbar({
            root: byId("task-center"), startButton: byId("start-button"), startMenu: byId("start-menu"), apps,
            onLaunch: appId => launcher.open(appId)
        });
        const windowManager = new window.WindowManager(byId("windows"), taskbar);
        const desktopController = new window.DesktopController({
            iconsRoot: byId("desktop-icons"), desktop, menu: byId("desktopMenu"), apps,
            onLaunch: appId => launcher.open(appId), onWallpaper: () => wallpaper.choose(), onLock: () => lockScreen.lock()
        });
        const packageManager = new window.PackageManager({ apps, desktop: desktopController, taskbar, notifications });

        // Settings is created only after its complete service bundle exists.
        const settingsServices = { apps, notifications, packageManager };
        const applicationInstances = {
            browser: new window.BrowserApp(windowManager, notifications),
            paint: new window.PaintApp(windowManager, notifications),
            calculator: new window.CalculatorApp(windowManager, notifications),
            notepad: new window.NotepadApp(windowManager, notifications),
            terminal: new window.TerminalApp(windowManager, notifications),
            "task-manager": new window.TaskManagerApp(windowManager, notifications, apps),
            settings: new window.SettingsApp(windowManager, wallpaper, desktopController, settingsServices),
            "tulip-store": new window.TulipStoreApp(windowManager, notifications, packageManager)
        };

        window.openFileExplorer = async (path = "/") => {
            let app = applicationInstances.explorer;
            if (!app) {
                app = new window.FileExplorerApp(windowManager, notifications);
                applicationInstances.explorer = app;
            }
            app.open();
            await app.loadFolder(path);
        };

        launcher = {
            open(appId) {
                let app = applicationInstances[appId];
                if (!app && appId === "explorer") {
                    app = new window.FileExplorerApp(windowManager, notifications);
                    applicationInstances[appId] = app;
                }
                if (!app && apps[appId]?.package) {
                    windowManager.create({ appId, title: `${apps[appId].icon} ${apps[appId].name}`, className: "package-window", content: `<div class="settings"><h2>${apps[appId].name}</h2><p>This locally installed Tulip package is ready to use.</p><p>Package functionality will load from <code>${appId}</code>.</p></div>` });
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

        try {
            await initializeFileSystem();
        } catch (error) {
            console.error("Unable to initialize TulipFS", error);
            notifications.show("Unable to initialize the filesystem", "error");
        }
        try {
            await desktopController.loadDesktop();
        } catch (error) {
            console.error("Unable to load desktop files", error);
            notifications.show("Unable to load desktop files", "error");
        }
        try {
            await packageManager.hydrate();
        } catch (error) {
            console.error("Unable to load installed packages", error);
            notifications.show("Unable to load installed packages", "error");
        }
    }

    const boot = new window.BootController({
        screen: byId("boot-screen"), desktop: byId("desktop"), progress: byId("boot-progress"), status: byId("boot-status")
    });
    boot.start(initializeSystem);
})();
