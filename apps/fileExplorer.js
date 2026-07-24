(function () {
    class FileExplorerApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.currentPath = '/';
            this.entries = [];
            this.record = null;
        }

        open() {
            const record = this.windowManager.create({
                appId: 'explorer',
                title: '📁 File Explorer',
                className: 'explorer-window',
                content: this.createView(),
                onMount: currentRecord => this.bind(currentRecord)
            });

            this.record = record;
            this.loadFolder(this.currentPath);
        }

        createView() {
            const root = document.createElement('div');
            root.className = 'file-explorer';
            root.innerHTML = '<div class="toolbar"><button id="backBtn" type="button">←</button><span id="currentPath">/</span></div><div id="fileGrid"></div>';
            return root;
        }

        bind(record) {
            const backButton = record.content.querySelector('#backBtn');
            const grid = record.content.querySelector('#fileGrid');

            backButton.addEventListener('click', () => this.goBack());
            grid.addEventListener('contextmenu', event => this.openExplorerContextMenu(event));
            grid.addEventListener('dblclick', async event => {
                const item = event.target.closest('.file-item');
                if (!item) return;

                const file = this.entries.find(entry => entry.path === item.dataset.path);
                if (!file) return;

                if (file.type === 'folder') {
                    await this.loadFolder(file.path);
                } else {
                    const opened = await window.TulipFS.get(file.path);
                    alert(opened && opened.content ? opened.content : 'This file is empty.');
                }
            });
        }

        openExplorerContextMenu(event) {
            const item = event.target.closest('.file-item');
            event.preventDefault();
            this.selectedFile = item ? this.entries.find(entry => entry.path === item.dataset.path) : null;
            const menu = document.getElementById('contextMenu');
            if (!menu) return;
            menu.style.left = `${event.pageX}px`;
            menu.style.top = `${event.pageY}px`;
            menu.style.display = 'block';

            const renameBtn = menu.querySelector('#renameBtn');
            const deleteBtn = menu.querySelector('#deleteBtn');
            if (renameBtn) renameBtn.style.display = item ? 'block' : 'none';
            if (deleteBtn) deleteBtn.style.display = item ? 'block' : 'none';

            menu.querySelector('#newFolderBtn').onclick = async () => {
                menu.style.display = 'none';
                await this.createInlineEntry({ targetPath: this.currentPath, type: 'folder', initialName: 'New Folder', x: event.pageX, y: event.pageY });
            };
            menu.querySelector('#newFileBtn').onclick = async () => {
                menu.style.display = 'none';
                await this.createInlineEntry({ targetPath: this.currentPath, type: 'file', initialName: 'New File.txt', x: event.pageX, y: event.pageY });
            };
            menu.querySelector('#pasteBtn').onclick = () => {
                menu.style.display = 'none';
            };
            menu.querySelector('#refreshBtn').onclick = async () => {
                menu.style.display = 'none';
                await this.loadFolder(this.currentPath);
            };
            menu.querySelector('#propertiesBtn').onclick = () => {
                menu.style.display = 'none';
                alert('Properties are not available yet.');
            };
            menu.querySelector('#renameBtn').onclick = async () => {
                if (!this.selectedFile) return;
                const newName = await window.TulipPrompt('Rename', this.selectedFile.path.split('/').pop());
                if (!newName) return;
                const newPath = `${this.selectedFile.path.substring(0, this.selectedFile.path.lastIndexOf('/'))}/${newName}`.replace(/\/+/g, '/') || `/${newName}`;
                await window.TulipFS.rename(this.selectedFile.path, newPath);
                menu.style.display = 'none';
                await this.loadFolder(this.currentPath);
            };
            menu.querySelector('#deleteBtn').onclick = async () => {
                if (!this.selectedFile) return;
                const action = this.currentPath === '/Recycle Bin' ? 'delete' : 'move';
                if (action === 'move') {
                    await window.TulipFS.move(this.selectedFile.path, `/Recycle Bin/${this.selectedFile.path.split('/').pop()}`);
                } else {
                    await window.TulipFS.delete(this.selectedFile.path);
                }
                menu.style.display = 'none';
                await this.loadFolder(this.currentPath);
            };
        }

        async createInlineEntry({ targetPath, type, initialName, x, y }) {
            const entryPath = await this.getAvailablePath(targetPath, initialName);
            await window.TulipFS.create(entryPath, type === 'folder' ? 'folder' : 'file', '');
            const newName = await window.TulipInlineEditor({
                x,
                y,
                initialValue: entryPath.split('/').pop(),
                placeholder: type === 'folder' ? 'Folder name' : 'File name',
                onSubmit: async value => {
                    if (value && value !== entryPath.split('/').pop()) {
                        const target = `${targetPath}/${value}`.replace(/\/+/g, '/');
                        await window.TulipFS.rename(entryPath, target);
                    }
                    await this.loadFolder(this.currentPath);
                }
            });
            if (newName === null || newName === '') {
                await this.loadFolder(this.currentPath);
            }
        }

        async getAvailablePath(targetPath, initialName) {
            const entries = await window.TulipFS.list();
            const parentPath = targetPath.replace(/\/+$/g, '') || '/';
            const existingNames = new Set(entries.filter(entry => {
                const parent = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/';
                return parent === parentPath;
            }).map(entry => entry.path.split('/').pop()));

            let candidate = initialName;
            let counter = 2;
            while (existingNames.has(candidate)) {
                candidate = `${initialName} ${counter}`;
                counter += 1;
            }
            return `${parentPath}/${candidate}`.replace(/\/+/g, '/');
        }

        async loadFolder(path = '/') {
            if (!window.TulipFS || typeof window.TulipFS.list !== 'function') {
                this.notifications && this.notifications.show('Filesystem is not ready yet', 'error');
                return;
            }

            this.currentPath = path;
            if (this.record) {
                const currentPathLabel = this.record.content.querySelector('#currentPath');
                if (currentPathLabel) currentPathLabel.textContent = path;
            }

            const files = await window.TulipFS.list();
            const folder = files.filter(file => {
                const parent = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
                return parent === path;
            });

            this.entries = files;
            this.render(folder);
        }

        async goBack() {
            if (this.currentPath === '/') return;
            const parent = this.currentPath.substring(0, this.currentPath.lastIndexOf('/')) || '/';
            await this.loadFolder(parent);
        }

        render(files) {
            const grid = this.record && this.record.content.querySelector('#fileGrid');
            const currentPath = this.record && this.record.content.querySelector('#currentPath');
            if (!grid || !currentPath) return;

            currentPath.textContent = this.currentPath;
            grid.innerHTML = '';

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.path = file.path;
                item.innerHTML = '<div class="icon">' + (file.type === 'folder' ? '📁' : '📄') + '</div><div class="name">' + file.path.split('/').pop() + '</div>';
                grid.appendChild(item);
            });
        }
    }

    window.FileExplorerApp = FileExplorerApp;
})();
