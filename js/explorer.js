const STARTING_FILE_SYSTEM = () => ({
    name: "Desktop", type: "folder", children: [
        { name: "Documents", type: "folder", children: [] },
        { name: "Pictures", type: "folder", children: [] },
        { name: "Music", type: "folder", children: [] },
        { name: "Welcome.txt", type: "file", content: "Welcome to Tulip OS!" }
    ]
});

window.ExplorerApp = class ExplorerApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.fileSystem = STARTING_FILE_SYSTEM();
        this.currentFolder = this.fileSystem;
        this.history = [];
        this.previewId = 0;
    }

    open() {
        const record = this.windowManager.create({ appId: "explorer", title: "📁 File Explorer", className: "explorer-window", content: this.createView(), onMount: record => this.bind(record) });
        this.record = record;
        this.render();
    }

    createView() {
        const root = document.createElement("div");
        root.className = "explorer";
        root.innerHTML = `<div class="explorer-toolbar"><button type="button" data-action="back">⬅ Back</button><button type="button" data-action="folder">📁 Folder</button><button type="button" data-action="file">📄 File</button><button type="button" data-action="upload">📤 Upload</button><button type="button" data-action="refresh">🔄 Refresh</button><input type="file" hidden data-role="upload"></div><p class="explorer-path" data-role="path"></p><div class="explorer-files" data-role="files"></div>`;
        return root;
    }

    bind(record) {
        const root = record.content.querySelector(".explorer");
        root.addEventListener("click", event => this.handleClick(event));
        root.addEventListener("dblclick", event => {
            const item = event.target.closest("[data-index]");
            if (item) this.openItem(Number(item.dataset.index));
        });
        root.addEventListener("contextmenu", event => {
            const item = event.target.closest("[data-index]");
            if (!item) return;
            event.preventDefault();
            this.showContextMenu(Number(item.dataset.index), event.clientX, event.clientY);
        });
        root.querySelector("[data-role=upload]").addEventListener("change", event => this.upload(event));
    }

    handleClick(event) {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "back") this.goBack();
        if (action === "folder") this.createFolder();
        if (action === "file") this.createFile();
        if (action === "upload") this.record.content.querySelector("[data-role=upload]").click();
        if (action === "refresh") this.render();
    }

    render() {
        if (!this.record?.element.isConnected) return;
        const root = this.record.content.querySelector(".explorer");
        root.querySelector("[data-role=path]").textContent = this.history.map(folder => folder.name).concat(this.currentFolder.name).join(" / ");
        const files = root.querySelector("[data-role=files]");
        files.replaceChildren(...this.currentFolder.children.map((item, index) => {
            const element = document.createElement("button");
            element.type = "button";
            element.className = "file-item";
            element.dataset.index = index;
            element.innerHTML = `<span class="file-icon">${this.iconFor(item)}</span><span class="file-name"></span>`;
            element.querySelector(".file-name").textContent = item.name;
            return element;
        }));
    }

    iconFor(item) {
        if (item.type === "folder") return "📁";
        if (item.mime?.startsWith("image/")) return "🖼️";
        if (item.mime?.startsWith("audio/")) return "🎵";
        if (item.mime?.startsWith("video/")) return "🎥";
        return "📄";
    }

    goBack() {
        const folder = this.history.pop();
        if (folder) this.currentFolder = folder;
        this.render();
    }

    createFolder() {
        const name = window.prompt("Folder name");
        if (!name?.trim()) return;
        this.currentFolder.children.push({ name: name.trim(), type: "folder", children: [] });
        this.render();
    }

    createFile() {
        const name = window.prompt("File name", "Untitled.txt");
        if (!name?.trim()) return;
        this.currentFolder.children.push({ name: name.trim(), type: "file", content: "" });
        this.render();
    }

    openItem(index) {
        const item = this.currentFolder.children[index];
        if (!item) return;
        if (item.type === "folder") {
            this.history.push(this.currentFolder);
            this.currentFolder = item;
            this.render();
        } else if (item.mime?.startsWith("image/")) this.preview(item, `<img alt="${item.name}" src="${item.data}">`);
        else if (item.mime?.startsWith("audio/")) this.preview(item, `<audio controls autoplay src="${item.data}"></audio>`);
        else if (item.mime?.startsWith("video/")) this.preview(item, `<video controls autoplay src="${item.data}"></video>`);
        else this.editText(item);
    }

    preview(item, markup) {
        this.windowManager.create({ appId: `preview-${++this.previewId}`, title: item.name, className: "preview-window", singleton: false, content: `<div class="file-preview">${markup}</div>` });
    }

    editText(item) {
        const record = this.windowManager.create({ appId: `editor-${++this.previewId}`, title: `📄 ${item.name}`, className: "editor-window", singleton: false, content: `<textarea class="text-editor"></textarea>` });
        const editor = record.content.querySelector("textarea");
        editor.value = item.content || "";
        editor.addEventListener("input", () => { item.content = editor.value; });
    }

    upload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            this.currentFolder.children.push({ name: file.name, type: "file", mime: file.type, data: reader.result, content: "" });
            event.target.value = "";
            this.render();
            this.notifications.show(`${file.name} uploaded`);
        }, { once: true });
        reader.readAsDataURL(file);
    }

    showContextMenu(index, x, y) {
        document.querySelector(".file-menu")?.remove();
        const menu = document.createElement("div");
        menu.className = "file-menu";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.innerHTML = `<button type="button" data-action="rename">✏ Rename</button><button type="button" data-action="delete">🗑 Delete</button><button type="button" data-action="download">⬇ Download</button>`;
        menu.addEventListener("click", event => {
            const action = event.target.dataset.action;
            if (action === "rename") this.rename(index);
            if (action === "delete") this.delete(index);
            if (action === "download") this.download(index);
            menu.remove();
        }, { once: true });
        document.body.append(menu);
        window.setTimeout(() => document.addEventListener("pointerdown", () => menu.remove(), { once: true }), 0);
    }

    rename(index) {
        const item = this.currentFolder.children[index];
        const name = window.prompt("Rename", item?.name);
        if (name?.trim() && item) { item.name = name.trim(); this.render(); }
    }

    delete(index) {
        const item = this.currentFolder.children[index];
        if (item && window.confirm(`Delete ${item.name}?`)) { this.currentFolder.children.splice(index, 1); this.render(); }
    }

    download(index) {
        const item = this.currentFolder.children[index];
        if (!item || item.type === "folder") return;
        const anchor = document.createElement("a");
        anchor.href = item.data || URL.createObjectURL(new Blob([item.content || ""], { type: "text/plain" }));
        anchor.download = item.name;
        anchor.click();
        if (!item.data) window.setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
    }
}
