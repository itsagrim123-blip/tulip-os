(function () {
    class FileExplorerApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.currentPath = "/";
            this.entries = [];
            this.visibleEntries = [];
            this.selectedIndices = new Set();
            this.lastSelectedIndex = null;
            this.record = null;
        }

        open() {
            const record = this.windowManager.create({ appId: "explorer", title: "📁 File Explorer", className: "explorer-window", content: this.createView(), onMount: current => this.bind(current) });
            this.record = record;
            this.loadFolder(this.currentPath);
        }

        createView() {
            const root = document.createElement("div");
            root.className = "file-explorer";
            root.innerHTML = '<div class="toolbar"><button id="backBtn" type="button">←</button><button type="button" data-action="upload">Upload</button><input type="file" data-role="upload" accept=".tapp,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.ico,.mp4,.webm,.mp3,.wav,.ogg" hidden><span id="currentPath">/</span></div><div id="fileGrid"></div>';
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".file-explorer");
            root.querySelector("#backBtn").addEventListener("click", () => this.goBack());
            root.querySelector("[data-action=upload]").addEventListener("click", () => root.querySelector("[data-role=upload]").click());
            root.querySelector("[data-role=upload]").addEventListener("change", event => this.upload(event));
            const grid = root.querySelector("#fileGrid");
            grid.addEventListener("click", event => this.handleGridClick(event));
            grid.addEventListener("contextmenu", event => this.openExplorerContextMenu(event));
            grid.addEventListener("dblclick", event => {
                const item = event.target.closest(".file-item");
                const file = item && this.visibleEntries[Number(item.dataset.index)];
                if (!file) return;
                if (file.type === "folder") this.loadFolder(file.path);
                else this.openFile(file);
            });
        }

        async upload(event) {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const extension = file.name.split(".").pop().toLowerCase();
            if (!window.TulipMedia?.isSupported({ path: file.name }) && extension !== "zip" && extension !== "tapp") {
                this.notifications.show(`Unsupported file type: .${extension || "unknown"}`, "error");
                return;
            }
            try {
                const content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error("The file could not be read."));
                    reader.readAsDataURL(file);
                });
                const path = await this.getAvailablePath(this.currentPath, file.name);
                await window.TulipFS.create(path, "file", content);
                await this.loadFolder(this.currentPath);
                this.notifications.show(`${file.name} uploaded`);
            } catch (error) {
                console.error("Unable to import media", error);
                this.notifications.show("Unable to import this media file", "error");
            }
        }

        async openFile(file, openWith = false) {
            if (file.path.toLowerCase().endsWith(".tapp")) {
                const packageData = await window.TulipFS.get(file.path);
                window.__tulipInstaller?.open(packageData?.content, file.path);
                return;
            }
            if (file.path.toLowerCase().endsWith(".zip")) {
                window.__tulipLauncher?.open("archive", file.path);
                return;
            }
            if (window.TulipMedia?.isSupported(file)) {
                if (window.TulipMedia?.isMedia(file) && window.__tulipLauncher) {
                    window.__tulipLauncher.open("media-player", file);
                    return;
                }
                const viewer = window.__tulipMediaViewer;
                if (viewer) await viewer.open(file);
                else this.notifications.show("Media Viewer is unavailable", "error");
                return;
            }
            if (openWith) {
                this.notifications.show("No compatible Tulip app can open this file", "error");
                return;
            }
            const opened = await window.TulipFS.get(file.path);
            alert(opened?.content ?? "This file is empty.");
        }

        openExplorerContextMenu(event) {
            const item = event.target.closest(".file-item");
            if (item) {
                const index = Number(item.dataset.index);
                if (!this.selectedIndices.has(index)) { this.selectedIndices.clear(); this.selectedIndices.add(index); }
                this.lastSelectedIndex = index;
                this.updateSelectionVisual();
            }
            event.preventDefault();
            const menu = document.getElementById("contextMenu");
            if (!menu) return;
            menu.style.left = `${event.pageX}px`; menu.style.top = `${event.pageY}px`; menu.style.display = "block";
            const selected = this.getSelectedEntries();
            const single = selected.length === 1 ? selected[0] : null;
            const show = (id, visible) => { const control = menu.querySelector(id); if (control) control.style.display = visible ? "block" : "none"; };
            show("#openBtn", Boolean(single)); show("#openWithBtn", Boolean(single)); show("#renameBtn", Boolean(single)); show("#deleteBtn", selected.length > 0);
            show("#newFolderBtn", true); show("#newFileBtn", true); show("#pasteBtn", true); show("#refreshBtn", true); show("#propertiesBtn", true);
            menu.querySelector("#openBtn").onclick = async () => { menu.style.display = "none"; if (single) await this.openFile(single); };
            menu.querySelector("#openWithBtn").onclick = async () => { menu.style.display = "none"; if (single) await this.openFile(single, true); };
            menu.querySelector("#newFolderBtn").onclick = async () => { menu.style.display = "none"; await this.createInlineEntry({ targetPath: this.currentPath, type: "folder", initialName: "New Folder", x: event.pageX, y: event.pageY }); };
            menu.querySelector("#newFileBtn").onclick = async () => { menu.style.display = "none"; await this.createInlineEntry({ targetPath: this.currentPath, type: "file", initialName: "New File.txt", x: event.pageX, y: event.pageY }); };
            menu.querySelector("#refreshBtn").onclick = async () => { menu.style.display = "none"; await this.loadFolder(this.currentPath); };
            menu.querySelector("#propertiesBtn").onclick = () => { menu.style.display = "none"; this.showProperties(selected); };
            menu.querySelector("#renameBtn").onclick = async () => { if (!single) return; const next = await window.TulipPrompt("Rename", single.path.split("/").pop()); if (!next) return; await window.TulipFS.rename(single.path, `${single.path.substring(0, single.path.lastIndexOf("/"))}/${next}`.replace(/\/+/, "/")); menu.style.display = "none"; await this.loadFolder(this.currentPath); };
            menu.querySelector("#deleteBtn").onclick = async () => { for (const file of selected) { const target = this.currentPath === "/Recycle Bin" ? null : `/Recycle Bin/${file.path.split("/").pop()}`; if (target) await window.TulipFS.move(file.path, target); else await window.TulipFS.delete(file.path); if (window.TulipMedia?.isSupported(file)) this.notifications.show(`Deleted ${file.path.split("/").pop()}`); } menu.style.display = "none"; await this.loadFolder(this.currentPath); };
        }

        showProperties(files) {
            if (!files.length) return alert("No item selected.");
            if (files.length > 1) return alert(`${files.length} items selected.`);
            const file = files[0]; const size = file.content ? `${Math.round(file.content.length * 3 / 4)} bytes` : "0 bytes";
            alert(`Name: ${file.path.split("/").pop()}\nType: ${file.type}\nSize: ${size}\nPath: ${file.path}`);
        }

        async createInlineEntry({ targetPath, type, initialName, x, y }) {
            const entryPath = await this.getAvailablePath(targetPath, initialName);
            await window.TulipFS.create(entryPath, type, "");
            await window.TulipInlineEditor({ x, y, initialValue: entryPath.split("/").pop(), placeholder: type === "folder" ? "Folder name" : "File name", onSubmit: async value => { if (value && value !== entryPath.split("/").pop()) await window.TulipFS.rename(entryPath, `${targetPath}/${value}`.replace(/\/+/g, "/")); await this.loadFolder(this.currentPath); } });
        }

        async getAvailablePath(targetPath, initialName) {
            const entries = await window.TulipFS.list(); const parent = targetPath.replace(/\/+$/g, "") || "/";
            const names = new Set(entries.filter(entry => (entry.path.substring(0, entry.path.lastIndexOf("/")) || "/") === parent).map(entry => entry.path.split("/").pop()));
            let name = initialName; let number = 2; while (names.has(name)) name = `${initialName} ${number++}`;
            return `${parent}/${name}`.replace(/\/+/g, "/");
        }

        async loadFolder(path = "/") {
            if (!window.TulipFS?.list) return this.notifications.show("Filesystem is not ready yet", "error");
            this.currentPath = path;
            const files = await window.TulipFS.list();
            this.entries = files; this.visibleEntries = files.filter(file => (file.path.substring(0, file.path.lastIndexOf("/")) || "/") === path);
            this.clearSelection(); this.render();
        }

        async goBack() { if (this.currentPath !== "/") await this.loadFolder(this.currentPath.substring(0, this.currentPath.lastIndexOf("/")) || "/"); }
        handleGridClick(event) { const item = event.target.closest(".file-item"); if (!item) return this.clearSelection(); const index = Number(item.dataset.index); if (event.ctrlKey) this.selectedIndices.has(index) ? this.selectedIndices.delete(index) : this.selectedIndices.add(index); else { this.selectedIndices.clear(); this.selectedIndices.add(index); } this.lastSelectedIndex = index; this.updateSelectionVisual(); }
        clearSelection() { this.selectedIndices.clear(); this.lastSelectedIndex = null; this.updateSelectionVisual(); }
        updateSelectionVisual() { this.record?.content.querySelectorAll(".file-item").forEach(item => item.classList.toggle("selected", this.selectedIndices.has(Number(item.dataset.index)))); }
        getSelectedEntries() { return [...this.selectedIndices].sort((a, b) => a - b).map(index => this.visibleEntries[index]).filter(Boolean); }

        render() {
            const grid = this.record?.content.querySelector("#fileGrid"); const label = this.record?.content.querySelector("#currentPath"); if (!grid || !label) return;
            label.textContent = this.currentPath; grid.replaceChildren(...this.visibleEntries.map((file, index) => {
                const item = document.createElement("div"); item.className = "file-item"; item.dataset.index = index; item.dataset.path = file.path;
                const icon = file.type === "folder" ? "📁" : window.TulipMedia?.isImage(file) ? "🖼️" : window.TulipMedia?.isMedia(file) ? "🎵" : "📄";
                item.innerHTML = `<div class="icon">${icon}</div><img class="file-thumbnail" alt="" hidden><div class="name"></div>`; item.querySelector(".name").textContent = file.path.split("/").pop();
                if (window.TulipMedia?.isImage(file)) this.loadThumbnail(file, item); return item;
            }));
        }

        async loadThumbnail(file, item) { const thumbnail = await window.TulipMedia.createThumbnail(file); const image = item.querySelector(".file-thumbnail"); if (!thumbnail || !item.isConnected || !image) return; image.src = thumbnail; image.hidden = false; item.querySelector(".icon").hidden = true; }
    }
    window.FileExplorerApp = FileExplorerApp;
})();
