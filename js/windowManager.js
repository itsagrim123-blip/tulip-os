window.WindowManager = class WindowManager {
    constructor(container, taskbar) {
        this.container = container;
        this.taskbar = taskbar;
        this.records = new Map();
        this.highestZ = 20;
        this.cascade = 0;
        this.drag = null;
        container.addEventListener("pointerdown", event => this.handlePointerDown(event));
        container.addEventListener("click", event => this.handleClick(event));
        window.addEventListener("pointermove", event => this.handlePointerMove(event));
        window.addEventListener("pointerup", () => this.finishDrag());
        window.addEventListener("resize", () => this.keepWindowsVisible());
    }

    create({ appId, title, content, className = "", singleton = true, onMount, onClose }) {
        const existing = singleton && this.records.get(appId);
        if (existing) {
            existing.restore();
            existing.focus();
            return existing;
        }
        const element = document.createElement("section");
        element.className = `window ${className}`.trim();
        element.dataset.appId = appId;
        element.innerHTML = `<header class="window-title"><span></span><div class="window-buttons"><button type="button" data-window-action="minimize" aria-label="Minimize">—</button><button type="button" data-window-action="maximize" aria-label="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close">✕</button></div></header><div class="window-content"></div>`;
        element.querySelector(".window-title > span").textContent = title;
        const contentRoot = element.querySelector(".window-content");
        if (typeof content === "string") contentRoot.innerHTML = content;
        else if (content) contentRoot.append(content);

        const record = {
            appId, element, content: contentRoot, title, minimized: false, focused: false,
            maximized: false, restoreBounds: null, onClose,
            focus: () => this.focus(record),
            minimize: () => this.minimize(record),
            restore: () => this.restore(record),
            close: () => this.close(record),
            maximize: () => this.maximize(record),
            snap: position => this.snap(record, position)
        };
        this.positionCascade(element);
        this.container.append(element);
        this.records.set(appId, record);
        this.taskbar.register(record);
        this.focus(record);
        onMount?.(record);
        return record;
    }

    positionCascade(element) {
        const offset = (this.cascade++ % 9) * 28;
        element.style.left = `${Math.min(100 + offset, Math.max(16, window.innerWidth - 300))}px`;
        element.style.top = `${Math.min(70 + offset, Math.max(16, window.innerHeight - 200))}px`;
    }

    handlePointerDown(event) {
        const element = event.target.closest(".window");
        if (!element) return;
        const record = this.records.get(element.dataset.appId);
        if (!record) return;
        this.focus(record);
        if (!event.target.closest(".window-title") || event.target.closest("button") || record.maximized) return;
        const bounds = element.getBoundingClientRect();
        this.drag = { record, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
        element.classList.add("is-dragging");
        event.preventDefault();
    }

    handlePointerMove(event) {
        if (!this.drag) return;
        const { record, offsetX, offsetY } = this.drag;
        const width = record.element.offsetWidth;
        const height = record.element.offsetHeight;
        const maxX = Math.max(0, window.innerWidth - width);
        const maxY = Math.max(0, window.innerHeight - height - 82);
        record.element.style.left = `${Math.max(0, Math.min(event.clientX - offsetX, maxX))}px`;
        record.element.style.top = `${Math.max(0, Math.min(event.clientY - offsetY, maxY))}px`;
    }

    finishDrag() {
        if (!this.drag) return;
        this.drag.record.element.classList.remove("is-dragging");
        this.drag = null;
    }

    handleClick(event) {
        const action = event.target.closest("[data-window-action]")?.dataset.windowAction;
        if (!action) return;
        const element = event.target.closest(".window");
        const record = this.records.get(element?.dataset.appId);
        if (record) record[action]?.();
    }

    focus(record) {
        if (record.minimized) return this.restore(record);
        for (const candidate of this.records.values()) {
            candidate.focused = false;
            candidate.element.classList.remove("is-focused");
        }
        record.focused = true;
        record.element.classList.add("is-focused");
        record.element.style.zIndex = String(++this.highestZ);
        this.taskbar.update(record);
    }

    minimize(record) {
        record.minimized = true;
        record.element.hidden = true;
        record.focused = false;
        this.taskbar.update(record);
    }

    restore(record) {
        record.minimized = false;
        record.element.hidden = false;
        this.focus(record);
        this.taskbar.update(record);
    }

    maximize(record) {
        if (!record.maximized) {
            const bounds = record.element.getBoundingClientRect();
            record.restoreBounds = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
            record.element.classList.add("is-maximized");
            record.maximized = true;
        } else {
            const bounds = record.restoreBounds;
            record.element.classList.remove("is-maximized");
            Object.assign(record.element.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
            record.maximized = false;
        }
        this.focus(record);
    }

    // Exposed for future edge-drop / keyboard snap controls.
    snap(record, position) {
        const width = window.innerWidth;
        const height = window.innerHeight - 90;
        record.element.classList.remove("is-maximized");
        record.maximized = false;
        const bounds = {
            left: position === "right" ? width / 2 : 0,
            top: 0,
            width: position === "top" ? width : width / 2,
            height: position === "top" ? height : height
        };
        Object.assign(record.element.style, {
            left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`
        });
        record.element.dataset.snap = position;
        this.focus(record);
    }

    close(record) {
        this.records.delete(record.appId);
        record.element.remove();
        record.onClose?.();
        this.taskbar.unregister(record);
    }

    keepWindowsVisible() {
        for (const record of this.records.values()) {
            if (record.maximized) continue;
            const width = record.element.offsetWidth;
            const height = record.element.offsetHeight;
            record.element.style.left = `${Math.max(0, Math.min(record.element.offsetLeft, window.innerWidth - width))}px`;
            record.element.style.top = `${Math.max(0, Math.min(record.element.offsetTop, window.innerHeight - height - 82))}px`;
        }
    }
}
