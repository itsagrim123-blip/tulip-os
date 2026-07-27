(() => {
    const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"]);
    const MEDIA_EXTENSIONS = new Set(["mp4", "webm", "mp3", "wav", "ogg"]);
    const thumbnailCache = new Map();

    const extensionOf = name => String(name || "").split(".").pop().toLowerCase();
    const isImage = file => IMAGE_EXTENSIONS.has(extensionOf(file.path || file.name));
    const isMedia = file => MEDIA_EXTENSIONS.has(extensionOf(file.path || file.name));
    const isSupported = file => isImage(file) || isMedia(file);
    const nameOf = file => String(file?.path || file?.name || "Untitled").split("/").pop();
    const mimeFor = file => {
        const extension = extensionOf(file.path || file.name);
        const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg" };
        return types[extension] || "application/octet-stream";
    };
    const sourceFor = file => {
        if (typeof file?.content !== "string" || !file.content) return "";
        return file.content.startsWith("data:") ? file.content : `data:${mimeFor(file)};base64,${file.content}`;
    };

    window.TulipMedia = {
        isSupported,
        isImage,
        isMedia,
        sourceFor,
        async createThumbnail(file) {
            if (!isImage(file)) return null;
            const key = `${file.path}:${file.created || ""}:${file.content?.length || 0}`;
            if (thumbnailCache.has(key)) return thumbnailCache.get(key);
            const source = sourceFor(file);
            if (!source) return null;
            const thumbnail = await new Promise(resolve => {
                const image = new Image();
                image.onload = () => {
                    const scale = Math.min(64 / image.naturalWidth, 64 / image.naturalHeight, 1);
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/png"));
                };
                image.onerror = () => resolve(null);
                image.src = source;
            });
            thumbnailCache.set(key, thumbnail);
            return thumbnail;
        }
    };

    window.MediaViewerApp = class MediaViewerApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.record = null;
            this.file = null;
            this.images = [];
            this.zoom = 1;
            this.rotation = 0;
            this.flipX = 1;
            this.flipY = 1;
            this.slideshowTimer = null;
            this.resizeObserver = null;
            this.sizeKey = "tulip.mediaViewerSize";
        }

        async open(file) {
            if (!file || !isSupported(file)) {
                this.notifications.show("This file is not supported by Media Viewer", "error");
                return;
            }
            const latest = file.path ? await window.TulipFS.get(file.path) : file;
            if (!latest?.content) {
                this.notifications.show("The selected media file is missing or empty", "error");
                return;
            }
            this.file = latest;
            this.stopSlideshow(false);
            await this.loadImageList();
            const record = this.windowManager.create({
                appId: "media-viewer", title: `🖼 ${nameOf(latest)}`, className: "media-viewer-window", content: this.createView(),
                onMount: current => this.bind(current), onClose: () => this.destroy()
            });
            this.record = record;
            this.applySavedSize(record);
            this.render();
            this.notifications.show(`Opened ${nameOf(latest)}`);
        }

        createView() {
            const root = document.createElement("div");
            root.className = "media-viewer";
            root.innerHTML = '<div class="media-viewer-toolbar" data-role="toolbar"><button type="button" data-action="previous" title="Previous image (Left arrow)">◀</button><button type="button" data-action="next" title="Next image (Right arrow)">▶</button><span class="media-viewer-separator"></span><button type="button" data-action="zoom-out" title="Zoom out">−</button><button type="button" data-action="zoom-in" title="Zoom in">+</button><button type="button" data-action="fit" title="Fit to screen">Fit</button><button type="button" data-action="original" title="Original size">1:1</button><span class="media-viewer-separator"></span><button type="button" data-action="rotate-left" title="Rotate left">↶</button><button type="button" data-action="rotate-right" title="Rotate right">↷</button><button type="button" data-action="flip-horizontal" title="Flip horizontal">↔</button><button type="button" data-action="flip-vertical" title="Flip vertical">↕</button><span class="media-viewer-separator"></span><button type="button" data-action="slideshow" title="Slideshow">▸</button><button type="button" data-action="fullscreen" title="Fullscreen">⛶</button><span class="media-viewer-status" data-role="status"></span></div><div class="media-viewer-stage" data-role="stage"></div><div class="media-viewer-media-controls" data-role="media-controls" hidden></div>';
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".media-viewer");
            root.addEventListener("click", event => this.handleClick(event));
            root.addEventListener("wheel", event => this.handleWheel(event), { passive: false });
            root.addEventListener("keydown", event => this.handleKey(event));
            root.tabIndex = 0;
            root.focus();
            this.resizeObserver = new ResizeObserver(() => this.saveSize(record));
            this.resizeObserver.observe(record.element);
        }

        async loadImageList() {
            if (!this.file?.path) return;
            const parent = this.file.path.substring(0, this.file.path.lastIndexOf("/")) || "/";
            const files = await window.TulipFS.list();
            this.images = files.filter(file => (file.path.substring(0, file.path.lastIndexOf("/")) || "/") === parent && isImage(file));
        }

        async selectImage(direction) {
            if (!this.images.length) return;
            const index = this.images.findIndex(file => file.path === this.file.path);
            const next = this.images[(index + direction + this.images.length) % this.images.length];
            if (!next || next.path === this.file.path) return;
            this.file = await window.TulipFS.get(next.path);
            this.zoom = 1; this.rotation = 0; this.flipX = 1; this.flipY = 1;
            this.record.element.querySelector(".window-title > span").textContent = `🖼 ${nameOf(this.file)}`;
            this.render();
        }

        handleClick(event) {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (!action) return;
            if (action === "next") this.selectImage(1);
            if (action === "previous") this.selectImage(-1);
            if (action === "zoom-in") this.changeZoom(.15);
            if (action === "zoom-out") this.changeZoom(-.15);
            if (action === "fit") this.fit();
            if (action === "original") { this.zoom = 1; this.applyTransform(); }
            if (action === "rotate-left") { this.rotation -= 90; this.applyTransform(); }
            if (action === "rotate-right") { this.rotation += 90; this.applyTransform(); }
            if (action === "flip-horizontal") { this.flipX *= -1; this.applyTransform(); }
            if (action === "flip-vertical") { this.flipY *= -1; this.applyTransform(); }
            if (action === "fullscreen") this.toggleFullscreen();
            if (action === "slideshow") this.toggleSlideshow();
            if (action === "play") this.togglePlayback();
            if (action === "pip") this.togglePictureInPicture();
        }

        handleWheel(event) {
            if (!isImage(this.file)) return;
            event.preventDefault();
            this.changeZoom(event.deltaY < 0 ? .1 : -.1);
        }

        handleKey(event) {
            if (event.key === "Escape") { if (document.fullscreenElement) document.exitFullscreen(); else this.stopSlideshow(); }
            if (!isImage(this.file)) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); this.selectImage(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); this.selectImage(1); }
            if (event.key === "+" || event.key === "=") this.changeZoom(.15);
            if (event.key === "-") this.changeZoom(-.15);
            if (event.key === "0") this.fit();
        }

        render() {
            const root = this.record?.content.querySelector(".media-viewer");
            if (!root || !this.file) return;
            const stage = root.querySelector("[data-role=stage]");
            const controls = root.querySelector("[data-role=media-controls]");
            const toolbar = root.querySelector("[data-role=toolbar]");
            const status = root.querySelector("[data-role=status]");
            stage.replaceChildren(); controls.replaceChildren(); controls.hidden = true;
            stage.classList.toggle("is-media", !isImage(this.file));
            toolbar.querySelectorAll("[data-action=previous],[data-action=next],[data-action=zoom-out],[data-action=zoom-in],[data-action=fit],[data-action=original],[data-action=rotate-left],[data-action=rotate-right],[data-action=flip-horizontal],[data-action=flip-vertical],[data-action=slideshow]").forEach(button => { button.hidden = !isImage(this.file); });
            status.textContent = `${nameOf(this.file)} · ${Math.round((this.file.content.length * 3) / 4 / 1024)} KB`;
            const source = sourceFor(this.file);
            if (!source) return this.showError(stage, "This media file cannot be read.");
            if (isImage(this.file)) this.renderImage(stage, source);
            else this.renderMedia(stage, controls, source);
        }

        renderImage(stage, source) {
            const image = new Image();
            image.className = "media-viewer-image";
            image.alt = nameOf(this.file);
            image.loading = "lazy";
            image.onload = () => { stage.replaceChildren(image); this.fit(); };
            image.onerror = () => this.showError(stage, "This image is broken or uses an unsupported encoding.");
            image.src = source;
        }

        renderMedia(stage, controls, source) {
            const video = extensionOf(this.file.path) === "mp4" || extensionOf(this.file.path) === "webm";
            const media = document.createElement(video ? "video" : "audio");
            media.className = video ? "media-viewer-video" : "media-viewer-audio";
            media.src = source; media.preload = "metadata"; media.controls = false;
            media.addEventListener("error", () => this.showError(stage, "This media file is corrupted or cannot be played."), { once: true });
            media.addEventListener("timeupdate", () => { const seek = controls.querySelector("[data-role=seek]"); const time = controls.querySelector("[data-role=time]"); if (seek && Number.isFinite(media.duration)) seek.value = String((media.currentTime / media.duration) * 100); if (time) time.textContent = `${this.formatTime(media.currentTime)} / ${this.formatTime(media.duration)}`; });
            media.addEventListener("ended", () => { const play = controls.querySelector("[data-action=play]"); if (play) play.textContent = "▶"; });
            stage.append(media);
            controls.hidden = false;
            controls.innerHTML = '<button type="button" data-action="play" title="Play or pause">▶</button><input data-role="seek" type="range" min="0" max="100" value="0" aria-label="Seek"><span data-role="time">0:00</span><input data-role="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"><select data-role="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button type="button" data-action="pip" title="Picture in picture" hidden>PiP</button>';
            const seek = controls.querySelector("[data-role=seek]");
            seek.addEventListener("input", () => { if (Number.isFinite(media.duration)) media.currentTime = media.duration * Number(seek.value) / 100; });
            controls.querySelector("[data-role=volume]").addEventListener("input", event => { media.volume = Number(event.target.value); });
            controls.querySelector("[data-role=speed]").addEventListener("change", event => { media.playbackRate = Number(event.target.value); });
            if (video && document.pictureInPictureEnabled) controls.querySelector("[data-action=pip]").hidden = false;
        }

        showError(stage, message) { stage.replaceChildren(Object.assign(document.createElement("div"), { className: "media-viewer-error", innerHTML: `<strong>Unable to open media</strong><span>${message}</span>` })); this.notifications.show(message, "error"); }
        changeZoom(amount) { this.zoom = Math.max(.1, Math.min(8, this.zoom + amount)); this.applyTransform(); }
        applyTransform() { const image = this.record?.content.querySelector(".media-viewer-image"); if (image) image.style.transform = `scale(${this.zoom}) rotate(${this.rotation}deg) scaleX(${this.flipX}) scaleY(${this.flipY})`; }
        fit() { const image = this.record?.content.querySelector(".media-viewer-image"); const stage = this.record?.content.querySelector("[data-role=stage]"); if (!image || !stage || !image.naturalWidth) return; this.zoom = Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight, 1); this.applyTransform(); }
        toggleFullscreen() { const stage = this.record?.content.querySelector("[data-role=stage]"); if (!stage) return; document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.(); }
        togglePlayback() { const media = this.record?.content.querySelector("video,audio"); const play = this.record?.content.querySelector("[data-action=play]"); if (!media) return; if (media.paused) { media.play().catch(() => this.notifications.show("Playback was blocked by the browser", "error")); if (play) play.textContent = "❚❚"; } else { media.pause(); if (play) play.textContent = "▶"; } }
        async togglePictureInPicture() { const video = this.record?.content.querySelector("video"); if (!video?.requestPictureInPicture) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch { this.notifications.show("Picture-in-picture is unavailable for this video", "error"); } }
        toggleSlideshow() { this.slideshowTimer ? this.stopSlideshow() : (this.slideshowTimer = window.setInterval(() => this.selectImage(1), 4000), this.notifications.show("Slideshow started")); }
        stopSlideshow(notify = true) { if (!this.slideshowTimer) return; window.clearInterval(this.slideshowTimer); this.slideshowTimer = null; if (notify) this.notifications.show("Slideshow stopped"); }
        formatTime(seconds) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
        applySavedSize(record) { try { const size = JSON.parse(localStorage.getItem(this.sizeKey)); if (size?.width && size?.height) { record.element.style.width = `${size.width}px`; record.element.style.height = `${size.height}px`; } } catch { /* Invalid saved dimensions are ignored. */ } }
        saveSize(record) { if (!record?.element.isConnected || record.maximized) return; const { width, height } = record.element.getBoundingClientRect(); localStorage.setItem(this.sizeKey, JSON.stringify({ width: Math.round(width), height: Math.round(height) })); }
        destroy() { this.stopSlideshow(false); this.resizeObserver?.disconnect(); this.resizeObserver = null; this.record = null; }
    };
})();
