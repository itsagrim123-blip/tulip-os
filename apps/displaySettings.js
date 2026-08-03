(() => {
    "use strict";

    window.DisplaySettingsApp = class DisplaySettingsApp {
        constructor(windowManager, wallpaper, notifications) {
            this.windowManager = windowManager;
            this.wallpaper = wallpaper;
            this.notifications = notifications;
            this.record = null;
            this.preferences = this.loadPreferences();
        }

        open() {
            const record = this.windowManager.create({
                appId: "display-settings",
                title: "🖥 Display Settings",
                className: "display-settings-window",
                content: this.createView(),
                onMount: current => this.bind(current),
                onClose: () => this.record = null
            });
            this.record = record;
        }

        createView() {
            const root = document.createElement("div");
            root.className = "display-settings-app";
            root.innerHTML = `
                <div class="display-settings-top">
                    <section class="display-settings-panel wallpaper-preview-panel">
                        <div class="wallpaper-preview">
                            <div>
                                <h3>Wallpaper Preview</h3>
                                <p>Enjoy a polished, live-updating desktop experience</p>
                            </div>
                        </div>
                    </section>
                    <section class="display-settings-panel">
                        <div class="display-settings-actions">
                            <button type="button" data-action="open-wallpaper-picker">⬆ Upload Wallpaper</button>
                            <button type="button" data-action="browse-wallpapers">🖼 Browse Wallpapers</button>
                            <button type="button" data-action="remove-wallpaper">✕ Remove</button>
                        </div>
                        <div class="wallpaper-gallery">
                            <div class="wallpaper-thumb selected">Aurora</div>
                            <div class="wallpaper-thumb">Mist</div>
                            <div class="wallpaper-thumb">Bloom</div>
                        </div>
                    </section>
                </div>
                <div class="display-settings-grid">
                    <section class="display-settings-panel">
                        <h3>Theme</h3>
                        <div class="choice-grid" data-role="theme">
                            <button type="button" data-value="dark">Dark</button>
                            <button type="button" data-value="light">Light</button>
                            <button type="button" data-value="auto">Auto</button>
                        </div>
                    </section>
                    <section class="display-settings-panel">
                        <h3>Accent Color</h3>
                        <input type="color" data-role="accent" value="${this.preferences.accent}">
                    </section>
                    <section class="display-settings-panel">
                        <h3>Transparency</h3>
                        <input type="range" data-role="transparency" min="0" max="100" value="${this.preferences.transparency}">
                    </section>
                    <section class="display-settings-panel">
                        <h3>Blur</h3>
                        <input type="range" data-role="blur" min="0" max="20" value="${this.preferences.blur}">
                    </section>
                    <section class="display-settings-panel">
                        <h3>Window Animations</h3>
                        <label class="toggle-row"><input type="checkbox" data-role="animations" ${this.preferences.animations ? "checked" : ""}><span>Enable</span></label>
                    </section>
                    <section class="display-settings-panel">
                        <h3>Icon Size</h3>
                        <div class="choice-grid" data-role="icon-size">
                            <button type="button" data-value="small">Small</button>
                            <button type="button" data-value="medium">Medium</button>
                            <button type="button" data-value="large">Large</button>
                        </div>
                    </section>
                    <section class="display-settings-panel">
                        <h3>Font Size</h3>
                        <input type="range" data-role="font-size" min="12" max="20" value="${this.preferences.fontSize}">
                    </section>
                    <section class="display-settings-panel">
                        <h3>Zoom</h3>
                        <input type="range" data-role="zoom" min="80" max="140" value="${this.preferences.zoom}">
                    </section>
                    <section class="display-settings-panel">
                        <h3>Wallpaper Fit</h3>
                        <div class="choice-grid" data-role="wallpaper-fit">
                            <button type="button" data-value="cover">Cover</button>
                            <button type="button" data-value="contain">Contain</button>
                            <button type="button" data-value="stretch">Stretch</button>
                        </div>
                    </section>
                    <section class="display-settings-panel">
                        <h3>Slideshow</h3>
                        <label class="toggle-row"><input type="checkbox" data-role="slideshow" ${this.preferences.slideshow ? "checked" : ""}><span>Enable</span></label>
                    </section>
                </div>
            `;
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".display-settings-app");
            root.addEventListener("input", event => this.handleInput(event, root));
            root.addEventListener("change", event => this.handleInput(event, root));
            root.addEventListener("click", event => this.handleClick(event, root));
            this.sync(root);
        }

        handleInput(event, root) {
            const target = event.target;
            if (target.matches("[data-role=accent]")) this.updatePreference("accent", target.value, root);
            if (target.matches("[data-role=transparency]")) this.updatePreference("transparency", Number(target.value), root);
            if (target.matches("[data-role=blur]")) this.updatePreference("blur", Number(target.value), root);
            if (target.matches("[data-role=font-size]")) this.updatePreference("fontSize", Number(target.value), root);
            if (target.matches("[data-role=zoom]")) this.updatePreference("zoom", Number(target.value), root);
            if (target.matches("[data-role=animations]")) this.updatePreference("animations", target.checked, root);
            if (target.matches("[data-role=slideshow]")) this.updatePreference("slideshow", target.checked, root);
        }

        handleClick(event, root) {
            const change = event.target.closest("[data-value]");
            if (change) return this.updatePreference(change.dataset.role || "theme", change.dataset.value, root);
            const theme = event.target.closest("[data-role=theme] button");
            if (theme) return this.updatePreference("theme", theme.dataset.value, root);
            const icon = event.target.closest("[data-role=icon-size] button");
            if (icon) return this.updatePreference("iconSize", icon.dataset.value, root);
            const fit = event.target.closest("[data-role=wallpaper-fit] button");
            if (fit) return this.updatePreference("wallpaperFit", fit.dataset.value, root);
            if (event.target.closest("[data-action=open-wallpaper-picker]")) {
                window.__tulipLauncher?.open("wallpaper-manager");
                this.notifications?.show("Wallpaper manager opened");
            }
            if (event.target.closest("[data-action=browse-wallpapers]")) {
                window.__tulipLauncher?.open("wallpaper-manager");
                this.notifications?.show("Wallpaper manager opened");
            }
            if (event.target.closest("[data-action=remove-wallpaper]")) {
                window.__tulipLauncher?.open("wallpaper-manager");
                this.notifications?.show("Wallpaper manager opened");
            }
        }

        loadPreferences() {
            try {
                return { theme: "dark", accent: "#8b78ff", transparency: 0, blur: 0, animations: true, iconSize: "medium", fontSize: 14, zoom: 100, wallpaperFit: "cover", slideshow: false, ...JSON.parse(localStorage.getItem("tulip.displaySettings") || "{}") };
            } catch {
                return { theme: "dark", accent: "#8b78ff", transparency: 0, blur: 0, animations: true, iconSize: "medium", fontSize: 14, zoom: 100, wallpaperFit: "cover", slideshow: false };
            }
        }

        savePreferences() {
            localStorage.setItem("tulip.displaySettings", JSON.stringify(this.preferences));
            document.documentElement.style.setProperty("--tulip-accent", this.preferences.accent);
            document.documentElement.style.setProperty("--tulip-accent-rgb", this.hexToRgb(this.preferences.accent));
            document.documentElement.style.setProperty("--tulip-transparency", `${this.preferences.transparency}%`);
            document.documentElement.style.setProperty("--tulip-blur", `${this.preferences.blur}px`);
            document.documentElement.style.fontSize = `${this.preferences.fontSize}px`;
            document.body.style.zoom = `${this.preferences.zoom}%`;
            document.body.dataset.iconSize = this.preferences.iconSize;
            document.body.classList.toggle("tulip-light", this.preferences.theme === "light");
            document.body.classList.toggle("tulip-dark", this.preferences.theme !== "light");
            if (this.preferences.theme === "auto") {
                const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                document.body.classList.toggle("tulip-dark", isDark);
                document.body.classList.toggle("tulip-light", !isDark);
            }
            document.body.classList.toggle("animations-disabled", !this.preferences.animations);
            this.notifications?.show("Display settings updated", "success");
        }

        hexToRgb(value) {
            const color = String(value || "").replace("#", "");
            if (!/^[\da-f]{6}$/i.test(color)) return "167, 139, 250";
            return [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16)).join(", ");
        }

        updatePreference(key, value, root) {
            this.preferences[key] = value;
            this.savePreferences();
            this.sync(root);
        }

        sync(root) {
            root.querySelectorAll("[data-role=theme] button").forEach(button => button.classList.toggle("selected", button.dataset.value === this.preferences.theme));
            root.querySelectorAll("[data-role=icon-size] button").forEach(button => button.classList.toggle("selected", button.dataset.value === this.preferences.iconSize));
            root.querySelectorAll("[data-role=wallpaper-fit] button").forEach(button => button.classList.toggle("selected", button.dataset.value === this.preferences.wallpaperFit));
            const accent = root.querySelector("[data-role=accent]");
            if (accent) accent.value = this.preferences.accent;
            const transparency = root.querySelector("[data-role=transparency]");
            if (transparency) transparency.value = this.preferences.transparency;
            const blur = root.querySelector("[data-role=blur]");
            if (blur) blur.value = this.preferences.blur;
            const fontSize = root.querySelector("[data-role=font-size]");
            if (fontSize) fontSize.value = this.preferences.fontSize;
            const zoom = root.querySelector("[data-role=zoom]");
            if (zoom) zoom.value = this.preferences.zoom;
            const animations = root.querySelector("[data-role=animations]");
            if (animations) animations.checked = this.preferences.animations;
            const slideshow = root.querySelector("[data-role=slideshow]");
            if (slideshow) slideshow.checked = this.preferences.slideshow;
        }
    };
})();
