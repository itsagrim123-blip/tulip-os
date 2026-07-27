(() => {
    "use strict";
    const sdk = typeof TulipSDK === "undefined" ? null : TulipSDK;
    if (!sdk) throw new Error("Tulip SDK is unavailable.");
    const content = document.createElement("div");
    content.className = "settings";
    const editor = document.createElement("textarea");
    editor.placeholder = "Write a focused note…";
    editor.style.cssText = "width:100%;min-height:240px;border:0;border-radius:12px;padding:14px;background:#111;color:#fff;resize:vertical";
    content.append(editor);
    sdk.windowManager.create({ title: "📝 Focus Notes", content });
    try { editor.value = sdk.settings.get("focus-notes.content") || ""; } catch { /* The editor remains usable without persistent storage. */ }
    editor.addEventListener("input", () => { try { sdk.settings.set("focus-notes.content", editor.value); } catch { /* Permission state can change while the app is open. */ } });
})();
