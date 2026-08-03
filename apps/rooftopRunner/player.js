(() => {
    "use strict";
    class RunnerPlayer {
        constructor() { this.reset(); }
        reset() { this.x = 112; this.y = 370; this.width = 34; this.height = 58; this.velocity = 0; this.jumps = 0; this.slideUntil = 0; this.hit = false; this.runningTime = 0; }
        get sliding() { return performance.now() < this.slideUntil && this.y >= 369; }
        bounds() { const height = this.sliding ? 32 : this.height; return { x: this.x - this.width / 2, y: this.y - height, width: this.width, height }; }
        jump() { if (this.hit || this.jumps >= 2) return false; this.velocity = this.jumps ? -460 : -510; this.jumps += 1; return true; }
        slide() { if (this.y >= 369 && !this.hit) { this.slideUntil = performance.now() + 560; return true; } return false; }
        update(dt) { this.runningTime += dt; this.velocity += 1380 * dt; this.y = Math.min(428, this.y + this.velocity * dt); if (this.y >= 428) { this.y = 428; this.velocity = 0; this.jumps = 0; } }
        draw(ctx) {
            const box = this.bounds(), bob = this.y >= 428 && !this.sliding ? Math.sin(this.runningTime * 18) * 2 : 0;
            ctx.save(); ctx.translate(box.x + box.width / 2, box.y + box.height / 2 + bob);
            if (this.hit) ctx.rotate(.35);
            ctx.fillStyle = "#f4f7ff"; ctx.fillRect(-11, -box.height / 2 + 3, 22, box.height - 12);
            ctx.fillStyle = "#9f7aff"; ctx.fillRect(-14, -box.height / 2, 28, 17);
            ctx.fillStyle = "#1b1d38"; ctx.beginPath(); ctx.arc(0, -box.height / 2 - 7, 13, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#73ecff"; ctx.lineWidth = 5; ctx.lineCap = "round"; const leg = this.sliding ? 0 : Math.sin(this.runningTime * 18) * 8; ctx.beginPath(); ctx.moveTo(-6, box.height / 2 - 9); ctx.lineTo(-8 + leg, box.height / 2 + 5); ctx.moveTo(6, box.height / 2 - 9); ctx.lineTo(8 - leg, box.height / 2 + 5); ctx.stroke(); ctx.restore();
        }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.Player = RunnerPlayer;
})();
