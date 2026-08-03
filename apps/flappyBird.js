(() => {
    "use strict";
    const SCORE_KEY = "tulip.flappy.high-score";
    const WORLD = Object.freeze({ width: 420, height: 560, gravity: 920, flapVelocity: -360, pipeSpeed: 170, pipeWidth: 58, pipeGap: 145, pipeEvery: 1450 });

    class FlappyBirdApp {
        constructor(windowManager, notifications, sound) { this.windowManager = windowManager; this.notifications = notifications; this.sound = sound; this.state = "idle"; }
        open() { this.record = this.windowManager.create({ appId: "flappy-bird", title: "🐦 Flappy Tulip", className: "flappy-window", content: this.view(), onMount: record => this.bind(record), onClose: () => this.stop() }); }
        view() { const root = document.createElement("div"); root.className = "flappy-app"; root.innerHTML = '<canvas aria-label="Flappy Tulip game" width="420" height="560"></canvas><div class="flappy-hud"><span>Score <b data-score>0</b></span><span>Best <b data-best>0</b></span><button type="button" data-pause>Pause</button></div><div class="flappy-message" data-message><h2>Flappy Tulip</h2><p>Tap, click, or press Space to fly</p><button type="button" data-start>Start game</button></div>'; return root; }
        bind(record) {
            this.record = record; this.root = record.content.querySelector(".flappy-app"); this.canvas = this.root.querySelector("canvas"); this.ctx = this.canvas.getContext("2d");
            this.root.querySelector("[data-best]").textContent = this.bestScore();
            this.root.querySelector("[data-start]").addEventListener("click", () => this.start());
            this.root.querySelector("[data-pause]").addEventListener("click", () => this.togglePause());
            this.canvas.addEventListener("pointerdown", event => { event.preventDefault(); this.flap(); });
            this.keydown = event => { if (!this.record?.focused) return; if (event.code === "Space" || event.key === "ArrowUp") { event.preventDefault(); this.flap(); } else if (event.key.toLowerCase() === "p") this.togglePause(); };
            window.addEventListener("keydown", this.keydown);
            if (window.ResizeObserver) { this.resizeObserver = new ResizeObserver(() => this.resizeCanvas()); this.resizeObserver.observe(this.canvas); }
            else { this.resizeHandler = () => this.resizeCanvas(); window.addEventListener("resize", this.resizeHandler); }
            this.resizeCanvas(); this.draw();
        }
        bestScore() { try { return Number(localStorage.getItem(SCORE_KEY)) || 0; } catch { return 0; } }
        start() {
            this.sound?.unlock?.(); this.state = "playing"; this.bird = { x: 90, y: WORLD.height / 2, velocity: 0, radius: 15 }; this.pipes = []; this.score = 0;
            this.lastPipe = performance.now(); this.lastFrame = this.lastPipe; this.root.querySelector("[data-score]").textContent = "0"; this.root.querySelector("[data-message]").hidden = true; this.root.querySelector("[data-pause]").textContent = "Pause";
            cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(time => this.loop(time));
        }
        flap() { if (this.state === "idle" || this.state === "over") { this.start(); this.bird.velocity = WORLD.flapVelocity; return; } if (this.state !== "playing") return; this.bird.velocity = WORLD.flapVelocity; this.sound?.play?.("flap", "game"); }
        togglePause() { if (this.state === "playing") { this.state = "paused"; cancelAnimationFrame(this.frame); this.root.querySelector("[data-pause]").textContent = "Resume"; } else if (this.state === "paused") { this.state = "playing"; this.lastFrame = performance.now(); this.root.querySelector("[data-pause]").textContent = "Pause"; this.frame = requestAnimationFrame(time => this.loop(time)); } }
        loop(time) {
            if (this.state !== "playing") return;
            const dt = Math.min(0.04, Math.max(0, (time - this.lastFrame) / 1000)); this.lastFrame = time;
            this.bird.velocity += WORLD.gravity * dt; this.bird.y += this.bird.velocity * dt;
            if (time - this.lastPipe >= WORLD.pipeEvery) { const top = 75 + Math.random() * (WORLD.height - WORLD.pipeGap - 150); this.pipes.push({ x: WORLD.width + 20, top, gap: WORLD.pipeGap, scored: false }); this.lastPipe = time; }
            for (const pipe of this.pipes) { pipe.x -= WORLD.pipeSpeed * dt; if (!pipe.scored && pipe.x + WORLD.pipeWidth < this.bird.x) { pipe.scored = true; this.score += 1; this.root.querySelector("[data-score]").textContent = this.score; this.sound?.play?.("score", "game"); } }
            this.pipes = this.pipes.filter(pipe => pipe.x + WORLD.pipeWidth > -8);
            if (this.collides()) return this.gameOver();
            this.draw(); this.frame = requestAnimationFrame(next => this.loop(next));
        }
        collides() { const bird = this.bird; return bird.y - bird.radius <= 0 || bird.y + bird.radius >= WORLD.height || this.pipes.some(pipe => bird.x + bird.radius > pipe.x && bird.x - bird.radius < pipe.x + WORLD.pipeWidth && (bird.y - bird.radius < pipe.top || bird.y + bird.radius > pipe.top + pipe.gap)); }
        gameOver() { this.state = "over"; this.sound?.play?.("hit", "game"); const best = Math.max(this.score, this.bestScore()); try { localStorage.setItem(SCORE_KEY, String(best)); } catch { /* High score remains visible in this session. */ } this.root.querySelector("[data-best]").textContent = best; const message = this.root.querySelector("[data-message]"); message.hidden = false; message.querySelector("h2").textContent = `Score: ${this.score}`; message.querySelector("p").textContent = "Tap, click, or press Space to try again"; message.querySelector("[data-start]").textContent = "Play again"; this.draw(); }
        resizeCanvas() { if (!this.canvas || !this.ctx) return; const rect = this.canvas.getBoundingClientRect(); const scale = Math.min(2, window.devicePixelRatio || 1); const width = Math.max(1, Math.round(rect.width * scale)); const height = Math.max(1, Math.round(rect.height * scale)); if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; } this.draw(); }
        draw() {
            if (!this.ctx || !this.canvas) return;
            const context = this.ctx; const sx = this.canvas.width / WORLD.width; const sy = this.canvas.height / WORLD.height; const bird = this.bird || { x: 90, y: WORLD.height / 2, radius: 15 };
            context.setTransform(sx, 0, 0, sy, 0, 0); context.clearRect(0, 0, WORLD.width, WORLD.height);
            const sky = context.createLinearGradient(0, 0, 0, WORLD.height); sky.addColorStop(0, "#75cef7"); sky.addColorStop(1, "#e7f7d8"); context.fillStyle = sky; context.fillRect(0, 0, WORLD.width, WORLD.height);
            context.fillStyle = "#74b94b"; for (const pipe of this.pipes || []) { context.fillRect(pipe.x, 0, WORLD.pipeWidth, pipe.top); context.fillRect(pipe.x, pipe.top + pipe.gap, WORLD.pipeWidth, WORLD.height); context.fillStyle = "#4f8d31"; context.fillRect(pipe.x - 5, pipe.top - 16, WORLD.pipeWidth + 10, 16); context.fillRect(pipe.x - 5, pipe.top + pipe.gap, WORLD.pipeWidth + 10, 16); context.fillStyle = "#74b94b"; }
            context.fillStyle = "#ffc933"; context.beginPath(); context.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2); context.fill(); context.fillStyle = "#fff"; context.beginPath(); context.arc(bird.x + 6, bird.y - 5, 5, 0, Math.PI * 2); context.fill(); context.fillStyle = "#222"; context.beginPath(); context.arc(bird.x + 8, bird.y - 5, 2, 0, Math.PI * 2); context.fill(); context.fillStyle = "#f47c3c"; context.fillRect(bird.x + 14, bird.y + 1, 11, 6);
        }
        stop() { cancelAnimationFrame(this.frame); this.resizeObserver?.disconnect(); window.removeEventListener("resize", this.resizeHandler); window.removeEventListener("keydown", this.keydown); this.state = "idle"; }
    }
    window.FlappyBirdApp = FlappyBirdApp;
})();
