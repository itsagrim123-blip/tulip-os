window.LockScreen = class LockScreen {
    constructor(element, unlockButton) {
        this.element = element;
        this.clock = element.querySelector("#lockClock");
        unlockButton.addEventListener("click", () => this.unlock());
        window.setInterval(() => this.updateClock(), 1000);
    }

    lock() {
        this.updateClock();
        this.element.hidden = false;
    }

    unlock() { this.element.hidden = true; }

    updateClock() {
        this.clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
}
