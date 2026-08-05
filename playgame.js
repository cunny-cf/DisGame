// ===== playgame.js (template) =====
// {{GAMES_JSON}} is replaced by script.js

(() => {
    delete window.$;
    let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
    webpackChunkdiscord_app.pop();

    const RunningGameStore = Object.values(wpRequire.c)
        .find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay;
    const FluxDispatcher = Object.values(wpRequire.c)
        .find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h;
    const api = Object.values(wpRequire.c)
        .find(x => x?.exports?.Bo?.get)?.exports?.Bo;

    if (!RunningGameStore || !FluxDispatcher) {
        console.error("[Game Spoof] Missing required Discord modules.");
        return;
    }

    // ---- injected by the builder ----
    const GAMES = {{GAMES_JSON}};
    // ---------------------------------

    const METHODS_TO_PATCH = [
        "getRunningGames",
        "getGameForPID",
        "getVisibleRunningGames",
        "getVisibleGame",
        "getCandidateGames",
        "getRunningDiscordApplicationIds",
        "getGamesSeen"
    ];

    let currentSpoof = null;

    function stopSpoof() {
        if (!currentSpoof) return;

        for (const [name, original] of Object.entries(currentSpoof.originals)) {
            RunningGameStore[name] = original;
        }

        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            removed: [currentSpoof.fakeGame],
            added: [],
            games: []
        });

        currentSpoof = null;
        console.log("%c[Game Spoof] Stopped", "color:#ed4245;font-weight:bold");
    }

    function startSpoof(game) {
        stopSpoof();

        const pid = Math.floor(Math.random() * 30000) + 1000;

        const finish = (appData) => {
            const name = appData?.name || game.name;
            const id = String(appData?.id || game.id || "0");
            const exeName =
                appData?.executables?.find(x => x.os === "win32")?.name?.replace(">", "") ||
                (name.replace(/[^a-zA-Z0-9 ]/g, "") + ".exe").replace(/ /g, "");

            const fakeGame = {
                cmdLine: `C:\\Program Files\\${name}\\${exeName}`,
                exeName,
                exePath: `c:/program files/${name.toLowerCase()}/${exeName}`,
                hidden: false,
                isLauncher: false,
                id,
                name,
                pid,
                pidPath: [pid],
                processName: name,
                start: Date.now()
            };

            const originals = {};
            for (const m of METHODS_TO_PATCH) {
                if (typeof RunningGameStore[m] === "function") {
                    originals[m] = RunningGameStore[m];
                }
            }

            const realGames = (originals.getRunningGames || RunningGameStore.getRunningGames)
                .call(RunningGameStore);

            if (originals.getRunningGames)
                RunningGameStore.getRunningGames = () => [fakeGame];
            if (originals.getGameForPID)
                RunningGameStore.getGameForPID = (p) => (p === pid ? fakeGame : null);
            if (originals.getVisibleRunningGames)
                RunningGameStore.getVisibleRunningGames = () => [fakeGame];
            if (originals.getVisibleGame)
                RunningGameStore.getVisibleGame = () => fakeGame;
            if (originals.getCandidateGames)
                RunningGameStore.getCandidateGames = () => [fakeGame];
            if (originals.getRunningDiscordApplicationIds)
                RunningGameStore.getRunningDiscordApplicationIds = () => [id];

            FluxDispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                removed: realGames,
                added: [fakeGame],
                games: [fakeGame]
            });

            currentSpoof = { originals, fakeGame };
            console.log(`%c[Game Spoof] Now playing: ${name}`, "color:#57f287;font-weight:bold");
        };

        if (api && game.id && game.id !== "0") {
            api.get({ url: `/applications/public?application_ids=${game.id}` })
                .then(r => finish(r.body?.[0] || null))
                .catch(() => finish(null));
        } else {
            finish(null);
        }
    }

    function openModal() {
        if (window.__gameModal) {
            window.__gameModal.close();
            return;
        }

        const style = document.createElement("style");
        style.textContent = `
            #gm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;justify-content:center;align-items:center;z-index:999999999;font-family:gg sans,Whitney,Arial,sans-serif}
            #gm-modal{width:520px;max-height:70vh;background:#313338;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
            #gm-search{width:100%;box-sizing:border-box;border:none;outline:none;padding:18px;font-size:18px;background:#1e1f22;color:#fff}
            #gm-list{overflow-y:auto;max-height:50vh}
            .gm-item{padding:14px 18px;color:#fff;cursor:pointer;user-select:none}
            .gm-item:hover,.gm-selected{background:#5865f2}
            .gm-stop{padding:14px 18px;color:#ed4245;cursor:pointer;border-top:1px solid #1e1f22;font-weight:600}
            .gm-stop:hover{background:#ed424522}
            .gm-hint{padding:10px 18px;font-size:12px;color:#b5bac1;background:#1e1f22}
        `;
        document.head.appendChild(style);

        const backdrop = document.createElement("div");
        backdrop.id = "gm-backdrop";
        backdrop.innerHTML = `
            <div id="gm-modal">
                <input id="gm-search" placeholder="Search games..." autocomplete="off">
                <div class="gm-hint">${GAMES.length} games loaded • F7 toggle • Esc close</div>
                <div id="gm-list"></div>
                <div class="gm-stop" id="gm-stop">⏹ Stop spoofing</div>
            </div>
        `;
        document.body.appendChild(backdrop);

        const input = backdrop.querySelector("#gm-search");
        const list = backdrop.querySelector("#gm-list");
        let selected = 0;
        let filtered = [...GAMES];

        function render() {
            list.innerHTML = "";
            filtered.forEach((g, i) => {
                const el = document.createElement("div");
                el.className = "gm-item" + (i === selected ? " gm-selected" : "");
                el.textContent = g.name;
                el.onclick = () => {
                    startSpoof(g);
                    close();
                };
                list.appendChild(el);
            });
        }

        function close() {
            document.removeEventListener("keydown", onKey, true);
            backdrop.remove();
            style.remove();
            delete window.__gameModal;
        }

        function onKey(e) {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selected = Math.min(selected + 1, filtered.length - 1);
                render();
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                selected = Math.max(selected - 1, 0);
                render();
            }
            if (e.key === "Enter" && filtered[selected]) {
                e.preventDefault();
                startSpoof(filtered[selected]);
                close();
            }
        }

        input.oninput = () => {
            const q = input.value.toLowerCase();
            filtered = GAMES.filter(g => g.name.toLowerCase().includes(q));
            selected = 0;
            render();
        };

        backdrop.onclick = (e) => {
            if (e.target === backdrop) close();
        };
        backdrop.querySelector("#gm-stop").onclick = () => {
            stopSpoof();
            close();
        };

        document.addEventListener("keydown", onKey, true);
        window.__gameModal = { close, stopSpoof };
        input.focus();
        render();
    }

    window.openGameSpoofModal = openModal;
    window.stopGameSpoof = stopSpoof;

    if (!window.__gameSpoofF7) {
        window.__gameSpoofF7 = true;
        document.addEventListener("keydown", (e) => {
            if (e.key === "F7") {
                e.preventDefault();
                e.stopImmediatePropagation();
                openModal();
            }
        }, true);
    }

    openModal();
    console.log(
        `%c[Game Spoof] Ready — ${GAMES.length} games • F7 to open`,
        "color:#5865f2;font-weight:bold"
    );
})();