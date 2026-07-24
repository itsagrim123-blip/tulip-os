window.Notifications = class Notifications {
    constructor() {
        this.container = document.createElement("div");
        this.container.className = "toast-container";
        document.body.append(this.container);
    }

    show(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.container.append(toast);
        requestAnimationFrame(() => toast.classList.add("show"));
        window.setTimeout(() => {
            toast.classList.remove("show");
            window.setTimeout(() => toast.remove(), 250);
        }, 3000);
    }
}
