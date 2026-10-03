// GET /api/markets → fair-value check for every live campaign market on Limitless.
//
// For each market: P(Up) from two drift-free estimates, averaged —
//   (a) empirical: symmetrised historical moves over the same horizon (fat tails, longer lookback)
//   (b) normal model with volatility from the last 6h of 1m returns (current regime)
// then edge = fair probability − price you'd pay. Plus "next candle" base rates (mean reversion).
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

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed." }); }
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
      const g = /^(BTC|ETH|SOL) Up or Down/.exec(m.title || "");
      const tf = tfOf(m.title || "");
      if (!g || !tf || !ELIGIBLE.has(`${g[1]} ${tf}`)) continue;
      const asset = g[1];
      const open = openPriceOf(m);
      const end = endOf(m, tf);
      if (!open || !(end > now)) continue;
      // 5m/15m settle on Chainlink and weekly on Pyth (USD); hourly/daily on Binance USDT candles.
      const usdQuoted = tf === "5m" || tf === "15m" || tf === "1w";
      const cur = (usdQuoted && spot[asset].coinbase) || spot[asset].binance;
      const minsLeft = (end - now) / 60e3;
      const p = pUp(K[asset], open, cur, minsLeft, tf === "1w");
      const buy = (m.tradePrices && m.tradePrices.buy && m.tradePrices.buy.market) || [];
      const row = {
        asset, tf, slug: m.slug, url: `https://limitless.exchange/markets/${m.slug}`,
        start: Date.parse(m.startAt), end, minsLeft, open, cur,
        source: tf === "5m" || tf === "15m" ? "Chainlink" : tf === "1w" ? "Pyth" : "Binance",
        fair: p.fair, fairHist: p.emp, fairVol: p.norm,
        mktUp: Array.isArray(m.prices) ? m.prices[0] : null,
        buyUp: buy[0] ?? null, buyDown: buy[1] ?? null,
        volume: Number(m.volumeFormatted) || 0,
      };
      row.verdict = verdict(row);
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
