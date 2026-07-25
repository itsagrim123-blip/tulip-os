window.TulipPrompt = async function(message, defaultValue = "") {
    if (typeof window.prompt === "function") {
        try {
            return window.prompt(message, defaultValue);
        } catch (error) {
            // Fall back to the in-app dialog below when the browser blocks prompt().
        }
    }

    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.background = "rgba(0, 0, 0, 0.4)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.zIndex = "99999";

        const dialog = document.createElement("div");
        dialog.style.background = "#1e1e1e";
        dialog.style.color = "#fff";
        dialog.style.padding = "20px";
        dialog.style.borderRadius = "12px";
        dialog.style.minWidth = "280px";
        dialog.style.boxShadow = "0 14px 40px rgba(0,0,0,0.35)";

        const label = document.createElement("div");
        label.textContent = message;
        label.style.marginBottom = "12px";

        const input = document.createElement("input");
        input.type = "text";
        input.value = defaultValue;
        input.style.width = "100%";
        input.style.padding = "8px";
        input.style.borderRadius = "6px";
        input.style.border = "1px solid #666";
        input.style.marginBottom = "12px";

        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.justifyContent = "flex-end";
        buttons.style.gap = "8px";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.padding = "8px 10px";
        cancelBtn.style.borderRadius = "6px";
        cancelBtn.style.border = "none";
        cancelBtn.style.cursor = "pointer";

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.textContent = "OK";
        okBtn.style.padding = "8px 10px";
        okBtn.style.borderRadius = "6px";
        okBtn.style.border = "none";
        okBtn.style.cursor = "pointer";
        okBtn.style.background = "#7b61ff";
        okBtn.style.color = "#fff";

        const finish = value => {
            overlay.remove();
            resolve(value);
        };

        cancelBtn.addEventListener("click", () => finish(null));
        okBtn.addEventListener("click", () => finish(input.value.trim()));
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                finish(input.value.trim());
            } else if (event.key === "Escape") {
                finish(null);
            }
        });
        overlay.addEventListener("click", event => {
            if (event.target === overlay) finish(null);
        });

        buttons.append(cancelBtn, okBtn);
        dialog.append(label, input, buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        input.focus();
        input.select();
    });
};

window.TulipInlineEditor = function({ x, y, initialValue = "", placeholder = "", onSubmit }) {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.className = "inline-name-editor";
        input.type = "text";
        input.value = initialValue;
        input.placeholder = placeholder;
        input.style.position = "fixed";
        input.style.left = `${Math.max(12, x)}px`;
        input.style.top = `${Math.max(12, y)}px`;
        input.style.zIndex = "100000";
        input.style.minWidth = "160px";
        input.style.padding = "8px 10px";
        input.style.borderRadius = "8px";
        input.style.border = "1px solid #7b61ff";
        input.style.background = "#171821";
        input.style.color = "#fff";
        input.style.boxShadow = "0 12px 30px rgba(0,0,0,.35)";

        const finish = async value => {
            input.remove();
            const result = await onSubmit?.(value);
            resolve(value);
            return result;
        };

        input.addEventListener("keydown", async event => {
            if (event.key === "Enter") {
                event.preventDefault();
                await finish(input.value.trim());
            } else if (event.key === "Escape") {
                event.preventDefault();
                await finish(null);
            }
        });

        document.body.appendChild(input);
        input.focus();
        input.select();
    });
};

window.BootController = class BootController {
    constructor({ screen, desktop, progress, status }) {
        this.screen = screen;
        this.desktop = desktop;
        this.progress = progress;
        this.status = status;
        this.steps = ["Initializing Kernel...", "Loading Drivers...", "Starting Desktop...", "Checking Storage...", "Loading User Interface...", "Preparing Applications...", "Finalizing...", "Welcome to Tulip OS"];
    }

    async start(initialize) {
        this.progress.style.width = "10%";
        this.status.textContent = this.steps[0];

        try {
            await initialize();
            this.progress.style.width = "85%";
            this.status.textContent = this.steps.at(-2);
        } catch (error) {
            console.error("Tulip OS initialization failed", error);
            this.progress.style.width = "85%";
            this.status.textContent = "Starting with limited functionality...";
        }

        this.progress.style.width = "100%";
        this.status.textContent = this.steps.at(-1);
        window.setTimeout(() => {
            this.screen.classList.add("boot-complete");
            window.setTimeout(() => {
                this.screen.remove();
                this.desktop.classList.remove("hidden");
            }, 350);
        }, 350);
    }
}
