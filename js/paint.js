window.PaintApp = class PaintApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
    }

    open() {
        this.windowManager.create({ appId: "paint", title: "🎨 Tulip Paint", className: "paint-window", content: `<div class="paint"><div class="paint-toolbar"><label>Color <input type="color" data-role="color" value="#ffffff"></label><label>Brush <input type="range" data-role="size" min="1" max="40" value="5"></label><button type="button" data-action="clear">🗑 Clear</button><button type="button" data-action="save">💾 Save PNG</button></div><canvas class="paint-canvas" data-role="canvas" width="900" height="550"></canvas></div>`, onMount: record => this.bind(record) });
    }

    bind(record) {
        const root = record.content.querySelector(".paint");
        const canvas = root.querySelector("[data-role=canvas]");
        const context = canvas.getContext("2d");
        const color = root.querySelector("[data-role=color]");
        const size = root.querySelector("[data-role=size]");
        let drawing = false;
        let lastPoint = null;
        const clear = () => { context.fillStyle = "#111"; context.fillRect(0, 0, canvas.width, canvas.height); };
        const point = event => {
            const bounds = canvas.getBoundingClientRect();
            return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
        };
        const draw = event => {
            if (!drawing) return;
            const next = point(event);
            context.strokeStyle = color.value;
            context.lineWidth = Number(size.value);
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            context.moveTo(lastPoint.x, lastPoint.y);
            context.lineTo(next.x, next.y);
            context.stroke();
            lastPoint = next;
        };
        canvas.addEventListener("pointerdown", event => { drawing = true; lastPoint = point(event); canvas.setPointerCapture(event.pointerId); draw(event); });
        canvas.addEventListener("pointermove", draw);
        canvas.addEventListener("pointerup", () => { drawing = false; lastPoint = null; });
        canvas.addEventListener("pointercancel", () => { drawing = false; lastPoint = null; });
        root.addEventListener("click", event => {
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action === "clear") clear();
            if (action === "save") { const link = document.createElement("a"); link.download = "tulip-drawing.png"; link.href = canvas.toDataURL("image/png"); link.click(); this.notifications.show("Drawing saved"); }
        });
        clear();
    }
}
