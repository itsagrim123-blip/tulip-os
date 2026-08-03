(() => {
    "use strict";
    class RunnerEngine {
        constructor({ canvas, onUpdate, onOver }) { this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.onUpdate = onUpdate; this.onOver = onOver; this.player = new window.RooftopRunner.Player(); this.world = new window.RooftopRunner.World(); this.state = "idle"; this.score = 0; this.coins = 0; this.lastTime = 0; this.fps = 60; }
        start() { this.player.reset(); this.world.reset(); this.score = 0; this.coins = 0; this.state = "playing"; this.lastTime = performance.now(); cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(time => this.loop(time)); }
        pause() { if (this.state === "playing") { this.state = "paused"; cancelAnimationFrame(this.frame); } }
        resume() { if (this.state === "paused") { this.state = "playing"; this.lastTime = performance.now(); this.frame = requestAnimationFrame(time => this.loop(time)); } }
        togglePause() { this.state === "playing" ? this.pause() : this.state === "paused" ? this.resume() : undefined; return this.state; }
        jump() { return this.state === "playing" && this.player.jump(); }
        slide() { return this.state === "playing" && this.player.slide(); }
        loop(time) { if (this.state !== "playing") return; const dt = Math.min(.04, Math.max(0, (time - this.lastTime) / 1000)); this.fps = this.fps * .88 + (dt ? 1 / dt : 60) * .12; this.lastTime = time; const speed = Math.min(510, 235 + this.world.distance * 1.8); this.player.update(dt); const event = this.world.update(dt, speed, this.player); this.score += Math.floor(speed * dt * .12); for (const item of event.gained) { this.coins += item.kind === "orb" ? 3 : 1; this.score += item.kind === "orb" ? 30 : 10; } this.draw(); this.onUpdate?.({ score: this.score, coins: this.coins, distance: Math.floor(event.distance), gained: event.gained, fps: this.fps }); if (event.hit) { this.player.hit = true; this.state = "over"; this.onOver?.({ score: this.score, coins: this.coins, distance: Math.floor(event.distance) }); return; } this.frame = requestAnimationFrame(next => this.loop(next)); }
        draw() { const rect = this.canvas.getBoundingClientRect(), scale = Math.min(2, window.devicePixelRatio || 1), width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale)); if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; } const sx = this.canvas.width / 800, sy = this.canvas.height / 480; this.ctx.setTransform(sx, 0, 0, sy, 0, 0); this.world.draw(this.ctx); this.player.draw(this.ctx); }
        stop() { cancelAnimationFrame(this.frame); this.state = "idle"; }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.Engine = RunnerEngine;
})();
