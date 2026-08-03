(() => {
    "use strict";

    class StorageManagerApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.record = null;
            this.data = null;
        }

        async open() {
            const record = this.windowManager.create({
                appId: "storage-manager",
                title: "💾 Storage Manager",
                className: "storage-manager-window",
                content: this.createView(),
                onMount: current => this.bind(current),
                onClose: () => this.record = null
            });
            this.record = record;
            await this.refresh();
        }

        createView() {
            const root = document.createElement("div");
            root.className = "storage-manager-app";
            root.innerHTML = `
                <div class="storage-toolbar">
                    <div class="storage-actions">
                        <button type="button" data-action="refresh" class="toolbar-btn">↻ Refresh</button>
                        <button type="button" data-action="cleanup" class="toolbar-btn">🧹 Cleanup</button>
                        <button type="button" data-action="recycle" class="toolbar-btn">🗑 Recycle</button>
                        <button type="button" data-action="cache" class="toolbar-btn">⚡ Cache</button>
                    </div>
                    <div class="storage-summary" data-role="summary"></div>
                </div>
                <div class="storage-hero">
                    <section class="storage-ring-card">
                        <div class="storage-ring" data-role="ring"></div>
                    </section>
                    <section class="storage-categories-card">
                        <h3>Storage Categories</h3>
                        <div class="storage-category-list" data-role="categories"></div>
                    </section>
                </div>
                <div class="storage-grid">
                    <section class="storage-card"><h3>Largest Files</h3><div data-role="largest-files"></div></section>
                    <section class="storage-card"><h3>Recent Activity</h3><div data-role="recent"></div></section>
                    <section class="storage-card"><h3>Cleanup Suggestions</h3><div data-role="suggestions"></div></section>
                    <section class="storage-card"><h3>Overview</h3><div data-role="overview"></div></section>
                </div>
            `;
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".storage-manager-app");
            root.addEventListener("click", event => this.handleClick(event));
        }

        async handleClick(event) {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "refresh") return this.refresh();
            if (action === "cleanup") { this.notifications?.show("Disk cleanup completed", "success"); await this.refresh(); }
            if (action === "recycle") { this.notifications?.show("Recycle bin emptied", "success"); await this.refresh(); }
            if (action === "cache") { this.notifications?.show("Cache cleared", "success"); await this.refresh(); }
        }

        async refresh() {
            if (!window.TulipFS?.list) return;
            const entries = await window.TulipFS.list();
            const files = entries.filter(entry => entry.type === "file");
            const folderSizes = new Map();
            files.forEach(file => {
                const path = file.path || "";
                const segments = path.split("/").filter(Boolean);
                for (let index = 1; index < segments.length; index += 1) {
                    const folderPath = `/${segments.slice(0, index).join("/")}`;
                    folderSizes.set(folderPath, (folderSizes.get(folderPath) || 0) + (file.content?.length || 0));
                }
            });
            const largestFiles = files.slice().sort((left, right) => (right.content?.length || 0) - (left.content?.length || 0)).slice(0, 6);
            const largestFolders = [...folderSizes.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6);
            const used = files.reduce((total, file) => total + (file.content?.length || 0), 0);
            const total = Math.max(used + 1024 * 1024 * 100, 1024 * 1024 * 1024);
            const free = Math.max(total - used, 0);
            this.data = { total, used, free, largestFiles, largestFolders, files, entries };
            this.render();
        }

        render() {
            if (!this.record || !this.data) return;
            const root = this.record.content.querySelector(".storage-manager-app");
            if (!root) return;
            root.querySelector("[data-role=summary]").innerHTML = `<strong>${this.formatBytes(this.data.used)}</strong> used of ${this.formatBytes(this.data.total)} · ${this.percent()}% used`;
            root.querySelector("[data-role=overview]").innerHTML = `<p>Total: ${this.formatBytes(this.data.total)}</p><p>Used: ${this.formatBytes(this.data.used)}</p><p>Free: ${this.formatBytes(this.data.free)}</p><p>Files: ${this.data.files.length}</p>`;
            root.querySelector("[data-role=largest-files]").innerHTML = this.data.largestFiles.map(file => `<div class="storage-list-item"><strong>${file.path.split("/").pop()}</strong><span>${this.formatBytes(file.content?.length || 0)}</span></div>`).join("");
            root.querySelector("[data-role=recent]").innerHTML = this.data.entries.slice().sort((left, right) => (right.modified || 0) - (left.modified || 0)).slice(0, 6).map(entry => `<div class="storage-list-item"><strong>${entry.path.split("/").pop()}</strong><span>${new Date(entry.modified || Date.now()).toLocaleDateString()}</span></div>`).join("");
            root.querySelector("[data-role=suggestions]").innerHTML = [
                `<div class="storage-list-item"><strong>Empty recycle bin</strong><span>Quick cleanup</span></div>`,
                `<div class="storage-list-item"><strong>Clear temporary cache</strong><span>Free up space</span></div>`,
                `<div class="storage-list-item"><strong>Archive old files</strong><span>Reduce clutter</span></div>`
            ].join("");
            root.querySelector("[data-role=categories]").innerHTML = [
                { label: "Pictures", size: Math.max(180000, this.data.used * 0.12), progress: 0.12 },
                { label: "Videos", size: Math.max(240000, this.data.used * 0.08), progress: 0.08 },
                { label: "Music", size: Math.max(110000, this.data.used * 0.05), progress: 0.05 },
                { label: "Documents", size: Math.max(90000, this.data.used * 0.07), progress: 0.07 },
                { label: "Downloads", size: Math.max(80000, this.data.used * 0.04), progress: 0.04 },
                { label: "Apps", size: Math.max(72000, this.data.used * 0.03), progress: 0.03 },
                { label: "Cache", size: Math.max(60000, this.data.used * 0.02), progress: 0.02 }
            ].map(category => `<div class="storage-category-item"><div class="storage-list-item"><strong>${category.label}</strong><span>${this.formatBytes(category.size)}</span></div><div class="storage-progress"><span style="width:${Math.min(100, category.progress * 100)}%"></span></div></div>`).join("");
            this.renderChart(root.querySelector("[data-role=ring]"));
        }

        renderChart(node) {
            if (!node) return;
            const ratio = this.data.used / this.data.total;
            node.style.setProperty("--storage-used", `${Math.max(4, ratio * 100)}%`);
            node.innerHTML = `<div style="position:relative;display:grid;place-items:center;width:100%;height:100%;"><strong>${Math.round(ratio * 100)}%</strong><span style="position:absolute;bottom:38px;color:var(--tulip-muted);">Used</span><span style="position:absolute;top:56px;color:var(--tulip-muted);font-size:12px;">${this.formatBytes(this.data.used)} / ${this.formatBytes(this.data.total)}</span></div>`;
        }

        percent() {
            return Math.round((this.data.used / Math.max(this.data.total, 1)) * 100);
        }

        formatBytes(bytes) {
            if (!bytes) return "0 B";
            const units = ["B", "KB", "MB", "GB", "TB"];
            const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
            return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
        }
    }

    window.StorageManagerApp = StorageManagerApp;
})();
