window.Notifications = class Notifications {
    constructor() {
        this.container = document.createElement("div");
        this.container.className = "toast-container";
        document.body.append(this.container);
    }

    async requestPermission() {
        const key = "tulip.notificationPermissionRequested";
        if (!("Notification" in window) || Notification.permission !== "default" || localStorage.getItem(key) === "true") return "Notification" in window ? Notification.permission : "unsupported";
        localStorage.setItem(key, "true");
        try {
            return await Notification.requestPermission();
        } catch {
            return "default";
        }
    }

    show(message, type = "info") {
        if (localStorage.getItem("tulip.notifications") === "false") return;
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.container.append(toast);
        requestAnimationFrame(() => toast.classList.add("show"));
        window.setTimeout(() => {
            toast.classList.remove("show");
            window.setTimeout(() => toast.remove(), 250);
        }, 3000);
        if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification("Tulip OS", { body: message }); } catch { /* The Tulip OS toast remains available. */ }
        }
    }
}
