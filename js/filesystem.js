class TulipFS {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("TulipOS", 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains("files")) {
                    db.createObjectStore("files", {
                        keyPath: "path"
                    });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = () => reject(new Error("Failed to initialize TulipFS"));
        });
    }

    async create(path, type = "file", content = "", position = { x: 120, y: 180 }) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files", "readwrite");
            const request = tx.objectStore("files").put({
                path,
                type,
                content,
                created: Date.now(),
                position,
                originalPath: path
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error("Failed to create file entry"));
            request.onerror = () => reject(new Error("Failed to write file entry"));
        });
    }

    async get(path) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files");
            const request = tx.objectStore("files").get(path);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Failed to read file entry"));
        });
    }

    async list() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files");
            const request = tx.objectStore("files").getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Failed to list file entries"));
        });
    }

    async rename(oldPath, newPath) {
        if (!oldPath || !newPath || oldPath === newPath) return false;
        const entries = await this.list();
        const affectedEntries = entries.filter(entry => entry.path === oldPath || entry.path.startsWith(`${oldPath}/`));
        if (!affectedEntries.length || entries.some(entry => entry.path === newPath || entry.path.startsWith(`${newPath}/`))) return false;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files", "readwrite");
            const store = tx.objectStore("files");
            affectedEntries.forEach(entry => {
                store.delete(entry.path);
                store.put({ ...entry, path: `${newPath}${entry.path.slice(oldPath.length)}`, originalPath: entry.originalPath || oldPath });
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(new Error("Failed to rename file entry"));
        });
    }

    async move(oldPath, newPath) {
        return this.rename(oldPath, newPath);
    }

    async delete(path) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("files", "readwrite");
            const request = tx.objectStore("files").delete(path);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(new Error("Failed to delete file entry"));
            request.onerror = () => reject(new Error("Failed to delete file entry"));
        });
    }
}

window.TulipFS = new TulipFS();
