// ===== script.js =====
const LUTRIS_URL = "https://raw.githubusercontent.com/lutris/website/refs/heads/master/discord-app-ids.json";
const LOCAL_URL = "./local-games.json";  // your own additions, relative to index.html — format: [{ "name": "...", "id": "..." }]
const TEMPLATE_URL = "./playgame.js";   // relative to index.html

function slugToName(slug) {
    return slug
        .replace(/-/g, " ")
        .replace(/:/g, ": ")
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

async function buildScript() {
    const status = document.getElementById("status");
    const output = document.getElementById("output");
    const copyBtn = document.getElementById("copyBtn");

    status.textContent = "Fetching game list + template…";
    copyBtn.disabled = true;

    try {
        const [gamesRes, templateRes, localRes] = await Promise.all([
            fetch(LUTRIS_URL),
            fetch(TEMPLATE_URL),
            fetch(LOCAL_URL).catch(() => null)   // local file is optional — missing is fine
        ]);

        if (!gamesRes.ok) throw new Error("Failed to fetch Lutris game list");
        if (!templateRes.ok) throw new Error("Failed to fetch playgame.js template");

        const rawGames = await gamesRes.json();
        const template = await templateRes.text();

        let localGames = [];
        if (localRes && localRes.ok) {
            try {
                const localData = await localRes.json();
                if (Array.isArray(localData)) {
                    localGames = localData;
                } else if (localData && Array.isArray(localData.gamesSeen)) {
                    // your local-games.json wraps entries in { "gamesSeen": [...] }
                    localGames = localData.gamesSeen;
                } else if (localData && Array.isArray(localData.games)) {
                    // also tolerate a { "games": [...] } wrapper
                    localGames = localData.games;
                } else {
                    console.warn("local-games.json did not contain an array (or a recognized wrapper) — ignoring it.", localData);
                }
            } catch (e) {
                console.warn("local-games.json failed to parse as JSON — ignoring it.", e);
            }
        }

        if (!template.includes("{{GAMES_JSON}}")) {
            throw new Error("Template is missing {{GAMES_JSON}} placeholder");
        }

        const githubGames = rawGames
            .filter(g => g.discord_id && g.game)
            .map(g => ({
                name: slugToName(g.game),
                id: String(g.discord_id)
            }))
            .filter((g, i, arr) => arr.findIndex(x => x.id === g.id) === i);

        // Local entries with an id already present on GitHub are skipped —
        // the GitHub entry wins. Only genuinely new ids get added.
        const githubIds = new Set(githubGames.map(g => g.id));

        const localSkippedNoId = localGames.filter(g => g && g.name && (g.id == null || g.id === ""));
        if (localSkippedNoId.length) {
            console.warn(
                `Skipped ${localSkippedNoId.length} local entr${localSkippedNoId.length === 1 ? "y" : "ies"} with no id (needed to avoid duplicates):`,
                localSkippedNoId.map(g => g.name)
            );
        }

        const localOnly = localGames
            .filter(g => g && g.id != null && g.id !== "" && g.name)
            .map(g => ({ name: String(g.name), id: String(g.id) }))
            .filter(g => !githubIds.has(g.id))
            // guard against duplicate ids within the local file itself
            .filter((g, i, arr) => arr.findIndex(x => x.id === g.id) === i);

        const games = [...githubGames, ...localOnly]
            .sort((a, b) => a.name.localeCompare(b.name));

        // Pretty-print so the embedded array is human-readable, not one giant line
        const gamesJsonPretty = JSON.stringify(games, null, 2); // "[\n  {...},\n  {...}\n]"
        // Same content but without the outer [ ] — used when the template
        // already supplies its own brackets around the placeholder.
        const gamesItemsOnly = gamesJsonPretty.replace(/^\[\n/, "").replace(/\n\]$/, "");

        const lines = template.split("\n");
        const PLACEHOLDER = "{{GAMES_JSON}}";
        let replacedCount = 0;

        // Checks whether the placeholder sits directly between a "[" and "]"
        // that the template itself provides — either on the same line
        // (e.g. `GAMES = [{{GAMES_JSON}}];`) or on separate lines
        // (e.g. "[" on the line above, "{{GAMES_JSON}}" alone, "]" below).
        function isTemplateWrapped(lineIdx, placeholderIdx) {
            const line = lines[lineIdx];
            const before = line.slice(0, placeholderIdx).trim();
            const after = line.slice(placeholderIdx + PLACEHOLDER.length).trim();

            if (before.endsWith("[") && after.startsWith("]")) return true;

            if (before === "" && after === "") {
                let p = lineIdx - 1;
                while (p >= 0 && lines[p].trim() === "") p--;
                let n = lineIdx + 1;
                while (n < lines.length && lines[n].trim() === "") n++;
                const prevEndsBracket = p >= 0 && lines[p].trim().endsWith("[");
                const nextStartsBracket = n < lines.length && lines[n].trim().startsWith("]");
                if (prevEndsBracket && nextStartsBracket) return true;
            }
            return false;
        }

        const outLines = lines.map((line, idx) => {
            const placeholderIdx = line.indexOf(PLACEHOLDER);
            if (placeholderIdx === -1) return line;

            const commentIdx = line.indexOf("//");
            if (commentIdx !== -1 && commentIdx < placeholderIdx) {
                // Placeholder only appears inside a comment on this line — skip it.
                return line;
            }

            replacedCount++;
            const wrapped = isTemplateWrapped(idx, placeholderIdx);
            let payload = wrapped ? gamesItemsOnly : gamesJsonPretty;
            if (wrapped) {
                // Drop the leading indent of the first item so it sits
                // cleanly right after the template's own "[".
                payload = payload.replace(/^[ \t]+/, "");
            }

            const indent = line.match(/^[ \t]*/)[0];
            const indentedJson = payload.replace(/\n/g, "\n" + indent);
            return line.replace(PLACEHOLDER, indentedJson);
        });

        if (replacedCount === 0) {
            throw new Error("Injection failed — no non-comment placeholder found");
        }

        const finalScript = outLines.join("\n");

        output.value = finalScript;
        status.textContent = localOnly.length
            ? `Ready — ${games.length} games embedded (${localOnly.length} from local file)`
            : `Ready — ${games.length} games embedded`;
        copyBtn.disabled = false;
        window.__lastScript = finalScript;
    } catch (err) {
        console.error(err);
        status.textContent = "Error: " + err.message;
        output.value = "";
    }
}

function copyScript() {
    const text = window.__lastScript || document.getElementById("output").value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById("copyBtn");
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy to clipboard", 1500);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buildBtn").addEventListener("click", buildScript);
    document.getElementById("copyBtn").addEventListener("click", copyScript);
    // auto-build on load
    buildScript();
});