#!/usr/bin/env node
// Usage: node post-art/build.js <dataDir> [outDir]   (run post-art/fetch.sh <dataDir> first)
// Renders the 1600x900 X images for the 10 Oct 2026 posts and prints the numbers used (numbers.json).
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const DATA = process.argv[2], OUT = process.argv[3] || __dirname;
const rd = f => fs.readFileSync(path.join(DATA, f), 'utf8');
const J = f => JSON.parse(rd(f));
const NOW = Number(rd('now.txt')) * 1000;

// ---------- palette (dark surface; blue/red = diverging pair, validated with validate_palette.js) ----------
const C = { surface: '#1a1a19', panel: '#222220', grid: '#2c2c2a', axis: '#46453f', text: '#f0efec', text2: '#c3c2b7',
  muted: '#9a998f', up: '#3987e5', down: '#e66767', violet: '#9085e9', neutral: '#77766f', good: '#0ca30c', crit: '#d03b3b' };

// ---------- helpers ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f0 = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) * (r1 - r0) / (d1 - d0);
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 20}" font-weight="${o.weight || 500}" fill="${o.fill || C.muted}" text-anchor="${o.anchor || 'start'}"${o.halo ? ` stroke="${C.surface}" stroke-width="7" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`;
const lr = c => c.slice(1).map((v, i) => Math.log(v / c[i]));
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
const klines = f => J(f).map(k => ({ t: k[0], h: +k[2], l: +k[3], c: +k[4] }));
const stamp = (() => { const d = new Date(NOW); return `${d.getUTCDate()} Oct ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; })();

// ---------- data ----------
const eth5 = klines('eth5m.json'), btcW = klines('btc1h_week.json');
const c1h = { BTC: klines('btc1h_168.json').map(k => k.c), ETH: klines('eth1h_168.json').map(k => k.c), SOL: klines('sol1h_168.json').map(k => k.c) };
const spot = { BTC: c1h.BTC.at(-1), ETH: c1h.ETH.at(-1), SOL: c1h.SOL.at(-1) };
const dp = rd('daily_prices.jsonl').trim().split('\n').map(JSON.parse);
const M = { ETH: dp[0], BTC: dp[1], SOL: dp[2] };
for (const a of Object.keys(M)) { M[a].strike = +M[a].open; M[a].up = M[a].buy[0] * 100; M[a].dn = M[a].buy[1] * 100; }
const DAILY_END = 1791648000000, hLeft = (DAILY_END - NOW) / 3.6e6;
function fair(a) {
  const r = lr(c1h[a]), s7 = rms(r), s36 = rms(r.slice(-36)), s24 = rms(r.slice(-24)), need = Math.log(M[a].strike / spot[a]);
  const pu = s => phi(-need / (s * Math.sqrt(hLeft)));
  const p = [pu(s7) * 100, pu(s36) * 100];
  return { s7, s24, s36, lo: Math.min(...p), hi: Math.max(...p), mid: (p[0] + p[1]) / 2, leadPct: (spot[a] / M[a].strike - 1) * 100 };
}
const F = { ETH: fair('ETH'), BTC: fair('BTC'), SOL: fair('SOL') };
const hourlyPct = a => rms(lr(c1h[a].slice(-25))) * 100;
const wk = { open: 86085, hi: Math.max(...btcW.map(k => k.h)), lo: Math.min(...btcW.map(k => k.l)) };
const wkPct = (spot.BTC / wk.open - 1) * 100;
const w24 = klines('btc1h_168.json').slice(-24), box24 = (Math.max(...w24.map(k => k.h)) / Math.min(...w24.map(k => k.l)) - 1) * 100;
// ladder: P(touch 80K) by volatility regime, until Mon 12 Oct 03:59 UTC
const LADDER_END = 1791777540000, hTouch = (LADDER_END - NOW) / 3.6e6, ladYes = J('ladder80.json').buy[0] * 100;
const touch = s => 2 * (1 - phi(Math.log(spot.BTC / 80000) / (s * Math.sqrt(hTouch)))) * 100;
const rB = lr(c1h.BTC), tCalm = [touch(rms(rB.slice(-36))), touch(rms(rB.slice(-24)))], tFlush7 = touch(rms(rB));
let tFlushTool = NaN; try { const m = rd('ladder.txt').match(/↓80,000[^\n]*\|\s*([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/); if (m) tFlushTool = +m[5]; } catch (e) {}
const flush = [tFlush7, isNaN(tFlushTool) ? tFlush7 * 1.3 : Math.max(tFlushTool, tFlush7)];
const calm = [Math.min(...tCalm), Math.max(...tCalm)];
const NUM = { stamp, hLeft, hTouch, spot, M, F, hourly: { BTC: hourlyPct('BTC'), ETH: hourlyPct('ETH'), SOL: hourlyPct('SOL') }, wk, wkPct, box24, ladYes, calm, flush };
fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(NUM, null, 1));

// ---------- components ----------
function lineChart(o) {
  const W = 956, H = 532, m = { l: 100, r: 34, t: 22, b: 52 };
  const X = lin(o.x0, o.x1, m.l, W - m.r), Y = lin(o.y0, o.y1, H - m.b, m.t);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  (o.zones || []).forEach(z => { const a = Y(z.from), b = Y(z.to); s += `<rect x="${m.l}" y="${Math.min(a, b)}" width="${W - m.r - m.l}" height="${Math.abs(b - a)}" fill="${z.color}" opacity="${z.op || .09}"/>`; });
  o.yt.forEach(v => { const y = Y(v); s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${C.grid}" stroke-width="1.5"/>` + T(m.l - 14, y + 7, o.yfmt(v), { anchor: 'end', size: 19 }); });
  o.xt.forEach(([t, l]) => { const x = X(t); s += `<line x1="${x}" x2="${x}" y1="${H - m.b}" y2="${H - m.b + 9}" stroke="${C.axis}" stroke-width="1.5"/>` + T(x, H - m.b + 34, l, { anchor: x > W - m.r - 40 ? 'end' : 'middle', size: 19 }); });
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="${C.axis}" stroke-width="1.5"/>`;
  if (o.nowT) { const xn = X(o.nowT); s += `<rect x="${xn}" y="${m.t}" width="${W - m.r - xn}" height="${H - m.b - m.t}" fill="#fff" opacity=".03"/>`; }
  (o.refs || []).forEach(r => { const y = Y(r.v); s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${r.color || C.text2}" stroke-width="${r.sw || 2.5}"/>` + T(r.lx ?? m.l + 12, y + (r.dy ?? -12), r.label, { fill: C.text, size: 21, weight: 700, anchor: r.anchor || 'start', halo: 1 }); });
  s += `<path d="${o.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${C.text}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  (o.marks || []).forEach(k => { const x = X(k.t), y = Y(k.v); s += `<circle cx="${x}" cy="${y}" r="${k.r || 8}" fill="${k.color || C.text}" stroke="${C.surface}" stroke-width="3.5"/>`;
    if (k.label) s += T(x + (k.dx ?? 16), y + (k.dy ?? 7), k.label, { fill: C.text, size: 23, weight: 800, anchor: k.anchor || 'start', halo: 1 }); });
  (o.texts || []).forEach(t => s += T(t.x, t.y, t.s, t.o));
  if (o.extra) s += o.extra(X, Y, m, W, H);
  return s + '</svg>';
}
const hrs = ms => ms * 3.6e6;
// price-vs-fair dumbbell: cost (¢) as a dot, model fair range as a band
function dumbbell(rows) {
  const W = 420, x0 = 14, x1 = W - 14, X = lin(0, 100, x0, x1); let s = `<svg width="${W}" height="${rows.length * 132}" viewBox="0 0 ${W} ${rows.length * 132}">`;
  rows.forEach((r, i) => { const b = i * 132, ty = b + 84;
    s += `<circle cx="${x0 + 8}" cy="${b + 16}" r="8" fill="${r.color}"/>` + T(x0 + 26, b + 24, r.label, { size: 24, weight: 800, fill: C.text }) + T(x1, b + 24, `model ${f0(r.lo)}${Math.round(r.hi) > Math.round(r.lo) ? '–' + f0(r.hi) : ''}%`, { anchor: 'end', size: 20, fill: C.text2 });
    s += `<line x1="${x0}" x2="${x1}" y1="${ty}" y2="${ty}" stroke="${C.axis}" stroke-width="2"/>`;
    [0, 50, 100].forEach(v => s += `<line x1="${X(v)}" x2="${X(v)}" y1="${ty - 7}" y2="${ty + 7}" stroke="${C.axis}" stroke-width="2"/>` + T(X(v), ty + 34, v + '%', { anchor: v === 0 ? 'start' : v === 100 ? 'end' : 'middle', size: 17 }));
    const cxm = (X(r.lo) + X(r.hi)) / 2, bw = Math.max(X(r.hi) - X(r.lo), 44);
    s += `<rect x="${cxm - bw / 2}" y="${ty - 17}" width="${bw}" height="34" rx="17" fill="${r.color}" opacity=".38"/>`;
    s += `<circle cx="${X(r.cost)}" cy="${ty}" r="13" fill="${r.color}" stroke="${C.panel}" stroke-width="5"/>` + T(X(r.cost), ty - 24, f0(r.cost) + '¢', { anchor: 'middle', size: 28, weight: 800, fill: C.text });
  });
  return s + '</svg>';
}
const legend = `<div class="legend"><span><i class="dot"></i>cost to buy</span><span><i class="band"></i>model fair range</span></div>`;
const dailyPanel = (a, hero, cap) => `<div class="panel"><div class="ptitle">Cost to buy vs model fair value</div>${legend}
  <div style="position:absolute;left:28px;top:112px">${dumbbell([
    { label: 'UP', color: C.up, cost: M[a].up, lo: F[a].lo, hi: F[a].hi },
    { label: 'DOWN', color: C.down, cost: M[a].dn, lo: 100 - F[a].hi, hi: 100 - F[a].lo }])}</div>
  <div class="hero"><b>${hero}</b><span>${cap}</span></div></div>`;
function card({ tag, h1, sub, left, panel, foot }) {
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;background:#000}
  .card{width:1600px;height:900px;background:${C.surface};color:${C.text};font-family:Inter,'DejaVu Sans',sans-serif;position:relative;overflow:hidden}
  .tag{position:absolute;left:64px;top:44px;font-size:22px;font-weight:700;letter-spacing:.14em;color:${C.text2};text-transform:uppercase}
  .handle{position:absolute;right:64px;top:42px;font-size:25px;font-weight:700;color:${C.text}}
  h1{position:absolute;left:64px;top:92px;margin:0;font-size:62px;line-height:1.08;font-weight:800;letter-spacing:-.02em;width:1472px;white-space:nowrap}
  .sub{position:absolute;left:64px;top:176px;width:1420px;font-size:28px;line-height:1.3;color:${C.text2}}
  .area{position:absolute;left:64px;top:262px}
  .panel{position:absolute;left:1060px;top:268px;width:476px;height:536px;background:${C.panel};border-radius:24px;padding:28px}
  .ptitle{font-size:24px;font-weight:800;color:${C.text}} .legend{margin-top:10px;font-size:19px;color:${C.muted};display:flex;gap:22px;align-items:center}
  .legend .dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:${C.text2};margin-right:8px;vertical-align:-1px}
  .legend .band{display:inline-block;width:30px;height:12px;border-radius:6px;background:${C.text2};opacity:.5;margin-right:8px;vertical-align:-1px}
  .hero{position:absolute;left:28px;right:28px;bottom:26px} .hero b{display:block;font-size:68px;line-height:1;font-weight:800;letter-spacing:-.02em}
  .hero span{display:block;font-size:20px;line-height:1.3;color:${C.text2};margin-top:8px}
  .foot{position:absolute;left:64px;right:64px;bottom:30px;font-size:19px;color:${C.muted};display:flex;justify-content:space-between}
  svg text{font-family:Inter,'DejaVu Sans',sans-serif}
  </style><div class="card" id="c"><div class="tag">${tag}</div><div class="handle">@hybridthegeek</div><h1>${h1}</h1><div class="sub">${sub}</div>
  <div class="area">${left}</div>${panel}<div class="foot"><span>${foot}</span><span>Ambassador content. Not financial advice.</span></div></div>`;
}
const wat = h => { const x = ((h % 24) + 24) % 24, ap = x >= 12 ? 'pm' : 'am', y = x % 12 === 0 ? 12 : x % 12; return y + ap; };
const cards = {};

// ---------- A: ETH Daily ----------
{
  const T0 = 1791561600000, T1 = DAILY_END, strike = M.ETH.strike, pts = eth5.map(k => [k.t, k.c]);
  const lo = Math.min(...pts.map(p => p[1]), strike), hi = Math.max(...pts.map(p => p[1]), strike), pad = (hi - lo) * .16;
  const y0 = Math.floor((lo - pad) / 10) * 10, y1 = Math.ceil((hi + pad) / 10) * 10, yt = []; for (let v = y0; v <= y1; v += 10) yt.push(v);
  const xt = ['Fri 5pm', '9pm', '1am Sat', '5am', '9am', '1pm', 'Sat 5pm'].map((l, i) => [T0 + i * hrs(4), l]);
  const nowP = pts.at(-1);
  const svg = lineChart({ x0: T0, x1: T1, y0, y1, yt, yfmt: v => '$' + f0(v), xt, pts, nowT: nowP[0],
    zones: [{ from: strike, to: y1, color: C.up }, { from: strike, to: y0, color: C.down }],
    refs: [{ v: strike, label: `Strike $${f0(strike, 2)}`, color: C.text2, lx: 956 - 34 - 8, anchor: 'end' }],
    marks: [{ t: nowP[0], v: nowP[1], label: `Now $${f0(spot.ETH)}`, dx: 16, dy: -16 }],
    extra: (X, Y, m, W) => `<rect x="${W - m.r - 22}" y="${m.t + 12}" width="16" height="16" rx="3" fill="${C.up}"/>` + T(W - m.r - 30, m.t + 26, 'UP wins above the strike', { anchor: 'end', size: 20, fill: C.text2 }) +
      `<rect x="${W - m.r - 22}" y="${Y(y0) - 38}" width="16" height="16" rx="3" fill="${C.down}"/>` + T(W - m.r - 30, Y(y0) - 24, 'DOWN wins below it', { anchor: 'end', size: 20, fill: C.text2 }) });
  const dn = 100 - F.ETH.mid;
  cards.A = card({ tag: 'ETH · Daily Up/Down', h1: 'Priced like a stablecoin.',
    sub: `ETH is ${F.ETH.leadPct >= 0 ? '+' : ''}${f0(F.ETH.leadPct, 2)}% over its daily strike with ${f0(hLeft, 1)} hours left, and UP costs ${f0(M.ETH.up)}¢. On Thursday it printed $2,406.`,
    left: svg, panel: dailyPanel('ETH', `${f0(M.ETH.dn)}¢`, `DOWN costs ${f0(M.ETH.dn)}¢ and pays $1. It loses about ${Math.round(10 * (1 - dn / 100))} in 10. Size small.`),
    foot: `Settles 12pm ET (5pm WAT) · Binance ETH/USDT 1-min close · Data ${stamp}` });
}

// ---------- B: BTC Daily ----------
{
  const T0 = btcW[0].t, T1 = NOW + hrs(11), strike = M.BTC.strike, pts = btcW.map(k => [k.t, k.c]);
  const y0 = 80000, y1 = 87000, yt = [80000, 81000, 82000, 83000, 84000, 85000, 86000, 87000];
  const xt = [[T0, 'Mon']]; ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d, i) => xt.push([1791172800000 + hrs(19) + i * hrs(24), d]));
  const lowK = btcW.reduce((a, k) => k.l < a.l ? k : a), nowP = pts.at(-1);
  const svg = lineChart({ x0: T0, x1: T1, y0, y1, yt, yfmt: v => v / 1000 + 'K', xt, pts,
    refs: [{ v: wk.open, label: `Monday open ${f0(wk.open)}`, color: C.axis, lx: 960 - 34 - 8, anchor: 'end', dy: -12 }, { v: strike, label: `Today's strike ${f0(strike)}`, color: C.text2, lx: 112, dy: -12 }],
    marks: [{ t: lowK.t, v: wk.lo, label: `Thu low ${f0(wk.lo)}`, dx: 16, dy: 8, r: 8, color: C.down }, { t: nowP[0], v: nowP[1], label: `Now ${f0(spot.BTC)}`, dx: -12, dy: -36, anchor: 'end' }] });
  cards.B = card({ tag: 'BTC · Daily Up/Down', h1: 'A coin flip, priced like a coin flip.',
    sub: `BTC is $${f0(Math.abs(spot.BTC - strike))} ${spot.BTC >= strike ? 'over' : 'under'} its daily strike after 24 hours inside a ${f0(box24, 1)}% range. It is ${wkPct < 0 ? '−' : '+'}${f0(Math.abs(wkPct), 1)}% on the week.`,
    left: svg, panel: dailyPanel('BTC', 'No edge', 'Price is close to fair value on both sides. If you trade it at all, keep it tiny.'),
    foot: `Settles 12pm ET (5pm WAT) · Binance BTC/USDT 1-min close · Data ${stamp}` });
}

// ---------- C: SOL Daily ----------
{
  const bars = [['BTC', NUM.hourly.BTC, C.neutral], ['ETH', NUM.hourly.ETH, C.neutral], ['SOL', NUM.hourly.SOL, C.violet]];
  const W = 956, H = 532, x0 = 190, xMax = Math.ceil(NUM.hourly.SOL * 10 + 1) / 10 + .1, X = lin(0, xMax, x0, W - 60);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` + T(0, 34, 'Typical move per hour, last 24 hours', { size: 24, weight: 800, fill: C.text });
  for (let v = 0; v <= xMax + .001; v += .1) { s += `<line x1="${X(v)}" x2="${X(v)}" y1="64" y2="${H - 56}" stroke="${C.grid}" stroke-width="1.5"/>` + (Math.round(v * 10) % 2 === 0 ? T(X(v), H - 24, f0(v, 1) + '%', { anchor: 'middle', size: 19 }) : ''); }
  bars.forEach(([n, v, col], i) => { const y = 100 + i * 120;
    s += T(0, y + 48, n, { size: 34, weight: 800, fill: C.text }) + `<path d="M${x0} ${y + 6}H${X(v) - 8}a8 8 0 0 1 8 8v52a8 8 0 0 1 -8 8H${x0}Z" fill="${col}"/>` + T(X(v) + 14, y + 52, f0(v, 2) + '%', { size: 30, weight: 800, fill: C.text });
  });
  const lx = X(F.SOL.leadPct), ys = 100 + 2 * 120;
  s += `<line x1="${lx}" x2="${lx}" y1="${ys - 12}" y2="${ys + 92}" stroke="${C.text}" stroke-width="5" stroke-linecap="round"/>` + T(lx + 14, ys + 104, `SOL's lead on its strike: ${f0(F.SOL.leadPct, 2)}%`, { size: 22, weight: 700, fill: C.text, halo: 1 });
  s += '</svg>';
  const gap = M.SOL.up + M.SOL.dn - 100;
  cards.C = card({ tag: 'SOL · Daily Up/Down', h1: "SOL's lead is smaller than one hour of SOL.",
    sub: `SOL is +$${f0(spot.SOL - M.SOL.strike, 2)} on its strike. A typical hour moves it ~$${f0(spot.SOL * NUM.hourly.SOL / 100, 2)}, and ${f0(hLeft, 1)} hours remain.`,
    left: s, panel: dailyPanel('SOL', `$${f0((M.SOL.up + M.SOL.dn) / 100, 2)}`, `to hold both sides of a $1 payout. That ${f0(gap)}¢ gap (spread, slippage) is the real opponent.`),
    foot: `Settles 12pm ET (5pm WAT) · Binance SOL/USDT 1-min close · Data ${stamp}` });
}

// ---------- F: BTC weekly ladder, retest 80K ----------
{
  const T0 = btcW[0].t, T1 = LADDER_END + 60000, pts = btcW.map(k => [k.t, k.c]), nowP = pts.at(-1);
  const y0 = 79500, y1 = 87500, yt = [80000, 81000, 82000, 83000, 84000, 85000, 86000, 87000], lowK = btcW.reduce((a, k) => k.l < a.l ? k : a);
  const xt = [[T0, 'Mon']]; ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d, i) => xt.push([1791172800000 + hrs(19) + i * hrs(24), d]));
  const svg = lineChart({ x0: T0, x1: T1, y0, y1, yt, yfmt: v => v / 1000 + 'K', xt, pts, nowT: nowP[0],
    zones: [{ from: 80000, to: y0, color: C.down, op: .14 }],
    refs: [{ v: 80000, label: 'Target $80,000', color: C.down, lx: 956 - 34 - 8, anchor: 'end', dy: -12 }, { v: wk.open, label: `Monday open ${f0(wk.open)}`, color: C.axis, lx: 956 - 34 - 8, anchor: 'end', dy: -12 }],
    marks: [{ t: lowK.t, v: wk.lo, label: `Thu low ${f0(wk.lo)}`, dx: -14, dy: -16, anchor: 'end', color: C.down }, { t: nowP[0], v: nowP[1], label: `Now ${f0(spot.BTC)}`, dx: 16, dy: -16 }],
    extra: (X, Y, m, W) => T(W - m.r - 8, m.t + 28, `Window closes Sun 11:59pm ET`, { anchor: 'end', size: 20, fill: C.text2 }) });
  const W = 420, X = lin(0, 15, 14, W - 14), mx = X(ladYes);
  const fmt = (lo, hi) => `${f0(lo)}${Math.round(hi) > Math.round(lo) ? '–' + f0(hi) : ''}%`;
  const row = (b, label, lo, hi) => T(14, b + 24, label, { size: 22, weight: 800, fill: C.text }) + T(W - 14, b + 24, fmt(lo, hi), { anchor: 'end', size: 26, weight: 800, fill: C.text }) +
    `<rect x="14" y="${b + 51}" width="${W - 28}" height="2" fill="${C.axis}"/><rect x="${X(lo)}" y="${b + 40}" width="${Math.max(X(hi) - X(lo), 22)}" height="24" rx="12" fill="${C.text2}" opacity=".85"/>` +
    `<rect x="${mx - 2.5}" y="${b + 34}" width="5" height="36" rx="2.5" fill="${C.text}"/>`;
  const rng = `<svg width="${W}" height="236" viewBox="0 0 ${W} 236">` + row(0, 'If the calm continues', calm[0], calm[1]) + row(90, 'If flush volatility returns', flush[0], flush[1]) +
    [0, 5, 10, 15].map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="170" y2="180" stroke="${C.axis}" stroke-width="2"/>` + T(X(v), 206, v + '%', { anchor: v === 0 ? 'start' : v === 15 ? 'end' : 'middle', size: 17 })).join('') +
    `<line x1="14" x2="${W - 14}" y1="175" y2="175" stroke="${C.axis}" stroke-width="2"/></svg>`;
  cards.F = card({ tag: 'BTC · Weekly hit ladder', h1: 'Will BTC retest $80K before Sunday night?',
    sub: `It needs −${f0((1 - 80000 / spot.BTC) * 100, 1)}% from $${f0(spot.BTC)} in ~${f0(hTouch)} hours. This week's low is $${f0(wk.lo)}. The YES ticket costs ${f0(ladYes)}¢.`,
    left: svg, panel: `<div class="panel"><div class="ptitle">Chance BTC touches $80K</div><div class="legend"><span><i class="band"></i>model, by volatility</span><span><i style="display:inline-block;width:5px;height:18px;border-radius:2px;background:${C.text};margin-right:8px;vertical-align:-3px"></i>market ${f0(ladYes)}¢</span></div><div style="position:absolute;left:28px;top:128px">${rng}</div>
      <div class="hero"><b>${f0(ladYes)}¢</b><span>The ticket sits with the calm. Thursday showed the other case can happen. Lottery-ticket size only.</span></div></div>`,
    foot: `Binance BTC/USDT 1-min High/Low, Mon 12am ET to Sun 11:59pm ET · Data ${stamp}` });
}

// ---------- D: the last daily that settles inside the window ----------
{
  const t0 = Date.UTC(2026, 9, 10, 6), t1 = Date.UTC(2026, 9, 12, 6), W = 956, H = 532, X = lin(t0, t1, 64, W - 64);
  const at = (d, h, m = 0) => Date.UTC(2026, 9, d, h, m), dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><pattern id="h" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="${C.panel}"/><line x1="0" y1="0" x2="0" y2="14" stroke="${C.axis}" stroke-width="5"/></pattern></defs>`;
  for (let i = 0; i <= 8; i++) { const t = t0 + i * hrs(6), d = new Date(t), x = X(t);
    s += `<line x1="${x}" x2="${x}" y1="30" y2="${H - 66}" stroke="${C.grid}" stroke-width="1.5"/>` + T(x, H - 34, `${dn[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}:00`, { anchor: 'middle', size: 17 }); }
  s += T(W - 64, H - 6, 'All times UTC', { anchor: 'end', size: 17 });
  const cx = X(at(11, 19, 6)), nx = X(NOW);
  const lane = (y, a, b, l1, l2, ok, anchorEnd) => { const x = X(a), x2 = X(Math.min(b, t1)), lx = anchorEnd ? cx - 16 : x;
    return `<rect x="${x}" y="${y}" width="${x2 - x}" height="70" rx="12" fill="${ok ? C.text2 : 'url(#h)'}" ${ok ? '' : `stroke="${C.axis}" stroke-width="2"`}/>` +
      T(lx, y - 44, l1, { size: 22, weight: 800, fill: C.text, anchor: anchorEnd ? 'end' : 'start', halo: 1 }) + T(lx, y - 14, l2, { size: 21, weight: 600, fill: C.text2, anchor: anchorEnd ? 'end' : 'start', halo: 1 }) +
      `<circle cx="${ok ? x + 38 : x2 - 38}" cy="${y + 35}" r="20" fill="${ok ? C.good : C.crit}"/><path d="${ok ? `M${x + 29} ${y + 35}l7 7l13 -14` : `M${x2 - 46} ${y + 26}l16 18M${x2 - 30} ${y + 26}l-16 18`}" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; };
  s += lane(170, at(10, 16), at(11, 16), 'Opens today, 4pm UTC (5pm WAT)', 'Settles Sun 16:00 UTC: before the cutoff', true, false);
  s += lane(330, at(11, 16), at(12, 16), 'Opens Sunday, 4pm UTC (5pm WAT)', 'Settles Mon 16:00 UTC: after the cutoff', false, true);
  s += `<line x1="${cx}" x2="${cx}" y1="22" y2="${H - 66}" stroke="${C.text}" stroke-width="4"/>` + T(cx - 14, 50, 'Competition ends', { size: 22, weight: 800, fill: C.text, anchor: 'end', halo: 1 }) + T(cx - 14, 76, 'Sun 19:06 UTC (8:06pm WAT)', { size: 20, fill: C.text2, anchor: 'end', halo: 1 });
  s += `<line x1="${nx}" x2="${nx}" y1="96" y2="${H - 66}" stroke="${C.muted}" stroke-width="2.5"/>` + T(nx + 10, 112, 'Now', { size: 20, weight: 700, fill: C.text2 });
  s += '</svg>';
  const pw = 420, PY = lin(80000, 87000, 330, 20), pxm = 150;
  const bar = `<svg width="${pw}" height="390" viewBox="0 0 ${pw} 390">` + [80000, 82000, 84000, 86000].map(v => `<line x1="40" x2="${pw - 10}" y1="${PY(v)}" y2="${PY(v)}" stroke="${C.grid}" stroke-width="1.5"/>` + T(32, PY(v) + 6, v / 1000 + 'K', { anchor: 'end', size: 17 })).join('') +
    `<rect x="${pxm - 14}" y="${PY(wk.hi)}" width="28" height="${PY(wk.lo) - PY(wk.hi)}" rx="14" fill="${C.text2}" opacity=".85"/>` +
    `<line x1="${pxm - 26}" x2="${pxm + 26}" y1="${PY(wk.open)}" y2="${PY(wk.open)}" stroke="${C.text}" stroke-width="4" stroke-linecap="round"/>` + T(pxm + 36, PY(wk.open) + 7, `Mon open ${f0(wk.open)}`, { size: 20, weight: 700, fill: C.text }) +
    T(pxm + 36, PY(wk.hi) + 7, `High ${f0(wk.hi)}`, { size: 20, fill: C.text2 }) + T(pxm + 36, PY(wk.lo) + 7, `Low ${f0(wk.lo)}`, { size: 20, fill: C.text2 }) +
    `<circle cx="${pxm}" cy="${PY(spot.BTC)}" r="11" fill="${C.text}" stroke="${C.panel}" stroke-width="5"/>` + T(pxm + 36, PY(spot.BTC) + 8, `Now ${f0(spot.BTC)}`, { size: 22, weight: 800, fill: C.text }) + `</svg>`;
  cards.D = card({ tag: 'Competition window · Last daily', h1: 'The last daily that settles in time.',
    sub: 'Today\'s 4pm UTC daily settles Sunday at 16:00 UTC. The next one settles after the competition closes.',
    left: s, panel: `<div class="panel"><div class="ptitle">BTC this week</div><div class="legend"><span>Mon open to now, 1-hour candles</span></div><div style="position:absolute;left:28px;top:108px">${bar}</div></div>`,
    foot: `Schedule from market close times and the 11 Oct 19:06 UTC cutoff · Data ${stamp}` });
}

// ---------- E: hourly cheat sheet ----------
{
  const mins = [60, 30, 15, 5], assets = ['BTC', 'ETH', 'SOL'], step = v => v < .1 ? ['#184f95', '#fff'] : v < .2 ? ['#256abf', '#fff'] : v < .35 ? ['#3987e5', '#0b0b0b'] : ['#6da7ec', '#0b0b0b'];
  let g = `<div style="font-size:24px;font-weight:800;margin-bottom:14px">Typical move left in the hour (last 24 hours)</div><div style="display:grid;grid-template-columns:110px repeat(4,1fr);gap:10px;width:940px">` +
    `<div></div>` + mins.map(m => `<div style="font-size:21px;font-weight:700;color:${C.text2};text-align:center;padding-bottom:4px">${m} min left</div>`).join('');
  assets.forEach(a => { g += `<div style="font-size:34px;font-weight:800;display:flex;align-items:center">${a}</div>`; mins.forEach(m => { const v = NUM.hourly[a] * Math.sqrt(m / 60), [bg, fg] = step(v); g += `<div style="background:${bg};color:${fg};border-radius:14px;height:112px;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800">${f0(v, 2)}%</div>`; }); });
  g += `</div><div style="margin-top:22px;font-size:21px;color:${C.text2};width:940px;line-height:1.35">Typical move = the last 24 hours' average hourly move, scaled by the square root of the time left. Your lead is the gap between price and strike, as a % of the strike.</div>`;
  const rows = [['Lead = ½ the typical move', 69], ['Lead = 1× the typical move', 84], ['Lead = 2× the typical move', 98]];
  let b = '<svg width="420" height="300" viewBox="0 0 420 300">'; rows.forEach(([l, p], i) => { const y = i * 100; b += T(0, y + 22, l, { size: 21, weight: 700, fill: C.text }) + `<path d="M0 ${y + 40}H${p * 3.1 - 8}a8 8 0 0 1 8 8v22a8 8 0 0 1 -8 8H0Z" fill="${C.text2}" opacity=".85"/>` + T(p * 3.1 + 12, y + 70, p + '%', { size: 30, weight: 800, fill: C.text }); }); b += '</svg>';
  cards.E = card({ tag: 'Hourly markets · Cheat sheet', h1: 'Is your lead bigger than the move left?',
    sub: 'Compare the side that is ahead with how far this asset normally travels in the time left.',
    left: g, panel: `<div class="panel"><div class="ptitle">Chance the side that is ahead holds</div><div class="legend"><span>random-walk model, no trend</span></div><div style="position:absolute;left:28px;top:122px">${b}</div><div class="hero" style="bottom:20px"><span>Rule of thumb: under 1× the typical move, treat it as a coin flip and keep the size small.</span></div></div>`,
    foot: `Per-hour volatility from Binance 1-hour candles · Data ${stamp}` });
}

// ---------- QT: Packs ----------
{
  const W = 956, H = 532; let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const leg = (x, y, ok, n) => `<rect x="${x}" y="${y}" width="150" height="86" rx="16" fill="${C.panel}" stroke="${C.axis}" stroke-width="2"/>` + T(x + 18, y + 34, 'Leg ' + n, { size: 20, weight: 700, fill: C.text2 }) + `<circle cx="${x + 112}" cy="${y + 43}" r="22" fill="${ok ? C.good : C.crit}"/><path d="${ok ? `M${x + 102} ${y + 43}l8 8l14 -15` : `M${x + 103} ${y + 34}l18 18M${x + 121} ${y + 34}l-18 18`}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const row = (y, oks, res, sub) => oks.map((o, i) => leg(i * 178, y, o, i + 1)).join('') + `<path d="M${3 * 178 + 2} ${y + 43}h40m-12 -12l12 12l-12 12" stroke="${C.muted}" stroke-width="4" fill="none" stroke-linecap="round"/>` + T(3 * 178 + 62, y + 40, res, { size: 30, weight: 800, fill: C.text }) + T(3 * 178 + 62, y + 70, sub, { size: 20, fill: C.text2 });
  s += row(8, [true, true, true], 'Pack won', 'pays the multiplier') + row(118, [true, true, false], 'Pack lost', 'one miss and it is gone');
  const p = .7 ** 3, fairX = 1 / p, netX = fairX * .9, bx = 0, bw = 760;
  s += T(0, 262, 'Illustration: 3 legs, each a 70% shot', { size: 24, weight: 800, fill: C.text }) + `<rect x="0" y="282" width="${bw}" height="30" rx="8" fill="${C.panel}"/><path d="M0 282H${bw * p - 8}a8 8 0 0 1 8 8v14a8 8 0 0 1 -8 8H0Z" fill="${C.up}"/>` +
    T(bw * p + 18, 305, `all 3 land: ${f0(p * 100)}%`, { size: 24, weight: 800, fill: C.text }) +
    T(0, 362, `Fair multiplier ${f0(fairX, 1)}x. After the 10% fee, about ${f0(netX, 1)}x.`, { size: 24, fill: C.text2 }) +
    T(0, 400, `$10 becomes ~$${f0(10 * netX)} when it lands. Average result: −$${f0(10 - 10 * p * netX, 0)} per $10 staked.`, { size: 24, fill: C.text2 }) +
    T(0, 456, 'That fee is the price of the ticket.', { size: 24, weight: 800, fill: C.text }) + T(0, 490, 'The 100,000 $LMTS is why it can still be worth trying small.', { size: 24, weight: 800, fill: C.text }) + T(0, 524, 'Illustration only: assumes the 10% fee comes off the fair multiplier.', { size: 17, fill: C.muted });
  s += '</svg>';
  const tile = (a, b2) => `<div style="background:${C.surface};border-radius:18px;padding:18px 20px"><div style="font-size:40px;font-weight:800;letter-spacing:-.01em">${a}</div><div style="font-size:19px;color:${C.text2};margin-top:4px">${b2}</div></div>`;
  cards.Q = card({ tag: 'Packs · 100,000 $LMTS challenge', h1: 'Know what a Pack is before you try one.',
    sub: 'A Pack bundles 2 to 10 predictions into one ticket. Every leg has to land.',
    left: s, panel: `<div class="panel"><div class="ptitle">Pack facts</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px">${tile('2–10', 'legs per pack')}${tile('$1–$70', 'stake per pack')}${tile('20x', 'multiplier cap')}${tile('10%', 'fee, built into the multiplier')}</div>
      <div class="hero"><b>$1,400</b><span>maximum payout per pack. Maximum loss is your stake.</span></div></div>`,
    foot: 'Pack rules from the Limitless docs. Challenge dates (Oct 7 to 28) per the campaign post: check the official post.' });
}

// ---------- render ----------
const names = { A: 'A-eth-daily', B: 'B-btc-daily', C: 'C-sol-daily', F: 'F-btc-80k-ladder', D: 'D-last-daily-window', E: 'E-hourly-cheatsheet', Q: 'QT-packs-100k-lmts' };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  for (const k of Object.keys(cards)) { if (process.env.KEEP_HTML) fs.writeFileSync(path.join(OUT, 'html-' + names[k] + '.html'), cards[k]); await pg.setContent(cards[k]); await pg.waitForTimeout(150); await pg.locator('#c').screenshot({ path: path.join(OUT, names[k] + '.png') }); console.log('wrote', names[k] + '.png'); }
  await b.close();
})();
