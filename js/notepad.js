window.NotepadApp = class NotepadApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.saveTimer = null;
    }

    open() {
        const record = this.windowManager.create({ appId: "notepad", title: "📝 Tulip Notepad", className: "notepad-window", content: `<div class="notepad"><div class="note-toolbar"><button type="button" data-action="save">💾 Save</button><button type="button" data-action="load">📂 Open</button><button type="button" data-action="new">📄 New</button><span class="note-status" data-role="status">Saved</span><span class="note-info" data-role="info"></span></div><textarea class="notepad-editor" data-role="editor" spellcheck="true"></textarea></div>`, onMount: record => this.bind(record) });
        record.focus();
    }

    bind(record) {
        const root = record.content.querySelector(".notepad");
        const editor = root.querySelector("[data-role=editor]");
        const status = root.querySelector("[data-role=status]");
        editor.value = localStorage.getItem("tulip.note") || "";
        const updateInfo = () => {
            const text = editor.value;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            root.querySelector("[data-role=info]").textContent = `Words: ${words} | Characters: ${text.length}`;
        };
        const save = (quiet = false) => {
            localStorage.setItem("tulip.note", editor.value);
            status.textContent = "Saved";
            if (!quiet) this.notifications.show("Note saved");
        };
        editor.addEventListener("input", () => {
            updateInfo();
            status.textContent = "Unsaved changes";
            window.clearTimeout(this.saveTimer);
            this.saveTimer = window.setTimeout(() => save(true), 700);
        });
        root.addEventListener("click", event => {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "save") save();
            if (action === "load") { editor.value = localStorage.getItem("tulip.note") || ""; status.textContent = "Saved"; updateInfo(); }
            if (action === "new" && window.confirm("Discard the current note?")) { editor.value = ""; updateInfo(); status.textContent = "Unsaved changes"; }
        });
        updateInfo();
    }
}
