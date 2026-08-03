(() => {
    "use strict";

    window.WallpaperManagerApp = class WallpaperManagerApp {
        constructor(windowManager, wallpaper, notifications) {
            this.windowManager = windowManager;
            this.wallpaper = wallpaper;
            this.notifications = notifications;
            this.record = null;
            this.previewWallpaper = null;
            this.pendingFile = null;
        }

        open() {
            const record = this.windowManager.create({
                appId: "wallpaper-manager",
                title: "🖼 Wallpaper Manager",
                className: "wallpaper-manager-window",
                content: this.createView(),
                onMount: current => this.bind(current),
                onClose: () => {
                    this.record = null;
                    this.previewWallpaper = null;
                }
            });
            this.record = record;
        }

        createView() {
            const root = document.createElement("div");
            root.className = "wallpaper-manager-app";
            root.innerHTML = `
                <div class="wallpaper-manager-header">
                    <div>
                        <p class="settings-eyebrow">DESKTOP</p>
                        <h2>Wallpaper Manager</h2>
                        <p>Apply, upload, organize, and rename wallpapers from one polished workspace.</p>
                    </div>
                    <div class="wallpaper-manager-actions">
                        <label class="toolbar-btn wallpaper-upload-label">
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" hidden data-role="file-input">
                            ⬆ Upload Wallpaper
                        </label>
                        <button type="button" data-action="open-picker">🎨 Quick Picker</button>
                        <button type="button" data-action="refresh">↻ Refresh</button>
                    </div>
                </div>
                <div class="wallpaper-manager-grid">
                    <section class="wallpaper-manager-sidebar">
                        <div class="wallpaper-manager-card">
                            <div class="wallpaper-dropzone" data-role="dropzone">Drop an image here or use upload to preview it instantly.</div>
                            <div class="wallpaper-preview-card" data-role="preview-card" hidden>
                                <img alt="Wallpaper preview" data-role="preview-image" loading="lazy" decoding="async">
                                <div class="wallpaper-preview-copy">
                                    <h3 data-role="preview-name">Preview</h3>
                                    <p data-role="preview-meta">Ready to apply</p>
                                    <div class="wallpaper-preview-actions">
                                        <button type="button" data-action="save-preview">Apply</button>
                                        <button type="button" data-action="discard-preview">Discard</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="wallpaper-manager-card">
                            <h3>Current wallpaper</h3>
                            <div class="current-wallpaper-card" data-role="current-wallpaper"></div>
                        </div>
                    </section>
                    <section class="wallpaper-manager-main">
                        <div class="wallpaper-manager-card">
                            <div class="wallpaper-manager-list-toolbar">
                                <h3>Available wallpapers</h3>
                                <p>Default, custom, and saved options all stay in sync with the desktop engine.</p>
                            </div>
                            <div class="wallpaper-manager-list" data-role="wallpaper-list"></div>
                        </div>
                    </section>
                </div>
            `;
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".wallpaper-manager-app");
            root.addEventListener("click", event => this.handleClick(event, root));
            root.addEventListener("change", event => this.handleFileSelection(event, root));
            root.addEventListener("dragover", event => this.handleDragOver(event));
            root.addEventListener("drop", event => this.handleDrop(event, root));
            this.render(root);
        }

        handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        }

        async handleDrop(event, root) {
            event.preventDefault();
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            await this.prepareWallpaper(file, root);
        }

        async handleFileSelection(event, root) {
            const input = event.target.closest("[data-role=file-input]");
            if (!input) return;
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            await this.prepareWallpaper(file, root);
        }

        async prepareWallpaper(file, root) {
            try {
                const preview = await this.wallpaper.createWallpaperPreview(file);
                this.previewWallpaper = preview;
                this.renderPreview(root);
                this.notifications?.show(`Preview ready: ${preview.name}`);
            } catch (error) {
                this.previewWallpaper = null;
                this.renderPreview(root);
                this.notifications?.show(error.message || "Unable to prepare wallpaper.", "error");
            }
        }

        async handleClick(event, root) {
            if (event.target.closest("[data-action=save-preview]")) {
                if (!this.previewWallpaper) return;
                try {
                    const wallpaper = await this.wallpaper.saveWallpaperPreview(this.previewWallpaper);
                    this.previewWallpaper = null;
                    await this.render(root);
                    this.notifications?.show(`${wallpaper.name} added to your wallpaper gallery`);
                } catch (error) {
                    this.notifications?.show(error.message || "Unable to save wallpaper.", "error");
                }
                return;
            }
            if (event.target.closest("[data-action=discard-preview]")) {
                this.previewWallpaper = null;
                this.renderPreview(root);
                return;
            }
            if (event.target.closest("[data-action=open-picker]")) {
                await this.wallpaper.choose?.();
                await this.render(root);
                return;
            }
            if (event.target.closest("[data-action=refresh]")) {
                await this.render(root);
                return;
            }
            const applyButton = event.target.closest("[data-action=apply-wallpaper]");
            if (applyButton) {
                const wallpaperId = applyButton.dataset.wallpaperId;
                if (!wallpaperId) return;
                await this.wallpaper.apply(wallpaperId, true);
                await this.render(root);
                return;
            }
            const renameButton = event.target.closest("[data-action=rename-wallpaper]");
            if (renameButton) {
                const wallpaperId = renameButton.dataset.wallpaperId;
                const target = this.wallpaper.getCustomWallpapers?.().find(wallpaper => wallpaper.id === wallpaperId);
                if (!target) return;
                const nextName = await window.TulipPrompt("Rename wallpaper", target.name || "Wallpaper");
                if (!nextName) return;
                const updated = await this.wallpaper.renameWallpaper(wallpaperId, nextName);
                if (updated) {
                    await this.render(root);
                    this.notifications?.show(`Renamed to ${updated.name}`);
                } else {
                    this.notifications?.show("The wallpaper could not be renamed.", "error");
                }
                return;
            }
            const deleteButton = event.target.closest("[data-action=delete-wallpaper]");
            if (deleteButton) {
                const wallpaperId = deleteButton.dataset.wallpaperId;
                const deleted = await this.wallpaper.removeWallpaper(wallpaperId);
                if (deleted) {
                    await this.render(root);
                    this.notifications?.show("Wallpaper removed");
                } else {
                    this.notifications?.show("The wallpaper could not be removed.", "error");
                }
            }
        }

        async render(root) {
            await this.wallpaper.ensureCustomWallpapersLoaded?.();
            const selected = this.wallpaper.getSavedWallpaper?.() || this.wallpaper.defaultWallpaper;
            const list = root.querySelector("[data-role=wallpaper-list]");
            const current = root.querySelector("[data-role=current-wallpaper]");
            if (list) {
                const cards = [...this.wallpaper.getDefaultWallpapers?.() || [], ...this.wallpaper.getCustomWallpapers?.() || []];
                list.replaceChildren(...cards.map(wallpaper => this.createWallpaperCard(wallpaper, selected)));
            }
            if (current) {
                current.innerHTML = `
                    <div class="current-wallpaper-thumb" style="background-image:url('${selected.url || selected.dataUrl || ""}')"></div>
                    <div>
                        <strong>${selected.name || "Current wallpaper"}</strong>
                        <p>${selected.isCustom ? "Custom wallpaper" : "Built-in wallpaper"}</p>
                    </div>
                `;
            }
            this.renderPreview(root);
        }

        createWallpaperCard(wallpaper, selected) {
            const card = document.createElement("div");
            card.className = "wallpaper-manager-list-item";
            card.innerHTML = `
                <img class="wallpaper-manager-thumb" alt="${wallpaper.name} wallpaper" src="${wallpaper.url || wallpaper.dataUrl || ""}" loading="lazy" decoding="async">
                <div class="wallpaper-manager-item-copy">
                    <div class="wallpaper-manager-item-head">
                        <strong>${wallpaper.name}</strong>
                        <span class="wallpaper-badge">${wallpaper.isCustom ? "Custom" : "Built-in"}</span>
                    </div>
                    <p>${wallpaper.isCustom ? this.formatBytes(wallpaper.size || 0) : "Default desktop wallpaper"}</p>
                </div>
                <div class="wallpaper-manager-item-actions">
                    <button type="button" class="toolbar-btn" data-action="apply-wallpaper" data-wallpaper-id="${wallpaper.id}">Apply</button>
                    ${wallpaper.isCustom ? `<button type="button" class="toolbar-btn" data-action="rename-wallpaper" data-wallpaper-id="${wallpaper.id}">Rename</button><button type="button" class="toolbar-btn" data-action="delete-wallpaper" data-wallpaper-id="${wallpaper.id}">Delete</button>` : ""}
                </div>
            `;
            card.classList.toggle("is-selected", wallpaper.id === selected.id);
            return card;
        }

        renderPreview(root) {
            const previewCard = root.querySelector("[data-role=preview-card]");
            const image = root.querySelector("[data-role=preview-image]");
            const name = root.querySelector("[data-role=preview-name]");
            const meta = root.querySelector("[data-role=preview-meta]");
            if (!previewCard || !image || !name || !meta) return;
            if (!this.previewWallpaper) {
                previewCard.hidden = true;
                return;
            }
            previewCard.hidden = false;
            image.src = this.previewWallpaper.url;
            image.alt = this.previewWallpaper.name;
            name.textContent = this.previewWallpaper.name;
            meta.textContent = `${this.previewWallpaper.width || "?"}×${this.previewWallpaper.height || "?"} · ${this.formatBytes(this.previewWallpaper.size || 0)}`;
        }

        formatBytes(bytes) {
            if (!bytes) return "0 B";
            const units = ["B", "KB", "MB", "GB"];
            const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
            return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
        }
    };
})();
