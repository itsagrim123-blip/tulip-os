(() => {
    "use strict";

    window.TULIP_WALLPAPERS = [
        { id: "aurora", name: "Aurora", url: new URL("wallpapers/aurora.svg", document.baseURI).href },
        { id: "bloom", name: "Tulip Bloom", url: new URL("wallpapers/bloom.svg", document.baseURI).href },
        { id: "midnight", name: "Midnight Garden", url: new URL("wallpapers/midnight.svg", document.baseURI).href }
    ];

    window.WallpaperController = class WallpaperController {
        constructor(desktop, notifications) {
            this.desktop = desktop;
            this.layer = document.getElementById("wallpaper-layer");
            this.notifications = notifications;
            this.storageKey = "tulip.wallpaper";
            this.defaultWallpaper = window.TULIP_WALLPAPERS[0];
            this.imageCache = new Map();
            this.currentUrl = "";
            this.fadeTimer = 0;
            this.fadeLayer = this.createFadeLayer();
        }

        createFadeLayer() {
            if (!this.layer?.parentElement) return null;
            const layer = document.createElement("div");
            layer.className = "wallpaper-fade-layer";
            layer.setAttribute("aria-hidden", "true");
            this.layer.after(layer);
            return layer;
        }

        resolve(value) {
            if (!value) return this.defaultWallpaper;
            const text = String(value).trim();
            const byId = window.TULIP_WALLPAPERS.find(wallpaper => wallpaper.id === text);
            if (byId) return byId;
            try {
                const path = new URL(text, document.baseURI).pathname;
                return window.TULIP_WALLPAPERS.find(wallpaper => new URL(wallpaper.url).pathname === path) || null;
            } catch { return null; }
        }

        getSavedWallpaper() {
            try {
                const wallpaper = this.resolve(localStorage.getItem(this.storageKey));
                if (!wallpaper) localStorage.removeItem(this.storageKey);
                return wallpaper || this.defaultWallpaper;
            } catch { return this.defaultWallpaper; }
        }

        restore() { return this.apply(this.getSavedWallpaper(), false); }

        async choose() {
            return new Promise(resolve => {
                const overlay = document.createElement("div");
                overlay.className = "wallpaper-picker";
                overlay.innerHTML = '<section role="dialog" aria-modal="true" aria-label="Choose wallpaper"><header><h2>Choose wallpaper</h2><button type="button" data-close aria-label="Close">×</button></header><div class="wallpaper-picker-grid"></div></section>';
                const finish = result => { overlay.remove(); resolve(result); };
                const grid = overlay.querySelector(".wallpaper-picker-grid");
                for (const wallpaper of window.TULIP_WALLPAPERS) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.dataset.wallpaper = wallpaper.id;
                    button.classList.toggle("selected", wallpaper.id === this.getSavedWallpaper().id);
                    button.innerHTML = `<img alt="" src="${wallpaper.url}"><span></span>`;
                    button.querySelector("span").textContent = wallpaper.name;
                    grid.append(button);
                }
                overlay.addEventListener("click", async event => {
                    if (event.target === overlay || event.target.closest("[data-close]")) return finish(false);
                    const id = event.target.closest("[data-wallpaper]")?.dataset.wallpaper;
                    if (!id) return;
                    const applied = await this.apply(id, true);
                    if (applied) this.notifications?.show("Wallpaper changed");
                    finish(applied);
                });
                document.body.append(overlay);
                overlay.querySelector("[data-close]").focus();
            });
        }

        async apply(value, save = false) {
            const wallpaper = typeof value === "object" ? this.resolve(value.id || value.url) : this.resolve(value);
            if (!wallpaper) { this.notifications?.show("The selected wallpaper is unavailable.", "error"); return false; }
            if (!(await this.loadImage(wallpaper.url))) {
                if (wallpaper.id !== this.defaultWallpaper.id) return this.apply(this.defaultWallpaper, save);
                this.notifications?.show("The default wallpaper could not be loaded.", "error");
                return false;
            }
            this.applyBackground(wallpaper.url);
            if (save) this.save(wallpaper.id);
            window.dispatchEvent(new CustomEvent("tulip:wallpaperchange", { detail: { id: wallpaper.id, url: wallpaper.url } }));
            return true;
        }

        loadImage(url) {
            if (this.imageCache.has(url)) return this.imageCache.get(url);
            const request = new Promise(resolve => {
                const image = new Image();
                image.decoding = "async";
                image.onload = async () => { try { await image.decode?.(); } catch { /* SVGs and older browsers may not support decode. */ } resolve(true); };
                image.onerror = () => resolve(false);
                image.src = url;
            });
            this.imageCache.set(url, request);
            while (this.imageCache.size > 4) this.imageCache.delete(this.imageCache.keys().next().value);
            return request;
        }

        applyBackground(url) {
            if (!this.layer) {
                this.desktop.style.background = `center / cover no-repeat url("${url}"), linear-gradient(135deg,#07070d,#0f1725,#14143d)`;
                return;
            }
            const previous = this.currentUrl ? `url("${this.currentUrl}")` : this.layer.style.backgroundImage;
            this.layer.style.backgroundImage = `url("${url}")`;
            this.currentUrl = url;
            if (!this.fadeLayer || !previous || previous === `url("${url}")`) return;
            window.clearTimeout(this.fadeTimer);
            this.fadeLayer.style.backgroundImage = previous;
            this.fadeLayer.classList.add("is-visible");
            requestAnimationFrame(() => this.fadeLayer?.classList.remove("is-visible"));
            this.fadeTimer = window.setTimeout(() => this.fadeLayer?.style.removeProperty("background-image"), 360);
        }

        save(id) {
            try { localStorage.setItem(this.storageKey, id); }
            catch { this.notifications?.show("Wallpaper changed, but could not be saved.", "error"); }
        }
    };
})();
