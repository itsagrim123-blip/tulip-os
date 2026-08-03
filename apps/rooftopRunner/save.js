(() => {
    "use strict";
    const ROOT = "/Games/Rooftop Runner";

    class RunnerSave {
        constructor(filesystem = window.TulipFS) { this.filesystem = filesystem; this.ready = null; }
        async ensure() {
            if (this.ready) return this.ready;
            this.ready = (async () => {
                for (const path of ["/Games", ROOT]) if (!(await this.filesystem.get(path))) await this.filesystem.create(path, "folder");
            })();
            return this.ready;
        }
        async read(name, fallback) {
            try { await this.ensure(); const file = await this.filesystem.get(`${ROOT}/${name}`); return file?.content ? { ...fallback, ...JSON.parse(file.content) } : { ...fallback }; }
            catch { return { ...fallback }; }
        }
        async write(name, value) {
            try { await this.ensure(); await this.filesystem.create(`${ROOT}/${name}`, "file", JSON.stringify(value, null, 2)); return true; }
            catch { return false; }
        }
        loadHighScore() { return this.read("highscore.json", { score: 0, coins: 0, distance: 0 }); }
        saveHighScore(value) { return this.write("highscore.json", value); }
        loadSettings() { return this.read("settings.json", { musicVolume: .45, soundVolume: .7, difficulty: "normal", quality: "high", showFps: false, muted: false }); }
        saveSettings(value) { return this.write("settings.json", value); }
        saveRun(value) { return this.write("save.json", value); }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.Save = RunnerSave;
})();
