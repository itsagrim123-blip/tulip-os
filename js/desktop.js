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
        this.layout = this.loadLayout();
        this.render();
        iconsRoot.addEventListener("pointerdown", event => this.startPointer(event));
        window.addEventListener("pointermove", event => this.movePointer(event));
        window.addEventListener("pointerup", event => this.endPointer(event));
        iconsRoot.addEventListener("click", event => this.openFromClick(event));
        desktop.addEventListener("contextmenu", event => this.showMenu(event));
        menu.addEventListener("click", event => this.handleMenu(event));
        document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) menu.hidden = true; });
        this.onWallpaper = onWallpaper;
        this.onLock = onLock;
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
        if (!icon || event.button !== 0) return;
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
        if (icon && !this.drag) this.onLaunch(icon.dataset.app);
    }

    showMenu(event) {
        if (event.target.closest(".window, #taskbar, #start-menu")) return;
        event.preventDefault();
        this.menu.hidden = false;
        this.menu.style.left = `${event.clientX}px`;
        this.menu.style.top = `${event.clientY}px`;
    }

    handleMenu(event) {
        const action = event.target.closest("[data-desktop-action]")?.dataset.desktopAction;
        if (action === "wallpaper") this.onWallpaper();
        if (action === "lock") this.onLock();
        this.menu.hidden = true;
    }
}
