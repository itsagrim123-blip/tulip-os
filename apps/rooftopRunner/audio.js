(() => {
    "use strict";
    class RunnerAudio {
        constructor(soundManager, settings) { this.soundManager = soundManager; this.settings = settings; }
        unlock() { return this.soundManager?.unlock?.(); }
        play(name) { if (!this.settings.muted) this.soundManager?.play?.(name, "game"); }
        jump() { this.play("flap"); }
        coin() { this.play("score"); }
        hit() { this.play("hit"); }
        click() { this.play("click"); }
    }
    window.RooftopRunner ||= {};
    window.RooftopRunner.Audio = RunnerAudio;
})();
