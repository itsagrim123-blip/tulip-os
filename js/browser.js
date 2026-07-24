const HOME_URL = "https://example.com";
const BLOCKED_DOMAINS = ["google.com", "youtube.com", "gmail.com", "chatgpt.com", "github.com"];
const DEFAULT_BOOKMARKS = ["https://github.com", "https://stackoverflow.com", "https://developer.mozilla.org"];

window.BrowserApp = class BrowserApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.tabs = [];
        this.activeTab = 0;
        this.fallbackTimer = null;
    }

    open() {
        const needsLoad = !this.record?.element.isConnected;
        const record = this.windowManager.create({ appId: "browser", title: "🌐 Tulip Browser", className: "browser-window", content: `<div class="tulip-browser"><div class="browser-toolbar"><button type="button" data-action="back" title="Back">⬅</button><button type="button" data-action="forward" title="Forward">➡</button><button type="button" data-action="refresh" title="Refresh">🔄</button><button type="button" data-action="home" title="Home">🏠</button><input class="browser-address" data-role="address" placeholder="Search or enter URL" autocomplete="off"><button type="button" data-action="bookmarks" title="Bookmarks">⭐</button><button type="button" data-action="external" title="Open externally">↗</button><button type="button" data-action="new-tab" title="New tab">+</button></div><div class="browser-tabs" data-role="tabs"></div><div class="browser-embed-notice" data-role="notice" hidden><span>This site cannot be displayed inside Tulip Browser.</span><button type="button" data-action="external">Open in New Tab</button></div><iframe class="browser-frame" data-role="frame" title="Tulip Browser"></iframe></div>`, onMount: record => this.bind(record), onClose: () => { window.clearTimeout(this.fallbackTimer); this.record = null; } });
        if (!this.tabs.length) this.newTab();
        this.record = record;
        this.render();
        if (needsLoad) this.navigate(this.tabs[this.activeTab].url, false);
    }

    bind(record) {
        const root = record.content.querySelector(".tulip-browser");
        root.addEventListener("click", event => this.handleClick(event));
        root.querySelector("[data-role=address]").addEventListener("keydown", event => {
            if (event.key === "Enter") this.navigate(event.target.value);
        });
        root.querySelector("[data-role=frame]").addEventListener("load", () => { window.clearTimeout(this.fallbackTimer); this.setNotice(false); });
        root.querySelector("[data-role=frame]").addEventListener("error", () => this.setNotice(true));
    }

    active() { return this.tabs[this.activeTab]; }
    root() { return this.record?.content.querySelector(".tulip-browser"); }
    frame() { return this.root()?.querySelector("[data-role=frame]"); }

    handleClick(event) {
        const close = event.target.closest("[data-close-tab]");
        if (close) { this.closeTab(Number(close.dataset.closeTab)); return; }
        const tab = event.target.closest("[data-tab]");
        if (tab) { this.activeTab = Number(tab.dataset.tab); this.render(); this.loadActive(); return; }
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "back") this.goHistory(-1);
        if (action === "forward") this.goHistory(1);
        if (action === "refresh") this.loadActive();
        if (action === "home") this.navigate(HOME_URL);
        if (action === "new-tab") { this.newTab(); this.render(); this.loadActive(); }
        if (action === "external") this.openExternally();
        if (action === "bookmarks") this.openBookmark();
    }

    newTab() {
        this.tabs.push({ title: "New Tab", url: HOME_URL, history: [HOME_URL], historyIndex: 0 });
        this.activeTab = this.tabs.length - 1;
    }

    closeTab(index) {
        if (this.tabs.length === 1) return;
        this.tabs.splice(index, 1);
        this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
        this.render();
        this.loadActive();
    }

    normalizeUrl(value) {
        const typed = value.trim();
        if (/^https?:\/\//i.test(typed)) return { url: typed, isSearch: false };
        if (typed.includes(".")) return { url: `https://${typed}`, isSearch: false };
        return { url: `https://www.google.com/search?q=${encodeURIComponent(typed)}`, isSearch: true };
    }

    navigate(value, addHistory = true) {
        const result = this.normalizeUrl(value);
        const tab = this.active();
        if (!tab) return;
        tab.url = result.url;
        tab.title = this.titleFor(result.url);
        if (addHistory) {
            tab.history = tab.history.slice(0, tab.historyIndex + 1);
            tab.history.push(result.url);
            tab.historyIndex += 1;
        }
        this.render();
        if (result.isSearch || this.mustOpenExternally(result.url)) {
            this.setNotice(true);
            this.openExternally();
            return;
        }
        this.loadActive();
    }

    loadActive() {
        const frame = this.frame();
        if (!frame || !this.active()) return;
        this.setNotice(false);
        frame.src = this.active().url;
        window.clearTimeout(this.fallbackTimer);
        this.fallbackTimer = window.setTimeout(() => this.setNotice(true), 6000);
    }

    goHistory(direction) {
        const tab = this.active();
        const next = tab?.historyIndex + direction;
        if (!tab || next < 0 || next >= tab.history.length) return;
        tab.historyIndex = next;
        tab.url = tab.history[next];
        tab.title = this.titleFor(tab.url);
        this.render();
        if (this.mustOpenExternally(tab.url)) {
            this.setNotice(true);
            this.openExternally();
        } else this.loadActive();
    }

    mustOpenExternally(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
        } catch { return false; }
    }

    titleFor(url) {
        try { return new URL(url).hostname.replace(/^www\./, "") || "New Tab"; } catch { return "New Tab"; }
    }

    openExternally() {
        const url = this.active()?.url;
        if (url) window.open(url, "_blank", "noopener");
    }

    openBookmark() {
        const saved = JSON.parse(localStorage.getItem("tulip.bookmarks") || "null") || DEFAULT_BOOKMARKS;
        const chosen = window.prompt(`Bookmarks:\n\n${saved.join("\n")}`);
        if (chosen) this.navigate(chosen);
    }

    setNotice(show) {
        const notice = this.root()?.querySelector("[data-role=notice]");
        if (notice) notice.hidden = !show;
    }

    render() {
        const root = this.root();
        if (!root || !this.active()) return;
        root.querySelector("[data-role=address]").value = this.active().url;
        const tabs = root.querySelector("[data-role=tabs]");
        tabs.replaceChildren(...this.tabs.map((tab, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `browser-tab${index === this.activeTab ? " active" : ""}`;
            button.dataset.tab = index;
            button.innerHTML = `<span></span><span class="browser-tab-close" data-close-tab="${index}" title="Close tab">✕</span>`;
            button.firstElementChild.textContent = tab.title;
            return button;
        }));
    }
}
