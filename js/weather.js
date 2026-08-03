(() => {
    "use strict";

    const CACHE_KEY = "tulip.weather.cache.v2";
    const LEGACY_CACHE_KEY = "tulip.weather.cache.v1";
    const CITY_KEY = "tulip.weather.city";
    const UNIT_KEY = "tulip.weather.unit";
    const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
    const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
    const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
    const WEATHER_CODES = {
        0: ["☀️", "Clear sky"], 1: ["🌤️", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
        45: ["🌫️", "Foggy"], 48: ["🌫️", "Rime fog"], 51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"],
        55: ["🌧️", "Heavy drizzle"], 61: ["🌧️", "Rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
        71: ["🌨️", "Snow"], 73: ["🌨️", "Snow"], 75: ["🌨️", "Heavy snow"], 80: ["🌦️", "Showers"],
        81: ["🌧️", "Showers"], 82: ["⛈️", "Heavy showers"], 95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm"], 99: ["⛈️", "Thunderstorm"]
    };
    const code = value => WEATHER_CODES[value] || ["🌡️", "Weather"];
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const formatDate = (date, options) => {
        const parsed = new Date(date);
        return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat(undefined, options).format(parsed);
    };

    class WeatherService {
        constructor() { this.data = null; this.timer = 0; this.abortController = null; }

        cache() {
            try {
                const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || localStorage.getItem(LEGACY_CACHE_KEY) || "null");
                return cached?.payload?.current && cached?.place ? cached : null;
            } catch { return null; }
        }

        savedCity() { try { return localStorage.getItem(CITY_KEY) || undefined; } catch { return undefined; } }
        unit() { try { return localStorage.getItem(UNIT_KEY) === "fahrenheit" ? "fahrenheit" : "celsius"; } catch { return "celsius"; } }
        setUnit(unit) { try { localStorage.setItem(UNIT_KEY, unit === "fahrenheit" ? "fahrenheit" : "celsius"); } catch { /* The current session remains usable. */ } this.broadcast(); }

        async request(url, signal) {
            const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
            return response.json();
        }

        async locate() {
            if (!navigator.geolocation) throw new Error("Location is unavailable in this browser.");
            return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
                position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, name: "Current location", country: "" }),
                () => reject(new Error("Location permission was not granted. Search for a city instead.")),
                { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 }
            ));
        }

        async search(city, signal) {
            const query = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
            const result = await this.request(`${GEOCODING_URL}?${query}`, signal);
            const place = result.results?.[0];
            if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) throw new Error("City not found. Try a more specific search.");
            return place;
        }

        async refresh({ city, force = false } = {}) {
            const cached = this.cache();
            const normalizedCity = String(city || "").trim().toLowerCase();
            if (!force && cached && Date.now() - cached.savedAt < 10 * 60_000 && (!normalizedCity || cached.place.name.toLowerCase() === normalizedCity)) {
                this.data = cached;
                this.broadcast();
                return cached;
            }
            this.abortController?.abort();
            this.abortController = new AbortController();
            const { signal } = this.abortController;
            let place;
            try { place = normalizedCity ? await this.search(city.trim(), signal) : await this.locate(); }
            catch (error) {
                if (cached) { this.data = cached; this.broadcast(); return cached; }
                throw error;
            }
            try {
                const query = new URLSearchParams({
                    latitude: String(place.latitude), longitude: String(place.longitude),
                    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
                    hourly: "temperature_2m,weather_code", daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
                    timezone: "auto", forecast_days: "7"
                });
                const payload = await this.request(`${FORECAST_URL}?${query}`, signal);
                if (!payload?.current || !Array.isArray(payload?.hourly?.time) || !Array.isArray(payload?.daily?.time)) throw new Error("Weather service returned an incomplete forecast.");
                let air = null;
                try {
                    const quality = await this.request(`${AIR_QUALITY_URL}?${new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, current: "us_aqi" })}`, signal);
                    air = quality.current?.us_aqi ?? null;
                } catch { /* Air quality is optional and must not block the forecast. */ }
                this.data = { place: { name: place.name || "Current location", country: place.country || "" }, payload, air, savedAt: Date.now() };
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.data)); if (normalizedCity) localStorage.setItem(CITY_KEY, city.trim()); } catch { /* Offline cache is best effort. */ }
                this.broadcast();
                return this.data;
            } catch (error) {
                if (cached) { this.data = cached; this.broadcast(); return cached; }
                throw error;
            }
        }

        broadcast() { window.dispatchEvent(new CustomEvent("tulip:weatherchange", { detail: this.data })); }
        start() {
            this.refresh({ city: this.savedCity() }).catch(() => { const cached = this.cache(); if (cached) { this.data = cached; this.broadcast(); } });
            window.clearInterval(this.timer);
            this.timer = window.setInterval(() => this.refresh({ city: this.savedCity(), force: true }).catch(() => {}), 30 * 60_000);
        }
    }

    class WeatherApp {
        constructor(windowManager, notifications, service) { this.windowManager = windowManager; this.notifications = notifications; this.service = service; this.listener = null; }
        open() { this.record = this.windowManager.create({ appId: "weather", title: "☀️ Weather", className: "weather-window", content: this.view(), onMount: record => this.bind(record), onClose: () => window.removeEventListener("tulip:weatherchange", this.listener) }); }
        view() { const root = document.createElement("div"); root.className = "weather-app"; root.innerHTML = '<form class="weather-search"><input aria-label="Search city" placeholder="Search a city" autocomplete="off"><button type="submit">Search</button><button type="button" data-location>My location</button><button type="button" data-unit aria-label="Toggle temperature unit">°C</button></form><div data-weather-content class="weather-loading">Loading forecast…</div>'; return root; }
        bind(record) {
            const root = record.content.querySelector(".weather-app");
            const refresh = async options => { this.setLoading(root, true); try { await this.service.refresh(options); } catch (error) { this.renderError(root, error); } finally { this.setLoading(root, false); } };
            root.querySelector("form").addEventListener("submit", event => { event.preventDefault(); const city = root.querySelector("input").value.trim(); if (city) refresh({ city, force: true }); });
            root.querySelector("[data-location]").addEventListener("click", () => refresh({ force: true }));
            root.querySelector("[data-unit]").addEventListener("click", () => { this.service.setUnit(this.service.unit() === "celsius" ? "fahrenheit" : "celsius"); this.render(root); });
            this.listener = () => this.render(root);
            window.addEventListener("tulip:weatherchange", this.listener);
            if (this.service.data || this.service.cache()) this.render(root); else refresh({ city: this.service.savedCity() });
        }
        setLoading(root, loading) { root.classList.toggle("is-loading", loading); }
        renderError(root, error) { const holder = root.querySelector("[data-weather-content]"); holder.replaceChildren(); const message = document.createElement("div"); message.className = "weather-loading"; message.innerHTML = '<p>Weather is unavailable right now.</p><small></small><button type="button">Retry</button>'; message.querySelector("small").textContent = error?.message || "Check your connection or search for a city."; message.querySelector("button").addEventListener("click", () => this.service.refresh({ city: this.service.savedCity(), force: true }).catch(next => this.renderError(root, next))); holder.append(message); }
        temperature(value) { return Math.round(this.service.unit() === "fahrenheit" ? value * 9 / 5 + 32 : value); }
        wind(value) { return this.service.unit() === "fahrenheit" ? `${Math.round(value * 0.621371)} mph` : `${Math.round(value)} km/h`; }
        render(root) {
            const data = this.service.data || this.service.cache();
            const holder = root.querySelector("[data-weather-content]");
            const unit = this.service.unit() === "fahrenheit" ? "°F" : "°C";
            root.querySelector("[data-unit]").textContent = unit;
            if (!data?.payload?.current) return this.renderError(root, new Error("No cached forecast is available."));
            const { payload, place, air } = data; const current = payload.current; const [icon, label] = code(current.weather_code);
            const hourly = payload.hourly.time.slice(0, 12).map((time, index) => `<div><b>${escapeHtml(formatDate(time, { hour: "numeric" }))}</b><span>${code(payload.hourly.weather_code[index])[0]}</span><small>${this.temperature(payload.hourly.temperature_2m[index])}${unit}</small></div>`).join("");
            const days = payload.daily.time.slice(0, 7).map((time, index) => `<div><span>${escapeHtml(formatDate(time, { weekday: "short" }))}</span><b>${code(payload.daily.weather_code[index])[0]}</b><small>${this.temperature(payload.daily.temperature_2m_max[index])}${unit} / ${this.temperature(payload.daily.temperature_2m_min[index])}${unit}</small></div>`).join("");
            holder.innerHTML = `<section class="weather-now"><div class="weather-place"><small>${escapeHtml(place.country)}</small><h2>${escapeHtml(place.name)}</h2><span>${label}</span></div><div class="weather-temperature"><b>${icon}</b><strong>${this.temperature(current.temperature_2m)}${unit}</strong><small>Feels ${this.temperature(current.apparent_temperature)}${unit}</small></div></section><section class="weather-metrics"><div>💧 <b>${current.relative_humidity_2m}%</b><small>Humidity</small></div><div>💨 <b>${this.wind(current.wind_speed_10m)}</b><small>Wind</small></div><div>🌬️ <b>${air ?? "—"}</b><small>US AQI</small></div><div>🌅 <b>${escapeHtml(formatDate(payload.daily.sunrise[0], { hour: "numeric", minute: "2-digit" }))}</b><small>Sunrise</small></div><div>🌇 <b>${escapeHtml(formatDate(payload.daily.sunset[0], { hour: "numeric", minute: "2-digit" }))}</b><small>Sunset</small></div></section><h3>Hourly forecast</h3><section class="weather-hours">${hourly}</section><h3>7-day forecast</h3><section class="weather-days">${days}</section>`;
        }
    }

    window.WeatherService = WeatherService;
    window.WeatherApp = WeatherApp;
    window.TulipWeatherCode = code;
})();
