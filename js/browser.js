(() => {
    "use strict";

    const HOME_URL = "https://example.com";
    const STORAGE_KEY = "tulip.browser.state.v2";
    const DEFAULT_BOOKMARKS = ["https://developer.mozilla.org", "https://github.com", "https://stackoverflow.com"];
    const EMBED_RESTRICTED = ["google.com", "youtube.com", "gmail.com", "chatgpt.com", "github.com"];
    const safeParse = value => { try { return JSON.parse(value); } catch { return null; } };

    window.BrowserApp = class BrowserApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            const saved = safeParse(localStorage.getItem(STORAGE_KEY) || "");
            this.tabs = Array.isArray(saved?.tabs) && saved.tabs.length ? saved.tabs.slice(0, 12).map(tab => this.normalizeTab(tab)) : [];
            this.activeTab = Math.max(0, Math.min(Number(saved?.activeTab) || 0, Math.max(0, this.tabs.length - 1)));
            this.bookmarks = Array.isArray(saved?.bookmarks) ? saved.bookmarks.filter(url => this.isSafeUrl(url)).slice(0, 50) : DEFAULT_BOOKMARKS;
            this.settings = { searchEngine: saved?.settings?.searchEngine === "duckduckgo" ? "duckduckgo" : "google" };
            this.fallbackTimer = 0;
        }

        normalizeTab(tab = {}) {
            const url = this.isSafeUrl(tab.url) ? tab.url : HOME_URL;
            const history = Array.isArray(tab.history) ? tab.history.filter(item => this.isSafeUrl(item)).slice(-50) : [url];
            return { title: this.titleFor(url), url, history: history.length ? history : [url], historyIndex: Math.max(0, Math.min(Number(tab.historyIndex) || 0, Math.max(0, history.length - 1))) };
        }

        save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: this.tabs, activeTab: this.activeTab, bookmarks: this.bookmarks, settings: this.settings })); } catch { /* The browser remains available without persistent storage. */ } }

        open() {
            const needsLoad = !this.record?.element.isConnected;
            const record = this.windowManager.create({ appId: "browser", title: "🌐 Tulip Browser", className: "browser-window", content: this.view(), onMount: current => this.bind(current), onClose: () => { window.clearTimeout(this.fallbackTimer); this.record = null; } });
            this.record = record;
            if (!this.tabs.length) this.newTab();
            this.render();
            if (needsLoad) this.loadActive();
        }

        view() {
            const root = document.createElement("div");
            root.className = "tulip-browser";
            root.innerHTML = '<div class="browser-toolbar"><button type="button" data-action="back" title="Back">←</button><button type="button" data-action="forward" title="Forward">→</button><button type="button" data-action="refresh" title="Reload">↻</button><button type="button" data-action="home" title="Home">⌂</button><input class="browser-address" data-role="address" placeholder="Search or enter URL" autocomplete="off" inputmode="url"><button type="button" data-action="bookmark" title="Bookmark this page">☆</button><button type="button" data-action="download" title="Save link to Downloads">⇩</button><button type="button" data-action="external" title="Open externally">↗</button><button type="button" data-action="new-tab" title="New tab">+</button></div><div class="browser-tabs" data-role="tabs"></div><div class="browser-embed-notice" data-role="notice" hidden><span>This site blocks in-app viewing. It can be opened safely in a separate tab.</span><button type="button" data-action="external">Open externally</button></div><div class="browser-panel" data-role="panel" hidden></div><iframe class="browser-frame" data-role="frame" title="Tulip Browser" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-modals allow-popups allow-scripts allow-downloads"></iframe><footer class="browser-footer"><button type="button" data-action="bookmarks">Bookmarks</button><button type="button" data-action="history">History</button><button type="button" data-action="settings">Settings</button></footer>';
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".tulip-browser");
            root.addEventListener("click", event => this.handleClick(event));
            root.querySelector("[data-role=address]").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); this.navigate(event.currentTarget.value); } });
            const frame = root.querySelector("[data-role=frame]");
            frame.addEventListener("load", () => { window.clearTimeout(this.fallbackTimer); this.setNotice(false); });
            frame.addEventListener("error", () => this.setNotice(true));
        }

        root() { return this.record?.content.querySelector(".tulip-browser"); }
        frame() { return this.root()?.querySelector("[data-role=frame]"); }
        active() { return this.tabs[this.activeTab]; }
        isSafeUrl(value) { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }
        titleFor(url) { try { return new URL(url).hostname.replace(/^www\./, "") || "New tab"; } catch { return "New tab"; } }

        normalizeUrl(value) {
            const typed = String(value || "").trim();
            if (!typed) return { url: HOME_URL, isSearch: false };
            if (/^https?:\/\//i.test(typed) && this.isSafeUrl(typed)) return { url: typed, isSearch: false };
            if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(typed)) return { url: `https://${typed}`, isSearch: false };
            const base = this.settings.searchEngine === "duckduckgo" ? "https://duckduckgo.com/?q=" : "https://www.google.com/search?q=";
            return { url: `${base}${encodeURIComponent(typed)}`, isSearch: true };
        }

        handleClick(event) {
            const close = event.target.closest("[data-close-tab]");
            if (close) return this.closeTab(Number(close.dataset.closeTab));
            const tab = event.target.closest("[data-tab]");
            if (tab) { this.activeTab = Number(tab.dataset.tab); this.render(); return this.loadActive(); }
            const removeBookmark = event.target.closest("[data-remove-bookmark]");
            if (removeBookmark) { this.bookmarks.splice(Number(removeBookmark.dataset.removeBookmark), 1); this.save(); return this.renderPanel("bookmarks"); }
            const history = event.target.closest("[data-history-index]");
            if (history) return this.goToHistory(Number(history.dataset.historyIndex));
            const bookmark = event.target.closest("[data-bookmark-url]");
            if (bookmark) return this.navigate(bookmark.dataset.bookmarkUrl);
            const engine = event.target.closest("[data-search-engine]");
            if (engine) { this.settings.searchEngine = engine.dataset.searchEngine; this.save(); return this.renderPanel("settings"); }
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "back") this.goHistory(-1);
            if (action === "forward") this.goHistory(1);
            if (action === "refresh") this.loadActive(true);
            if (action === "home") this.navigate(HOME_URL);
            if (action === "new-tab") { this.newTab(); this.render(); this.loadActive(); }
            if (action === "external") this.openExternally();
            if (action === "bookmark") this.toggleBookmark();
            if (action === "download") this.downloadActive();
            if (["bookmarks", "history", "settings"].includes(action)) this.renderPanel(action);
        }

        newTab() { this.tabs.push(this.normalizeTab()); this.activeTab = this.tabs.length - 1; this.save(); }
        closeTab(index) { if (this.tabs.length === 1) { this.tabs[0] = this.normalizeTab(); this.activeTab = 0; } else { this.tabs.splice(index, 1); this.activeTab = Math.min(this.activeTab, this.tabs.length - 1); } this.save(); this.render(); this.loadActive(); }

        navigate(value, addHistory = true) {
            const result = this.normalizeUrl(value); const tab = this.active();
            if (!tab) return;
            tab.url = result.url; tab.title = this.titleFor(result.url);
            if (addHistory) { tab.history = tab.history.slice(0, tab.historyIndex + 1); tab.history.push(result.url); tab.history = tab.history.slice(-50); tab.historyIndex = tab.history.length - 1; }
            this.save(); this.render();
            if (result.isSearch || this.mustOpenExternally(result.url)) { this.setNotice(true); this.openExternally(); return; }
            this.loadActive();
        }

        loadActive(force = false) {
            const frame = this.frame(); const tab = this.active(); if (!frame || !tab) return;
            this.setNotice(false); window.clearTimeout(this.fallbackTimer);
            frame.src = force ? `${tab.url}${tab.url.includes("#") ? "&" : "#"}tulip-reload=${Date.now()}` : tab.url;
            if (!this.mustOpenExternally(tab.url)) this.fallbackTimer = window.setTimeout(() => this.setNotice(true), 6500);
        }

        goHistory(direction) { const tab = this.active(); this.goToHistory((tab?.historyIndex ?? 0) + direction); }
        goToHistory(index) { const tab = this.active(); if (!tab || index < 0 || index >= tab.history.length) return; tab.historyIndex = index; tab.url = tab.history[index]; tab.title = this.titleFor(tab.url); this.save(); this.render(); if (this.mustOpenExternally(tab.url)) this.setNotice(true); else this.loadActive(); }
        mustOpenExternally(url) { try { const host = new URL(url).hostname.toLowerCase(); return EMBED_RESTRICTED.some(domain => host === domain || host.endsWith(`.${domain}`)); } catch { return true; } }
        openExternally() { const url = this.active()?.url; if (!this.isSafeUrl(url)) return; const external = window.open(url, "_blank", "noopener,noreferrer"); if (!external) this.notifications?.show("Your browser blocked the new tab. Allow popups to open this page.", "error"); }

        toggleBookmark() { const url = this.active()?.url; if (!this.isSafeUrl(url)) return; const index = this.bookmarks.indexOf(url); if (index >= 0) this.bookmarks.splice(index, 1); else this.bookmarks.unshift(url); this.bookmarks = this.bookmarks.slice(0, 50); this.save(); this.render(); this.notifications?.show(index >= 0 ? "Bookmark removed" : "Page bookmarked"); }
        async downloadActive() { const tab = this.active(); if (!tab || !this.isSafeUrl(tab.url)) return; const name = `${this.titleFor(tab.url).replace(/[^a-z0-9._-]/gi, "-").slice(0, 60) || "website"}.url`; try { await window.TulipFS?.create?.(`/Downloads/${name}`, "file", `[InternetShortcut]\nURL=${tab.url}\n`); this.notifications?.show("Website shortcut saved to Downloads"); } catch { this.notifications?.show("Unable to save this download shortcut.", "error"); } }

        setNotice(show) { const notice = this.root()?.querySelector("[data-role=notice]"); if (notice) notice.hidden = !show; }
        renderPanel(kind) {
            const panel = this.root()?.querySelector("[data-role=panel]"); if (!panel) return;
            panel.hidden = !panel.hidden && panel.dataset.kind === kind;
            if (panel.hidden) return;
            panel.dataset.kind = kind; panel.replaceChildren();
            if (kind === "bookmarks") { const heading = document.createElement("h3"); heading.textContent = "Bookmarks"; panel.append(heading, ...this.bookmarks.map((url, index) => { const row = document.createElement("div"); const open = document.createElement("button"); open.type = "button"; open.dataset.bookmarkUrl = url; open.textContent = this.titleFor(url); const remove = document.createElement("button"); remove.type = "button"; remove.dataset.removeBookmark = index; remove.textContent = "Remove"; row.append(open, remove); return row; })); }
            if (kind === "history") { const tab = this.active(); const heading = document.createElement("h3"); heading.textContent = "History"; panel.append(heading, ...(tab?.history || []).slice().reverse().map((url, reverseIndex) => { const button = document.createElement("button"); button.type = "button"; button.dataset.historyIndex = String((tab.history.length - 1) - reverseIndex); button.textContent = url; return button; })); }
            if (kind === "settings") { panel.innerHTML = '<h3>Browser settings</h3><p>Search engine</p><div><button type="button" data-search-engine="google">Google</button><button type="button" data-search-engine="duckduckgo">DuckDuckGo</button></div>'; panel.querySelectorAll("[data-search-engine]").forEach(button => button.classList.toggle("active", button.dataset.searchEngine === this.settings.searchEngine)); }
        }
        render() {
            const root = this.root(); const active = this.active(); if (!root || !active) return;
            root.querySelector("[data-role=address]").value = active.url;
            root.querySelector("[data-action=bookmark]").textContent = this.bookmarks.includes(active.url) ? "★" : "☆";
            const tabs = root.querySelector("[data-role=tabs]"); tabs.replaceChildren(...this.tabs.map((tab, index) => { const button = document.createElement("button"); button.type = "button"; button.className = `browser-tab${index === this.activeTab ? " active" : ""}`; button.dataset.tab = index; const title = document.createElement("span"); title.textContent = tab.title; const close = document.createElement("span"); close.className = "browser-tab-close"; close.dataset.closeTab = index; close.title = "Close tab"; close.textContent = "×"; button.append(title, close); return button; }));
        }
    };
})();
