const STORAGE_KEY = "tulip.desktopLayout";

window.DesktopController = class DesktopController {
    constructor({ iconsRoot, desktop, menu, apps, onLaunch, onWallpaper, onLock }) {
        this.iconsRoot = iconsRoot;
        this.desktop = desktop;
        this.menu = menu;
        this.apps = apps;
        this.onLaunch = onLaunch;
        this.drag = null;
        this.suppressClick = false;
        this.selectedIcon = null;
        this.selectedFile = null;
        this.desktopFiles = [];
        this.dragState = null;
        this.layout = this.loadLayout();
        this.render();
        iconsRoot.addEventListener("pointerdown", event => this.startPointer(event));
        window.addEventListener("pointermove", event => this.movePointer(event));
        window.addEventListener("pointerup", event => this.endPointer(event));
        iconsRoot.addEventListener("click", event => this.openFromClick(event));
        desktop.addEventListener("contextmenu", event => this.showMenu(event));
        menu.addEventListener("click", event => this.handleMenu(event));
        document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) menu.hidden = true; });
        document.addEventListener("mousemove", event => this.handleFileDragMove(event));
        document.addEventListener("mouseup", () => this.handleFileDragEnd());
        document.addEventListener("click", () => { const menu = document.getElementById("contextMenu"); if (menu) menu.style.display = "none"; });
        this.onWallpaper = onWallpaper;
        this.onLock = onLock;
        this.contextMenu = document.getElementById("contextMenu");
    }

    loadLayout() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && Array.isArray(saved.order)) return saved;
        } catch { /* invalid local storage is safely ignored */ }
        return { mode: "grid", order: Object.keys(this.apps), positions: {} };
    }

    saveLayout() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout)); }

    render() {
        const validOrder = this.layout.order.filter(id => this.apps[id]);
        for (const id of Object.keys(this.apps)) if (!validOrder.includes(id)) validOrder.push(id);
        this.layout.order = validOrder;
        this.layout.positions ||= {};
        this.iconsRoot.classList.toggle("is-free-layout", this.layout.mode === "free");
        this.iconsRoot.replaceChildren(...validOrder.map((id, index) => {
            const app = this.apps[id];
            const icon = document.createElement("button");
            icon.type = "button";
            icon.className = "desktop-icon";
            icon.dataset.app = id;
            icon.innerHTML = `<span class="icon-image">${app.icon}</span><span class="icon-text"></span>`;
            icon.querySelector(".icon-text").textContent = app.name;
            if (this.layout.mode === "free") {
                const position = this.layout.positions[id] || { left: (index % 6) * 112, top: Math.floor(index / 6) * 132 };
                icon.style.left = `${position.left}px`;
                icon.style.top = `${position.top}px`;
            }
            return icon;
        }));
        this.renderDesktopFiles();
    }

    async loadDesktop() {
        if (!window.TulipFS?.list) return;
        const files = await window.TulipFS.list();
        const desktopFiles = files.filter(file => {
            const parent = file.path.substring(0, file.path.lastIndexOf("/")) || "/";
            return parent === "/Desktop";
        });
        this.desktopFiles = desktopFiles;
        this.renderDesktopFiles();
    }

    renderDesktopFiles() {
        this.iconsRoot.querySelectorAll(".desktop-file-icon").forEach(icon => icon.remove());

        this.desktopFiles.forEach((file, index) => {
            const icon = document.createElement("div");
            icon.className = "desktop-icon desktop-file-icon";
            icon.dataset.path = file.path;
            const position = file.position || { x: 120, y: 180 + index * 95 };
            icon.style.left = `${position.x}px`;
            icon.style.top = `${position.y}px`;
            icon.innerHTML = `
                <img src="${file.type === "folder" ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 64 64'%3E%3Cpath fill='%23ffd466' d='M8 16h20l6 8h22v24H8z'/%3E%3Cpath fill='%23ffb703' d='M8 16h20l6 8h22v24H8z'/%3E%3C/svg%3E" : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 64 64'%3E%3Crect x='12' y='8' width='40' height='48' rx='6' fill='%233f8cff'/%3E%3Cpath fill='white' d='M24 20h16v4H24zm0 10h16v4H24zm0 10h10v4H24z'/%3E%3C/svg%3E"}">
                <div class="desktop-name">${file.path.split("/").pop()}</div>
            `;
            icon.addEventListener("click", () => this.selectDesktopFile(icon, file));
            icon.addEventListener("contextmenu", event => this.openDesktopContextMenu(event, file));
            icon.addEventListener("dblclick", async () => {
                if (file.type === "folder") {
                    window.openFileExplorer?.(file.path);
                } else {
                    const opened = await window.TulipFS.get(file.path);
                    alert(opened?.content ?? "This file is empty.");
                }
            });
            icon.addEventListener("mousedown", event => this.startFileDrag(event, icon, file));
            this.iconsRoot.appendChild(icon);
        });
    }

    selectDesktopFile(icon, file) {
        this.iconsRoot.querySelectorAll(".desktop-file-icon.selected").forEach(item => item.classList.remove("selected"));
        icon.classList.add("selected");
        this.selectedIcon = file;
        this.selectedFile = file;
    }

    showContextMenu(event, file = null) {
        event.preventDefault();
        this.selectedFile = file;
        const menu = this.contextMenu;
        if (!menu) return;
        menu.style.left = `${event.pageX}px`;
        menu.style.top = `${event.pageY}px`;
        menu.style.display = "block";

        const renameBtn = menu.querySelector("#renameBtn");
        const deleteBtn = menu.querySelector("#deleteBtn");
        const openBtn = menu.querySelector("#openBtn");
        const openWithBtn = menu.querySelector("#openWithBtn");
        if (renameBtn) renameBtn.style.display = file ? "block" : "none";
        if (deleteBtn) deleteBtn.style.display = file ? "block" : "none";
        if (openBtn) openBtn.style.display = "none";
        if (openWithBtn) openWithBtn.style.display = "none";

        const currentPath = "/Desktop";
        menu.querySelector("#newFolderBtn").onclick = async () => {
            menu.style.display = "none";
            await this.createInlineEntry({ targetPath: currentPath, type: "folder", initialName: "New Folder", x: event.pageX, y: event.pageY });
        };
        menu.querySelector("#newFileBtn").onclick = async () => {
            menu.style.display = "none";
            await this.createInlineEntry({ targetPath: currentPath, type: "file", initialName: "New File.txt", x: event.pageX, y: event.pageY });
        };
        menu.querySelector("#pasteBtn").onclick = () => {
            menu.style.display = "none";
        };
        menu.querySelector("#refreshBtn").onclick = async () => {
            menu.style.display = "none";
            await this.loadDesktop();
        };
        menu.querySelector("#propertiesBtn").onclick = () => {
            menu.style.display = "none";
            alert("Properties are not available yet.");
        };
        menu.querySelector("#renameBtn").onclick = async () => {
            if (!file) return;
            const newName = await window.TulipPrompt("Rename", file.path.split("/").pop());
            if (!newName) return;
            const newPath = `${file.path.substring(0, file.path.lastIndexOf("/"))}/${newName}`.replace(/\/+/g, "/") || `/${newName}`;
            await window.TulipFS.rename(file.path, newPath);
            menu.style.display = "none";
            await this.loadDesktop();
        };
        menu.querySelector("#deleteBtn").onclick = async () => {
            if (!file) return;
            const fileName = file.path.split("/").pop();
            await window.TulipFS.move(file.path, `/Recycle Bin/${fileName}`);
            menu.style.display = "none";
            await this.loadDesktop();
        };
    }

    openDesktopContextMenu(event, file) {
        this.showContextMenu(event, file);
    }

    async createInlineEntry({ targetPath, type, initialName, x, y }) {
        const entryPath = await this.getAvailablePath(targetPath, initialName);
        await window.TulipFS.create(entryPath, type === "folder" ? "folder" : "file", "");
        const newName = await window.TulipInlineEditor({
            x,
            y,
            initialValue: entryPath.split("/").pop(),
            placeholder: type === "folder" ? "Folder name" : "File name",
            onSubmit: async value => {
                if (value && value !== entryPath.split("/").pop()) {
                    const target = `${targetPath}/${value}`.replace(/\/+/g, "/");
                    await window.TulipFS.rename(entryPath, target);
                }
                await this.loadDesktop();
            }
        });
        if (newName === null || newName === "") {
            await this.loadDesktop();
        }
    }

    async getAvailablePath(targetPath, initialName) {
        const entries = await window.TulipFS.list();
        const parentPath = targetPath.replace(/\/+$/g, "") || "/";
        const existingNames = new Set(entries.filter(entry => {
            const parent = entry.path.substring(0, entry.path.lastIndexOf("/")) || "/";
            return parent === parentPath;
        }).map(entry => entry.path.split("/").pop()));

        let candidate = initialName;
        let counter = 2;
        while (existingNames.has(candidate)) {
            candidate = `${initialName} ${counter}`;
            counter += 1;
        }
        return `${parentPath}/${candidate}`.replace(/\/+/g, "/");
    }

    startFileDrag(event, icon, file) {
        if (event.button !== 0) return;
        event.preventDefault();
        this.dragState = {
            icon,
            file,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: parseInt(icon.style.left, 10) || 0,
            startTop: parseInt(icon.style.top, 10) || 0
        };
    }

    handleFileDragMove(event) {
        if (!this.dragState) return;
        const dx = event.clientX - this.dragState.startX;
        const dy = event.clientY - this.dragState.startY;
        this.dragState.icon.style.left = `${this.dragState.startLeft + dx}px`;
        this.dragState.icon.style.top = `${this.dragState.startTop + dy}px`;
    }

    async handleFileDragEnd() {
        if (!this.dragState) return;
        const { icon, file } = this.dragState;
        this.dragState = null;
        const nextX = parseInt(icon.style.left, 10) || 0;
        const nextY = parseInt(icon.style.top, 10) || 0;
        file.position = { x: nextX, y: nextY };
        await window.TulipFS.create(file.path, file.type, file.content, file.position);
    }

    setMode(mode) {
        if (!['grid', 'free'].includes(mode)) return;
        if (mode === "free") {
            this.layout.order.forEach((id, index) => {
                this.layout.positions[id] ||= { left: (index % 6) * 112, top: Math.floor(index / 6) * 132 };
            });
        }
        this.layout.mode = mode;
        this.saveLayout();
        this.render();
    }

    startPointer(event) {
        const icon = event.target.closest(".desktop-icon");
        if (!icon || icon.classList.contains("desktop-file-icon") || event.button !== 0) return;
        this.drag = { icon, startX: event.clientX, startY: event.clientY, moved: false };
    }

    movePointer(event) {
        if (!this.drag) return;
        const dx = event.clientX - this.drag.startX;
        const dy = event.clientY - this.drag.startY;
        if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
        this.drag.moved = true;
        this.drag.icon.classList.add("is-dragging");
        this.drag.icon.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    endPointer(event) {
        if (!this.drag) return;
        const { icon, moved } = this.drag;
        this.drag = null;
        icon.classList.remove("is-dragging");
        icon.style.transform = "";
        if (!moved) return;
        this.suppressClick = true;
        if (this.layout.mode === "free") {
            const bounds = this.iconsRoot.getBoundingClientRect();
            const left = Math.max(0, Math.min(event.clientX - bounds.left - 40, bounds.width - 80));
            const top = Math.max(0, Math.min(event.clientY - bounds.top - 45, bounds.height - 90));
            this.layout.positions[icon.dataset.app] = this.findOpenPosition(left, top, icon.dataset.app, bounds);
            this.saveLayout();
            this.render();
            return;
        }
        const icons = [...this.iconsRoot.children];
        const target = icons.reduce((closest, candidate) => {
            const bounds = candidate.getBoundingClientRect();
            const distance = Math.hypot(event.clientX - (bounds.left + bounds.width / 2), event.clientY - (bounds.top + bounds.height / 2));
            return !closest || distance < closest.distance ? { candidate, distance } : closest;
        }, null)?.candidate;
        const from = this.layout.order.indexOf(icon.dataset.app);
        const to = this.layout.order.indexOf(target?.dataset.app);
        if (from >= 0 && to >= 0 && from !== to) {
            this.layout.order.splice(from, 1);
            this.layout.order.splice(to, 0, icon.dataset.app);
            this.saveLayout();
            this.render();
        }
    }

    findOpenPosition(left, top, appId, bounds) {
        const stepX = 100;
        const stepY = 110;
        let candidate = { left: Math.round(left / stepX) * stepX, top: Math.round(top / stepY) * stepY };
        const occupied = position => Object.entries(this.layout.positions).some(([id, other]) => id !== appId && Math.abs(other.left - position.left) < 80 && Math.abs(other.top - position.top) < 90);
        while (occupied(candidate)) {
            candidate.left += stepX;
            if (candidate.left > bounds.width - 80) { candidate.left = 0; candidate.top += stepY; }
            if (candidate.top > bounds.height - 90) return { left: Math.max(0, bounds.width - 80), top: Math.max(0, bounds.height - 90) };
        }
        return candidate;
    }

    openFromClick(event) {
        const icon = event.target.closest(".desktop-icon");
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }
        if (icon?.dataset.app && !this.drag) this.onLaunch(icon.dataset.app);
    }

    showMenu(event) {
        if (event.target.closest(".window, #taskbar, #start-menu")) return;
        if (event.target.closest(".desktop-file-icon, .desktop-icon")) return;
        event.preventDefault();
        this.showContextMenu(event);
    }

    handleMenu(event) {
        const action = event.target.closest("[data-desktop-action]")?.dataset.desktopAction;
        if (action === "wallpaper") this.onWallpaper();
        if (action === "lock") this.onLock();
        this.menu.hidden = true;
    }
}
