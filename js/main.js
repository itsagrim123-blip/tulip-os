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
        "tulip-store": { name: "Tulip Store", icon: "🛍️" },
        weather: { name: "Weather", icon: "☀️" },
        "flappy-bird": { name: "Flappy Tulip", icon: "🐦" },
        camera: { name: "Camera", icon: "📷" },
        clock: { name: "Clock", icon: "🕰️" },
        "media-player": { name: "Media Player", icon: "🎵" }
    };

    const requiredModules = [
        "TulipFS", "Notifications", "WallpaperController", "WeatherService", "WeatherApp", "SoundManager", "FlappyBirdApp", "CameraApp", "ClockApp", "MediaPlayerApp", "LockScreen", "Taskbar", "WindowManager",
        "DesktopController", "PackageManager", "TulipAppRegistry", "BrowserApp", "PaintApp", "CalculatorApp", "NotepadApp",
        "TerminalApp", "TaskManagerApp", "SettingsApp", "TulipStoreApp", "FileExplorerApp", "MediaViewerApp"
    ];

    async function initializeFileSystem() {
        await window.TulipFS.init();
        const existingPaths = new Set((await window.TulipFS.list()).map(entry => entry.path));
        const createIfMissing = async (path, type, content = "") => {
            if (!existingPaths.has(path)) await window.TulipFS.create(path, type, content);
        };

        await createIfMissing("/Desktop", "folder");
        await createIfMissing("/Documents", "folder");
        await createIfMissing("/Downloads", "folder");
        await createIfMissing("/Pictures", "folder");
        await createIfMissing("/Recycle Bin", "folder");
        await createIfMissing("/Desktop/Projects", "folder");
        await createIfMissing("/Desktop/Projects/readme.txt", "file", "Welcome to Tulip OS!");
        await createIfMissing("/Desktop/Notes.txt", "file", "Welcome to Tulip OS!");
    }

    async function initializeSystem() {
        const missing = requiredModules.filter(name => !window[name]);
        if (missing.length) throw new Error(`Required system modules are unavailable: ${missing.join(", ")}`);

        const desktop = byId("desktop");
        const kernel = window.__tulipKernel;
        window.__tulipProcesses = new window.TulipProcessManager(kernel.eventBus);
        window.__tulipServices = new window.TulipServiceManager(kernel.eventBus);
        window.__tulipClipboard = new window.TulipClipboardManager(kernel.eventBus);
        window.__tulipPower = new window.TulipPowerManager(kernel.eventBus);
        window.__tulipDiagnostics = new window.TulipDiagnostics(kernel.eventBus);
        apps.archive = { name: "Archive Manager", icon: "🗜" };
        const notifications = new window.Notifications();
        const sounds = new window.SoundManager();
        window.__tulipSounds = sounds;
        document.addEventListener("pointerdown", () => sounds.unlock().catch(() => {}), { once: true, passive: true });
        const users = new window.UserManager(notifications);
        window.TulipFS.setActiveUser(users.getActive().username);
        const wallpaper = new window.WallpaperController(desktop, notifications);
        const weatherService = new window.WeatherService();
        weatherService.start();
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
        const settingsServices = { apps, notifications, packageManager, users };
        const applicationInstances = {
            browser: new window.BrowserApp(windowManager, notifications),
            paint: new window.PaintApp(windowManager, notifications),
            calculator: new window.CalculatorApp(windowManager, notifications),
            notepad: new window.NotepadApp(windowManager, notifications),
            terminal: new window.TerminalApp(windowManager, notifications, users),
            archive: new window.ArchiveManagerApp(windowManager, notifications),
            "task-manager": new window.TaskManagerApp(windowManager, notifications, apps),
            "media-viewer": new window.MediaViewerApp(windowManager, notifications),
            settings: new window.SettingsApp(windowManager, wallpaper, desktopController, settingsServices),
            "tulip-store": new window.TulipStoreApp(windowManager, notifications, packageManager),
            weather: new window.WeatherApp(windowManager, notifications, weatherService),
            "flappy-bird": new window.FlappyBirdApp(windowManager, notifications, sounds),
            camera: new window.CameraApp(windowManager, notifications),
            clock: new window.ClockApp(windowManager, notifications),
            "media-player": new window.MediaPlayerApp(windowManager, notifications)
        };
        window.__tulipMediaViewer = applicationInstances["media-viewer"];

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
            open(appId, argument) {
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
                app.open(argument);
            }
        };
        window.__tulipLauncher = launcher;
        [byId("desktop-weather"), byId("taskbar-weather")].filter(Boolean).forEach(widget => widget.addEventListener("click", () => launcher.open("weather")));
        window.addEventListener("tulip:weatherchange", event => {
            const current = event.detail?.payload?.current; if (!current) return;
            const [icon] = window.TulipWeatherCode(current.weather_code);
            document.querySelectorAll("[data-weather-icon]").forEach(node => node.textContent = icon);
            document.querySelectorAll("[data-weather-temp]").forEach(node => node.textContent = `${Math.round(current.temperature_2m)}°`);
            document.querySelectorAll("[data-weather-place]").forEach(node => node.textContent = event.detail.place?.name || "Weather");
        });
        window.addEventListener("tulip:windowchange", event => {
            if (event.detail.action === "opened") sounds.play("window-open");
            if (event.detail.action === "closed") sounds.play("window-close");
        });
        const appRegistry = new window.TulipAppRegistry({ apps, packageManager, notifications, windowManager, launcher });
        window.__tulipAppRegistry = appRegistry;
        window.TulipSDK = Object.freeze({ version: "1.0.0", permissions: [...window.TulipSDK.permissions], forApp: (id, argument) => appRegistry.getSDK(id, argument) });
        window.__tulipInstaller = new window.TulipTappInstaller(packageManager, notifications);
        settingsServices.appRegistry = appRegistry;
        packageManager.appRegistry = appRegistry;
        const nativeOpen = launcher.open;
        launcher.open = (appId, argument) => {
            if (apps[appId]?.package) return appRegistry.launch(appId, argument).catch(error => notifications.show(error.message || "Unable to launch application", "error"));
            return nativeOpen(appId, argument);
        };
        window.addEventListener("tulip:userchange", async () => { await desktopController.loadDesktop(); wallpaper.restore(); });

        const clock = byId("clock");
        const updateClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
        updateClock();
        window.setInterval(updateClock, 1000);
        await wallpaper.restore();

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
            await appRegistry.loadInstalled();
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
