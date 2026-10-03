import { blankDoc, mergeDocs, normaliseDoc } from "./merge.js";

(() => {
  "use strict";

  // ---- Campaign config (from the ambassador Mini App, 2 Oct 2026) ----------
  // "Ends in 9D 4H" read at 2 Oct 15:06 UTC → ~11 Oct 19:06 UTC. Adjust if the Mini App shows otherwise.
  const CAMPAIGN_START = Date.parse("2026-09-10T00:00:00Z");
  const CAMPAIGN_END = Date.parse("2026-10-11T19:06:00Z");
  // Standings refresh roughly every 9h, anchored on the 2 Oct 15:06 UTC update.
  const UPDATE_ANCHOR = Date.parse("2026-10-02T15:06:00Z");
  const UPDATE_EVERY = 9 * 3600e3;
  const MIN_PER_WEEK = 4;
  const MAX_PER_WEEK = 10;
  const TOP_N = 8;

  const WEEKS = [
    { id: "W37", start: "2026-09-07", end: "2026-09-14" },
    { id: "W38", start: "2026-09-14", end: "2026-09-21" },
    { id: "W39", start: "2026-09-21", end: "2026-09-28" },
    { id: "W40", start: "2026-09-28", end: "2026-10-05" },
    { id: "W41", start: "2026-10-05", end: "2026-10-12" },
  ].map(w => ({ ...w, s: Date.parse(w.start + "T00:00:00Z"), e: Math.min(Date.parse(w.end + "T00:00:00Z"), CAMPAIGN_END) }));
  const PHASE_WEEKS = ["W40", "W41"];

  const TIMEFRAMES = [
    { id: "5m", label: "5-min", assets: ["BTC", "ETH"] },
    { id: "15m", label: "15-min", assets: ["BTC", "ETH"] },
    { id: "1h", label: "Hourly", assets: ["BTC", "ETH", "SOL"] },
    { id: "1d", label: "Daily", assets: ["BTC", "ETH", "SOL"] },
    { id: "1w", label: "Weekly", assets: ["BTC"] },
  ];
  const TF = Object.fromEntries(TIMEFRAMES.map(t => [t.id, t]));
  const ASSETS = ["BTC", "ETH", "SOL"];
  const RIVALS = ["polymarket", "kalshi", "manifold", "predictit", "myriad", "azuro", "sx bet", "overtime markets", "hedgehog", "drift bet", "betmoar"];
  const COUNTED = new Set(["submitted", "verified", "rejected"]);
  const STATUS_ORDER = ["posted", "submitted", "verified", "rejected"];
  const STATUS_LABEL = { posted: "Posted", submitted: "Submitted", verified: "Verified", rejected: "Rejected" };

  // ---- Draft queue ----------------------------------------------------------
  const DRAFTS = [
    {
      id: "d1", day: "Fri 2 Oct", asset: "BTC", timeframe: "1h", kind: "original", title: "Explainer · BTC Hourly",
      text:
`Tired of watching BTC move while you're stuck reading 14 indicators, 3 funding charts and one guru's "trust me bro"?

Here's a simpler game.

One question: will BTC close this hour higher or lower?

➡️ Up or Down.

That's it. No leverage. No liquidation. No shege.

On @trylimitless you pick a side, the hour plays out, the market settles. Simple!

Now, you'd ask: "Hybrid, how is that different from a normal trade?"

You're not managing a position. You're pricing an outcome.

BTC Hourly is live 👇
[paste limitless.exchange/markets/… link]`,
    },
    {
      id: "d2", day: "Fri 2 Oct", asset: "BTC", timeframe: "15m", kind: "original", title: "Live call · BTC 15-min",
      text:
`BTC 15-minute market.

What am I taking? [Up/Down].
Why? [one line: e.g. reclaimed $X on the 5m, volume picking up].
What if I'm wrong? Then I'm wrong in 15 minutes, not 15 days. Lol!

That's the beauty of these short windows on @trylimitless. Your thesis gets tested FAST.

I'd post the result once it settles.

Your call? Up or Down 👇
[paste limitless.exchange/markets/… link]`,
    },
    {
      id: "d3", day: "Fri 2 Oct", asset: "ETH", timeframe: "1d", kind: "original", title: "Daily take · ETH Daily",
      text:
`...at the open, ETH chose a direction.
...at the close, someone was right.

Two scenarios, one market: ETH Up or Down, daily.

Daily markets are for the patient chads. You're not chasing every wick, you're reading the whole day: [catalyst: ETF flows / macro print / your chart read].

My lean today: [Up/Down], because [reason].

Simple question. Real conviction.
Pick your side on @trylimitless 👇
[paste limitless.exchange/markets/… link]`,
    },
    {
      id: "d4", day: "Sat 3 Oct", asset: "SOL", timeframe: "1h", kind: "original", title: "Metaphor · SOL Hourly",
      text:
`Picture SOL as The Flash.

Fast. Restless. Never stays in one place for long.

Now, you'd ask: "So how do I even play something that moves like that?"

You don't chase it. You call it. One hour at a time.

➡️ SOL Up or Down (Hourly) on @trylimitless

60 minutes. One question. One answer.

More volatility → more opinions → more action.
This is exactly why hourly fits SOL.

What's your call for this hour? 👇
[paste limitless.exchange/markets/… link]`,
    },
  ];

  // ---- Storage --------------------------------------------------------------
  // localStorage is the offline cache; /api/sync (Upstash Redis) is the source of truth.
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

  // Tombstoned (deleted) rows stay in state so deletes sync; views read these.
  const entries = () => state.entries.filter(e => !e.deleted);
  const standings = () => state.standings.filter(s => !s.deleted);
  const touch = o => { o.updatedAt = Date.now(); return o; };

  // ---- Sync -----------------------------------------------------------------
  let syncKey = (() => { try { return localStorage.getItem(SYNC_KEY) || ""; } catch { return ""; } })();
  let syncTimer = null, syncing = null, syncAgain = false;

  function setSyncStatus(kind, label) {
    const el = $("#syncState");
    el.className = "sync-pill sync-pill--" + kind;
    el.textContent = label;
    $("#syncDetail").textContent = {
      off: "Not connected. Logs stay on this device only.",
      ok: "Connected. Logs sync across your devices.",
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
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pad = n => String(n).padStart(2, "0");

  function fmtCountdown(ms, withSecs) {
    if (ms <= 0) return "0s";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (withSecs) return `${d ? d + "d " : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
    return d ? `${d}d ${h}h ${pad(m)}m` : `${h}h ${pad(m)}m`;
  }
  const fmtDate = ms => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtDay = ms => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  function toLocalInput(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const weekOf = ms => (WEEKS.find(w => ms >= w.s && ms < Date.parse(w.end + "T00:00:00Z")) || {}).id || null;
  const entryTime = e => e.submittedAt || e.postedAt;
  const entryWeek = e => weekOf(entryTime(e));
  const eligible = (asset, tf) => !!TF[tf] && TF[tf].assets.includes(asset);

  function guessFromUrl(url) {
    const u = (url || "").toLowerCase();
    const asset = /\bsol(ana)?\b|[-/]sol[-/]/.test(u) ? "SOL" : /eth(ereum)?/.test(u) ? "ETH" : /btc|bitcoin/.test(u) ? "BTC" : null;
    const tf = /15[-_ ]?min|15m/.test(u) ? "15m" : /5[-_ ]?min|\b5m\b|-5m-/.test(u) ? "5m" : /hour|1h/.test(u) ? "1h" : /daily|day|1d/.test(u) ? "1d" : /week|1w/.test(u) ? "1w" : null;
    return { asset, tf };
  }

  // ---- Rule checker ---------------------------------------------------------
  // Returns [{ ok: true|false|null, label }]. null = can't tell from what was entered.
  function checks(e, ignoreId) {
    const out = [];
    const text = (e.text || "").trim();
    const lower = text.toLowerCase();

    out.push({ ok: /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(e.postUrl || ""), label: "Valid X post URL" });
    const dup = entries().some(o => o.id !== ignoreId && o.postUrl && normUrl(o.postUrl) === normUrl(e.postUrl));
    if (e.postUrl && dup) out.push({ ok: false, label: "Already logged" });

    out.push({ ok: e.kind === "original" || e.kind === "quote", label: "Original or quote post (no replies, no reposts)" });

    const m = e.marketUrl || "";
    out.push({
      ok: /^https?:\/\/(www\.)?limitless\.exchange\/markets\/\S+/.test(m) ? true : /t\.co\//.test(m) ? null : false,
      label: "Market link is limitless.exchange/markets/…",
    });
    out.push({ ok: eligible(e.asset, e.timeframe), label: `${e.asset} ${TF[e.timeframe]?.label || ""} is a campaign market` });

    if (text) {
      out.push({ ok: /@trylimitless\b|@limitless\w*/i.test(text), label: "Tags @trylimitless" });
      out.push({ ok: /limitless\.exchange\/markets\/|t\.co\//i.test(text) ? true : false, label: "Market link is inside the post text" });
      const hits = RIVALS.filter(r => lower.includes(r));
      out.push({ ok: hits.length === 0, label: hits.length ? `Mentions a rival: ${hits.join(", ")}` : "No rival prediction market mentioned" });
      if (/\[[^\]]+\]/.test(text)) out.push({ ok: false, label: "Unfilled [placeholder] still in the text" });
    } else {
      out.push({ ok: null, label: "Tags @trylimitless (paste text to check)" });
      out.push({ ok: null, label: "No rival mentioned (paste text to check)" });
    }

    const t = entryTime(e);
    out.push({ ok: t >= CAMPAIGN_START && t <= CAMPAIGN_END, label: "Inside the campaign window" });

    const wk = weekOf(t);
    if (wk && COUNTED.has(e.status)) {
      const n = entries().filter(o => o.id !== ignoreId && COUNTED.has(o.status) && entryWeek(o) === wk).length;
      out.push({ ok: n < MAX_PER_WEEK, label: `${wk}: ${n + 1} of ${MAX_PER_WEEK} weekly submissions` });
    }
    return out;
  }
  const normUrl = u => (u || "").trim().toLowerCase().replace(/^https?:\/\/(www\.|mobile\.)?twitter\.com/, "https://x.com").replace(/^https?:\/\/(www\.|mobile\.)?x\.com/, "https://x.com").replace(/[?#].*$/, "").replace(/\/$/, "");

  // ---- Render ---------------------------------------------------------------
  let filter = "all";

  function render() {
    renderWeeks();
    renderCoverage();
    renderLog();
    renderDrafts();
    renderStandings();
    renderTicker();
    const verified = entries().filter(e => e.status === "verified" && PHASE_WEEKS.includes(entryWeek(e))).length;
    $("#totVerified").textContent = verified;
  }

  function weekStats(id) {
    const es = entries().filter(e => entryWeek(e) === id);
    return {
      posted: es.length,
      submitted: es.filter(e => COUNTED.has(e.status)).length,
      verified: es.filter(e => e.status === "verified").length,
      rejected: es.filter(e => e.status === "rejected").length,
    };
  }

  function renderWeeks() {
    const now = Date.now();
    $("#weeks").innerHTML = WEEKS.filter(w => PHASE_WEEKS.includes(w.id)).map(w => {
      const st = weekStats(w.id);
      const current = now >= w.s && now < w.e;
      const closed = now >= w.e;
      const met = st.verified >= MIN_PER_WEEK;
      const pill = met ? `<span class="pill pill--ok">Qualified</span>`
        : current ? `<span class="pill pill--live">Live</span>`
        : closed ? `<span class="pill">Closed</span>` : `<span class="pill">Upcoming</span>`;
      const need = Math.max(0, MIN_PER_WEEK - st.verified);
      const left = Math.max(0, MAX_PER_WEEK - st.submitted);
      const foot = closed ? `Closed ${fmtDay(w.e)}`
        : current ? `Ends in <span class="mono" data-countdown="${w.e}">${fmtCountdown(w.e - now)}</span>`
        : `Opens ${fmtDate(w.s)}`;
      return `
        <article class="week ${current ? "is-current" : ""}" aria-label="${w.id}">
          <div class="week__head">
            <div>
              <div class="week__name">${w.id}</div>
              <div class="week__dates">${fmtDay(w.s)} → ${fmtDay(w.e - 1)}</div>
            </div>
            ${pill}
          </div>
          <div class="week__nums">
            <div class="num"><b>${st.verified}</b><span>Verified</span></div>
            <div class="num"><b>${st.submitted}<small style="color:var(--text-3);font-size:14px">/${MAX_PER_WEEK}</small></b><span>Submitted</span></div>
            <div class="num"><b>${need}</b><span>To qualify</span></div>
          </div>
          <div class="bar" role="img" aria-label="${st.verified} verified and ${st.submitted} submitted of ${MAX_PER_WEEK}">
            <div class="bar__fill" style="width:${Math.min(100, st.submitted / MAX_PER_WEEK * 100)}%"></div>
            <div class="bar__verified" style="width:${Math.min(100, st.verified / MAX_PER_WEEK * 100)}%"></div>
            <div class="bar__min" title="Minimum ${MIN_PER_WEEK}"></div>
          </div>
          <div class="week__foot"><span>${foot}</span><span>${left} slots left${st.rejected ? ` · ${st.rejected} rejected` : ""}</span></div>
        </article>`;
    }).join("");
  }

  function renderCoverage() {
    const counts = {};
    entries().filter(e => e.status !== "rejected").forEach(e => { const k = e.asset + e.timeframe; counts[k] = (counts[k] || 0) + 1; });
    let html = `<div></div>` + TIMEFRAMES.map(t => `<div class="h" role="columnheader">${t.label}</div>`).join("");
    ASSETS.forEach(a => {
      html += `<div class="a" role="rowheader">${a}</div>`;
      TIMEFRAMES.forEach(t => {
        if (!t.assets.includes(a)) { html += `<div class="cell off" role="cell" aria-label="${a} ${t.label}: not eligible">–</div>`; return; }
        const n = counts[a + t.id] || 0;
        html += `<div class="cell ${n ? "has" : "zero"}" role="cell" aria-label="${a} ${t.label}: ${n} posts">${n}</div>`;
      });
    });
    $("#coverage").innerHTML = html;
  }

  function renderLog() {
    let es = [...entries()].sort((a, b) => entryTime(b) - entryTime(a));
    if (filter === "W40" || filter === "W41") es = es.filter(e => entryWeek(e) === filter);
    if (filter === "open") es = es.filter(e => e.status === "posted" || e.status === "submitted" || e.status === "rejected");
    if (!es.length) {
      $("#log").innerHTML = `<div class="empty">${entries().length ? "Nothing here for this filter." : "No posts logged yet. Post your first draft below, then tap <b>+ Log post</b>."}</div>`;
      return;
    }
    $("#log").innerHTML = es.map(e => {
      const bad = checks(e, e.id).filter(c => c.ok === false);
      const wk = entryWeek(e) || "Outside window";
      return `
        <article class="entry">
          <div>
            <div class="entry__title">
              <span class="entry__market">${esc(e.asset)} ${esc(TF[e.timeframe]?.label || e.timeframe)}</span>
              <span class="pill">${esc(wk)}</span>
              ${e.kind === "quote" ? `<span class="pill">Quote</span>` : ""}
            </div>
            <div class="entry__meta">
              <span>${fmtDate(entryTime(e))}</span>
              ${e.postUrl ? `<a href="${esc(e.postUrl)}" target="_blank" rel="noopener">View post ↗</a>` : ""}
              ${e.marketUrl ? `<a href="${esc(e.marketUrl)}" target="_blank" rel="noopener">Market ↗</a>` : ""}
              ${e.views ? `<span>${Number(e.views).toLocaleString()} views</span>` : ""}
            </div>
            ${bad.length ? `<div class="entry__warn">⚠ ${bad.map(c => esc(c.label)).join(" · ")}</div>` : ""}
            ${e.notes ? `<div class="entry__notes">${esc(e.notes)}</div>` : ""}
          </div>
          <div class="entry__side">
            <button class="status status--${e.status}" data-cycle="${e.id}" title="Tap to change status">${STATUS_LABEL[e.status] || e.status}</button>
            <button class="btn btn--ghost btn--sm" data-edit="${e.id}">Edit</button>
          </div>
        </article>`;
    }).join("");
  }

  function renderDrafts() {
    $("#drafts").innerHTML = DRAFTS.map(d => {
      const used = state.usedDrafts.includes(d.id);
      const body = esc(d.text).replace(/\[[^\]]+\]/g, m => `<mark>${m}</mark>`);
      return `
        <article class="draft ${used ? "is-used" : ""}">
          <div class="draft__top">
            <span class="draft__tag">${esc(d.title)}</span>
            <span class="draft__day">${esc(d.day)}${used ? " · logged" : ""}</span>
          </div>
          <pre>${body}</pre>
          <div class="row">
            <button class="btn btn--ghost btn--sm" data-copy="${d.id}">Copy text</button>
            <button class="btn btn--lime btn--sm" data-use="${d.id}">Log this post</button>
          </div>
        </article>`;
    }).join("");
  }

  function renderStandings() {
    const list = [...standings()].sort((a, b) => b.at - a.at);
    $("#standings").innerHTML = list.map(s => `
      <li class="${s.rank <= TOP_N ? "in" : ""}">
        <span>${fmtDate(s.at)}</span>
        <span><b>#${s.rank}</b> of ${s.total} ${s.rank <= TOP_N ? "· in the money" : `· ${s.rank - TOP_N} off top ${TOP_N}`}</span>
        <button class="icon-btn" data-delstand="${s.at}" aria-label="Delete snapshot" style="width:28px;height:28px">✕</button>
      </li>`).join("");
    $("#latestRank").innerHTML = list[0] ? `#${list[0].rank}<small> / ${list[0].total}</small>` : "—";
  }

  function renderTicker() {
    const items = PHASE_WEEKS.map(id => {
      const s = weekStats(id);
      return `${id} · <b class="${s.verified >= MIN_PER_WEEK ? "yes" : "no"}">${s.verified} verified</b> · ${s.submitted}/${MAX_PER_WEEK} submitted`;
    }).concat([
      `Tag <b class="yes">@trylimitless</b>`,
      `Link in the post, <b class="no">not</b> the reply`,
      `<b class="no">No</b> rival mentions`,
      `Submit in the Mini App right after posting`,
      `Top <b class="yes">${TOP_N}</b> win the airdrop share`,
    ]);
    const row = items.map(i => `<span>${i}</span>`).join("");
    $("#ticker").innerHTML = row + row; // doubled for a seamless loop
  }

  // ---- Clock ----------------------------------------------------------------
  function tick() {
    const now = Date.now();
    const left = CAMPAIGN_END - now;
    $("#campaignEnd").textContent = left > 0 ? fmtCountdown(left) : "Ended";
    const st = $("#campaignState");
    st.classList.toggle("is-ended", left <= 0);
    st.lastChild.textContent = left > 0 ? "Live" : "Ended";

    let next = UPDATE_ANCHOR;
    if (now > next) next += Math.ceil((now - next) / UPDATE_EVERY) * UPDATE_EVERY;
    $("#nextUpdate").textContent = fmtCountdown(next - now, true);
    $("#nextUpdate").title = "~" + new Date(next).toUTCString();

    document.querySelectorAll("[data-mcount]").forEach(el => {
      const left = Number(el.dataset.mcount) - now;
      el.textContent = left > 0 ? fmtCountdown(left, true) : "Settling…";
    });
    if (mcData) $("#mcAge").textContent = `Updated ${Math.max(0, Math.round((now - mcData.at) / 1000))}s ago`;
    document.querySelectorAll("[data-countdown]").forEach(el => {
      el.textContent = fmtCountdown(Number(el.dataset.countdown) - now);
    });
  }

  // ---- Market check ---------------------------------------------------------
  // Live fair-value view of every campaign market, served by /api/markets.
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
      renderMarkets();
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
      $("#mcGrid").innerHTML = `<div class="empty">No campaign markets are live right now.</div>`;
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
            <div class="mc-lean ${lean.side === "UP" ? "is-up" : "is-down"}">Likely ${lean.side} <b>${pct(lean.p)}</b></div>
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
                <a class="btn btn--ghost btn--sm" href="${esc(m.url)}" target="_blank" rel="noopener">Open ↗</a>
                <button class="btn btn--lime btn--sm" type="button" data-mclog="${esc(m.slug)}">Log post</button>
              </div>
            </div>
          </article>`;
      }).join("");
    }
    const nice = { "5m": "5m", "15m": "15m", "1h": "1h" };
    $("#mcNext").innerHTML = d.nextRates.filter(r => r.eligible).map(r => {
      const side = r.nextUp >= 0.5 ? "UP" : "DOWN", p = Math.max(r.nextUp, 1 - r.nextUp);
      return `<span class="mc-chip" title="Last closed ${r.lastUp ? "Up" : "Down"}; n=${r.n}"><b>${r.asset} ${nice[r.tf]}</b> last ${r.lastUp ? "▲" : "▼"} → next ${side} ${pct(p)}</span>`;
    }).join("") + (d.missing.length ? `<span class="hint mc-missing">Not live on Limitless now: ${d.missing.map(esc).join(", ")}</span>` : "");
    tick();
  }

  $("#mcRefresh").addEventListener("click", loadMarkets);

  // ---- Form -----------------------------------------------------------------
  const dlg = $("#logDialog");
  const form = $("#logForm");

  function readForm() {
    const f = new FormData(form);
    const postedAt = f.get("postedAt") ? new Date(f.get("postedAt")).getTime() : Date.now();
    return {
      id: f.get("id") || "",
      postUrl: (f.get("postUrl") || "").trim(),
      marketUrl: (f.get("marketUrl") || "").trim(),
      asset: f.get("asset"),
      timeframe: f.get("timeframe"),
      kind: f.get("kind"),
      postedAt: isNaN(postedAt) ? Date.now() : postedAt,
      text: f.get("text") || "",
      status: f.get("status"),
      views: f.get("views") ? Number(f.get("views")) : null,
      notes: (f.get("notes") || "").trim(),
    };
  }

  // `entry` is either a saved entry (edit) or, with isNew, a set of prefilled defaults.
  function openForm(entry, draftId, isNew) {
    form.reset();
    const e = entry || { postedAt: Date.now(), status: "submitted", kind: "original", asset: "BTC", timeframe: "1h" };
    const editing = !!entry && !isNew;
    form.elements.id.value = editing ? entry.id : "";
    form.elements.postUrl.value = e.postUrl || "";
    form.elements.marketUrl.value = e.marketUrl || "";
    form.elements.asset.value = e.asset;
    form.elements.timeframe.value = e.timeframe;
    form.elements.kind.value = e.kind;
    form.elements.postedAt.value = toLocalInput(e.postedAt);
    form.elements.text.value = e.text || "";
    form.elements.status.value = e.status;
    form.elements.views.value = e.views ?? "";
    form.elements.notes.value = e.notes || "";
    form.dataset.draft = draftId || "";
    $("#formTitle").textContent = editing ? "Edit post" : "Log a post";
    $("#deleteEntry").hidden = !editing;
    updatePreflight();
    dlg.showModal();
  }

  function updatePreflight() {
    const e = readForm();
    const res = checks(e, e.id);
    const icon = ok => ok === true ? "✓" : ok === false ? "✕" : "?";
    const cls = ok => ok === true ? "ok" : ok === false ? "bad" : "unk";
    const fails = res.filter(c => c.ok === false).length;
    $("#preflight").innerHTML = `<div class="preflight__title">Rule check · ${fails ? `${fails} issue${fails > 1 ? "s" : ""}` : "looks good"}</div>` +
      res.map(c => `<div class="chk ${cls(c.ok)}"><i>${icon(c.ok)}</i><span>${esc(c.label)}</span></div>`).join("");
  }

  form.addEventListener("input", e => {
    if (e.target.name === "marketUrl") {
      const g = guessFromUrl(e.target.value);
      if (g.asset) form.elements.asset.value = g.asset;
      if (g.tf) form.elements.timeframe.value = g.tf;
    }
    updatePreflight();
  });
  form.addEventListener("change", updatePreflight);

  form.addEventListener("submit", ev => {
    const btn = ev.submitter;
    if (btn && btn.value === "cancel") return;
    ev.preventDefault();
    const e = readForm();
    if (!e.postUrl) { toast("Add the post URL first"); form.elements.postUrl.focus(); return; }
    const existing = entries().find(x => x.id === e.id);
    const wasCounted = existing && COUNTED.has(existing.status);
    const entry = touch({ ...(existing || {}), ...e, id: e.id || uid() });
    if (COUNTED.has(entry.status) && !wasCounted) entry.submittedAt = Date.now();
    if (!COUNTED.has(entry.status)) delete entry.submittedAt;
    if (existing) Object.assign(existing, entry); else state.entries.push(entry);
    const draft = form.dataset.draft;
    if (draft && !state.usedDrafts.includes(draft)) state.usedDrafts.push(draft);
    save(); render(); dlg.close();
    const issues = checks(entry, entry.id).filter(c => c.ok === false).length;
    toast(issues ? `Saved, with ${issues} rule issue${issues > 1 ? "s" : ""} to fix` : "Saved ✓");
  });

  $("#deleteEntry").addEventListener("click", () => {
    const id = form.elements.id.value;
    if (!id || !confirm("Delete this entry?")) return;
    state.entries = state.entries.map(e => e.id === id ? touch({ id, deleted: true }) : e);
    save(); render(); dlg.close(); toast("Deleted");
  });

  // ---- Clicks ---------------------------------------------------------------
  document.addEventListener("click", async ev => {
    const t = ev.target.closest("button, [data-open]");
    if (!t) return;
    if (t.dataset.open === "logDialog") return openForm(null);
    if (t.dataset.edit) return openForm(entries().find(e => e.id === t.dataset.edit));
    if (t.dataset.cycle) {
      const e = entries().find(x => x.id === t.dataset.cycle);
      if (!e) return;
      const next = STATUS_ORDER[(STATUS_ORDER.indexOf(e.status) + 1) % STATUS_ORDER.length];
      if (COUNTED.has(next) && !COUNTED.has(e.status)) e.submittedAt = Date.now();
      if (!COUNTED.has(next)) delete e.submittedAt;
      e.status = next;
      touch(e);
      save(); render();
      return;
      return;
    }
    if (t.dataset.copy) {
      const d = DRAFTS.find(x => x.id === t.dataset.copy);
      try { await navigator.clipboard.writeText(d.text); toast("Copied, now fill the [brackets]"); }
      catch { toast("Copy blocked. Long-press the text to copy"); }
      return;
    }
    if (t.dataset.mclog && mcData) {
      const m = mcData.markets.find(x => x.slug === t.dataset.mclog);
      if (m) openForm({ postedAt: Date.now(), status: "submitted", kind: "original", asset: m.asset, timeframe: m.tf, marketUrl: m.url }, null, true);
      return;
    }
    if (t.dataset.use) {
      const d = DRAFTS.find(x => x.id === t.dataset.use);
      openForm({ postedAt: Date.now(), status: "submitted", kind: d.kind, asset: d.asset, timeframe: d.timeframe, text: d.text }, d.id, true);
      return;
    }
    if (t.dataset.delstand) {
      state.standings = state.standings.map(s => String(s.at) === t.dataset.delstand ? touch({ at: s.at, deleted: true }) : s);
      save(); render();
      return;
    }
    if (t.dataset.filter) {
      filter = t.dataset.filter;
      document.querySelectorAll("#filters button").forEach(b => b.classList.toggle("is-on", b === t));
      renderLog();
    }
  });

  $("#standForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const rank = Number(f.get("rank")), total = Number(f.get("total"));
    if (!rank || !total || rank > total) { toast("Rank must be between 1 and the total"); return; }
    state.standings.push(touch({ at: Date.now(), rank, total }));
    save(); render(); ev.target.rank.value = "";
    toast(rank <= TOP_N ? "Inside the top 8 🔥" : `${rank - TOP_N} places to climb`);
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

  $("#exportJson").addEventListener("click", () => download(`phase-1-${stamp()}.json`, JSON.stringify(state, null, 2), "application/json"));
  $("#exportCsv").addEventListener("click", () => {
    const cols = ["week", "status", "asset", "timeframe", "kind", "postedAt", "submittedAt", "postUrl", "marketUrl", "views", "notes"];
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = entries().map(e => cols.map(c =>
      c === "week" ? q(entryWeek(e)) : (c === "postedAt" || c === "submittedAt") ? q(e[c] ? new Date(e[c]).toISOString() : "") : q(e[c])
    ).join(","));
    download(`phase-1-${stamp()}.csv`, [cols.join(","), ...rows].join("\n"), "text/csv");
  });
  $("#importJson").addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const data = normaliseDoc(JSON.parse(await file.text()));
      const n = data.entries.filter(e => !e.deleted).length;
      if (!confirm(`Merge ${n} entries from ${file.name} into your log?`)) return;
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
    if (!confirm("Stop syncing on this device? Your logs stay saved here.")) return;
    syncKey = "";
    try { localStorage.removeItem(SYNC_KEY); } catch {}
    setSyncStatus("off", "Local only");
  });
  $("#syncState").addEventListener("click", () => syncKey ? sync() : $("#syncForm").elements.passphrase.focus());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(0); });
  window.addEventListener("online", () => scheduleSync(0));
  setInterval(() => { if (!document.hidden) scheduleSync(0); }, 60e3);

  render();
  loadMarkets();
  setInterval(() => { if (!document.hidden) loadMarkets(); }, 30e3);
  setSyncStatus("off", "Local only");
  scheduleSync(0);
  tick();
  setInterval(tick, 1000);
  setInterval(renderWeeks, 60e3);
})();
