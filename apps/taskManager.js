window.TaskManagerApp = class TaskManagerApp {
    constructor(windowManager, notifications, apps) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.apps = apps;
        this.sort = { key: "name", direction: "asc" };
        this.selectedId = null;
        this.refreshTimer = null;
        this.frameCount = 0;
        this.fps = null;
        this.lastFpsSample = performance.now();
        this.onWindowChange = () => this.refresh();
        this.onDocumentKeydown = event => {
            if (this.record?.focused && !event.target.matches("input, textarea")) this.handleKeydown(event);
        };
    }

    open() {
        const record = this.windowManager.create({
            appId: "task-manager",
            title: "▦ Task Manager",
            className: "task-manager-window",
            content: this.createView(),
            onMount: current => this.bind(current),
            onClose: () => this.stop()
        });
        this.record = record;
        this.start();
    }

    createView() {
        const root = document.createElement("div");
        root.className = "task-manager";
        root.innerHTML = `
            <header class="task-manager-header">
                <div><p class="task-manager-eyebrow">SYSTEM MONITOR</p><h2>Task Manager</h2></div>
                <button type="button" class="task-manager-refresh" data-action="refresh" title="Refresh (Ctrl+R)">↻ Refresh</button>
            </header>
            <section class="task-manager-metrics" aria-label="Performance overview">
                <div><span>Total running apps</span><strong data-role="app-count">0</strong></div>
                <div><span>Estimated RAM</span><strong data-role="ram">Calculating…</strong></div>
                <div><span>Estimated CPU</span><strong data-role="cpu">0%</strong></div>
                <div><span>System uptime</span><strong data-role="uptime">00:00:00</strong></div>
                <div><span>FPS</span><strong data-role="fps">Measuring…</strong></div>
            </section>
            <section class="task-manager-toolbar">
                <label class="task-manager-search"><span>⌕</span><input type="search" data-role="search" placeholder="Search running applications" autocomplete="off"></label>
                <button type="button" class="task-manager-end" data-action="end-selected" disabled>End task</button>
            </section>
            <div class="task-manager-layout">
                <section class="task-manager-processes">
                    <div class="task-manager-table-wrap"><table><thead><tr>
                        <th data-sort="icon">App icon</th><th data-sort="name">App name</th><th data-sort="pid">PID</th><th data-sort="status">Status</th><th data-sort="memory">Memory usage</th><th data-sort="cpu">CPU usage</th><th data-sort="state">Window state</th><th data-sort="running">Running time</th><th>Action</th>
                    </tr></thead><tbody data-role="processes"></tbody></table></div>
                    <p class="task-manager-empty" data-role="empty" hidden>No running applications match your search.</p>
                </section>
                <aside class="task-manager-details" data-role="details"><p>Select a process to view its details.</p></aside>
            </div>
            <div class="task-manager-context" data-role="context" hidden>
                <button type="button" data-action="focus">Bring to front</button><button type="button" data-action="minimize">Minimize</button><button type="button" data-action="maximize">Maximize</button><hr><button type="button" class="danger" data-action="end-selected">End task</button>
            </div>`;
        return root;
    }

    bind(record) {
        this.root = record.content.querySelector(".task-manager");
        this.root.addEventListener("click", event => this.handleClick(event));
        this.root.addEventListener("dblclick", event => {
            const row = event.target.closest("[data-process-id]");
            if (row && !event.target.closest("button")) this.perform("focus", row.dataset.processId);
        });
        this.root.addEventListener("contextmenu", event => this.openContextMenu(event));
        this.root.querySelector("[data-role=search]").addEventListener("input", () => this.refresh());
        record.element.tabIndex = -1;
    }

    start() {
        this.stop();
        window.addEventListener("tulip:windowchange", this.onWindowChange);
        document.addEventListener("keydown", this.onDocumentKeydown);
        this.refreshTimer = window.setInterval(() => this.refresh(), 1000);
        this.measureFps();
        this.refresh();
    }

    stop() {
        window.clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        window.removeEventListener("tulip:windowchange", this.onWindowChange);
        document.removeEventListener("keydown", this.onDocumentKeydown);
    }

    measureFps() {
        if (!this.record?.element.isConnected) return;
        this.frameCount += 1;
        const now = performance.now();
        if (now - this.lastFpsSample >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsSample));
            this.frameCount = 0;
            this.lastFpsSample = now;
        }
        requestAnimationFrame(() => this.measureFps());
    }

    processes() {
        return [...this.windowManager.records.values()].map(record => {
            const app = this.apps[record.appId] || {};
            const nodeCount = record.content.querySelectorAll("*").length + 1;
            const textBytes = new Blob([record.content.textContent || ""]).size;
            const memory = 0.5 + nodeCount * 0.012 + textBytes / 1048576;
            return {
                record, id: record.appId, icon: app.icon || "◻", name: app.name || record.title.replace(/^\S+\s*/, ""), pid: record.pid,
                status: record.minimized ? "Suspended" : "Running", state: record.minimized ? "Minimized" : record.maximized ? "Maximized" : record.focused ? "Active" : "Normal",
                memory, running: Math.max(0, Date.now() - record.createdAt), createdAt: record.createdAt, windowId: record.windowId
            };
        }).map((process, _, all) => ({ ...process, cpu: this.estimateCpu(process, all) }));
    }

    estimateCpu(process, all) {
        if (process.record.minimized) return 0;
        const totalWeight = all.filter(item => !item.record.minimized).reduce((total, item) => total + item.memory, 0) || 1;
        const activeBonus = process.record.focused ? 3 : 0;
        return Math.min(99, (process.memory / totalWeight) * 12 + activeBonus);
    }

    refresh() {
        const root = this.root;
        if (!root?.isConnected) return;
        const query = root.querySelector("[data-role=search]").value.trim().toLowerCase();
        let processes = this.processes();
        if (!processes.some(process => process.id === this.selectedId)) this.selectedId = null;
        const totalMemory = processes.reduce((total, process) => total + process.memory, 0);
        const totalCpu = processes.reduce((total, process) => total + process.cpu, 0);
        this.updateMetrics(processes.length, totalMemory, totalCpu);
        processes = processes.filter(process => !query || `${process.name} ${process.pid} ${process.status} ${process.state}`.toLowerCase().includes(query));
        processes.sort((left, right) => this.compare(left, right));
        this.renderProcesses(processes);
        this.renderDetails(this.processes().find(process => process.id === this.selectedId));
        root.querySelector("[data-action=end-selected]").disabled = !this.selectedId;
        root.querySelectorAll("th[data-sort]").forEach(header => header.classList.toggle("is-sorted", header.dataset.sort === this.sort.key));
    }

    updateMetrics(count, memory, cpu) {
        const root = this.root;
        root.querySelector("[data-role=app-count]").textContent = count;
        const heap = performance.memory?.usedJSHeapSize;
        root.querySelector("[data-role=ram]").textContent = heap ? `${this.formatBytes(heap)} JS heap` : `~${memory.toFixed(1)} MB`;
        root.querySelector("[data-role=cpu]").textContent = `~${cpu.toFixed(1)}%`;
        root.querySelector("[data-role=uptime]").textContent = this.formatDuration(performance.now());
        root.querySelector("[data-role=fps]").textContent = this.fps === null ? "Measuring…" : `${this.fps} FPS`;
    }

    compare(left, right) {
        const value = key => key === "icon" ? key : key;
        let a = left[value(this.sort.key)], b = right[value(this.sort.key)];
        if (typeof a === "string") { a = a.toLowerCase(); b = String(b).toLowerCase(); }
        const result = a > b ? 1 : a < b ? -1 : 0;
        return result * (this.sort.direction === "asc" ? 1 : -1);
    }

    renderProcesses(processes) {
        const body = this.root.querySelector("[data-role=processes]");
        body.replaceChildren(...processes.map(process => {
            const row = document.createElement("tr");
            row.dataset.processId = process.id;
            row.classList.toggle("selected", process.id === this.selectedId);
            row.innerHTML = `<td class="process-icon"></td><td></td><td>${process.pid}</td><td><span class="process-status"></span></td><td>${process.memory.toFixed(1)} MB</td><td>~${process.cpu.toFixed(1)}%</td><td>${process.state}</td><td>${this.formatDuration(process.running)}</td><td><button type="button" data-action="end" title="End task">End task</button></td>`;
            row.querySelector(".process-icon").textContent = process.icon;
            row.children[1].textContent = process.name;
            row.querySelector(".process-status").textContent = process.status;
            row.querySelector(".process-status").classList.toggle("is-suspended", process.status === "Suspended");
            return row;
        }));
        this.root.querySelector("[data-role=empty]").hidden = processes.length > 0;
    }

    renderDetails(process) {
        const panel = this.root.querySelector("[data-role=details]");
        if (!process) { panel.innerHTML = "<p>Select a process to view its details.</p>"; return; }
        panel.innerHTML = `<div class="details-app-icon"></div><div><p class="task-manager-eyebrow">PROCESS DETAILS</p><h3></h3><span>PID ${process.pid}</span></div><dl><dt>Memory</dt><dd>${process.memory.toFixed(1)} MB estimated</dd><dt>CPU</dt><dd>~${process.cpu.toFixed(1)}% estimated</dd><dt>Created</dt><dd>${new Date(process.createdAt).toLocaleTimeString()}</dd><dt>Window ID</dt><dd>${process.windowId}</dd></dl>`;
        panel.querySelector(".details-app-icon").textContent = process.icon;
        panel.querySelector("h3").textContent = process.name;
    }

    handleClick(event) {
        const header = event.target.closest("th[data-sort]");
        if (header) { this.sort.direction = this.sort.key === header.dataset.sort && this.sort.direction === "asc" ? "desc" : "asc"; this.sort.key = header.dataset.sort; this.refresh(); return; }
        const row = event.target.closest("[data-process-id]");
        if (row) this.select(row.dataset.processId);
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "refresh") this.refresh();
        if (action === "end") this.perform("end", row?.dataset.processId);
        if (action === "end-selected") this.perform("end", this.selectedId);
        if (["focus", "minimize", "maximize"].includes(action)) this.perform(action, this.selectedId);
        this.hideContextMenu();
    }

    handleKeydown(event) {
        if (event.ctrlKey && event.key.toLowerCase() === "r") { event.preventDefault(); this.refresh(); }
        if (event.key === "Delete") { event.preventDefault(); this.perform("end", this.selectedId); }
        if (event.key === "Escape") { this.selectedId = null; this.hideContextMenu(); this.refresh(); }
    }

    select(id) { this.selectedId = id; this.refresh(); }

    perform(action, id) {
        const record = this.windowManager.records.get(id);
        if (!record) return;
        if (action === "end") { const title = this.apps[id]?.name || record.title; this.notifications.show(`${title} was closed.`); record.close(); return; }
        if (action === "focus") record.focus();
        if (action === "minimize") record.minimize();
        if (action === "maximize") record.maximize();
    }

    openContextMenu(event) {
        const row = event.target.closest("[data-process-id]");
        if (!row) return;
        event.preventDefault();
        this.selectedId = row.dataset.processId;
        this.refresh();
        const menu = this.root.querySelector("[data-role=context]");
        const bounds = this.root.getBoundingClientRect();
        menu.hidden = false;
        menu.style.left = `${Math.min(event.clientX - bounds.left, bounds.width - 180)}px`;
        menu.style.top = `${Math.min(event.clientY - bounds.top, bounds.height - 190)}px`;
    }

    hideContextMenu() { const menu = this.root?.querySelector("[data-role=context]"); if (menu) menu.hidden = true; }
    formatBytes(bytes) { return `${(bytes / 1048576).toFixed(1)} MB`; }
    formatDuration(milliseconds) { const total = Math.floor(milliseconds / 1000); const hours = String(Math.floor(total / 3600)).padStart(2, "0"); const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, "0"); const seconds = String(total % 60).padStart(2, "0"); return `${hours}:${minutes}:${seconds}`; }
};
