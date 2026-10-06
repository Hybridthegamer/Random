// GET /api/markets               → fair-value check + one-shot call for every live campaign market.
// GET /api/markets?resolve=a,b,c  → resolution status of up to 25 market slugs (for the scorecard).
//
// For each market: P(Up) from two drift-free estimates, averaged —
//   (a) empirical: symmetrised historical moves over the same horizon (fat tails, longer lookback)
//   (b) normal model with volatility from the last 6h of 1m returns (current regime)
// For 5m/15m/1h markets that's then nudged by the reversal prior (how often a candle closed Up after
// the previous one closed the way the pre-market candle did), weighted by the share of the period
// still to run. Edge = fair probability − price you'd pay.
// Public market data only, so no passphrase; responses are edge-cached for a few seconds.

export const config = { maxDuration: 30 };

const LIMITLESS = "https://api.limitless.exchange";
const BINANCE = "https://data-api.binance.vision/api/v3"; // public mirror, reachable from US regions
const COINBASE = "https://api.exchange.coinbase.com";

// Campaign markets (ambassador Mini App rules).
const ELIGIBLE = new Set(["BTC 5m", "ETH 5m", "BTC 15m", "ETH 15m", "BTC 1h", "ETH 1h", "SOL 1h", "BTC 1d", "ETH 1d", "SOL 1d", "BTC 1w"]);
const ASSETS = ["BTC", "ETH", "SOL"];
const TF_MS = { "5m": 300e3, "15m": 900e3, "1h": 3600e3, "1d": 86400e3 };

const getJSON = async url => {
  const res = await fetch(url, { headers: { "User-Agent": "phase-1-tracker" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const tfOf = title =>
  /15 Min/.test(title) ? "15m" : /5 Min/.test(title) ? "5m" : /Hourly/.test(title) ? "1h" : /Daily/.test(title) ? "1d" : /Weekly/.test(title) ? "1w" : null;

async function activeMarkets() {
  const first = await getJSON(`${LIMITLESS}/markets/active?page=1&limit=25`);
  const pages = Math.min(40, Math.ceil((first.totalMarketsCount || 0) / 25));
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => getJSON(`${LIMITLESS}/markets/active?page=${i + 2}&limit=25`).catch(() => ({ data: [] })))
  );
  return [first, ...rest].flatMap(p => p.data || []);
}

function openPriceOf(m) {
  const meta = m.metadata || {};
  if (meta.openPrice) return Number(meta.openPrice);
  const text = String(m.description || "").replace(/<[^>]+>/g, " ");
  const g = text.match(/(?:Price to Beat|captured)[^$]*\$([\d,]+(?:\.\d+)?)/);
  return g ? Number(g[1].replace(/,/g, "")) : null;
}

function endOf(m, tf) {
  const start = Date.parse(m.startAt);
  if (tf === "1w") return Number(m.expirationTimestamp);
  return start + TF_MS[tf]; // daily runs noon ET → noon ET
}

const phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

function pUp(k, open, cur, mins, strict) {
  const iv = mins <= 240 ? "1m" : mins <= 1440 ? "5m" : "1h";
  const step = { "1m": 1, "5m": 5, "1h": 60 }[iv];
  const c = k[iv];
  const h = Math.max(1, Math.round(mins / step));
  const need = Math.log(open / cur);
  let hit = 0, n = 0;
  for (let i = 0; i + h < c.length; i++) {
    const r = Math.log(c[i + h] / c[i]);
    for (const x of [r, -r]) { n++; if (strict ? x > need : x >= need) hit++; }
  }
  const emp = n ? hit / n : 0.5;
  const m1 = k["1m"].slice(-360);
  let ss = 0;
  for (let i = 1; i < m1.length; i++) ss += Math.log(m1[i] / m1[i - 1]) ** 2;
  const sd = Math.sqrt(ss / Math.max(1, m1.length - 1));
  const norm = sd ? phi(-need / (sd * Math.sqrt(mins))) : 0.5;
  return { fair: (emp + norm) / 2, emp, norm };
}

// Reversal prior for the candle a market covers: P(Up | direction of the candle just before it).
function reversalPrior(rows, start, tfMs) {
  const closed = rows.filter(r => Number(r[6]) < Date.now());
  const ups = closed.map(r => Number(r[4]) >= Number(r[1]));
  const rate = dir => {
    let n = 0, up = 0;
    for (let i = 1; i < ups.length; i++) if (ups[i - 1] === dir) { n++; if (ups[i]) up++; }
    return n ? up / n : 0.5;
  };
  const prev = closed.find(r => Number(r[0]) === start - tfMs);
  if (!prev) return null;
  const prevUp = Number(prev[4]) >= Number(prev[1]);
  return { prevUp, p: rate(prevUp) };
}

function verdict(row) {
  const { fair, buyUp, buyDown, tf, minsLeft } = row;
  if ((tf === "5m" && minsLeft < 2) || (tf === "15m" && minsLeft < 4)) return { kind: "late", text: "Too late to act" };
  const edges = [
    buyUp != null && buyUp < 0.98 ? { side: "UP", edge: fair - buyUp } : null,
    buyDown != null && buyDown < 0.98 ? { side: "DOWN", edge: 1 - fair - buyDown } : null,
  ].filter(Boolean);
  if (!edges.length) return { kind: "illiquid", text: "No sellers right now" };
  const best = edges.sort((a, b) => b.edge - a.edge)[0];
  if (best.edge >= 0.05) return { kind: "value", side: best.side, edge: best.edge, text: `Value on ${best.side}` };
  if (best.edge >= 0.02) return { kind: "thin", side: best.side, edge: best.edge, text: `Thin edge on ${best.side}` };
  return { kind: "fair", side: best.side, edge: best.edge, text: "Priced fairly, skip" };
}

// The one-line "what would the model do" call.
function oneShot(row) {
  const v = row.verdict;
  const tfName = { "5m": "5m", "15m": "15m", "1h": "1h", "1d": "Daily", "1w": "Weekly" }[row.tf];
  // Markets with almost no volume have stale/wide quotes, so their odds mean little.
  const label = `${row.asset} ${tfName}` + (row.volume < 10 ? " (thin book)" : "");
  const lean = row.fair >= 0.5 ? "UP" : "DOWN";
  const leanP = Math.round(Math.max(row.fair, 1 - row.fair) * 100);
  const c = x => `${Math.round(x * 100)}¢`;
  if (v.kind === "value") {
    const price = v.side === "UP" ? row.buyUp : row.buyDown;
    return { action: "BUY", side: v.side, price, text: `${label} · BUY ${v.side} @${c(price)} (edge +${(v.edge * 100).toFixed(1)})` };
  }
  if (v.kind === "thin") {
    const price = v.side === "UP" ? row.buyUp : row.buyDown;
    return { action: "LEAN", side: v.side, price, text: `${label} · LEAN ${v.side} @${c(price)}, small stake (edge +${(v.edge * 100).toFixed(1)})` };
  }
  const why = v.kind === "late" ? "too late" : v.kind === "illiquid" ? "no sellers" : "priced fairly";
  return { action: "SKIP", side: lean, price: null, text: `${label} · SKIP, ${why} (likely ${lean} ${leanP}%)` };
}

async function resolveSlugs(slugs) {
  return Promise.all(slugs.map(async slug => {
    try {
      const m = await getJSON(`${LIMITLESS}/markets/${encodeURIComponent(slug)}`);
      const idx = m.winningOutcomeIndex;
      const winner = m.status === "RESOLVED" && (idx === 0 || idx === 1) ? (idx === 0 ? "UP" : "DOWN") : null;
      return { slug, status: m.status || null, winner };
    } catch {
      return { slug, status: null, winner: null };
    }
  }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed." }); }
  const q = req.query && req.query.resolve !== undefined ? req.query.resolve : new URL(req.url, "http://x").searchParams.get("resolve");
  if (q) {
    const slugs = [...new Set(String(q).split(",").map(s => s.trim()).filter(s => /^[a-z0-9-]{3,120}$/.test(s)))].slice(0, 25);
    res.setHeader("Cache-Control", "public, s-maxage=30");
    return res.status(200).json({ results: await resolveSlugs(slugs) });
  }
  try {
    const kl = (a, iv) => getJSON(`${BINANCE}/klines?symbol=${a}USDT&interval=${iv}&limit=1000`);
    const [markets, binanceSpot, coinbaseSpot, klines] = await Promise.all([
      activeMarkets(),
      Promise.all(ASSETS.map(a => getJSON(`${BINANCE}/ticker/price?symbol=${a}USDT`).then(r => Number(r.price)))),
      Promise.all(ASSETS.map(a => getJSON(`${COINBASE}/products/${a}-USD/ticker`).then(r => Number(r.price)).catch(() => null))),
      Promise.all(ASSETS.flatMap(a => ["1m", "5m", "15m", "1h"].map(iv => kl(a, iv)))),
    ]);
    const now = Date.now();
    const K = {}, raw = {};
    ASSETS.forEach((a, i) => {
      K[a] = {}; raw[a] = {};
      ["1m", "5m", "15m", "1h"].forEach((iv, j) => {
        const rows = klines[i * 4 + j];
        raw[a][iv] = rows;
        K[a][iv] = rows.map(r => Number(r[4]));
      });
    });
    const spot = Object.fromEntries(ASSETS.map((a, i) => [a, { binance: binanceSpot[i], coinbase: coinbaseSpot[i] }]));

    const rows = [];
    for (const m of markets) {
      // Limitless titles Solana markets "Solana Up or Down ...", not "SOL Up or Down ...".
      const g = /^(BTC|ETH|SOL|Solana) Up or Down/.exec(m.title || "");
      const tf = tfOf(m.title || "");
      const asset = g && (g[1] === "Solana" ? "SOL" : g[1]);
      if (!g || !tf || !ELIGIBLE.has(`${asset} ${tf}`)) continue;
      const open = openPriceOf(m);
      const end = endOf(m, tf);
      if (!open || !(end > now)) continue;
      // Hourly/daily settle on Binance USDT candles, so Binance spot is exact. 5m/15m settle on a Chainlink
      // 60s TWAP, which sits a few dollars off any one exchange: estimate that basis from the Binance
      // minute just before the market opened, and carry it forward. Weekly (Pyth) uses Coinbase USD.
      let cur = spot[asset].binance, basis = null;
      if (tf === "5m" || tf === "15m") {
        const startMs = Date.parse(m.startAt);
        const pre = raw[asset]["1m"].find(r => Number(r[0]) === startMs - 60e3);
        if (pre) { basis = open - (Number(pre[1]) + Number(pre[4])) / 2; cur = spot[asset].binance + basis; }
        else cur = spot[asset].coinbase || cur;
      } else if (tf === "1w") cur = spot[asset].coinbase || cur;
      const minsLeft = (end - now) / 60e3;
      const p = pUp(K[asset], open, cur, minsLeft, tf === "1w");
      // Reversal prior, weighted by how much of the period is still to run.
      let prior = null, fair = p.fair;
      if (TF_MS[tf] && tf !== "1d") {
        prior = reversalPrior(raw[asset][tf], Date.parse(m.startAt), TF_MS[tf]);
        if (prior) {
          const w = Math.min(1, Math.max(0, (end - now) / TF_MS[tf]));
          fair = Math.min(0.995, Math.max(0.005, p.fair + (prior.p - 0.5) * w));
          prior.weight = w;
        }
      }
      const buy = (m.tradePrices && m.tradePrices.buy && m.tradePrices.buy.market) || [];
      const row = {
        asset, tf, slug: m.slug, url: `https://limitless.exchange/markets/${m.slug}`,
        start: Date.parse(m.startAt), end, minsLeft, open, cur, basis,
        source: tf === "5m" || tf === "15m" ? "Chainlink" : tf === "1w" ? "Pyth" : "Binance",
        fair, fairRandomWalk: p.fair, fairHist: p.emp, fairVol: p.norm, prior,
        mktUp: Array.isArray(m.prices) ? m.prices[0] : null,
        buyUp: buy[0] ?? null, buyDown: buy[1] ?? null,
        volume: Number(m.volumeFormatted) || 0,
      };
      row.verdict = verdict(row);
      row.call = oneShot(row);
      rows.push(row);
    }
    const order = { "5m": 0, "15m": 1, "1h": 2, "1d": 3, "1w": 4 };
    rows.sort((a, b) => order[a.tf] - order[b.tf] || a.asset.localeCompare(b.asset));

    // Next-candle base rates: after the last closed candle's direction, how often the next closed Up.
    const nextRates = [];
    for (const a of ASSETS) for (const iv of ["5m", "15m", "1h"]) {
      const closed = raw[a][iv].slice(0, -1).map(r => Number(r[4]) >= Number(r[1]));
      const last = closed[closed.length - 1];
      let n = 0, up = 0;
      for (let i = 1; i < closed.length; i++) if (closed[i - 1] === last) { n++; if (closed[i]) up++; }
      nextRates.push({ asset: a, tf: iv, lastUp: last, nextUp: n ? up / n : 0.5, n, eligible: ELIGIBLE.has(`${a} ${iv}`) });
    }

    const live = new Set(rows.map(r => `${r.asset} ${r.tf}`));
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=20");
    return res.status(200).json({
      at: now, spot, markets: rows, nextRates,
      missing: [...ELIGIBLE].filter(k => !live.has(k)),
    });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Couldn't load market data right now." });
  }
}
