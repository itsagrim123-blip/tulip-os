(() => {
    "use strict";

    const CATEGORY_ICONS = Object.freeze({
        "New Features": "\u2728", "Bug Fixes": "\uD83D\uDC1B", Performance: "\u26A1", Security: "\uD83D\uDD12", Games: "\uD83C\uDFAE", UI: "\uD83D\uDDA5", Apps: "\uD83D\uDCE6"
    });
    const text = value => document.createTextNode(String(value ?? ""));

    window.UpdateCenterApp = class UpdateCenterApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.manager = new window.UpdateManager();
            this.record = null;
            this.root = null;
            this.history = null;
            this.expanded = new Set();
        }

        open() {
            this.record = this.windowManager.create({
                appId: "update-center",
                title: "\u2B06 Update Center",
                className: "update-center-window",
                content: this.createView(),
                onMount: record => this.bind(record),
                onClose: () => { this.record = null; this.root = null; }
            });
            return this.record;
        }

        createView() {
            const root = document.createElement("div");
            root.className = "update-center-app";
            root.innerHTML = `
                <aside class="update-sidebar">
                    <div class="update-brand"><span class="update-brand-mark">&#x2B06;</span><div><h2>Update Center</h2><p>Windows-style update history</p></div></div>
                    <div class="update-info-card update-system-info" data-role="system-info"></div>
                    <div class="update-sidebar-actions"><button type="button" class="update-action-btn" data-action="check">Check for updates</button><button type="button" class="update-action-btn subtle" data-action="refresh">Refresh history</button></div>
                </aside>
                <main class="update-main">
                    <header class="update-hero"><div><p class="settings-eyebrow">UPDATE HISTORY</p><h3>What’s new in Tulip OS</h3><p>Review every release, improvement, and fix.</p></div><span class="update-status-pill" data-role="status"></span></header>
                    <div class="update-filters"><label>Search updates<input type="search" data-role="search" placeholder="Search release notes"></label><label>Version<select data-role="version"></select></label><label>Category<select data-role="category"></select></label></div>
                    <section class="update-timeline" data-role="timeline" aria-live="polite"></section>
                </main>`;
            return root;
        }

        async bind(record) {
            this.root = record.content.querySelector(".update-center-app");
            this.root.addEventListener("click", event => this.handleClick(event));
            this.root.addEventListener("input", event => { if (event.target.matches("[data-role=search]")) this.renderTimeline(); });
            this.root.addEventListener("change", event => { if (event.target.matches("[data-role=version], [data-role=category]")) this.renderTimeline(); });
            await this.loadHistory();
        }

        async loadHistory(force = false) {
            const timeline = this.root?.querySelector("[data-role=timeline]");
            if (timeline) timeline.textContent = "Loading update history…";
            this.history = await this.manager.load({ force });
            this.renderSystemInfo();
            this.populateFilters();
            this.renderTimeline();
            if (this.history.error) this.notifications?.show(this.history.error, "error");
        }

        renderSystemInfo() {
            const target = this.root?.querySelector("[data-role=system-info]");
            if (!target || !this.history) return;
            target.replaceChildren(...[
                ["Current OS", this.history.current.version], ["Build number", this.history.current.buildNumber], ["Release channel", this.history.current.channel], ["Installed date", this.history.current.installedDate]
            ].map(([label, value]) => this.createInfoRow(label, value)));
            this.root.querySelector("[data-role=status]").textContent = this.history.current.status;
        }

        createInfoRow(label, value) {
            const row = document.createElement("div"); row.className = "update-info-row";
            const name = document.createElement("span"); name.textContent = label;
            const content = document.createElement("strong"); content.textContent = value;
            row.append(name, content); return row;
        }

        populateFilters() {
            const versions = [...new Set(this.history.updates.map(update => update.version))];
            const categories = [...new Set(this.history.updates.flatMap(update => update.categories))].sort();
            this.populateSelect("[data-role=version]", "All versions", versions);
            this.populateSelect("[data-role=category]", "All categories", categories);
        }

        populateSelect(selector, label, values) {
            const select = this.root.querySelector(selector); if (!select) return;
            const selected = select.value;
            select.replaceChildren(this.option("", label), ...values.map(value => this.option(value, value)));
            select.value = values.includes(selected) ? selected : "";
        }

        option(value, label) { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }

        filteredUpdates() {
            const query = this.root.querySelector("[data-role=search]").value.trim().toLowerCase();
            const version = this.root.querySelector("[data-role=version]").value;
            const category = this.root.querySelector("[data-role=category]").value;
            return this.history.updates.filter(update => {
                const searchable = [update.version, update.buildNumber, update.title, update.updateType, ...update.changelog, ...update.newFeatures, ...update.improvements, ...update.bugFixes, ...update.categories].join(" ").toLowerCase();
                return (!query || searchable.includes(query)) && (!version || update.version === version) && (!category || update.categories.includes(category));
            });
        }

        renderTimeline() {
            const timeline = this.root?.querySelector("[data-role=timeline]");
            if (!timeline || !this.history) return;
            const updates = this.filteredUpdates();
            if (this.history.error) { timeline.textContent = "Update history could not be loaded. Try refreshing when the update file is available."; return; }
            if (!updates.length) { timeline.textContent = "No updates match the selected filters."; return; }
            timeline.replaceChildren(...updates.map((update, index) => this.createCard(update, index)));
        }

        createCard(update, index) {
            const key = `${update.version}-${update.buildNumber}`;
            const expanded = this.expanded.has(key);
            const card = document.createElement("article"); card.className = "update-card is-visible"; card.style.transitionDelay = `${index * 45}ms`;
            const head = document.createElement("div"); head.className = "update-card-head";
            const title = document.createElement("div"); title.className = "update-card-title-group";
            const badge = document.createElement("span"); badge.className = "update-version-badge"; badge.textContent = update.version;
            const name = document.createElement("div"); const heading = document.createElement("h4"); heading.textContent = update.title; const details = document.createElement("p"); details.textContent = `Build ${update.buildNumber} · ${update.releaseDate}`; name.append(heading, details); title.append(badge, name);
            const meta = document.createElement("div"); meta.className = "update-card-meta"; const type = document.createElement("span"); type.className = "update-category-pill"; type.textContent = update.updateType;
            const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "update-toggle"; toggle.dataset.action = "toggle"; toggle.dataset.key = key; toggle.setAttribute("aria-expanded", String(expanded)); toggle.textContent = expanded ? "Collapse" : "Expand"; meta.append(type, toggle); head.append(title, meta);
            const icons = document.createElement("div"); icons.className = "update-feature-icons";
            update.categories.forEach(category => { const icon = document.createElement("span"); icon.className = "feature-icon"; icon.title = category; icon.setAttribute("aria-label", category); icon.textContent = CATEGORY_ICONS[category] || "•"; icons.append(icon); });
            const body = document.createElement("div"); body.className = `update-card-body${expanded ? " is-open" : ""}`;
            [["Changelog", update.changelog], ["New Features", update.newFeatures], ["Improvements", update.improvements], ["Bug Fixes", update.bugFixes]].filter(([, items]) => items.length).forEach(([label, items]) => body.append(this.createSection(label, items)));
            card.append(head, icons, body); return card;
        }

        createSection(label, items) {
            const section = document.createElement("section"); section.className = "update-section";
            const heading = document.createElement("h5"); heading.textContent = label; const list = document.createElement("ul"); items.forEach(item => { const entry = document.createElement("li"); entry.append(text(item)); list.append(entry); }); section.append(heading, list); return section;
        }

        handleClick(event) {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "toggle") { const key = event.target.closest("[data-key]").dataset.key; this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key); this.renderTimeline(); }
            if (action === "refresh") this.loadHistory(true);
            if (action === "check") { const status = this.root.querySelector("[data-role=status]"); status.textContent = "Checking for updates…"; window.setTimeout(() => { status.textContent = this.history.current.status; this.notifications?.show("Your Tulip OS build is up to date."); }, 700); }
        }
    };
})();
