(() => {
    "use strict";
    const KEY = "tulip.sound.settings";
    const tones = Object.freeze({ startup: [523, .16], shutdown: [220, .2], notification: [784, .12], click: [620, .035], error: [180, .18], success: [880, .1], "window-open": [660, .05], "window-close": [330, .06], delete: [160, .12], recycle: [260, .1], "app-launch": [740, .06], "app-close": [360, .06], flap: [680, .05], score: [980, .08], hit: [130, .18] });

    class SoundManager {
        constructor() { this.context = null; this.settings = { master: .55, muted: false, categories: { ui: 1, game: 1 }, ...this.load() }; }
        load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
        save() { try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* Storage is optional. */ } }
        unlock() { if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)(); return this.context.resume?.(); }
        setMaster(volume) { this.settings.master = Math.max(0, Math.min(1, Number(volume) || 0)); this.save(); }
        setMuted(muted) { this.settings.muted = Boolean(muted); this.save(); }
        play(name, category = "ui") {
            const tone = tones[name]; if (!tone || this.settings.muted || !this.settings.master) return;
            try {
                const context = this.context || new (window.AudioContext || window.webkitAudioContext)(); this.context = context;
                if (context.state !== "running") return; // Browsers require a user gesture before audio.
                const oscillator = context.createOscillator(), gain = context.createGain();
                const now = context.currentTime, duration = tone[1], volume = .12 * this.settings.master * (this.settings.categories[category] ?? 1);
                oscillator.type = name === "hit" || name === "error" ? "sawtooth" : "sine";
                oscillator.frequency.setValueAtTime(tone[0], now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, tone[0] * .72), now + duration);
                gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
                oscillator.connect(gain).connect(context.destination); oscillator.start(now); oscillator.stop(now + duration);
            } catch { /* Audio support is intentionally non-critical. */ }
        }
    }
    window.SoundManager = SoundManager;
})();
