(() => {
    "use strict";

    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const assertString = (value, name) => { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`); return value.trim(); };

    class TulipEventBus {
        constructor() { this.listeners = new Map(); }
        on(type, listener) { assertString(type, "Event type"); if (typeof listener !== "function") throw new TypeError("Event listener must be a function."); if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); return () => this.off(type, listener); }
        once(type, listener) { const unsubscribe = this.on(type, event => { unsubscribe(); listener(event); }); return unsubscribe; }
        off(type, listener) { this.listeners.get(type)?.delete(listener); }
        emit(type, detail = {}) { const event = Object.freeze({ type, detail, timestamp: Date.now() }); for (const listener of this.listeners.get(type) || []) { try { listener(event); } catch (error) { console.error(`Tulip event listener failed: ${type}`, error); } } window.dispatchEvent(new CustomEvent(`tulip:${type}`, { detail })); return event; }
    }

    class TulipProcessManager {
        constructor(eventBus) { this.eventBus = eventBus; this.processes = new Map(); this.nextPid = 1000; }
        register({ name, type = "application", owner = "system", priority = 0, metadata = {} } = {}) { assertString(name, "Process name"); if (!isRecord(metadata)) throw new TypeError("Process metadata must be an object."); const process = { pid: ++this.nextPid, name, type, owner, priority: Number(priority) || 0, status: "running", createdAt: Date.now(), cpu: 0, memory: 0, metadata: { ...metadata } }; this.processes.set(process.pid, process); this.eventBus.emit("process-created", process); return process; }
        get(pid) { return this.processes.get(Number(pid)) || null; }
        list(filter = {}) { if (!isRecord(filter)) throw new TypeError("Process filter must be an object."); return [...this.processes.values()].filter(process => Object.entries(filter).every(([key, value]) => process[key] === value)).map(process => ({ ...process, metadata: { ...process.metadata } })); }
        update(pid, changes = {}) { const process = this.get(pid); if (!process) throw new Error(`Unknown process: ${pid}`); if (!isRecord(changes)) throw new TypeError("Process changes must be an object."); Object.assign(process, changes, { pid: process.pid, createdAt: process.createdAt }); this.eventBus.emit("process-updated", { ...process }); return process; }
        suspend(pid) { return this.update(pid, { status: "suspended" }); }
        resume(pid) { return this.update(pid, { status: "running" }); }
        sleep(pid) { return this.update(pid, { status: "sleeping" }); }
        kill(pid, reason = "terminated") { const process = this.get(pid); if (!process) return false; process.status = "killed"; process.endedAt = Date.now(); process.reason = String(reason); this.eventBus.emit("process-killed", { ...process }); this.processes.delete(process.pid); return true; }
    }

    class TulipServiceManager {
        constructor(eventBus) { this.eventBus = eventBus; this.services = new Map(); }
        register({ id, start, stop, healthCheck = () => true, dependencies = [], autoRestart = false } = {}) { assertString(id, "Service id"); if (typeof start !== "function" || typeof stop !== "function") throw new TypeError("Services require start and stop functions."); if (!Array.isArray(dependencies) || dependencies.some(dependency => typeof dependency !== "string")) throw new TypeError("Service dependencies must be string ids."); if (this.services.has(id)) throw new Error(`Service already registered: ${id}`); const service = { id, start, stop, healthCheck, dependencies: [...dependencies], autoRestart: Boolean(autoRestart), status: "stopped", startedAt: null, failures: 0 }; this.services.set(id, service); return service; }
        async start(id, stack = new Set()) { const service = this.services.get(assertString(id, "Service id")); if (!service) throw new Error(`Unknown service: ${id}`); if (service.status === "running") return service; if (stack.has(id)) throw new Error(`Circular service dependency: ${id}`); stack.add(id); for (const dependency of service.dependencies) await this.start(dependency, stack); try { await service.start(); service.status = "running"; service.startedAt = Date.now(); service.failures = 0; this.eventBus.emit("service-started", { id }); return service; } catch (error) { service.status = "failed"; service.failures += 1; this.eventBus.emit("service-failed", { id, error }); if (service.autoRestart) await this.restart(id); throw error; } finally { stack.delete(id); } }
        async stop(id) { const service = this.services.get(assertString(id, "Service id")); if (!service || service.status === "stopped") return false; await service.stop(); service.status = "stopped"; this.eventBus.emit("service-stopped", { id }); return true; }
        async restart(id) { await this.stop(id); return this.start(id); }
        async health(id) { const service = this.services.get(assertString(id, "Service id")); if (!service) throw new Error(`Unknown service: ${id}`); try { return Boolean(await service.healthCheck()); } catch (error) { this.eventBus.emit("service-health-error", { id, error }); return false; } }
        list() { return [...this.services.values()].map(service => ({ id: service.id, status: service.status, dependencies: [...service.dependencies], failures: service.failures, startedAt: service.startedAt })); }
    }

    class TulipClipboardManager {
        constructor(eventBus) { this.eventBus = eventBus; this.items = []; this.limit = 50; }
        async write(text, source = "system") { const value = String(text); if (navigator.clipboard?.writeText) try { await navigator.clipboard.writeText(value); } catch (error) { console.warn("Clipboard permission unavailable", error); } this.items.unshift({ value, source: String(source), createdAt: Date.now() }); this.items = this.items.slice(0, this.limit); this.eventBus.emit("clipboard-changed", this.items[0]); return value; }
        async read() { if (navigator.clipboard?.readText) try { return await navigator.clipboard.readText(); } catch (error) { console.warn("Clipboard read permission unavailable", error); } return this.items[0]?.value || ""; }
        history() { return this.items.map(item => ({ ...item })); }
        clear() { this.items = []; this.eventBus.emit("clipboard-cleared"); }
    }

    class TulipPowerManager {
        constructor(eventBus) { this.eventBus = eventBus; this.state = "running"; }
        async transition(state) { const valid = ["running", "sleeping", "restarting", "shutting-down"]; if (!valid.includes(state)) throw new RangeError(`Unsupported power state: ${state}`); this.state = state; this.eventBus.emit("power-state-changed", { state }); if (state === "sleeping") document.body.classList.add("system-sleeping"); else document.body.classList.remove("system-sleeping"); if (state === "restarting") window.setTimeout(() => window.location.reload(), 250); if (state === "shutting-down") window.setTimeout(() => document.body.classList.add("system-shut-down"), 250); return state; }
        sleep() { return this.transition("sleeping"); }
        restart() { return this.transition("restarting"); }
        shutdown() { return this.transition("shutting-down"); }
        wake() { return this.transition("running"); }
    }

    class TulipDiagnostics {
        constructor(eventBus) { this.eventBus = eventBus; this.results = []; }
        async run() { const checks = [{ name: "dom", test: () => Boolean(document.body) }, { name: "indexeddb", test: () => "indexedDB" in window }, { name: "storage", test: () => { const key = `tulip-diagnostic-${Date.now()}`; localStorage.setItem(key, "ok"); localStorage.removeItem(key); return true; } }, { name: "canvas", test: () => Boolean(document.createElement("canvas").getContext("2d")) }]; this.results = checks.map(check => { try { return { name: check.name, passed: Boolean(check.test()), checkedAt: Date.now() }; } catch (error) { return { name: check.name, passed: false, error: error.message, checkedAt: Date.now() }; } }); this.eventBus.emit("diagnostics-complete", this.results); return this.results.map(result => ({ ...result })); }
    }

    window.TulipEventBus = TulipEventBus;
    window.TulipProcessManager = TulipProcessManager;
    window.TulipServiceManager = TulipServiceManager;
    window.TulipClipboardManager = TulipClipboardManager;
    window.TulipPowerManager = TulipPowerManager;
    window.TulipDiagnostics = TulipDiagnostics;
    window.__tulipKernel = Object.freeze({ eventBus: new TulipEventBus() });
})();
