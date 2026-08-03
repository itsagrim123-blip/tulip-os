(() => {
    "use strict";
    const { Obstacle, ObstacleTypes } = window.RooftopRunner;
    const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    class RunnerWorld {
        constructor() { this.reset(); }
        reset() { this.obstacles = []; this.collectibles = []; this.particles = []; this.roofs = [{ x: -80, width: 300, height: 78 }, { x: 220, width: 330, height: 96 }, { x: 550, width: 300, height: 70 }]; this.spawnTimer = 1.2; this.collectTimer = .75; this.time = 0; this.distance = 0; this.dayPhase = 0; }
        update(dt, speed, player) {
            this.time += dt; this.distance += speed * dt * .035; this.dayPhase = (this.dayPhase + dt / 75) % 1;
            for (const item of this.obstacles) item.update(dt, speed); this.obstacles = this.obstacles.filter(item => item.x + item.type.width > -40);
            for (const item of this.collectibles) item.x -= speed * dt; this.collectibles = this.collectibles.filter(item => item.x > -30);
            for (const roof of this.roofs) roof.x -= speed * dt; if (this.roofs[0].x + this.roofs[0].width < -20) { const previous = this.roofs.shift(); this.roofs.push({ x: this.roofs.at(-1).x + this.roofs.at(-1).width + 18 + Math.random() * 34, width: 250 + Math.random() * 160, height: 62 + Math.random() * 62 }); }
            this.spawnTimer -= dt; this.collectTimer -= dt;
            if (this.spawnTimer <= 0) { const type = ObstacleTypes[Math.floor(Math.random() * ObstacleTypes.length)]; this.obstacles.push(new Obstacle(type, 780)); this.spawnTimer = Math.max(.72, 1.48 - speed / 620) + Math.random() * .5; }
            if (this.collectTimer <= 0) { this.collectibles.push({ x: 780, y: 285 + Math.random() * 90, kind: Math.random() > .84 ? "orb" : "coin", phase: Math.random() * Math.PI * 2 }); this.collectTimer = .38 + Math.random() * .42; }
            this.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }); this.particles = this.particles.filter(p => p.life > 0);
            const playerBounds = player.bounds(); const hit = this.obstacles.some(item => intersects(playerBounds, item.bounds()));
            const gained = []; this.collectibles = this.collectibles.filter(item => { const box = { x: item.x - 11, y: item.y - 11, width: 22, height: 22 }; if (intersects(playerBounds, box)) { gained.push(item); this.spark(item.x, item.y, item.kind === "orb" ? "#73ecff" : "#ffd65a"); return false; } return true; });
            return { hit, gained, distance: this.distance };
        }
        spark(x, y, color) { for (let i = 0; i < 8; i += 1) this.particles.push({ x, y, vx: (Math.random() - .5) * 110, vy: (Math.random() - .5) * 110, life: .35 + Math.random() * .3, color }); }
        draw(ctx) {
            const phase = this.dayPhase, hue = 215 + Math.sin(phase * Math.PI * 2) * 25; const sky = ctx.createLinearGradient(0, 0, 0, 480); sky.addColorStop(0, `hsl(${hue} 54% ${18 + Math.max(0, Math.sin(phase * Math.PI * 2)) * 18}%)`); sky.addColorStop(1, `hsl(${hue + 22} 60% 52%)`); ctx.fillStyle = sky; ctx.fillRect(0, 0, 800, 480);
            ctx.globalAlpha = .25; ctx.fillStyle = "#edf7ff"; for (let i = 0; i < 5; i += 1) { const x = ((i * 180 - this.distance * 1.7) % 900 + 900) % 900 - 60; ctx.beginPath(); ctx.ellipse(x, 95 + (i % 3) * 35, 55, 14, 0, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
            this.drawCity(ctx, .18, "#25315f", 235); this.drawCity(ctx, .34, "#1b2451", 285);
            for (const roof of this.roofs) { const top = 428 - roof.height; ctx.fillStyle = "#18203d"; ctx.fillRect(roof.x, top, roof.width, 480 - top); ctx.fillStyle = "#51628a"; ctx.fillRect(roof.x, top, roof.width, 8); }
            this.collectibles.forEach(item => { const pulse = 1 + Math.sin(this.time * 8 + item.phase) * .12; ctx.save(); ctx.translate(item.x, item.y); ctx.scale(pulse, pulse); ctx.shadowBlur = 16; ctx.shadowColor = item.kind === "orb" ? "#73ecff" : "#ffd65a"; ctx.fillStyle = item.kind === "orb" ? "#73ecff" : "#ffd65a"; ctx.beginPath(); ctx.arc(0, 0, item.kind === "orb" ? 10 : 8, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
            this.obstacles.forEach(item => item.draw(ctx)); this.particles.forEach(p => { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1;
        }
        drawCity(ctx, factor, color, base) { ctx.fillStyle = color; for (let i = -1; i < 10; i += 1) { const width = 60 + (i % 3) * 24; const x = i * 100 - (this.distance * factor * 35 % 100); const height = 45 + ((i * 37) % 85); ctx.fillRect(x, base - height, width, height); } }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.World = RunnerWorld;
})();
