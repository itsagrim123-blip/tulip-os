(() => {
    "use strict";
    class RunnerUI {
        constructor(root) { this.root = root; }
        update({ score, coins, distance, best, fps, showFps }) { this.set("score", score); this.set("coins", coins); this.set("distance", `${distance}m`); this.set("best", best); this.root.querySelector("[data-role=fps]").hidden = !showFps; this.set("fps", `${Math.round(fps)} FPS`); }
        set(role, value) { const node = this.root.querySelector(`[data-role=${role}]`); if (node) node.textContent = value; }
        showScreen(kind, data = {}) { const screen = this.root.querySelector("[data-role=screen]"); screen.hidden = false; screen.dataset.state = kind; screen.querySelector("h2").textContent = kind === "over" ? "Run complete" : kind === "paused" ? "Paused" : "Rooftop Runner"; screen.querySelector("p").textContent = kind === "over" ? `Score ${data.score} · ${data.coins} coins · ${data.distance}m` : "Run across the skyline and keep moving."; screen.querySelector("[data-action=start]").textContent = kind === "paused" ? "Resume run" : kind === "over" ? "Run again" : "Start run"; }
        hideScreen() { this.root.querySelector("[data-role=screen]").hidden = true; }
        toggleSettings(show) { this.root.querySelector("[data-role=settings]").hidden = !show; }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.UI = RunnerUI;
})();
