(() => {
    "use strict";

    const DEFAULT_WALLPAPER_STORAGE_KEY = "tulip.wallpaper";
    const CUSTOM_WALLPAPER_STORAGE_KEY = "tulip.customWallpapers";
    const MAX_WALLPAPER_SIZE = 20 * 1024 * 1024;

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
            this.storageKey = DEFAULT_WALLPAPER_STORAGE_KEY;
            this.customWallpaperStorageKey = CUSTOM_WALLPAPER_STORAGE_KEY;
            this.defaultWallpaper = window.TULIP_WALLPAPERS[0];
            this.customWallpapers = [];
            this.customWallpapersLoaded = false;
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

        getDefaultWallpapers() {
            return window.TULIP_WALLPAPERS;
        }

        getCustomWallpapers() {
            return this.customWallpapers;
        }

        getAllWallpapers() {
            return [...this.getDefaultWallpapers(), ...this.customWallpapers];
        }

        resolve(value) {
            if (!value) return this.defaultWallpaper;
            const text = String(value).trim();
            const all = this.getAllWallpapers();
            const byId = all.find(wallpaper => wallpaper.id === text);
            if (byId) return byId;
            const byPath = all.find(wallpaper => wallpaper.path && wallpaper.path === text);
            if (byPath) return byPath;
            try {
                const path = new URL(text, document.baseURI).pathname;
                return all.find(wallpaper => wallpaper.url && new URL(wallpaper.url, document.baseURI).pathname === path) || null;
            } catch { return null; }
        }

        async ensureCustomWallpapersLoaded() {
            if (this.customWallpapersLoaded) return this.customWallpapers;
            const metadata = this.readStoredWallpaperMetadata();
            const hydrated = [];
            for (const entry of metadata) {
                try {
                    const wallpaper = await this.hydrateWallpaper(entry);
                    if (wallpaper) hydrated.push(wallpaper);
                } catch {
                    // Skip inaccessible wallpapers and keep the rest available.
                }
            }
            this.customWallpapers = hydrated;
            this.customWallpapersLoaded = true;
            return this.customWallpapers;
        }

        readStoredWallpaperMetadata() {
            try {
                const parsed = JSON.parse(localStorage.getItem(this.customWallpaperStorageKey) || "[]");
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        writeStoredWallpaperMetadata() {
            try {
                const payload = this.customWallpapers.map(wallpaper => ({
                    id: wallpaper.id,
                    name: wallpaper.name,
                    path: wallpaper.path,
                    mimeType: wallpaper.mimeType,
                    size: wallpaper.size,
                    width: wallpaper.width,
                    height: wallpaper.height,
                    createdAt: wallpaper.createdAt,
                    thumbnail: wallpaper.thumbnail
                }));
                localStorage.setItem(this.customWallpaperStorageKey, JSON.stringify(payload));
            } catch {
                // Ignore localStorage write failures and continue with the in-memory state.
            }
        }

        async hydrateWallpaper(entry) {
            if (!entry?.path || !window.TulipFS?.get) return null;
            const source = await window.TulipFS.get(entry.path);
            if (!source?.content) return null;
            const content = source.content.startsWith("data:") ? source.content : `data:${entry.mimeType || "image/png"};base64,${source.content}`;
            return {
                id: entry.id,
                name: entry.name,
                path: entry.path,
                url: content,
                dataUrl: content,
                mimeType: entry.mimeType || "image/png",
                size: entry.size || 0,
                width: entry.width || 0,
                height: entry.height || 0,
                createdAt: entry.createdAt || Date.now(),
                thumbnail: entry.thumbnail || null,
                isCustom: true
            };
        }

        getSavedWallpaper() {
            try {
                const wallpaper = this.resolve(localStorage.getItem(this.storageKey));
                if (!wallpaper) localStorage.removeItem(this.storageKey);
                return wallpaper || this.defaultWallpaper;
            } catch { return this.defaultWallpaper; }
        }

        async restore() {
            await this.ensureCustomWallpapersLoaded();
            return this.apply(this.getSavedWallpaper(), false);
        }

        async choose() {
            return new Promise(resolve => {
                const overlay = document.createElement("div");
                overlay.className = "wallpaper-picker";
                overlay.innerHTML = '<section role="dialog" aria-modal="true" aria-label="Choose wallpaper"><header><h2>Choose wallpaper</h2><button type="button" data-close aria-label="Close">×</button></header><div class="wallpaper-picker-grid"></div></section>';
                const finish = result => { overlay.remove(); resolve(result); };
                const grid = overlay.querySelector(".wallpaper-picker-grid");
                const renderChoices = async () => {
                    await this.ensureCustomWallpapersLoaded();
                    const selected = this.getSavedWallpaper().id;
                    grid.replaceChildren(...this.getAllWallpapers().map(wallpaper => {
                        const button = document.createElement("button");
                        button.type = "button";
                        button.dataset.wallpaper = wallpaper.id;
                        button.classList.toggle("selected", wallpaper.id === selected);
                        button.innerHTML = `<img alt="" src="${wallpaper.url}"><span></span>`;
                        button.querySelector("span").textContent = wallpaper.name;
                        return button;
                    }));
                };
                overlay.addEventListener("click", async event => {
                    if (event.target === overlay || event.target.closest("[data-close]")) return finish(false);
                    const id = event.target.closest("[data-wallpaper]")?.dataset.wallpaper;
                    if (!id) return;
                    const applied = await this.apply(id, true);
                    if (applied) this.notifications?.show("Wallpaper changed");
                    finish(applied);
                });
                document.body.append(overlay);
                renderChoices().finally(() => overlay.querySelector("[data-close]")?.focus());
            });
        }

        async apply(value, save = false) {
            await this.ensureCustomWallpapersLoaded();
            const wallpaper = typeof value === "object" ? await this.resolveWallpaper(value.id || value.url || value.path || value.name) : await this.resolveWallpaper(value);
            if (!wallpaper) { this.notifications?.show("The selected wallpaper is unavailable.", "error"); return false; }
            const source = wallpaper.dataUrl || wallpaper.url || wallpaper.content || wallpaper.path;
            if (!source) {
                this.notifications?.show("The selected wallpaper is unavailable.", "error");
                return false;
            }
            if (!(await this.loadImage(source))) {
                if (wallpaper.id !== this.defaultWallpaper.id) return this.apply(this.defaultWallpaper, save);
                this.notifications?.show("The default wallpaper could not be loaded.", "error");
                return false;
            }
            this.applyBackground(source);
            if (save) this.save(wallpaper.id);
            window.dispatchEvent(new CustomEvent("tulip:wallpaperchange", { detail: { id: wallpaper.id, url: source } }));
            return true;
        }

        async resolveWallpaper(value) {
            if (!value) return this.defaultWallpaper;
            if (typeof value === "object") {
                const direct = this.resolve(value.id || value.url || value.path || value.name);
                if (direct) return direct;
                await this.ensureCustomWallpapersLoaded();
                return this.resolve(value.id || value.url || value.path || value.name);
            }
            await this.ensureCustomWallpapersLoaded();
            return this.resolve(value);
        }

        loadImage(url) {
            if (!url) return Promise.resolve(false);
            if (this.imageCache.has(url)) return this.imageCache.get(url);
            const request = new Promise(resolve => {
                const image = new Image();
                image.decoding = "async";
                image.onload = async () => { try { await image.decode?.(); } catch { /* SVGs and older browsers may not support decode. */ } resolve(true); };
                image.onerror = () => resolve(false);
                image.src = url;
            });
            this.imageCache.set(url, request);
            while (this.imageCache.size > 8) this.imageCache.delete(this.imageCache.keys().next().value);
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

        async createWallpaperPreview(file) {
            if (!file) throw new Error("No image was selected.");
            const extension = String(file.name || "").split(".").pop()?.toLowerCase();
            const supportedExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
            const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
            if (!supportedExtensions.has(extension || "") && !supportedTypes.has(file.type)) {
                throw new Error("Unsupported image format. Please choose JPG, JPEG, PNG, WEBP, or GIF.");
            }
            if (file.size > MAX_WALLPAPER_SIZE) {
                throw new Error("The image is too large. Please choose a file smaller than 20MB.");
            }
            const dataUrl = await this.readFileAsDataUrl(file);
            const metadata = await this.readImageMetadata(dataUrl);
            const compressed = await this.compressImageDataUrl(dataUrl, metadata.mimeType || file.type || "image/png", metadata.width, metadata.height);
            const thumbnail = await this.generateThumbnail(compressed, metadata.width, metadata.height);
            return {
                id: `custom-${Date.now()}`,
                name: file.name,
                path: "",
                url: compressed,
                dataUrl: compressed,
                mimeType: metadata.mimeType || file.type || "image/png",
                size: Math.min(file.size, compressed.length * 3 / 4),
                width: metadata.width,
                height: metadata.height,
                thumbnail,
                isPending: true,
                isCustom: true,
                createdAt: Date.now()
            };
        }

        async saveWallpaperPreview(preview) {
            if (!preview?.dataUrl) throw new Error("The selected image could not be prepared.");
            const directory = "/Pictures/Wallpapers";
            const name = this.sanitizeFileName(preview.name || "wallpaper");
            const path = await this.getAvailableWallpaperPath(name);
            const wallpaper = {
                ...preview,
                id: `custom-${Date.now()}`,
                name: name.replace(/\s+/g, " ").trim() || "wallpaper",
                path,
                isPending: false,
                isCustom: true
            };
            const duplicate = this.customWallpapers.find(entry => entry.name === wallpaper.name || entry.dataUrl === wallpaper.dataUrl);
            if (duplicate) {
                this.customWallpapers = this.customWallpapers.filter(entry => entry.id !== duplicate.id).concat({ ...duplicate, path: duplicate.path || wallpaper.path, name: wallpaper.name, dataUrl: wallpaper.dataUrl, url: wallpaper.url, size: wallpaper.size, width: wallpaper.width, height: wallpaper.height, thumbnail: wallpaper.thumbnail });
                this.customWallpapersLoaded = true;
                this.writeStoredWallpaperMetadata();
                await this.apply({ ...duplicate, name: wallpaper.name, dataUrl: wallpaper.dataUrl, url: wallpaper.url, size: wallpaper.size, width: wallpaper.width, height: wallpaper.height, thumbnail: wallpaper.thumbnail }, true);
                return { ...duplicate, name: wallpaper.name, dataUrl: wallpaper.dataUrl, url: wallpaper.url, size: wallpaper.size, width: wallpaper.width, height: wallpaper.height, thumbnail: wallpaper.thumbnail };
            }
            if (window.TulipFS?.create) {
                await window.TulipFS.create(wallpaper.path, "file", wallpaper.dataUrl);
            }
            this.customWallpapers = this.customWallpapers.filter(entry => entry.id !== wallpaper.id).concat(wallpaper);
            this.customWallpapersLoaded = true;
            this.writeStoredWallpaperMetadata();
            await this.apply(wallpaper, true);
            return wallpaper;
        }

        async removeWallpaper(id) {
            const wallpaper = this.customWallpapers.find(entry => entry.id === id);
            if (!wallpaper) return false;
            if (wallpaper.path && window.TulipFS?.delete) {
                try { await window.TulipFS.delete(wallpaper.path); } catch { /* Ignore deletion failures and still remove the local entry. */ }
            }
            this.customWallpapers = this.customWallpapers.filter(entry => entry.id !== id);
            this.writeStoredWallpaperMetadata();
            if (this.getSavedWallpaper().id === id) {
                this.save(this.defaultWallpaper.id);
                await this.apply(this.defaultWallpaper, false);
            }
            return true;
        }

        async renameWallpaper(id, newName) {
            const wallpaper = this.customWallpapers.find(entry => entry.id === id);
            if (!wallpaper || !newName) return null;
            const extension = this.getFileExtension(wallpaper.name || wallpaper.path || "wallpaper");
            const cleanName = this.sanitizeFileName(newName, extension);
            const targetPath = `${this.getWallpaperDirectoryPath()}/${cleanName}`;
            if (window.TulipFS?.rename) await window.TulipFS.rename(wallpaper.path, targetPath);
            wallpaper.name = cleanName;
            wallpaper.path = targetPath;
            this.writeStoredWallpaperMetadata();
            return wallpaper;
        }

        getWallpaperDirectoryPath() {
            return "/Pictures/Wallpapers";
        }

        async getAvailableWallpaperPath(name) {
            if (!window.TulipFS?.list) return `${this.getWallpaperDirectoryPath()}/${this.sanitizeFileName(name)}`;
            const entries = await window.TulipFS.list();
            const parent = this.getWallpaperDirectoryPath();
            const existing = new Set(entries.filter(entry => entry.path?.startsWith(`${parent}/`)).map(entry => entry.path.split("/").pop()));
            let candidate = this.sanitizeFileName(name);
            let counter = 2;
            while (existing.has(candidate)) {
                const base = this.getFileBaseName(name);
                const extension = this.getFileExtension(name);
                candidate = `${base} (${counter++})${extension ? `.${extension}` : ""}`;
            }
            return `${parent}/${candidate}`;
        }

        sanitizeFileName(name, fallbackExtension = "") {
            const trimmed = String(name || "wallpaper").trim().replace(/\s+/g, " ");
            const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, "").replace(/\.+$/g, "").slice(0, 80) || "wallpaper";
            const extension = fallbackExtension ? `.${fallbackExtension}` : "";
            return `${cleaned}${extension}`;
        }

        getFileBaseName(name) {
            const value = String(name || "wallpaper").trim();
            if (!value) return "wallpaper";
            const lastDot = value.lastIndexOf(".");
            return lastDot > 0 ? value.slice(0, lastDot) : value;
        }

        getFileExtension(name) {
            const value = String(name || "").trim();
            const lastDot = value.lastIndexOf(".");
            return lastDot > 0 ? value.slice(lastDot + 1).toLowerCase() : "";
        }

        readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("The selected image could not be read."));
                reader.readAsDataURL(file);
            });
        }

        readImageMetadata(dataUrl) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = async () => {
                    try { await image.decode?.(); } catch { /* Ignore decode errors and keep using the image dimensions. */ }
                    resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0, mimeType: this.getMimeTypeFromDataUrl(dataUrl) });
                };
                image.onerror = () => reject(new Error("The selected image is invalid or corrupted."));
                image.src = dataUrl;
            });
        }

        async generateThumbnail(dataUrl, width, height) {
            if (!dataUrl) return null;
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("The thumbnail image could not be generated."));
                img.src = dataUrl;
            });
            const scale = Math.min(1, 140 / Math.max(width || image.naturalWidth || 1, height || image.naturalHeight || 1));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round((width || image.naturalWidth || 1) * scale));
            canvas.height = Math.max(1, Math.round((height || image.naturalHeight || 1) * scale));
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/webp", .8);
        }

        async compressImageDataUrl(dataUrl, mimeType, width, height) {
            if (!dataUrl) return null;
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("The image could not be processed."));
                img.src = dataUrl;
            });
            const maxDimension = 1600;
            const scale = Math.min(1, maxDimension / Math.max(width || image.naturalWidth || 1, height || image.naturalHeight || 1));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round((width || image.naturalWidth || 1) * scale));
            canvas.height = Math.max(1, Math.round((height || image.naturalHeight || 1) * scale));
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const outputType = mimeType === "image/png" ? "image/webp" : mimeType;
            return canvas.toDataURL(outputType, outputType === "image/jpeg" ? .82 : .8);
        }

        getMimeTypeFromDataUrl(dataUrl) {
            if (!dataUrl) return "image/png";
            if (dataUrl.startsWith("data:image/")) {
                const match = dataUrl.match(/^data:([^;,]+)/);
                return match?.[1] || "image/png";
            }
            return "image/png";
        }
    };
})();
