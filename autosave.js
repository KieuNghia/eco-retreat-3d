"use strict";
window.Eco = window.Eco || {};

// Autosave of the model into localStorage, keyed by schema version, plus
// timestamped export names. Blocked, absent or quota-limited storage degrades
// silently: the editor simply behaves as it did before persistence existed.
Eco.autosave = (() => {
  const KEY = "eco-retreat.model.v2";
  let store = null;
  try {
    store = typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    store = null; // e.g. Safari private mode throws on access itself
  }
  const pad = (n) => String(n).padStart(2, "0");
  function stamp(now = Date.now()) {
    const t = new Date(now);
    return (
      t.getFullYear() +
      "-" +
      pad(t.getMonth() + 1) +
      "-" +
      pad(t.getDate()) +
      "-" +
      pad(t.getHours()) +
      "-" +
      pad(t.getMinutes())
    );
  }
  function time(ts) {
    return new Date(ts).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return {
    KEY,
    supported: () => store !== null,
    save(data) {
      if (!store) return null;
      try {
        const savedAt = Date.now();
        store.setItem(KEY, JSON.stringify({ savedAt, data }));
        return savedAt;
      } catch {
        return null; // quota exceeded — keep the session, drop persistence
      }
    },
    load() {
      if (!store) return null;
      let raw;
      try {
        raw = store.getItem(KEY);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return {
          model: Eco.modelState.prepare(parsed.data),
          savedAt: parsed.savedAt,
        };
      } catch {
        // A corrupt entry must never block startup.
        try {
          store.removeItem(KEY);
        } catch {}
        return null;
      }
    },
    clear() {
      try {
        store?.removeItem(KEY);
      } catch {}
    },
    exportName(prefix = "eco-retreat-model") {
      return prefix + "-" + stamp() + ".json";
    },
    time,
  };
})();
