window.BootController = class BootController {
    constructor({ screen, desktop, progress, status }) {
        this.screen = screen;
        this.desktop = desktop;
        this.progress = progress;
        this.status = status;
        this.steps = ["Initializing Kernel...", "Loading Drivers...", "Starting Desktop...", "Checking Storage...", "Loading User Interface...", "Preparing Applications...", "Finalizing...", "Welcome to Tulip OS"];
    }

    start() {
        let step = 0;
        const timer = window.setInterval(() => {
            const percent = Math.min((step + 1) * 13, 100);
            this.progress.style.width = `${percent}%`;
            this.status.textContent = this.steps[step] || this.steps.at(-1);
            step += 1;
            if (step >= this.steps.length) {
                window.clearInterval(timer);
                window.setTimeout(() => {
                    this.screen.classList.add("boot-complete");
                    window.setTimeout(() => {
                        this.screen.remove();
                        this.desktop.classList.remove("hidden");
                    }, 350);
                }, 350);
            }
        }, 250);
    }
}
