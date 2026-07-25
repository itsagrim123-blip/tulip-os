window.TULIP_WALLPAPERS = [
    { id: "aurora", name: "Aurora", url: "wallpapers/aurora.svg" },
    { id: "bloom", name: "Tulip Bloom", url: "wallpapers/bloom.svg" },
    { id: "midnight", name: "Midnight Garden", url: "wallpapers/midnight.svg" }
];

window.WallpaperController = class WallpaperController {
    constructor(desktop, notifications) {
        this.desktop = desktop;
        this.notifications = notifications;
    }

    restore() {
        const value = localStorage.getItem("tulip.wallpaper");
        if (value) this.apply(value);
    }

    choose() {
        const answer = window.prompt(`Choose a wallpaper (1-${window.TULIP_WALLPAPERS.length})`);
        const wallpaper = window.TULIP_WALLPAPERS[Number(answer) - 1];
        if (!wallpaper) return;
        this.apply(wallpaper.url, true);
        this.notifications.show("Wallpaper changed");
    }

    apply(url, save = false) {
        this.desktop.style.backgroundImage = `url("${url}"), linear-gradient(135deg,#07070d,#0f1725,#14143d)`;
        this.desktop.style.backgroundSize = "cover";
        this.desktop.style.backgroundPosition = "center";
        if (save) localStorage.setItem("tulip.wallpaper", url);
    }
}
