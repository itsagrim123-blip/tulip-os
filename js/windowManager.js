(() => {
    "use strict";

    /** @typedef {{left:number,top:number,width:number,height:number}} WindowBounds */

    const STORAGE_KEY = "tulip.window-manager.v2";
    const DEFAULTS = Object.freeze({
        minWidth: 240,
        minHeight: 140,
        maxWidth: Number.POSITIVE_INFINITY,
        maxHeight: Number.POSITIVE_INFINITY,
        workspaceId: "workspace-1",
        monitorId: "primary",
        singleton: true,
        resizable: true,
        draggable: true,
        modal: false,
        animationDuration: 180
    });
    const SNAP_POSITIONS = new Set(["left", "right", "top", "bottom"]);
    const RESIZE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

    const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0;

    class ZIndexManager {
        constructor(base = 20) { this.base = base; this.current = base; }
        next() { return ++this.current; }
        reset(records) {
            this.current = this.base;
            for (const record of records) record.element.style.zIndex = String(this.next());
        }
    }

    class FocusManager {
        constructor(manager) { this.manager = manager; }
        focus(record, options = {}) {
            if (!record || record.closed || record.minimized) return false;
            if (!this.manager.isVisibleInActiveContext(record)) return false;
            for (const candidate of this.manager.records.values()) {
                const active = candidate === record;
                candidate.focused = active;
                candidate.element.classList.toggle("is-focused", active);
                candidate.element.setAttribute("aria-hidden", String(!active && candidate.modal));
            }
            record.element.style.zIndex = String(this.manager.zIndex.next());
            this.manager.activeWindow = record;
            record.element.focus({ preventScroll: true });
            if (!options.silent) this.manager.emit("focused", record);
            this.manager.taskbar?.update(record);
            return true;
        }
        focusNext() {
            const visible = [...this.manager.records.values()].filter(record => this.manager.isVisibleInActiveContext(record) && !record.minimized);
            if (!visible.length) return null;
            const index = visible.indexOf(this.manager.activeWindow);
            return this.focus(visible[(index + 1) % visible.length]) ? visible[(index + 1) % visible.length] : null;
        }
    }

    window.WindowManager = class WindowManager {
        /** @param {HTMLElement} container @param {object} taskbar */
        constructor(container, taskbar, options = {}) {
            if (!(container instanceof HTMLElement)) throw new TypeError("WindowManager requires an HTMLElement container.");
            if (!isObject(options)) throw new TypeError("WindowManager options must be an object.");
            this.container = container;
            this.taskbar = taskbar || null;
            this.records = new Map();
            this.recordsById = new Map();
            this.workspaces = new Map([["workspace-1", { id: "workspace-1", name: "Workspace 1" }]]);
            this.activeWorkspaceId = "workspace-1";
            this.monitors = new Map([["primary", { id: "primary", left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }]]);
            this.activeMonitorId = "primary";
            this.nextPid = 1000;
            this.cascade = 0;
            this.activeWindow = null;
            this.drag = null;
            this.resize = null;
            this.pendingPointer = null;
            this.interactionFrame = 0;
            this.hooks = new Map();
            this.sessionFactories = new Map();
            this.zIndex = new ZIndexManager(20);
            this.focusManager = new FocusManager(this);
            this.persistTimer = 0;
            this.sessionRestored = false;
            this.bindEvents();
            this.refreshMonitors();
        }

        bindEvents() {
            this.container.addEventListener("pointerdown", event => this.handlePointerDown(event));
            this.container.addEventListener("dblclick", event => this.handleDoubleClick(event));
            this.container.addEventListener("click", event => this.handleClick(event));
            this.container.addEventListener("keydown", event => this.handleKeyDown(event));
            window.addEventListener("pointermove", event => this.handlePointerMove(event));
            window.addEventListener("pointerup", event => this.finishInteraction(event));
            window.addEventListener("pointercancel", event => this.finishInteraction(event));
            window.addEventListener("resize", () => { this.refreshMonitors(); this.keepWindowsVisible(); });
            window.addEventListener("beforeunload", () => this.saveSession());
        }

        /** Create a window while preserving the original Tulip OS API. */
        create(options = {}) {
            if (!isObject(options) || typeof options.appId !== "string" || !options.appId.trim()) throw new TypeError("create requires a non-empty appId.");
            if (typeof options.title !== "string") throw new TypeError("create requires a string title.");
            const config = { ...DEFAULTS, ...options };
            if (config.parentId !== undefined && !this.recordsById.has(config.parentId)) throw new Error(`Parent window does not exist: ${config.parentId}`);
            const existing = this.records.get(config.appId);
            if (config.singleton && existing && !existing.closed) { existing.restore(); existing.focus(); return existing; }
            const pid = ++this.nextPid;
            const windowId = `window-${pid}`;
            const element = document.createElement("section");
            element.className = `window ${String(config.className || "")}`.trim();
            element.id = windowId;
            element.dataset.appId = config.appId;
            element.dataset.windowId = windowId;
            element.dataset.workspace = config.workspaceId;
            element.dataset.monitor = config.monitorId;
            element.tabIndex = -1;
            element.setAttribute("role", config.modal ? "dialog" : "application");
            element.setAttribute("aria-label", config.title);
            element.innerHTML = `<header class="window-title" data-window-drag-handle><span class="window-title-text"></span><div class="window-buttons"><button type="button" data-window-action="minimize" aria-label="Minimize window" title="Minimize">—</button><button type="button" data-window-action="maximize" aria-label="Maximize window" title="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close window" title="Close">✕</button></div></header><div class="window-content" tabindex="0"></div>`;
            element.querySelector(".window-title-text").textContent = config.title;
            const contentRoot = element.querySelector(".window-content");
            if (typeof config.content === "string") contentRoot.innerHTML = config.content;
            else if (config.content instanceof Node) contentRoot.append(config.content);
            else if (config.content !== undefined && config.content !== null) throw new TypeError("content must be a string or Node.");
            this.addResizeHandles(element, config);
            const record = this.createRecord(config, element, contentRoot, pid, windowId);
            this.positionCascade(record);
            this.container.append(element);
            this.records.set(config.appId, record);
            this.recordsById.set(windowId, record);
            this.taskbar?.register(record);
            this.applyContext(record);
            this.focus(record);
            try { config.onMount?.(record); } catch (error) { this.reportError(error, "window mount hook"); }
            this.emit("opened", record);
            this.scheduleSave();
            return record;
        }

        createRecord(config, element, content, pid, windowId) {
            const record = {
                appId: config.appId, windowId, pid, element, content, title: config.title, createdAt: Date.now(),
                minimized: false, focused: false, maximized: false, fullscreen: false, modal: Boolean(config.modal),
                closed: false, closing: false, snapped: null, restoreBounds: null, parentId: config.parentId || null,
                workspaceId: config.workspaceId, monitorId: config.monitorId, options: config, onClose: config.onClose,
                focus: () => this.focus(record), minimize: () => this.minimize(record), restore: () => this.restore(record),
                maximize: () => this.maximize(record), fullscreen: () => this.fullscreen(record), close: () => this.close(record),
                snap: position => this.snap(record, position), moveToWorkspace: id => this.moveToWorkspace(record, id),
                resizeTo: bounds => this.resizeTo(record, bounds), getBounds: () => this.getBounds(record),
                on: (event, callback) => this.on(record, event, callback)
            };
            return record;
        }

        addResizeHandles(element, config) {
            if (config.resizable === false) return;
            for (const direction of RESIZE_DIRECTIONS) {
                const handle = document.createElement("div");
                handle.className = `window-resize-handle window-resize-${direction}`;
                handle.dataset.resizeDirection = direction;
                handle.setAttribute("aria-hidden", "true");
                element.append(handle);
            }
        }

        handlePointerDown(event) {
            const element = event.target.closest(".window");
            if (!element || !this.container.contains(element)) return;
            const record = this.recordsById.get(element.dataset.windowId);
            if (!record || record.closed) return;
            this.focus(record);
            const direction = event.target.closest("[data-resize-direction]")?.dataset.resizeDirection;
            if (direction && record.options.resizable !== false && !record.maximized && !record.fullscreen) {
                this.resize = { record, direction, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, bounds: this.getBounds(record) };
                this.capturePointer(element, event.pointerId);
                event.preventDefault();
                return;
            }
            const handle = event.target.closest("[data-window-drag-handle]");
            if (!handle || event.target.closest("button, input, textarea, select, a, [data-no-window-drag]") || record.options.draggable === false || record.fullscreen) return;
            if (record.maximized) this.restoreForDrag(record, event.clientX, event.clientY);
            const bounds = element.getBoundingClientRect();
            this.drag = { record, pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, moved: false };
            this.capturePointer(element, event.pointerId);
            element.classList.add("is-dragging");
            event.preventDefault();
        }

        handlePointerMove(event) {
            if ((this.drag && event.pointerId !== this.drag.pointerId) || (this.resize && event.pointerId !== this.resize.pointerId)) return;
            if (!this.drag && !this.resize) return;
            this.pendingPointer = { clientX: event.clientX, clientY: event.clientY };
            if (!this.interactionFrame) this.interactionFrame = requestAnimationFrame(() => this.flushInteraction());
        }

        flushInteraction() {
            this.interactionFrame = 0;
            const pointer = this.pendingPointer;
            this.pendingPointer = null;
            if (!pointer) return;
            if (this.drag) {
                const { record, offsetX, offsetY } = this.drag;
                this.drag.moved = true;
                this.moveTo(record, pointer.clientX - offsetX, pointer.clientY - offsetY, false);
            } else if (this.resize) this.resizeWindow(this.resize, pointer.clientX, pointer.clientY);
        }

        resizeWindow(interaction, clientX, clientY) {
            const { record, direction, startX, startY, bounds } = interaction;
            let { left, top, width, height } = bounds;
            const dx = clientX - startX, dy = clientY - startY;
            if (direction.includes("e")) width += dx;
            if (direction.includes("s")) height += dy;
            if (direction.includes("w")) { left += dx; width -= dx; }
            if (direction.includes("n")) { top += dy; height -= dy; }
            const minWidth = Math.max(DEFAULTS.minWidth, Number(record.options.minWidth) || DEFAULTS.minWidth);
            const minHeight = Math.max(DEFAULTS.minHeight, Number(record.options.minHeight) || DEFAULTS.minHeight);
            if (width < minWidth) { if (direction.includes("w")) left -= minWidth - width; width = minWidth; }
            if (height < minHeight) { if (direction.includes("n")) top -= minHeight - height; height = minHeight; }
            const area = this.workArea(record.monitorId);
            left = Math.max(area.left, Math.min(left, area.left + area.width - minWidth));
            top = Math.max(area.top, Math.min(top, area.top + area.height - minHeight));
            width = Math.min(width, area.left + area.width - left);
            height = Math.min(height, area.top + area.height - top);
            this.resizeTo(record, { left, top, width, height }, false);
        }

        moveTo(record, left, top, persist = true) {
            const area = this.workArea(record.monitorId);
            const bounds = this.getBounds(record);
            const maxLeft = area.left + Math.max(0, area.width - bounds.width);
            const maxTop = area.top + Math.max(0, area.height - bounds.height);
            record.element.style.left = `${Math.round(Math.max(area.left, Math.min(left, maxLeft)))}px`;
            record.element.style.top = `${Math.round(Math.max(area.top, Math.min(top, maxTop)))}px`;
            record.snapped = null;
            if (persist) { this.emit("moved", record); this.scheduleSave(); }
        }

        finishInteraction(event) {
            if (event && this.drag && event.pointerId !== this.drag.pointerId) return;
            if (event && this.resize && event.pointerId !== this.resize.pointerId) return;
            if (this.interactionFrame) { cancelAnimationFrame(this.interactionFrame); this.interactionFrame = 0; this.flushInteraction(); }
            const drag = this.drag;
            if (drag) {
                drag.record.element.classList.remove("is-dragging");
                this.releasePointer(drag.record.element, drag.pointerId);
                if (drag.moved && event) this.snapFromPointer(drag.record, event.clientX, event.clientY);
                this.emit("moved", drag.record);
            }
            if (this.resize) this.releasePointer(this.resize.record.element, this.resize.pointerId);
            this.drag = null; this.resize = null; this.pendingPointer = null;
            this.scheduleSave();
        }

        capturePointer(element, pointerId) { try { element.setPointerCapture?.(pointerId); } catch { /* Pointer capture is an optional enhancement. */ } }
        releasePointer(element, pointerId) { try { if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId); } catch { /* The pointer may already be released. */ } }

        handleDoubleClick(event) {
            const title = event.target.closest("[data-window-drag-handle]");
            if (!title || event.target.closest("button, input, textarea, select, a")) return;
            const record = this.recordsById.get(title.closest(".window")?.dataset.windowId);
            if (record && record.options.resizable !== false) this.maximize(record);
        }

        restoreForDrag(record, clientX, clientY) {
            const previous = record.restoreBounds || { left: 32, top: 32, width: 560, height: 360 };
            record.maximized = false;
            record.element.classList.remove("is-maximized");
            const area = this.workArea(record.monitorId);
            const width = Math.min(previous.width, area.width);
            const ratio = Math.min(0.9, Math.max(0.1, clientX / Math.max(1, area.width)));
            this.resizeTo(record, { left: area.left + clientX - width * ratio, top: area.top + 8, width, height: Math.min(previous.height, area.height) }, false);
            this.moveTo(record, this.getBounds(record).left, this.getBounds(record).top, false);
        }

        snapFromPointer(record, clientX, clientY) {
            const area = this.workArea(record.monitorId);
            const edge = Math.min(32, Math.max(16, Math.round(area.width * 0.035)));
            if (clientX <= area.left + edge) this.snap(record, "left");
            else if (clientX >= area.left + area.width - edge) this.snap(record, "right");
            else if (clientY <= area.top + 12) this.maximize(record);
        }

        handleClick(event) {
            const action = event.target.closest("[data-window-action]")?.dataset.windowAction;
            if (!action) return;
            const record = this.recordsById.get(event.target.closest(".window")?.dataset.windowId);
            if (record && typeof record[action] === "function") { record[action](); event.stopPropagation(); }
        }

        handleKeyDown(event) {
            if (event.key === "Escape" && this.activeWindow?.modal) { this.close(this.activeWindow); return; }
            if (event.altKey && event.key === "Tab") { event.preventDefault(); this.focusManager.focusNext(); return; }
            const record = this.activeWindow;
            if (!record) return;
            const shortcut = event.key.toLowerCase();
            if (event.altKey && shortcut === "f4") { event.preventDefault(); record.close(); }
            if (event.metaKey || (event.ctrlKey && event.altKey)) {
                const actions = { arrowleft: "left", arrowright: "right", arrowup: "top", arrowdown: "bottom" };
                if (actions[shortcut]) { event.preventDefault(); record.snap(actions[shortcut]); }
            }
        }

        focus(record) { return this.focusManager.focus(record); }

        minimize(record) {
            if (!record || record.closed || record.minimized) return;
            record.minimized = true; record.focused = false; record.element.classList.add("is-minimizing");
            this.afterAnimation(record, () => { record.element.hidden = true; record.element.classList.remove("is-minimizing"); });
            if (this.activeWindow === record) this.focusManager.focusNext();
            this.taskbar?.update(record); this.emit("minimized", record); this.scheduleSave();
        }

        restore(record) {
            if (!record || record.closed) return;
            record.minimized = false; record.element.hidden = false; record.element.classList.remove("is-minimizing");
            this.applyContext(record); this.focus(record); this.taskbar?.update(record); this.emit("restored", record); this.scheduleSave();
        }

        maximize(record) {
            if (!record || record.closed) return;
            if (record.fullscreen) this.exitFullscreen(record);
            if (!record.maximized) { record.restoreBounds = this.getBounds(record); record.maximized = true; record.snapped = null; record.element.classList.add("is-maximized"); }
            else { record.maximized = false; record.element.classList.remove("is-maximized"); if (record.restoreBounds) this.resizeTo(record, record.restoreBounds, false); }
            this.animate(record); this.focus(record); this.emit(record.maximized ? "maximized" : "restored", record); this.scheduleSave();
        }

        fullscreen(record) {
            if (!record || record.closed) return;
            if (record.fullscreen) { this.exitFullscreen(record); return; }
            record.restoreBounds = this.getBounds(record); record.fullscreen = true; record.maximized = false; record.element.classList.add("is-fullscreen");
            this.focus(record); this.emit("fullscreen", record); this.scheduleSave();
        }

        exitFullscreen(record) {
            record.fullscreen = false; record.element.classList.remove("is-fullscreen");
            if (record.restoreBounds) this.resizeTo(record, record.restoreBounds, false);
            this.emit("restored", record); this.scheduleSave();
        }

        snap(record, position) {
            if (!record || !SNAP_POSITIONS.has(position)) throw new TypeError("Snap position must be left, right, top, or bottom.");
            if (!record.restoreBounds) record.restoreBounds = this.getBounds(record);
            const area = this.workArea(record.monitorId), halfWidth = Math.floor(area.width / 2), halfHeight = Math.floor(area.height / 2);
            const bounds = position === "left" ? { left: area.left, top: area.top, width: halfWidth, height: area.height } : position === "right" ? { left: area.left + halfWidth, top: area.top, width: area.width - halfWidth, height: area.height } : position === "top" ? { left: area.left, top: area.top, width: area.width, height: halfHeight } : { left: area.left, top: area.top + halfHeight, width: area.width, height: area.height - halfHeight };
            record.maximized = false; record.fullscreen = false; record.snapped = position; record.element.classList.remove("is-maximized", "is-fullscreen"); this.resizeTo(record, bounds, false);
            this.focus(record); this.emit("snapped", record); this.scheduleSave();
        }

        resizeTo(record, bounds, emit = true) {
            if (!record || !isObject(bounds) || !["left", "top", "width", "height"].every(key => finitePositive(bounds[key]) || key === "left" || key === "top")) throw new TypeError("resizeTo requires valid bounds.");
            const width = Math.max(Number(record.options.minWidth) || DEFAULTS.minWidth, Math.min(Number(record.options.maxWidth) || Infinity, Number(bounds.width)));
            const height = Math.max(Number(record.options.minHeight) || DEFAULTS.minHeight, Math.min(Number(record.options.maxHeight) || Infinity, Number(bounds.height)));
            Object.assign(record.element.style, { left: `${Math.round(Number(bounds.left) || 0)}px`, top: `${Math.round(Number(bounds.top) || 0)}px`, width: `${Math.round(width)}px`, height: `${Math.round(height)}px` });
            if (emit) this.emit("resized", record);
            this.scheduleSave();
        }

        close(record) {
            if (!record || record.closed || record.closing) return;
            record.closing = true; record.element.classList.add("is-closing");
            this.afterAnimation(record, () => this.finalizeClose(record));
        }

        finalizeClose(record) {
            if (record.closed) return;
            record.closed = true; record.closing = false; if (this.records.get(record.appId) === record) this.records.delete(record.appId); this.recordsById.delete(record.windowId); record.element.remove();
            try { record.onClose?.(record); } catch (error) { this.reportError(error, "window close hook"); }
            this.taskbar?.unregister(record); if (this.activeWindow === record) { this.activeWindow = null; this.focusManager.focusNext(); }
            this.emit("closed", record); this.scheduleSave();
        }

        moveToWorkspace(record, workspaceId) {
            if (!record || typeof workspaceId !== "string" || !workspaceId.trim()) throw new TypeError("workspaceId must be a non-empty string.");
            this.ensureWorkspace(workspaceId); record.workspaceId = workspaceId; record.element.dataset.workspace = workspaceId; this.applyContext(record); this.emit("workspace-changed", record); this.scheduleSave();
        }

        createWorkspace(id, name = id) { if (typeof id !== "string" || !id.trim()) throw new TypeError("Workspace id is required."); this.workspaces.set(id, { id, name: String(name) }); this.emit("workspace-created", null, { workspaceId: id }); return this.workspaces.get(id); }
        switchWorkspace(id) { this.ensureWorkspace(id); this.activeWorkspaceId = id; for (const record of this.records.values()) this.applyContext(record); this.focusManager.focusNext(); this.emit("workspace-switched", null, { workspaceId: id }); this.scheduleSave(); }
        ensureWorkspace(id) { if (!this.workspaces.has(id)) this.createWorkspace(id); }

        refreshMonitors() { const primary = this.monitors.get("primary") || { id: "primary" }; Object.assign(primary, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }); this.monitors.set("primary", primary); }
        workArea(monitorId = this.activeMonitorId) { const monitor = this.monitors.get(monitorId) || this.monitors.get("primary"); const top = document.body.classList.contains("taskbar-top") ? 96 : 0; const bottom = document.body.classList.contains("taskbar-top") ? 0 : 96; return { left: monitor.left, top: monitor.top + top, width: monitor.width, height: Math.max(140, monitor.height - top - bottom) }; }
        positionCascade(record) { const area = this.workArea(record.monitorId); const offset = (this.cascade++ % 9) * 28; this.resizeTo(record, { left: area.left + 32 + offset, top: area.top + 32 + offset, width: record.element.offsetWidth || 560, height: record.element.offsetHeight || 360 }, false); }
        applyContext(record) { const visible = record.workspaceId === this.activeWorkspaceId && record.monitorId === this.activeMonitorId; record.element.hidden = record.minimized || !visible; record.element.setAttribute("aria-hidden", String(!visible)); const modalVisible = [...this.records.values()].some(candidate => candidate.modal && !candidate.closed && candidate.workspaceId === this.activeWorkspaceId && candidate.monitorId === this.activeMonitorId && !candidate.minimized); this.container.classList.toggle("has-modal-window", modalVisible); }
        isVisibleInActiveContext(record) { return record.workspaceId === this.activeWorkspaceId && record.monitorId === this.activeMonitorId && !record.element.hidden; }
        getBounds(record) { const bounds = record.element.getBoundingClientRect(); return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }; }
        keepWindowsVisible() { for (const record of this.records.values()) if (!record.maximized && !record.fullscreen && this.isVisibleInActiveContext(record)) { const b = this.getBounds(record), area = this.workArea(record.monitorId); this.moveTo(record, b.left, b.top); if (b.width > area.width || b.height > area.height) this.resizeTo(record, { ...b, width: Math.min(b.width, area.width), height: Math.min(b.height, area.height) }, false); } }

        on(record, event, callback) { if (!record || typeof event !== "string" || typeof callback !== "function") throw new TypeError("on requires a record, event, and callback."); const key = `${record.windowId}:${event}`; if (!this.hooks.has(key)) this.hooks.set(key, new Set()); this.hooks.get(key).add(callback); return () => this.hooks.get(key)?.delete(callback); }
        emit(action, record, detail = {}) { const payload = { action, record, ...detail }; window.dispatchEvent(new CustomEvent("tulip:windowchange", { detail: payload })); if (record) for (const callback of this.hooks.get(`${record.windowId}:${action}`) || []) try { callback(payload); } catch (error) { this.reportError(error, `${action} hook`); } }
        animate(record) { if (this.animationsEnabled()) { record.element.classList.remove("is-maximizing"); requestAnimationFrame(() => record.element.classList.add("is-maximizing")); window.setTimeout(() => record.element.classList.remove("is-maximizing"), DEFAULTS.animationDuration); } }
        afterAnimation(record, callback) { if (!this.animationsEnabled()) { callback(); return; } window.setTimeout(callback, Number(record.options.animationDuration) || DEFAULTS.animationDuration); }
        animationsEnabled() { const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; return !document.body.classList.contains("animations-disabled") && !reducedMotion; }
        reportError(error, context) { console.error(`WindowManager ${context} failed`, error); window.dispatchEvent(new CustomEvent("tulip:windowerror", { detail: { error, context } })); }

        scheduleSave() { window.clearTimeout(this.persistTimer); this.persistTimer = window.setTimeout(() => this.saveSession(), 100); }
        saveSession() { const windows = [...this.records.values()].filter(record => !record.closed).map(record => ({ appId: record.appId, title: record.title, workspaceId: record.workspaceId, monitorId: record.monitorId, minimized: record.minimized, maximized: record.maximized, fullscreen: record.fullscreen, snapped: record.snapped, bounds: this.getBounds(record) })); try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, workspaceId: this.activeWorkspaceId, windows })); return true; } catch (error) { this.reportError(error, "save session"); return false; } }
        loadSession() { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (!isObject(value) || value.version !== 2) return null; this.activeWorkspaceId = typeof value.workspaceId === "string" ? value.workspaceId : this.activeWorkspaceId; this.ensureWorkspace(this.activeWorkspaceId); this.sessionRestored = true; return value; } catch (error) { this.reportError(error, "load session"); return null; } }
        registerSessionFactory(appId, factory) { if (typeof appId !== "string" || !appId.trim() || typeof factory !== "function") throw new TypeError("registerSessionFactory requires an appId and factory function."); this.sessionFactories.set(appId, factory); return () => this.sessionFactories.delete(appId); }
        restoreSession(factories = {}) { if (!isObject(factories)) throw new TypeError("Session factories must be an object."); const session = this.loadSession(); if (!session || !Array.isArray(session.windows)) return []; const restored = []; for (const saved of session.windows) { const factory = this.sessionFactories.get(saved.appId) || factories[saved.appId]; if (typeof factory !== "function") continue; try { const record = factory(saved); if (!record || !this.recordsById.has(record.windowId)) continue; if (saved.bounds) this.resizeTo(record, saved.bounds, false); if (saved.snapped && SNAP_POSITIONS.has(saved.snapped)) this.snap(record, saved.snapped); else if (saved.fullscreen) this.fullscreen(record); else if (saved.maximized) this.maximize(record); if (saved.minimized) this.minimize(record); restored.push(record); } catch (error) { this.reportError(error, `restore session window ${saved.appId}`); } } return restored; }
        clearSession() { localStorage.removeItem(STORAGE_KEY); }
    };
})();
