import { blankDoc, mergeDocs, normaliseDoc } from "./merge.js";

(() => {
  "use strict";

  // ---- Storage --------------------------------------------------------------
  // localStorage is the offline cache; /api/sync (Upstash Redis) is the source of truth.
  // The key names keep their original "phase1" prefix so data already saved on a device is still found.
  const KEY = "phase1-tracker-v1";
  const SYNC_KEY = "phase1-sync-key";
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normaliseDoc(JSON.parse(raw)) : blankDoc();
    } catch { return blankDoc(); }
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { toast("Couldn't save in this browser. Export a backup!"); }
  }
  function save() {
    saveLocal();
    scheduleSync();
  }

  const touch = o => { o.updatedAt = Date.now(); return o; };

  // ---- Sync -----------------------------------------------------------------
  let syncKey = (() => { try { return localStorage.getItem(SYNC_KEY) || ""; } catch { return ""; } })();
  let syncTimer = null, syncing = null, syncAgain = false;

  function setSyncStatus(kind, label) {
    const el = $("#syncState");
    el.className = "sync-pill sync-pill--" + kind;
    el.textContent = label;
    $("#syncDetail").textContent = {
      off: "Not connected. Calls stay on this device only.",
      ok: "Connected. Calls sync across your devices.",
      busy: "Syncing…",
      err: "Can't reach the sync server. Changes are kept here and will sync when it's back.",
      locked: "Wrong passphrase. Enter it again to reconnect.",
      setup: "Sync isn't configured on the server yet (see README).",
    }[kind] || "";
    $("#syncForm").hidden = kind === "ok" || kind === "busy" || kind === "err";
    $("#syncDisconnect").hidden = !syncKey;
  }

  function scheduleSync(delay = 600) {
    if (!syncKey) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay);
  }

  // Push local state, get the merged doc back, adopt it. Runs one at a time.
  async function sync() {
    if (!syncKey) { setSyncStatus("off", "Local only"); return false; }
    if (syncing) { syncAgain = true; return syncing; }
    setSyncStatus("busy", "Syncing");
    syncing = (async () => {
      try {
        const res = await fetch("api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sync-key": syncKey },
          body: JSON.stringify(state),
        });
        if (res.status === 401) { setSyncStatus("locked", "Locked"); return false; }
        if (res.status === 503) { setSyncStatus("setup", "Not set up"); return false; }
        if (!res.ok) throw new Error(res.status);
        // Merge again locally so edits made while the request was in flight survive.
        state = mergeDocs(state, await res.json());
        saveLocal();
        render();
        setSyncStatus("ok", "Synced");
        return true;
      } catch {
        setSyncStatus("err", "Offline");
        return false;
      } finally {
        syncing = null;
        if (syncAgain) { syncAgain = false; scheduleSync(0); }
      }
    })();
    return syncing;
  }

  // ---- Helpers --------------------------------------------------------------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");

  function fmtCountdown(ms, withSecs) {
    if (ms <= 0) return "0s";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (withSecs) return `${d ? d + "d " : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
    return d ? `${d}d ${h}h ${pad(m)}m` : `${h}h ${pad(m)}m`;
  }

  // ---- Tabs -----------------------------------------------------------------
  // The active tab lives in the URL hash (#predictions, #calls, #data), so a refresh or a shared link lands on it.
  const TABS = ["predictions", "calls", "data"];

  function showTab(id) {
    if (!TABS.includes(id)) id = TABS[0];
    for (const t of TABS) {
      const on = t === id;
      const btn = $("#tabBtn-" + t);
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
      $("#tab-" + t).hidden = !on;
    }
    return id;
  }

  function goTab(id) {
    id = showTab(id);
    try { history.replaceState(null, "", "#" + id); } catch { /* sandboxed frames can refuse */ }
    return id;
  }

  $(".tabs").addEventListener("click", ev => {
    const b = ev.target.closest("[data-tab]");
    if (b) goTab(b.dataset.tab);
  });
  $(".tabs").addEventListener("keydown", ev => {
    const i = TABS.findIndex(t => $("#tabBtn-" + t) === document.activeElement);
    if (i < 0) return;
    const j = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[ev.key];
    if (j === undefined) return;
    ev.preventDefault();
    goTab(TABS[j]);
    $("#tabBtn-" + TABS[j]).focus();
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

  // ---- Render ---------------------------------------------------------------
  function render() {
    renderScorecard();
  }

  // ---- Clock ----------------------------------------------------------------
  function tick() {
    const now = Date.now();
    document.querySelectorAll("[data-mcount]").forEach(el => {
      const left = Number(el.dataset.mcount) - now;
      el.textContent = left > 0 ? fmtCountdown(left, true) : "Settling…";
    });
    if (mcData) $("#mcAge").textContent = `Updated ${Math.max(0, Math.round((now - mcData.at) / 1000))}s ago`;
  }

  // ---- Market check ---------------------------------------------------------
  // Live fair-value view of every tracked market, served by /api/markets.
  const TF_LABEL = { "5m": "5-min", "15m": "15-min", "1h": "Hourly", "1d": "Daily", "1w": "Weekly" };
  const pct = x => (x * 100).toFixed(x > 0.995 || x < 0.005 ? 1 : 0) + "%";
  const cents = x => x == null ? "–" : Math.round(x * 100) + "¢";
  const money = (x, ref) => (ref < 100 ? x.toFixed(2) : x.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  let mcData = null, mcLoading = false;

  async function loadMarkets() {
    if (mcLoading) return;
    mcLoading = true;
    $("#mcRefresh").disabled = true;
    try {
      const res = await fetch("api/markets", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      mcData = await res.json();
      recordCalls();
      renderMarkets();
      resolveCalls();
    } catch {
      if (!mcData) $("#mcGrid").innerHTML = `<div class="empty">Couldn't load market data. Tap Refresh to try again.</div>`;
      $("#mcAge").textContent = "Refresh failed";
    } finally {
      mcLoading = false;
      $("#mcRefresh").disabled = false;
    }
  }

  function renderMarkets() {
    const d = mcData;
    if (!d.markets.length) {
      $("#mcGrid").innerHTML = `<div class="empty">No tracked markets are live right now.</div>`;
    } else {
      $("#mcGrid").innerHTML = d.markets.map(m => {
        const v = m.verdict;
        const lean = m.fair >= 0.5 ? { side: "UP", p: m.fair } : { side: "DOWN", p: 1 - m.fair };
        const diff = m.cur - m.open;
        return `
          <article class="mc-card mc-card--${v.kind}">
            <div class="mc-card__head">
              <span class="mc-card__name">${esc(m.asset)} · ${TF_LABEL[m.tf]}</span>
              <span class="mc-badge mc-badge--${v.kind}">${esc(v.text)}${v.edge != null && v.kind !== "fair" ? ` +${(v.edge * 100).toFixed(1)}` : ""}</span>
            </div>
            <div class="mc-call mc-call--${m.call.action.toLowerCase()}">${esc(m.call.text.split(" · ")[1])}</div>
            <div class="mc-lean ${lean.side === "UP" ? "is-up" : "is-down"}">Likely ${lean.side} <b>${pct(lean.p)}</b>${m.prior ? `<span class="hint" title="Previous candle closed ${m.prior.prevUp ? "Up" : "Down"}; next closed Up ${pct(m.prior.p)} historically; weight ${pct(m.prior.weight)}"> · reversal ${m.prior.prevUp ? "▲" : "▼"} ${pct(m.prior.p)} Up</span>` : ""}</div>
            <div class="mc-bar" role="img" aria-label="Model ${pct(m.fair)} Up versus market ${m.mktUp == null ? "unknown" : pct(m.mktUp)}">
              <div class="mc-bar__fair" style="width:${(m.fair * 100).toFixed(1)}%"></div>
              ${m.mktUp == null ? "" : `<div class="mc-bar__mkt" style="left:${(m.mktUp * 100).toFixed(1)}%" title="Market ${pct(m.mktUp)}"></div>`}
            </div>
            <div class="mc-legend"><span>Model Up ${pct(m.fair)}</span><span>Market Up ${m.mktUp == null ? "–" : pct(m.mktUp)}</span></div>
            <dl class="mc-facts">
              <div><dt>Open</dt><dd>${money(m.open, m.open)}</dd></div>
              <div><dt>Now</dt><dd class="${diff >= 0 ? "is-up" : "is-down"}">${money(m.cur, m.cur)} <small>${diff >= 0 ? "+" : ""}${money(diff, m.cur)}</small></dd></div>
              <div><dt>Buy Up / Down</dt><dd>${cents(m.buyUp)} / ${cents(m.buyDown)}</dd></div>
              <div><dt>Ends in</dt><dd class="mono" data-mcount="${m.end}">${fmtCountdown(m.end - Date.now(), true)}</dd></div>
            </dl>
            <div class="mc-card__foot">
              <span class="hint">Settles on ${esc(m.source)}</span>
              <div class="row">
                ${m.call.action !== "SKIP" ? `<button class="btn btn--ghost btn--sm ${callTaken(m.slug) ? "is-taken" : ""}" type="button" data-took="${esc(m.slug)}">${callTaken(m.slug) ? "Took it ✓" : "I took it"}</button>` : ""}
                <a class="btn btn--ghost btn--sm" href="${esc(m.url)}" target="_blank" rel="noopener">Open ↗</a>
              </div>
            </div>
          </article>`;
      }).join("");
    }
    $("#mcCalls").innerHTML = d.markets.length
      ? d.markets.map(m => `<li class="mc-calls__item mc-calls__item--${m.call.action.toLowerCase()}"><span class="mc-calls__tag">${m.call.action}</span>${esc(m.call.text)}</li>`).join("")
      : `<li class="hint">No tracked markets live.</li>`;
    const nice = { "5m": "5m", "15m": "15m", "1h": "1h" };
    $("#mcNext").innerHTML = d.nextRates.filter(r => r.tracked).map(r => {
      const side = r.nextUp >= 0.5 ? "UP" : "DOWN", p = Math.max(r.nextUp, 1 - r.nextUp);
      return `<span class="mc-chip" title="Last closed ${r.lastUp ? "Up" : "Down"}; n=${r.n}"><b>${r.asset} ${nice[r.tf]}</b> last ${r.lastUp ? "▲" : "▼"} → next ${side} ${pct(p)}</span>`;
    }).join("") + (d.missing.length ? `<span class="hint mc-missing">Not live on Limitless now: ${d.missing.map(esc).join(", ")}</span>` : "");
    tick();
  }

  $("#mcRefresh").addEventListener("click", loadMarkets);

  // ---- Calibration log ------------------------------------------------------
  // The model's one-shot call is stored once per market (first time the panel sees it, unless it's
  // already too late), then resolved through /api/markets?resolve= once the market settles.
  const callsLive = () => state.calls || (state.calls = []);
  const callTaken = slug => !!callsLive().find(c => c.id === slug && c.taken);

  function recordCalls() {
    const have = new Set(callsLive().map(c => c.id));
    let added = 0;
    for (const m of mcData.markets) {
      if (have.has(m.slug) || m.verdict.kind === "late") continue;
      callsLive().push(touch({
        id: m.slug, asset: m.asset, tf: m.tf, url: m.url, at: mcData.at, end: m.end,
        minsLeft: Math.round(m.minsLeft * 10) / 10, open: m.open, cur: m.cur,
        fair: m.fair, mkt: m.mktUp, buyUp: m.buyUp, buyDown: m.buyDown,
        action: m.call.action, side: m.call.side, price: m.call.price, text: m.call.text,
        outcome: null, taken: false,
      }));
      added++;
    }
    if (added) { save(); renderScorecard(); }
  }

  let resolving = false;
  async function resolveCalls() {
    if (resolving) return;
    const now = Date.now();
    const due = callsLive().filter(c => !c.outcome && c.end + 60e3 < now).slice(0, 25);
    if (!due.length) return;
    resolving = true;
    try {
      const res = await fetch("api/markets?resolve=" + due.map(c => encodeURIComponent(c.id)).join(","), { cache: "no-store" });
      if (!res.ok) return;
      const { results } = await res.json();
      let changed = 0;
      for (const r of results) {
        const c = callsLive().find(x => x.id === r.slug);
        if (!c) continue;
        if (r.winner) { c.outcome = r.winner; touch(c); changed++; }
        else if (now - c.end > 48 * 3600e3) { c.outcome = "VOID"; touch(c); changed++; }
      }
      if (changed) { save(); renderScorecard(); }
    } catch { /* retry on next refresh */ } finally { resolving = false; }
  }

  function scoreRows(list) {
    const done = list.filter(c => c.outcome === "UP" || c.outcome === "DOWN");
    let wins = 0, exp = 0, pnl = 0, staked = 0;
    for (const c of done) {
      const p = c.side === "UP" ? c.fair : 1 - c.fair;
      exp += p;
      const won = c.outcome === c.side;
      if (won) wins++;
      if (c.price) { staked++; pnl += won ? 1 / c.price - 1 : -1; }
    }
    return { n: done.length, open: list.length - done.length - list.filter(c => c.outcome === "VOID").length, wins, exp, pnl, staked };
  }

  function renderScorecard() {
    const calls = callsLive();
    const groups = [
      ["BUY calls", calls.filter(c => c.action === "BUY"), "edge ≥ 5 pts"],
      ["LEAN calls", calls.filter(c => c.action === "LEAN"), "edge 2–5 pts"],
      ["Your trades", calls.filter(c => c.taken), "marked “I took it”"],
      ["All calls (likely side)", calls, "direction only"],
    ];
    const pnlTxt = r => r.staked ? `${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)} per $1 × ${r.staked}` : "–";
    let html = groups.map(([name, list, sub]) => {
      const r = scoreRows(name.startsWith("All") ? list.map(c => ({ ...c, side: c.fair >= 0.5 ? "UP" : "DOWN", price: null })) : list);
      const hit = r.n ? `${Math.round(r.wins / r.n * 100)}%` : "–";
      const expP = r.n ? `${Math.round(r.exp / r.n * 100)}%` : "–";
      return `<div class="score-cell">
        <div class="score-cell__name">${name} <span class="hint">${sub}</span></div>
        <div class="score-cell__big">${r.wins}/${r.n} <small>won</small></div>
        <div class="score-cell__meta">Hit ${hit} vs expected ${expP}${name.startsWith("All") ? "" : ` · P&L ${pnlTxt(r)}`}${r.open ? ` · ${r.open} pending` : ""}</div>
      </div>`;
    }).join("");
    // Brier score: model vs market on the same resolved calls (lower is better).
    const done = calls.filter(c => (c.outcome === "UP" || c.outcome === "DOWN") && c.mkt != null);
    if (done.length) {
      const b = f => done.reduce((s, c) => s + (f(c) - (c.outcome === "UP" ? 1 : 0)) ** 2, 0) / done.length;
      const bm = b(c => c.fair), bk = b(c => c.mkt);
      html += `<div class="score-cell score-cell--wide"><div class="score-cell__name">Model vs market <span class="hint">Brier score, lower is better · ${done.length} calls</span></div>
        <div class="score-cell__meta">Model <b>${bm.toFixed(3)}</b> · Market <b>${bk.toFixed(3)}</b> → ${bm < bk ? "model is sharper so far" : bm > bk ? "market is sharper so far" : "tied"}${done.length < 50 ? " (too few calls to trust yet)" : ""}</div></div>`;
    }
    $("#scoreGrid").innerHTML = html;
    const recent = [...calls].filter(c => c.outcome).sort((a, b) => b.end - a.end).slice(0, 8);
    $("#scoreRecent").innerHTML = recent.length ? recent.map(c => {
      const ok = c.action === "SKIP" ? (c.fair >= 0.5 ? "UP" : "DOWN") === c.outcome : c.side === c.outcome;
      return `<li><span class="${c.outcome === "VOID" ? "hint" : ok ? "is-ok" : "is-bad"}">${c.outcome === "VOID" ? "–" : ok ? "✓" : "✗"}</span> ${esc(c.text)} <span class="hint">→ ${c.outcome}${c.taken ? " · taken" : ""}</span></li>`;
    }).join("") : `<li class="hint">No settled calls yet. Leave the page open and calls fill in as markets settle.</li>`;
  }

  // ---- Clicks ---------------------------------------------------------------
  document.addEventListener("click", ev => {
    const t = ev.target.closest("button[data-took]");
    if (!t) return;
    const c = callsLive().find(x => x.id === t.dataset.took);
    if (c) { c.taken = !c.taken; touch(c); save(); renderMarkets(); renderScorecard(); toast(c.taken ? "Marked as taken ✓" : "Unmarked"); }
  });

  // ---- Import / export ------------------------------------------------------
  function download(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  // The export is the whole synced doc, so it also carries the old competition log still kept in storage.
  $("#exportJson").addEventListener("click", () => download(`dragoncalls-${stamp()}.json`, JSON.stringify(state, null, 2), "application/json"));
  $("#importJson").addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = normaliseDoc(JSON.parse(await file.text()));
      if (!confirm(`Merge ${data.calls.length} calls from ${file.name} into your scorecard?`)) return;
      state = mergeDocs(state, data); save(); render(); toast("Imported ✓");
    } catch { toast("That file isn't a valid backup"); }
    ev.target.value = "";
  });

  // ---- Toast ----------------------------------------------------------------
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ---- Sync controls --------------------------------------------------------
  $("#syncForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const key = ev.target.elements.passphrase.value.trim();
    if (!key) return;
    syncKey = key;
    try { localStorage.setItem(SYNC_KEY, key); } catch {}
    ev.target.reset();
    if (await sync()) toast("Connected. This device now syncs ✓");
  });
  $("#syncDisconnect").addEventListener("click", () => {
    if (!confirm("Stop syncing on this device? Your calls stay saved here.")) return;
    syncKey = "";
    try { localStorage.removeItem(SYNC_KEY); } catch {}
    setSyncStatus("off", "Local only");
  });
  // Without a passphrase the pill sends you to the field, which lives on the Data tab.
  $("#syncState").addEventListener("click", () => {
    if (syncKey) return sync();
    goTab("data");
    $("#syncForm").elements.passphrase.focus();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(0); });
  window.addEventListener("online", () => scheduleSync(0));
  setInterval(() => { if (!document.hidden) scheduleSync(0); }, 60e3);

  showTab(location.hash.slice(1));
  render();
  loadMarkets();
  setInterval(() => { if (!document.hidden) loadMarkets(); }, 30e3);
  setSyncStatus("off", "Local only");
  scheduleSync(0);
  tick();
  setInterval(tick, 1000);
})();
