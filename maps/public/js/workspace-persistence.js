(function attachWorkspacePersistence(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.LalGeoWorkspacePersistence = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorkspacePersistence() {
    "use strict";

    function classifyStorageError(error) {
        const name = String(error?.name || "");
        const message = String(error?.message || error || "Browser storage failed");
        const quota = name === "QuotaExceededError"
            || name === "NS_ERROR_DOM_QUOTA_REACHED"
            || Number(error?.code) === 22
            || /quota|storage.*full|exceed/i.test(message);
        return {
            code: quota ? "quota" : "unavailable",
            message,
            retryable: !quota
        };
    }

    function persistJsonAtomically(storage, key, value, stringify = JSON.stringify) {
        const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        let json;
        try {
            json = stringify(value);
            storage.setItem(key, json);
            return {
                ok: true,
                bytes: new Blob([json]).size,
                durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
            };
        } catch (error) {
            return {
                ok: false,
                bytes: typeof json === "string" ? new Blob([json]).size : 0,
                durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
                error: classifyStorageError(error)
            };
        }
    }

    return { classifyStorageError, persistJsonAtomically };
}));
