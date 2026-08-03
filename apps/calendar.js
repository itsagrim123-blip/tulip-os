(() => {
    "use strict";

    const CALENDAR_EVENTS_PATH = "/Documents/Calendar/events.json";
    const EVENT_COLORS = ["#7b61ff", "#4fc3f7", "#f59e0b", "#34d399", "#f472b6"];
    const EVENT_CATEGORIES = ["Work", "Personal", "Health", "Study", "Family"];

    window.CalendarApp = class CalendarApp {
        constructor(windowManager, notifications) {
            this.windowManager = windowManager;
            this.notifications = notifications;
            this.record = null;
            this.events = [];
            this.currentDate = new Date();
            this.view = "month";
            this.search = "";
            this.selectedDate = this.toDateKey(new Date());
            this.reminderTimer = null;
        }

        async open(argument) {
            const record = this.windowManager.create({
                appId: "calendar",
                title: "🗓 Calendar",
                className: "calendar-window",
                content: this.createView(),
                onMount: current => this.bind(current),
                onClose: () => this.destroy()
            });
            this.record = record;
            await this.loadEvents();
            this.render();
            this.checkReminders();
        }

        createView() {
            const root = document.createElement("div");
            root.className = "calendar-app";
            root.innerHTML = `
                <div class="calendar-toolbar">
                    <div class="calendar-toolbar-group">
                        <button type="button" data-action="prev" class="toolbar-btn">◀</button>
                        <button type="button" data-action="today" class="toolbar-btn">Today</button>
                        <button type="button" data-action="next" class="toolbar-btn">▶</button>
                    </div>
                    <div class="calendar-toolbar-group">
                        <button type="button" data-view="month" class="toolbar-btn is-active">Month</button>
                        <button type="button" data-view="week" class="toolbar-btn">Week</button>
                        <button type="button" data-view="day" class="toolbar-btn">Day</button>
                        <button type="button" data-view="year" class="toolbar-btn">Year</button>
                        <button type="button" data-view="agenda" class="toolbar-btn">Agenda</button>
                    </div>
                    <div class="calendar-toolbar-group">
                        <input class="calendar-search" type="search" data-role="search" placeholder="Search events" aria-label="Search events">
                        <button type="button" data-action="new-event" class="toolbar-btn">＋ New Event</button>
                    </div>
                </div>
                <div class="calendar-layout">
                    <aside class="calendar-sidebar">
                        <div class="calendar-card calendar-mini" data-role="mini-calendar"></div>
                        <div class="calendar-card calendar-upcoming" data-role="upcoming"></div>
                    </aside>
                    <section class="calendar-main">
                        <div class="calendar-heading-card" data-role="heading"></div>
                        <div class="calendar-card calendar-body" data-role="body"></div>
                    </section>
                </div>
            `;
            return root;
        }

        bind(record) {
            const root = record.content.querySelector(".calendar-app");
            root.addEventListener("click", event => this.handleClick(event, root));
            root.querySelector("[data-role=search]").addEventListener("input", event => {
                this.search = event.target.value.trim().toLowerCase();
                this.render();
            });
        }

        handleClick(event, root) {
            const action = event.target.closest("[data-action]")?.dataset.action;
            const view = event.target.closest("[data-view]")?.dataset.view;
            const dayCell = event.target.closest("[data-day]");
            if (view) { this.view = view; this.render(); return; }
            if (action === "prev") { this.shiftView(-1); return; }
            if (action === "next") { this.shiftView(1); return; }
            if (action === "today") { this.currentDate = new Date(); this.selectedDate = this.toDateKey(this.currentDate); this.render(); return; }
            if (action === "new-event") { this.showEventEditor(); return; }
            if (action === "edit-event") { const id = event.target.closest("[data-event-id]").dataset.eventId; this.showEventEditor(this.events.find(eventItem => eventItem.id === id)); return; }
            if (action === "delete-event") { const id = event.target.closest("[data-event-id]").dataset.eventId; this.deleteEvent(id); return; }
            if (dayCell) { this.selectedDate = dayCell.dataset.day; this.view = "day"; this.render(); return; }
        }

        shiftView(direction) {
            const date = new Date(this.currentDate);
            if (this.view === "month") date.setMonth(date.getMonth() + direction);
            else if (this.view === "week") date.setDate(date.getDate() + direction * 7);
            else if (this.view === "day") date.setDate(date.getDate() + direction);
            else if (this.view === "year") date.setFullYear(date.getFullYear() + direction);
            else date.setMonth(date.getMonth() + direction);
            this.currentDate = date;
            this.render();
        }

        async loadEvents() {
            try {
                const entry = await window.TulipFS.get(CALENDAR_EVENTS_PATH);
                const content = entry?.content || "[]";
                const parsed = JSON.parse(content);
                this.events = Array.isArray(parsed) ? parsed : [];
            } catch {
                this.events = [];
                await window.TulipFS.create(CALENDAR_EVENTS_PATH, "file", JSON.stringify([], null, 2));
            }
        }

        async saveEvents() {
            await window.TulipFS.create(CALENDAR_EVENTS_PATH, "file", JSON.stringify(this.events, null, 2));
        }

        async createOrUpdateEvent(payload) {
            if (payload.id) {
                this.events = this.events.map(item => item.id === payload.id ? payload : item);
            } else {
                this.events.push({ ...payload, id: `${Date.now()}` });
            }
            await this.saveEvents();
            this.render();
            this.checkReminders();
        }

        async deleteEvent(id) {
            this.events = this.events.filter(item => item.id !== id);
            await this.saveEvents();
            this.render();
        }

        showEventEditor(existing = null) {
            const overlay = document.createElement("div");
            overlay.className = "calendar-editor-overlay";
            const startValue = existing?.start || this.selectedDate || this.toDateKey(new Date());
            const endValue = existing?.end || startValue;
            overlay.innerHTML = `
                <div class="calendar-editor">
                    <h3>${existing ? "Edit event" : "New event"}</h3>
                    <label>Title<input data-role="title" value="${(existing?.title || "").replace(/"/g, "&quot;")}"></label>
                    <label>Date<input data-role="date" type="date" value="${startValue}"></label>
                    <label>Start<input data-role="start" type="time" value="${existing?.startTime || "09:00"}"></label>
                    <label>End<input data-role="end" type="time" value="${existing?.endTime || "10:00"}"></label>
                    <label>Category<select data-role="category">${EVENT_CATEGORIES.map(name => `<option value="${name}" ${existing?.category === name ? "selected" : ""}>${name}</option>`).join("")}</select></label>
                    <label>Color<select data-role="color">${EVENT_COLORS.map(color => `<option value="${color}" ${existing?.color === color ? "selected" : ""}>${color}</option>`).join("")}</select></label>
                    <label>Reminder<select data-role="reminder"><option value="none" ${existing?.reminder === "none" || !existing ? "selected" : ""}>None</option><option value="10m" ${existing?.reminder === "10m" ? "selected" : ""}>10 min before</option><option value="1h" ${existing?.reminder === "1h" ? "selected" : ""}>1 hour before</option><option value="1d" ${existing?.reminder === "1d" ? "selected" : ""}>1 day before</option></select></label>
                    <label>Recurring<select data-role="recurring"><option value="none" ${existing?.recurring === "none" || !existing ? "selected" : ""}>None</option><option value="daily" ${existing?.recurring === "daily" ? "selected" : ""}>Daily</option><option value="weekly" ${existing?.recurring === "weekly" ? "selected" : ""}>Weekly</option><option value="monthly" ${existing?.recurring === "monthly" ? "selected" : ""}>Monthly</option></select></label>
                    <label>Notes<textarea data-role="notes">${(existing?.notes || "").replace(/</g, "&lt;")}</textarea></label>
                    <div class="calendar-editor-actions"><button type="button" data-action="cancel-editor">Cancel</button><button type="button" data-action="save-event">Save</button></div>
                </div>
            `;
            overlay.addEventListener("click", async event => {
                const action = event.target.closest("[data-action]")?.dataset.action;
                if (action === "cancel-editor") return overlay.remove();
                if (action === "save-event") {
                    const title = overlay.querySelector("[data-role=title]").value.trim();
                    if (!title) return this.notifications?.show("An event title is required.", "error");
                    const payload = {
                        id: existing?.id,
                        title,
                        date: overlay.querySelector("[data-role=date]").value,
                        startTime: overlay.querySelector("[data-role=start]").value,
                        endTime: overlay.querySelector("[data-role=end]").value,
                        category: overlay.querySelector("[data-role=category]").value,
                        color: overlay.querySelector("[data-role=color]").value,
                        reminder: overlay.querySelector("[data-role=reminder]").value,
                        recurring: overlay.querySelector("[data-role=recurring]").value,
                        notes: overlay.querySelector("[data-role=notes]").value,
                        createdAt: existing?.createdAt || Date.now()
                    };
                    await this.createOrUpdateEvent(payload);
                    overlay.remove();
                }
            });
            document.body.appendChild(overlay);
        }

        render() {
            const root = this.record?.content.querySelector(".calendar-app");
            if (!root) return;
            const heading = root.querySelector("[data-role=heading]");
            const body = root.querySelector("[data-role=body]");
            const mini = root.querySelector("[data-role=mini-calendar]");
            const upcoming = root.querySelector("[data-role=upcoming]");
            root.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("is-active", button.dataset.view === this.view));
            heading.innerHTML = this.renderHeading();
            body.innerHTML = this.renderBody();
            mini.innerHTML = this.renderMiniCalendar();
            upcoming.innerHTML = this.renderUpcoming();
        }

        renderHeading() {
            const label = this.view === "month" ? this.formatMonthLabel(this.currentDate) : this.view === "week" ? `${this.formatRangeLabel()} ` : this.view === "day" ? this.formatDateLabel(this.currentDate) : this.view === "year" ? `${this.currentDate.getFullYear()}` : "Agenda";
            return `<div><h2>${label}</h2><p>${this.getFilteredEvents().length} events</p></div><button type="button" data-action="new-event" class="toolbar-btn">＋ Add</button>`;
        }

        renderBody() {
            if (this.view === "month") return this.renderMonthView();
            if (this.view === "week") return this.renderWeekView();
            if (this.view === "day") return this.renderDayView();
            if (this.view === "year") return this.renderYearView();
            return this.renderAgendaView();
        }

        renderMonthView() {
            const first = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
            const start = new Date(first);
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
            const cells = [];
            for (let index = 0; index < 42; index += 1) {
                const date = new Date(start); date.setDate(start.getDate() + index);
                const key = this.toDateKey(date);
                const isCurrentMonth = date.getMonth() === this.currentDate.getMonth();
                const events = this.getEventsForDate(key);
                cells.push(`<button type="button" class="calendar-day ${isCurrentMonth ? "" : "is-muted"} ${key === this.selectedDate ? "is-selected" : ""}" data-day="${key}"><span>${date.getDate()}</span>${events.slice(0, 2).map(item => `<em style="border-color:${item.color}">${item.title}</em>`).join("")}</button>`);
            }
            return `<div class="calendar-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-grid">${cells.join("")}</div>`;
        }

        renderWeekView() {
            const days = [];
            const start = new Date(this.currentDate);
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
            for (let index = 0; index < 7; index += 1) {
                const date = new Date(start); date.setDate(start.getDate() + index);
                const key = this.toDateKey(date);
                const events = this.getEventsForDate(key);
                days.push(`<div class="calendar-week-column"><h4>${this.formatDayShort(date)}</h4>${events.length ? events.map(item => this.renderEventCard(item)).join("") : "<p>No events</p>"}</div>`);
            }
            return `<div class="calendar-week-view">${days.join("")}</div>`;
        }

        renderDayView() {
            const key = this.selectedDate || this.toDateKey(this.currentDate);
            const events = this.getEventsForDate(key);
            return `<div class="calendar-day-view"><h3>${this.formatDateLabel(new Date(`${key}T00:00:00`))}</h3>${events.length ? events.map(item => this.renderEventCard(item)).join("") : "<p>No events scheduled.</p>"}</div>`;
        }

        renderYearView() {
            return `<div class="calendar-year-grid">${[...Array(12)].map((_, month) => {
                const date = new Date(this.currentDate.getFullYear(), month, 1);
                const monthLabel = date.toLocaleString("default", { month: "short" });
                const count = this.getEventsForMonth(month, this.currentDate.getFullYear()).length;
                return `<div class="calendar-year-month"><strong>${monthLabel}</strong><span>${count} events</span></div>`;
            }).join("")}</div>`;
        }

        renderAgendaView() {
            const events = this.getFilteredEvents().slice().sort((left, right) => left.date.localeCompare(right.date));
            return `<div class="calendar-agenda">${events.length ? events.map(item => this.renderEventCard(item)).join("") : "<p>No matching events.</p>"}</div>`;
        }

        renderMiniCalendar() {
            const date = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
            const start = new Date(date);
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
            const cells = [];
            for (let index = 0; index < 35; index += 1) {
                const current = new Date(start); current.setDate(start.getDate() + index);
                const key = this.toDateKey(current);
                const isCurrentMonth = current.getMonth() === this.currentDate.getMonth();
                cells.push(`<button type="button" class="calendar-mini-day ${isCurrentMonth ? "" : "is-muted"} ${key === this.selectedDate ? "is-selected" : ""}" data-day="${key}">${current.getDate()}</button>`);
            }
            return `<h3>${this.formatMonthLabel(this.currentDate)}</h3><div class="calendar-mini-grid">${cells.join("")}</div>`;
        }

        renderUpcoming() {
            const upcoming = this.getFilteredEvents().slice().sort((left, right) => left.date.localeCompare(right.date)).slice(0, 5);
            return `<h3>Upcoming</h3>${upcoming.length ? upcoming.map(item => `<div class="calendar-upcoming-item"><strong>${item.title}</strong><span>${item.date} · ${item.startTime}</span></div>`).join("") : "<p>No upcoming events.</p>"}`;
        }

        renderEventCard(item) {
            return `<article class="calendar-event-card" style="border-left:4px solid ${item.color || EVENT_COLORS[0]}">
                <div class="calendar-event-head">
                    <strong>${item.title}</strong>
                    <div class="calendar-event-actions">
                        <button type="button" data-action="edit-event" data-event-id="${item.id}">✎</button>
                        <button type="button" data-action="delete-event" data-event-id="${item.id}">✕</button>
                    </div>
                </div>
                <p>${item.date} · ${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}</p>
                <small>${item.category || "General"} · ${item.recurring !== "none" ? item.recurring : "one time"}</small>
            </article>`;
        }

        getFilteredEvents() {
            const term = this.search.trim().toLowerCase();
            return this.events.filter(item => !term || `${item.title} ${item.notes} ${item.category}`.toLowerCase().includes(term));
        }

        getEventsForDate(dateKey) {
            const items = this.getFilteredEvents().filter(item => item.date === dateKey || this.matchesRecurring(item, dateKey));
            return items.sort((left, right) => left.startTime.localeCompare(right.startTime));
        }

        getEventsForMonth(month, year) {
            return this.getFilteredEvents().filter(item => new Date(`${item.date}T00:00:00`).getMonth() === month && new Date(`${item.date}T00:00:00`).getFullYear() === year);
        }

        matchesRecurring(item, dateKey) {
            if (item.recurring === "none") return item.date === dateKey;
            const date = new Date(`${dateKey}T00:00:00`);
            const start = new Date(`${item.date}T00:00:00`);
            if (item.recurring === "daily") return date >= start;
            if (item.recurring === "weekly") return (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) >= 0 && ((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) % 7 === 0;
            if (item.recurring === "monthly") return date.getDate() === start.getDate() && date >= start;
            return false;
        }

        async checkReminders() {
            clearTimeout(this.reminderTimer);
            const now = new Date();
            const upcoming = this.events.filter(item => item.reminder !== "none" && this.isDueSoon(item, now));
            if (upcoming.length) {
                this.notifications?.show(`You have ${upcoming.length} upcoming event${upcoming.length > 1 ? "s" : ""}.`, "info");
            }
            this.reminderTimer = setTimeout(() => this.checkReminders(), 60000);
        }

        isDueSoon(item, now) {
            if (!item.date) return false;
            const eventDate = new Date(`${item.date}T${item.startTime || "09:00"}:00`);
            const diff = eventDate.getTime() - now.getTime();
            if (item.reminder === "10m") return diff > 0 && diff <= 10 * 60 * 1000;
            if (item.reminder === "1h") return diff > 0 && diff <= 60 * 60 * 1000;
            if (item.reminder === "1d") return diff > 0 && diff <= 24 * 60 * 60 * 1000;
            return false;
        }

        formatMonthLabel(date) {
            return date.toLocaleString("default", { month: "long", year: "numeric" });
        }

        formatRangeLabel() {
            const start = new Date(this.currentDate); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
            const end = new Date(start); end.setDate(start.getDate() + 6);
            return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
        }

        formatDateLabel(date) {
            return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        }

        formatDayShort(date) {
            return date.toLocaleDateString(undefined, { weekday: "short" });
        }

        toDateKey(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }

        destroy() {
            clearTimeout(this.reminderTimer);
        }
    };
})();
