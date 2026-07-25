window.TerminalApp = class TerminalApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.historyKey = "tulip.terminalHistory";
        this.commands = ["help", "clear", "date", "time", "echo", "pwd", "ls", "dir", "cd", "mkdir", "touch", "cat", "rm", "rmdir", "rename", "cp", "mv", "tree", "whoami", "hostname", "version", "about", "history", "cls", "exit"];
        this.cwd = "/";
        this.history = this.loadHistory();
        this.historyIndex = this.history.length;
        this.busy = false;
    }

    loadHistory() {
        try {
            const history = JSON.parse(localStorage.getItem(this.historyKey) || "[]");
            return Array.isArray(history) ? history.slice(-100) : [];
        } catch { return []; }
    }

    saveHistory() {
        localStorage.setItem(this.historyKey, JSON.stringify(this.history.slice(-100)));
    }

    open() {
        const record = this.windowManager.create({
            appId: "terminal",
            title: "⌘ Tulip Terminal",
            className: "terminal-window",
            content: this.createView(),
            onMount: current => this.bind(current),
            onClose: () => { this.record = null; }
        });
        this.record = record;
        this.focusInput();
    }

    createView() {
        const root = document.createElement("div");
        root.className = "terminal-app";
        root.innerHTML = '<div class="terminal-topbar"><span class="terminal-status"></span><span>Tulip shell</span><span data-role="cwd"></span></div><div class="terminal-output" data-role="output" aria-live="polite"></div><form class="terminal-prompt" data-role="prompt"><span class="terminal-user">Agrim@Tulip</span><span>:</span><span class="terminal-path" data-role="prompt-path">~</span><span>$</span><input data-role="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Terminal command"><span class="terminal-cursor" aria-hidden="true"></span></form>';
        return root;
    }

    bind(record) {
        const root = record.content.querySelector(".terminal-app");
        this.root = root;
        this.output = root.querySelector("[data-role=output]");
        this.input = root.querySelector("[data-role=input]");
        this.writeBanner();
        this.updatePrompt();
        root.querySelector("[data-role=prompt]").addEventListener("submit", event => {
            event.preventDefault();
            this.submit();
        });
        this.input.addEventListener("keydown", event => this.handleKeydown(event));
        root.addEventListener("pointerdown", event => {
            if (!event.target.closest("input")) this.focusInput();
        });
    }

    focusInput() {
        requestAnimationFrame(() => this.input?.focus());
    }

    writeBanner() {
        this.write("Tulip OS Terminal", "terminal-banner-title");
        this.write("Version 1.0 · Type 'help' to see available commands.", "terminal-banner-copy");
        this.write("");
    }

    write(text = "", className = "") {
        if (!this.output) return;
        const line = document.createElement("div");
        line.className = `terminal-line ${className}`.trim();
        line.textContent = text;
        this.output.append(line);
        this.scrollToEnd();
    }

    writeLines(lines, className = "") {
        lines.forEach(line => this.write(line, className));
    }

    scrollToEnd() {
        if (this.output) this.output.scrollTop = this.output.scrollHeight;
    }

    updatePrompt() {
        const displayPath = this.cwd === "/" ? "~" : `~${this.cwd}`;
        this.root?.querySelector("[data-role=prompt-path]")?.replaceChildren(displayPath);
        this.root?.querySelector("[data-role=cwd]")?.replaceChildren(this.cwd);
    }

    handleKeydown(event) {
        if (event.ctrlKey && event.key.toLowerCase() === "l") {
            event.preventDefault(); this.clear(); return;
        }
        if (event.ctrlKey && event.key.toLowerCase() === "c") {
            event.preventDefault(); this.input.value = ""; this.historyIndex = this.history.length; this.write("^C", "terminal-muted"); return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (this.historyIndex > 0) this.historyIndex -= 1;
            this.input.value = this.history[this.historyIndex] || "";
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (this.historyIndex < this.history.length - 1) this.historyIndex += 1;
            else this.historyIndex = this.history.length;
            this.input.value = this.history[this.historyIndex] || "";
            return;
        }
        if (event.key === "Tab") { event.preventDefault(); this.complete(); }
    }

    async submit() {
        const command = this.input.value.trim();
        if (!command || this.busy) return;
        this.echoPrompt(command);
        this.input.value = "";
        if (this.history.at(-1) !== command) this.history.push(command);
        this.history = this.history.slice(-100); this.saveHistory(); this.historyIndex = this.history.length;
        this.busy = true;
        try { await this.run(command); }
        catch (error) { this.write(error.message || "The command could not be completed.", "terminal-error"); }
        finally { this.busy = false; this.updatePrompt(); this.focusInput(); }
    }

    echoPrompt(command) {
        const path = this.cwd === "/" ? "~" : `~${this.cwd}`;
        this.write(`Agrim@Tulip:${path}$ ${command}`, "terminal-command");
    }

    parse(command) {
        const args = [];
        command.replace(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g, token => {
            args.push(token.replace(/^("|')|("|')$/g, "")); return token;
        });
        return args;
    }

    async run(command) {
        const [name, ...args] = this.parse(command);
        const handlers = {
            help: () => this.help(), clear: () => this.clear(), cls: () => this.clear(), date: () => this.write(new Date().toLocaleDateString()), time: () => this.write(new Date().toLocaleTimeString()),
            echo: () => this.write(args.join(" ")), pwd: () => this.write(this.cwd), ls: () => this.list(args[0]), dir: () => this.list(args[0]), cd: () => this.changeDirectory(args[0]),
            mkdir: () => this.makeDirectory(args[0]), touch: () => this.touch(args[0]), cat: () => this.cat(args[0]), rm: () => this.remove(args[0]), rmdir: () => this.removeDirectory(args[0]),
            rename: () => this.rename(args[0], args[1]), cp: () => this.copy(args[0], args[1]), mv: () => this.move(args[0], args[1]), tree: () => this.tree(args[0]),
            whoami: () => this.write("Agrim"), hostname: () => this.write("Tulip"), version: () => this.write("Tulip OS Terminal 1.0"),
            about: () => this.writeLines(["Tulip OS Terminal", "A local shell for the Tulip virtual filesystem."]), history: () => this.showHistory(), exit: () => this.record?.close()
        };
        if (!handlers[name]) { this.write(`${name}: command not found. Type 'help' for commands.`, "terminal-error"); return; }
        await handlers[name]();
    }

    help() {
        this.writeLines([
            "Filesystem: ls, dir, cd, mkdir, touch, cat, rm, rmdir, rename, cp, mv, tree",
            "System:     date, time, pwd, whoami, hostname, version, about, history",
            "Shell:      help, clear, cls, exit",
            "Shortcuts:  Tab autocomplete · Up/Down history · Ctrl+L clear · Ctrl+C cancel"
        ], "terminal-help");
    }

    clear() { if (this.output) this.output.replaceChildren(); }

    requireArgument(value, usage) {
        if (value) return;
        throw new Error(`Missing argument. Usage: ${usage}`);
    }

    resolve(value = "") {
        if (!value || value === "~") return "/";
        const raw = value.startsWith("/") ? value : `${this.cwd}/${value}`;
        const parts = [];
        raw.replace(/\\/g, "/").split("/").forEach(part => {
            if (!part || part === ".") return;
            if (part === "..") parts.pop(); else parts.push(part);
        });
        return `/${parts.join("/")}`;
    }

    async entries() { return window.TulipFS.list(); }

    async entry(path) { return window.TulipFS.get(path); }

    parent(path) { return path.substring(0, path.lastIndexOf("/")) || "/"; }

    basename(path) { return path.split("/").filter(Boolean).pop() || ""; }

    async assertParent(path) {
        const parent = this.parent(path);
        if (parent === "/") return;
        const entry = await this.entry(parent);
        if (!entry || entry.type !== "folder") throw new Error(`Invalid path: parent folder '${parent}' does not exist.`);
    }

    async list(value) {
        const path = this.resolve(value || this.cwd);
        const target = path === "/" ? { type: "folder" } : await this.entry(path);
        if (!target) throw new Error(`Invalid path: '${path}' does not exist.`);
        if (target.type !== "folder") { this.write(this.basename(path)); return; }
        const children = (await this.entries()).filter(item => this.parent(item.path) === path).sort((a, b) => a.type === b.type ? a.path.localeCompare(b.path) : a.type === "folder" ? -1 : 1);
        if (!children.length) { this.write("This folder is empty.", "terminal-muted"); return; }
        this.write(children.map(item => `${item.type === "folder" ? "▸ " : "  "}${this.basename(item.path)}${item.type === "folder" ? "/" : ""}`).join("    "));
    }

    async changeDirectory(value) {
        const path = this.resolve(value || "/");
        if (path !== "/" && (await this.entry(path))?.type !== "folder") throw new Error(`cd: '${path}' is not a folder.`);
        this.cwd = path; this.updatePrompt();
    }

    async makeDirectory(value) {
        this.requireArgument(value, "mkdir <folder>");
        const path = this.resolve(value);
        if (await this.entry(path)) throw new Error(`mkdir: '${path}' already exists.`);
        await this.assertParent(path); await window.TulipFS.create(path, "folder", "");
    }

    async touch(value) {
        this.requireArgument(value, "touch <file>");
        const path = this.resolve(value); const existing = await this.entry(path);
        if (existing?.type === "folder") throw new Error(`touch: '${path}' is a folder.`);
        await this.assertParent(path); await window.TulipFS.create(path, "file", existing?.content || "");
    }

    async cat(value) {
        this.requireArgument(value, "cat <file>");
        const path = this.resolve(value); const file = await this.entry(path);
        if (!file) throw new Error(`cat: '${path}' does not exist.`);
        if (file.type === "folder") throw new Error(`cat: '${path}' is a folder.`);
        this.write(file.content || "");
    }

    async remove(value) {
        this.requireArgument(value, "rm <file>");
        const path = this.resolve(value); const file = await this.entry(path);
        if (!file) throw new Error(`rm: '${path}' does not exist.`);
        if (file.type === "folder") throw new Error("rm: use rmdir to remove an empty folder.");
        await window.TulipFS.delete(path);
    }

    async removeDirectory(value) {
        this.requireArgument(value, "rmdir <folder>");
        const path = this.resolve(value);
        if (path === "/") throw new Error("Permission denied: the root folder cannot be removed.");
        const folder = await this.entry(path);
        if (!folder) throw new Error(`rmdir: '${path}' does not exist.`);
        if (folder.type !== "folder") throw new Error(`rmdir: '${path}' is not a folder.`);
        if ((await this.entries()).some(item => this.parent(item.path) === path)) throw new Error("rmdir: folder is not empty.");
        await window.TulipFS.delete(path);
        if (this.cwd === path) this.cwd = this.parent(path);
    }

    async rename(source, destination) {
        this.requireArgument(source, "rename <source> <destination>"); this.requireArgument(destination, "rename <source> <destination>");
        const from = this.resolve(source); const to = this.resolve(destination);
        if (!(await this.entry(from))) throw new Error(`rename: '${from}' does not exist.`);
        await this.assertParent(to);
        if (!(await window.TulipFS.rename(from, to))) throw new Error(`rename: '${to}' already exists or is invalid.`);
        this.updateWorkingDirectory(from, to);
    }

    async copy(source, destination) {
        this.requireArgument(source, "cp <source> <destination>"); this.requireArgument(destination, "cp <source> <destination>");
        const from = this.resolve(source); const original = await this.entry(from);
        if (!original) throw new Error(`cp: '${from}' does not exist.`);
        let to = this.resolve(destination); const target = await this.entry(to);
        if (target?.type === "folder") to = `${to}/${this.basename(from)}`;
        if (await this.entry(to)) throw new Error(`cp: '${to}' already exists.`);
        await this.assertParent(to);
        const all = await this.entries(); const copies = all.filter(item => item.path === from || item.path.startsWith(`${from}/`));
        for (const item of copies) await window.TulipFS.create(`${to}${item.path.slice(from.length)}`, item.type, item.content || "", item.position);
    }

    async move(source, destination) {
        this.requireArgument(source, "mv <source> <destination>"); this.requireArgument(destination, "mv <source> <destination>");
        const from = this.resolve(source);
        if (!(await this.entry(from))) throw new Error(`mv: '${from}' does not exist.`);
        let to = this.resolve(destination); const target = await this.entry(to);
        if (target?.type === "folder") to = `${to}/${this.basename(from)}`;
        await this.assertParent(to);
        if (!(await window.TulipFS.move(from, to))) throw new Error(`mv: '${to}' already exists or is invalid.`);
        this.updateWorkingDirectory(from, to);
    }

    updateWorkingDirectory(from, to) {
        if (this.cwd === from || this.cwd.startsWith(`${from}/`)) this.cwd = `${to}${this.cwd.slice(from.length)}`;
    }

    async tree(value) {
        const root = this.resolve(value || this.cwd); const target = root === "/" ? { type: "folder" } : await this.entry(root);
        if (!target || target.type !== "folder") throw new Error(`tree: '${root}' is not a folder.`);
        const all = await this.entries(); const lines = [root === "/" ? "/" : this.basename(root)];
        const walk = (path, prefix) => {
            const children = all.filter(item => this.parent(item.path) === path).sort((a, b) => a.path.localeCompare(b.path));
            children.forEach((item, index) => {
                const last = index === children.length - 1; lines.push(`${prefix}${last ? "└──" : "├──"} ${this.basename(item.path)}${item.type === "folder" ? "/" : ""}`);
                if (item.type === "folder") walk(item.path, `${prefix}${last ? "    " : "│   "}`);
            });
        };
        walk(root, ""); this.writeLines(lines, "terminal-tree");
    }

    showHistory() { this.history.forEach((item, index) => this.write(`${String(index + 1).padStart(3, " ")}  ${item}`)); }

    async complete() {
        const value = this.input.value; const before = value.slice(0, this.input.selectionStart); const tokens = this.parse(before);
        const token = tokens.at(-1) || ""; const first = tokens.length <= 1 && !/\s$/.test(before);
        let candidates = [];
        if (first) candidates = this.commands.filter(command => command.startsWith(token.toLowerCase()));
        else {
            const slash = token.lastIndexOf("/"); const folderPart = slash >= 0 ? token.slice(0, slash + 1) : ""; const namePart = slash >= 0 ? token.slice(slash + 1) : token;
            const folder = this.resolve(folderPart || ".");
            const target = folder === "/" ? { type: "folder" } : await this.entry(folder);
            if (target?.type === "folder") candidates = (await this.entries()).filter(item => this.parent(item.path) === folder && this.basename(item.path).toLowerCase().startsWith(namePart.toLowerCase())).map(item => `${folderPart}${this.basename(item.path)}${item.type === "folder" ? "/" : ""}`);
        }
        if (!candidates.length) return;
        if (candidates.length === 1) {
            const replacement = candidates[0]; const start = before.length - token.length;
            this.input.value = `${value.slice(0, start)}${replacement}${value.slice(this.input.selectionStart)}`;
            const caret = start + replacement.length; this.input.setSelectionRange(caret, caret);
        } else this.write(candidates.join("    "), "terminal-help");
    }
}
