// ===== json-cleaner.js =====
// Takes messy/arbitrary JSON on the left and produces a clean
// [{ "name": "...", "id": "..." }] array on the right — same shape
// used by DisUpload's game list.

const ID_KEYS = ["id", "Id", "ID", "discord_id", "discordId", "appId", "app_id", "application_id", "applicationId", "snowflake"];
const NAME_KEYS = ["name", "Name", "title", "Title", "game", "Game", "gameName", "label"];

function pickKey(obj, keys) {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return undefined;
}

// Finds the "list of entries" inside arbitrary parsed JSON.
function extractEntryList(parsed) {
    if (Array.isArray(parsed)) return parsed;

    if (parsed && typeof parsed === "object") {
        // Common wrapper keys, e.g. { "gamesSeen": [...] }, { "games": [...] }
        const wrapperKeys = ["gamesSeen", "games", "items", "list", "entries", "data"];
        for (const k of wrapperKeys) {
            if (Array.isArray(parsed[k])) return parsed[k];
        }

        // Otherwise scan all top-level values for the first array of objects.
        for (const v of Object.values(parsed)) {
            if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
        }

        // A single entry object (has recognizable id/name keys) — wrap it.
        // Checked before the generic map guess below, since e.g.
        // { id: "999", title: "Solo Entry" } would otherwise look like
        // a plausible id->name map purely because both values are strings.
        if (pickKey(parsed, ID_KEYS) !== undefined || pickKey(parsed, NAME_KEYS) !== undefined) {
            return [parsed];
        }

        // id -> name map, e.g. { "363427...": "100% Orange Juice", ... }
        const values = Object.values(parsed);
        const looksLikeIdNameMap =
            values.length > 0 && values.every(v => typeof v === "string" || typeof v === "number");
        if (looksLikeIdNameMap) {
            return Object.entries(parsed).map(([id, name]) => ({ id, name }));
        }
    }

    return [];
}

function cleanEntries(rawList) {
    const seen = new Set();
    const cleaned = [];
    let skippedNoId = 0;
    let skippedNoName = 0;
    let skippedDupe = 0;

    for (const item of rawList) {
        if (!item || typeof item !== "object") continue;

        const rawId = pickKey(item, ID_KEYS);
        const rawName = pickKey(item, NAME_KEYS);

        if (rawId === undefined) { skippedNoId++; continue; }
        if (rawName === undefined) { skippedNoName++; continue; }

        const id = String(rawId);
        const name = String(rawName);

        if (seen.has(id)) { skippedDupe++; continue; }
        seen.add(id);

        cleaned.push({ name, id });
    }

    cleaned.sort((a, b) => a.name.localeCompare(b.name));
    return { cleaned, skippedNoId, skippedNoName, skippedDupe };
}

function setStatus(msg, kind) {
    const status = document.getElementById("status");
    status.textContent = msg;
    status.className = kind || "";
}

function convert() {
    const input = document.getElementById("input");
    const output = document.getElementById("output");
    const copyBtn = document.getElementById("copyBtn");

    const text = input.value.trim();
    if (!text) {
        output.value = "";
        copyBtn.disabled = true;
        setStatus("Paste JSON on the left, or choose a file above.");
        return;
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        output.value = "";
        copyBtn.disabled = true;
        setStatus("Invalid JSON — " + e.message, "error");
        return;
    }

    const rawList = extractEntryList(parsed);
    if (!rawList.length) {
        output.value = "";
        copyBtn.disabled = true;
        setStatus("Couldn't find any recognizable entries (no array of objects, or id/name map, found).", "error");
        return;
    }

    const { cleaned, skippedNoId, skippedNoName, skippedDupe } = cleanEntries(rawList);

    output.value = JSON.stringify(cleaned, null, 2);
    copyBtn.disabled = cleaned.length === 0;

    const skippedParts = [];
    if (skippedNoId) skippedParts.push(`${skippedNoId} missing id`);
    if (skippedNoName) skippedParts.push(`${skippedNoName} missing name`);
    if (skippedDupe) skippedParts.push(`${skippedDupe} duplicate id`);

    const skippedMsg = skippedParts.length ? ` (skipped: ${skippedParts.join(", ")})` : "";
    setStatus(`Cleaned ${cleaned.length} entr${cleaned.length === 1 ? "y" : "ies"}${skippedMsg}`, "ok");
}

// Debounce so we're not re-parsing on every single keystroke.
let debounceTimer = null;
function scheduleConvert() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(convert, 150);
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("input");
    const fileInput = document.getElementById("fileInput");
    const copyBtn = document.getElementById("copyBtn");
    const output = document.getElementById("output");

    input.addEventListener("input", scheduleConvert);

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            input.value = reader.result;
            convert();
        };
        reader.onerror = () => setStatus("Failed to read file.", "error");
        reader.readAsText(file);
    });

    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(output.value).then(() => {
            const old = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => copyBtn.textContent = old, 1500);
        });
    });
});