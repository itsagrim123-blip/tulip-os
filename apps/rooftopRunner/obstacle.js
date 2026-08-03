(() => {
    "use strict";
    const TYPES = Object.freeze([
        { name: "air conditioner", width: 48, height: 38, color: "#9aa5b9" }, { name: "chimney", width: 28, height: 72, color: "#6f6174" }, { name: "satellite dish", width: 54, height: 30, color: "#b8c8e5" }, { name: "vent", width: 36, height: 28, color: "#7c879f" }, { name: "barrier", width: 56, height: 45, color: "#ffae4a" }, { name: "pipe", width: 42, height: 22, color: "#84d8d6" }
    ]);
    class RunnerObstacle {
        constructor(type, x) { this.type = type; this.x = x; this.y = 428 - type.height; }
        update(dt, speed) { this.x -= speed * dt; }
        bounds() { return { x: this.x, y: this.y, width: this.type.width, height: this.type.height }; }
        draw(ctx) { ctx.save(); ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(this.x + 5, 430, this.type.width, 7); ctx.fillStyle = this.type.color; ctx.fillRect(this.x, this.y, this.type.width, this.type.height); ctx.fillStyle = "rgba(255,255,255,.24)"; ctx.fillRect(this.x + 5, this.y + 5, this.type.width - 10, 6); if (this.type.name === "satellite dish") { ctx.beginPath(); ctx.arc(this.x + 26, this.y + 18, 16, Math.PI, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.Obstacle = RunnerObstacle;
    window.RooftopRunner.ObstacleTypes = TYPES;
})();
