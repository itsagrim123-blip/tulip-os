const BUTTONS = ["MC", "MR", "M+", "M-", "(", ")", "%", "C", "sin", "cos", "tan", "÷", "√", "log", "π", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", "."];

window.CalculatorApp = class CalculatorApp {
    constructor(windowManager, notifications) {
        this.windowManager = windowManager;
        this.notifications = notifications;
        this.memory = 0;
        this.history = [];
    }

    open() {
        const buttons = BUTTONS.map(value => `<button type="button" data-value="${value}">${value}</button>`).join("");
        this.windowManager.create({ appId: "calculator", title: "🧮 Tulip Calculator", className: "calculator-window", content: `<div class="calc-app"><input class="calc-display" data-role="display" value="0" readonly><div class="calc-history" data-role="history"></div><div class="calc-grid">${buttons}</div></div>`, onMount: record => this.bind(record) });
    }

    bind(record) {
        const root = record.content.querySelector(".calc-app");
        const display = root.querySelector("[data-role=display]");
        const renderHistory = () => { root.querySelector("[data-role=history]").innerHTML = this.history.map(value => `<div>${value}</div>`).join(""); };
        const append = value => { display.value = display.value === "0" || display.value === "Error" ? value : display.value + value; };
        const calculate = () => {
            try {
                const expression = display.value.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-").replaceAll("π", "Math.PI").replaceAll("√", "Math.sqrt").replace(/\bsin\b/g, "Math.sin").replace(/\bcos\b/g, "Math.cos").replace(/\btan\b/g, "Math.tan").replace(/\blog\b/g, "Math.log");
                if (!/^[0-9+\-*/().%\sA-Za-z]+$/.test(expression) || /(?:constructor|prototype|window|document)/.test(expression)) throw new Error("Invalid expression");
                const result = Function(`"use strict"; return (${expression})`)();
                if (!Number.isFinite(result)) throw new Error("Invalid result");
                this.history.unshift(`${display.value} = ${result}`);
                this.history = this.history.slice(0, 8);
                display.value = String(result);
                renderHistory();
            } catch { display.value = "Error"; }
        };
        root.addEventListener("click", event => {
            const value = event.target.closest("[data-value]")?.dataset.value;
            if (!value) return;
            if (value === "C") display.value = "0";
            else if (value === "=") calculate();
            else if (value === "MC") this.memory = 0;
            else if (value === "MR") append(String(this.memory));
            else if (value === "M+") this.memory += Number(display.value) || 0;
            else if (value === "M-") this.memory -= Number(display.value) || 0;
            else append(value);
        });
        record.element.addEventListener("keydown", event => {
            if (event.key === "Enter") calculate();
            if (event.key === "Backspace") display.value = display.value.slice(0, -1) || "0";
            if (/^[0-9+\-*/().%]$/.test(event.key)) append(event.key);
        });
        record.element.tabIndex = -1;
        renderHistory();
    }
}
