window.Notifications = class Notifications {
    constructor() {
        this.container = document.createElement("div");
        this.container.className = "toast-container";
        document.body.append(this.container);
    }

    async requestPermission() {
        const key = "tulip.notificationPermissionRequested";
        const NotificationApi = window.Notification;
        if (!NotificationApi) return "unsupported";
        if (NotificationApi.permission !== "default") return NotificationApi.permission;
        try {
            if (localStorage.getItem(key) === "true") return NotificationApi.permission;
            localStorage.setItem(key, "true");
        } catch (error) {
            console.warn("Unable to save notification permission state", error);
        }
        try {
            return await NotificationApi.requestPermission();
        } catch {
            return "default";
        }
    }

    show(message, type = "info") {
        try {
            if (localStorage.getItem("tulip.notifications") === "false") return;
        } catch (error) {
            console.warn("Unable to read notification preferences", error);
        }
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.container.append(toast);
        requestAnimationFrame(() => toast.classList.add("show"));
        window.setTimeout(() => {
            toast.classList.remove("show");
            window.setTimeout(() => toast.remove(), 250);
        }, 3000);
        const NotificationApi = window.Notification;
        if (NotificationApi?.permission === "granted") {
            try { new NotificationApi("Tulip OS", { body: message }); } catch { /* The Tulip OS toast remains available. */ }
        }
    }
}
