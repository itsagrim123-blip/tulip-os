window.TULIP_WALLPAPERS = [
    { id: "aurora", name: "Aurora", url: new URL("./wallpapers/aurora.svg", document.baseURI).href },
    { id: "bloom", name: "Tulip Bloom", url: new URL("./wallpapers/bloom.svg", document.baseURI).href },
    { id: "midnight", name: "Midnight Garden", url: new URL("./wallpapers/midnight.svg", document.baseURI).href }
];

window.WallpaperController = class WallpaperController {
    constructor(desktop, notifications) {
        this.desktop = desktop;
        this.notifications = notifications;
    }

    restore() {
        const value = localStorage.getItem("tulip.wallpaper");
        if (value) this.apply(new URL(value, document.baseURI).href);
    }

    choose() {
        const answer = window.prompt(`Choose a wallpaper (1-${window.TULIP_WALLPAPERS.length})`);
        const wallpaper = window.TULIP_WALLPAPERS[Number(answer) - 1];
        if (!wallpaper) return;
        this.apply(wallpaper.url, true);
        this.notifications.show("Wallpaper changed");
    }

    apply(url, save = false) {
        const wallpaperUrl = new URL(url, document.baseURI).href;
        this.desktop.style.backgroundImage = `url("${wallpaperUrl}"), linear-gradient(135deg,#07070d,#0f1725,#14143d)`;
        this.desktop.style.backgroundSize = "cover";
        this.desktop.style.backgroundPosition = "center";
        if (save) localStorage.setItem("tulip.wallpaper", wallpaperUrl);
    }
}
