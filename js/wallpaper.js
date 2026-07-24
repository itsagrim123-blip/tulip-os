const WALLPAPERS = [
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=80"
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
        const answer = window.prompt(`Choose a wallpaper (1-${WALLPAPERS.length})`);
        const index = Number(answer) - 1;
        if (!Number.isInteger(index) || !WALLPAPERS[index]) return;
        this.apply(WALLPAPERS[index]);
        localStorage.setItem("tulip.wallpaper", WALLPAPERS[index]);
        this.notifications.show("Wallpaper changed");
    }

    apply(url) {
        this.desktop.style.backgroundImage = `url("${url}"), linear-gradient(135deg,#07070d,#0f1725,#14143d)`;
        this.desktop.style.backgroundSize = "cover";
        this.desktop.style.backgroundPosition = "center";
    }
}
