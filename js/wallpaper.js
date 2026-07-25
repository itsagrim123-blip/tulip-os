window.TULIP_WALLPAPERS = [
    { id: "aurora", name: "Aurora", url: new URL("wallpapers/aurora.svg", document.baseURI).href },
    { id: "bloom", name: "Tulip Bloom", url: new URL("wallpapers/bloom.svg", document.baseURI).href },
    { id: "midnight", name: "Midnight Garden", url: new URL("wallpapers/midnight.svg", document.baseURI).href }
];

window.WallpaperController = class WallpaperController {
    constructor(desktop, notifications) {
        this.desktop = desktop;
        this.notifications = notifications;
        this.storageKey = "tulip.wallpaper";
        this.defaultWallpaper = window.TULIP_WALLPAPERS[0];
    }

    resolve(value) {
        if (!value) return this.defaultWallpaper;
        const text = String(value).trim();
        const byId = window.TULIP_WALLPAPERS.find(wallpaper => wallpaper.id === text);
        if (byId) return byId;
        try {
            const candidate = new URL(text, document.baseURI);
            return window.TULIP_WALLPAPERS.find(wallpaper => new URL(wallpaper.url).pathname === candidate.pathname) || null;
        } catch {
            return null;
        }
    }

    getSavedWallpaper() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            const wallpaper = this.resolve(saved);
            if (!wallpaper) {
                console.warn("Tulip wallpaper: ignoring invalid saved wallpaper.");
                localStorage.removeItem(this.storageKey);
                return this.defaultWallpaper;
            }
            return wallpaper;
        } catch (error) {
            console.warn("Tulip wallpaper: storage is unavailable.", error);
            return this.defaultWallpaper;
        }
    }

    restore() {
        return this.apply(this.getSavedWallpaper(), false);
    }

    async choose() {
        const answer = window.prompt(`Choose a wallpaper (1-${window.TULIP_WALLPAPERS.length})`);
        const wallpaper = window.TULIP_WALLPAPERS[Number(answer) - 1];
        if (!wallpaper) return false;
        const applied = await this.apply(wallpaper, true);
        if (applied) this.notifications.show("Wallpaper changed");
        return applied;
    }

    async apply(value, save = false) {
        const wallpaper = typeof value === "object" ? this.resolve(value.id || value.url) : this.resolve(value);
        if (!wallpaper) {
            console.warn("Tulip wallpaper: invalid wallpaper path.");
            this.notifications?.show("The selected wallpaper is unavailable.", "error");
            return false;
        }
        if (!(await this.loadImage(wallpaper.url))) {
            console.warn(`Tulip wallpaper: image failed to load (${wallpaper.id}).`);
            if (wallpaper.id !== this.defaultWallpaper.id) return this.apply(this.defaultWallpaper, false);
            this.applyBackground(this.defaultWallpaper.url);
            return false;
        }
        this.applyBackground(wallpaper.url);
        if (save) this.save(wallpaper.id);
        window.dispatchEvent(new CustomEvent("tulip:wallpaperchange", { detail: { id: wallpaper.id, url: wallpaper.url } }));
        return true;
    }

    loadImage(url) {
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = url;
        });
    }

    applyBackground(url) {
        this.desktop.style.backgroundImage = `url("${url}"), linear-gradient(135deg,#07070d,#0f1725,#14143d)`;
        this.desktop.style.backgroundSize = "cover";
        this.desktop.style.backgroundPosition = "center";
        this.desktop.style.backgroundRepeat = "no-repeat";
    }

    save(id) {
        try {
            localStorage.setItem(this.storageKey, id);
        } catch (error) {
            console.warn("Tulip wallpaper: unable to save selection.", error);
            this.notifications?.show("Wallpaper changed, but could not be saved.", "error");
        }
    }
};
