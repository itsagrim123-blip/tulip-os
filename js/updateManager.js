(() => {
    "use strict";

    const DEFAULT_STATUS = "Up to date";
    const versionNumber = value => String(value || "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/)?.slice(1).map(Number) || [0];
    const compareVersions = (left, right) => {
        const a = versionNumber(left), b = versionNumber(right);
        for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
            const difference = (b[index] || 0) - (a[index] || 0);
            if (difference) return difference;
        }
        return 0;
    };

    class UpdateManager {
        constructor(url = "data/updates.json") {
            this.url = url;
            this.data = null;
        }

        async load({ force = false } = {}) {
            if (this.data && !force) return this.data;
            try {
                const response = await fetch(this.url, { cache: "no-store" });
                if (!response.ok) throw new Error(`Update history is unavailable (${response.status}).`);
                const payload = await response.json();
                if (!Array.isArray(payload?.updates)) throw new Error("Update history is invalid.");
                this.data = this.normalize(payload);
            } catch (error) {
                this.data = {
                    current: { version: "Unknown", buildNumber: "—", channel: "Unknown", installedDate: "—", status: DEFAULT_STATUS },
                    updates: [],
                    error: error.message || "Unable to load update history."
                };
            }
            return this.data;
        }

        normalize(payload) {
            const updates = payload.updates.map(update => ({
                version: String(update.version || "Unknown"),
                buildNumber: String(update.buildNumber || "—"),
                releaseDate: String(update.releaseDate || "Unknown date"),
                updateType: String(update.updateType || "Update"),
                title: String(update.title || "Tulip OS Update"),
                changelog: Array.isArray(update.changelog) ? update.changelog.filter(Boolean) : [],
                newFeatures: Array.isArray(update.newFeatures) ? update.newFeatures.filter(Boolean) : [],
                improvements: Array.isArray(update.improvements) ? update.improvements.filter(Boolean) : [],
                bugFixes: Array.isArray(update.bugFixes) ? update.bugFixes.filter(Boolean) : [],
                categories: Array.isArray(update.categories) ? update.categories.filter(Boolean) : []
            }));
            updates.sort((left, right) => compareVersions(left.version, right.version) || Number(right.buildNumber) - Number(left.buildNumber) || Date.parse(right.releaseDate) - Date.parse(left.releaseDate));
            return {
                current: {
                    version: String(payload.current?.version || updates[0]?.version || "Unknown"),
                    buildNumber: String(payload.current?.buildNumber || updates[0]?.buildNumber || "—"),
                    channel: String(payload.current?.channel || "Pre-Alpha"),
                    installedDate: String(payload.current?.installedDate || "—"),
                    status: String(payload.current?.status || DEFAULT_STATUS)
                },
                updates,
                error: ""
            };
        }
    }

    window.UpdateManager = UpdateManager;
})();
