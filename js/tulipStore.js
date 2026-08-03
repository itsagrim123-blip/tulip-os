window.TulipStoreApp = class TulipStoreApp {
    constructor(windowManager, notifications, packageManager) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.packageManager = packageManager;
        this.catalog = [];
        this.category = "All";
        this.search = "";
        this.selectedApp = null;
    }

    async open() {
        const record = this.windowManager.create({ appId: "tulip-store", title: "🛍️ Tulip Store", className: "store-window", content: this.createView(), onMount: current => this.bind(current) });
        this.record = record;
        await this.loadCatalog();
        await this.render();
    }

    createView() {
        const root = document.createElement("div");
        root.className = "tulip-store";
        root.innerHTML = '<section class="store-hero"><div><p class="store-eyebrow">TULIP STORE</p><h2>Discover your next favorite app.</h2><p>Curated applications, ready to install offline.</p></div><button type="button" data-action="updates">Check updates</button></section><div class="store-toolbar"><input type="search" data-role="search" placeholder="Search apps"><div data-role="categories" class="store-categories"></div></div><div class="store-content"><section><div class="store-section-heading"><h3>Featured</h3><button type="button" data-action="update-all">Update all</button></div><div data-role="featured" class="store-featured"></div><h3>All apps</h3><div data-role="apps" class="store-grid"></div></section><aside data-role="details" class="store-details"><p>Select an app to view details.</p></aside></div>';
        return root;
    }

    bind(record) {
        const root = record.content.querySelector(".tulip-store");
        root.addEventListener("input", event => {
            if (event.target.matches("[data-role=search]")) { this.search = event.target.value; this.render(); }
        });
        root.addEventListener("click", event => this.handleClick(event));
    }

    async loadCatalog() {
        try {
            const response = await fetch(new URL("./data/store.json", document.baseURI));
            if (!response.ok) throw new Error("Catalog unavailable");
            this.catalog = await response.json();
            await this.packageManager.ensureInstalled(this.catalog.filter(app => app.installed));
        } catch (error) {
            this.catalog = [];
            this.notifications.show("Tulip Store catalog could not be loaded", "error");
        }
    }

    async handleClick(event) {
        const category = event.target.closest("[data-category]");
        if (category) { this.category = category.dataset.category; await this.render(); return; }
        const select = event.target.closest("[data-app-id]");
        if (select && !event.target.closest("[data-action]")) { this.selectedApp = this.catalog.find(app => app.id === select.dataset.appId); await this.render(); return; }
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "install") await this.install(this.selectedApp);
        if (action === "uninstall") { await this.packageManager.uninstall(this.selectedApp.id); await this.render(); }
        if (action === "update") { await this.packageManager.update(this.selectedApp); await this.render(); }
        if (action === "updates") { const updates = await this.packageManager.checkUpdates(this.catalog); this.notifications.show(updates.length ? `${updates.length} update${updates.length === 1 ? "" : "s"} available` : "Everything is up to date"); }
        if (action === "update-all") { const count = await this.packageManager.updateAll(this.catalog); this.notifications.show(count ? `${count} app${count === 1 ? "" : "s"} updated` : "Everything is up to date"); await this.render(); }
    }

    async install(app) {
        if (!app) return;
        const button = this.record.content.querySelector("[data-action=install]");
        const progress = this.record.content.querySelector(".store-progress");
        if (button) { button.disabled = true; button.textContent = "Installing…"; }
        if (progress) progress.hidden = false;
        try {
            await new Promise(resolve => window.setTimeout(resolve, 450));
            const installed = await this.packageManager.install(app, { confirmPermissions: manifest => this.showPermissionDialog(manifest) });
            if (installed) this.selectedApp = app;
        } catch (error) {
            this.notifications.show(error.message || "Installation failed", "error");
        }
        await this.render();
    }

    showPermissionDialog(manifest) {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "store-permissions";
            overlay.innerHTML = '<div class="store-permission-dialog"><p class="store-eyebrow">PERMISSIONS</p><h3></h3><p>Allow this package to use:</p><ul></ul><div><button type="button" data-result="cancel">Cancel</button><button type="button" data-result="allow">Allow & Install</button></div></div>';
            overlay.querySelector("h3").textContent = manifest.name;
            overlay.querySelector("ul").replaceChildren(...manifest.permissions.map(permission => { const item = document.createElement("li"); item.textContent = permission; return item; }));
            overlay.addEventListener("click", event => { const result = event.target.closest("[data-result]")?.dataset.result; if (!result) return; overlay.remove(); resolve(result === "allow"); });
            document.body.append(overlay);
        });
    }

    filteredApps() {
        const term = this.search.trim().toLowerCase();
        return this.catalog.filter(app => (this.category === "All" || app.category === this.category) && (!term || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(term)));
    }

    async render() {
        const root = this.record?.content.querySelector(".tulip-store");
        if (!root) return;
        const installed = new Map((await this.packageManager.getInstalledList()).map(pkg => [pkg.id, pkg]));
        const categories = ["All", ...new Set(this.catalog.map(app => app.category))];
        root.querySelector("[data-role=categories]").replaceChildren(...categories.map(category => {
            const button = document.createElement("button"); button.type = "button"; button.dataset.category = category; button.textContent = category; button.classList.toggle("active", category === this.category); return button;
        }));
        const apps = this.filteredApps();
        const makeCard = app => this.makeCard(app, installed.get(app.id));
        root.querySelector("[data-role=featured]").replaceChildren(...apps.slice(0, 3).map(makeCard));
        root.querySelector("[data-role=apps]").replaceChildren(...apps.map(makeCard));
        const details = root.querySelector("[data-role=details]");
        details.replaceChildren(this.makeDetails(this.selectedApp, installed.get(this.selectedApp?.id)));
    }

    makeCard(app, installed) {
        const card = document.createElement("article");
        card.className = "store-card"; card.dataset.appId = app.id;
        const update = installed && this.packageManager.compareVersions(app.version, installed.installedVersion) > 0;
        card.innerHTML = `<div class="store-app-icon">${app.icon || "📦"}</div><div><h4></h4><p></p></div><span class="store-badge" hidden></span>`;
        card.querySelector("h4").textContent = app.name;
        card.querySelector("p").textContent = app.category;
        const badge = card.querySelector(".store-badge");
        if (update || installed || !this.packageManager.isCatalogInstallable(app)) { badge.hidden = false; badge.textContent = update ? "Update" : installed ? "Installed" : "Coming soon"; badge.classList.toggle("is-update", update); }
        return card;
    }

    makeDetails(app, installed) {
        const panel = document.createElement("div");
        if (!app) { panel.innerHTML = "<p>Select an app to view details.</p>"; return panel; }
        const update = installed && this.packageManager.compareVersions(app.version, installed.installedVersion) > 0;
        panel.innerHTML = '<div class="store-details-icon"></div><h2></h2><p class="store-author"></p><p class="store-description"></p><div class="store-screenshots"><span>Screenshot preview</span><span>Screenshot preview</span></div><dl><dt>Version</dt><dd></dd><dt>Permissions</dt><dd></dd><dt>What’s new</dt><dd></dd></dl><div class="store-detail-actions"></div><div class="store-progress" hidden><span></span></div>';
        panel.querySelector(".store-details-icon").textContent = app.icon || "📦";
        panel.querySelector("h2").textContent = app.name;
        panel.querySelector(".store-author").textContent = `By ${app.author}`;
        panel.querySelector(".store-description").textContent = app.description;
        const values = panel.querySelectorAll("dd"); values[0].textContent = app.version; values[1].textContent = app.permissions.join(", ") || "None"; values[2].textContent = app.changeLog || "No release notes yet.";
        const actions = panel.querySelector(".store-detail-actions");
        const button = document.createElement("button"); button.type = "button";
        if (update) { button.dataset.action = "update"; button.textContent = "Update"; }
        else if (installed) { button.dataset.action = "uninstall"; button.textContent = "Uninstall"; button.className = "secondary"; }
        else if (!this.packageManager.isCatalogInstallable(app)) { button.disabled = true; button.textContent = "Coming soon"; }
        else { button.dataset.action = "install"; button.textContent = "Install"; }
        actions.append(button);
        return panel;
    }
};
