# Usage: python3 tools/hit_ladder.py   (needs network)
# Fair-value check for Limitless's weekly "What price will Bitcoin hit <dates>?" one-touch ladder.
# Resolution: any Binance BTC/USDT 1-minute candle High >= level (up rows) or Low <= level (down rows)
# between Mon 12:00 AM ET and Sun 11:59 PM ET. Note: this ladder is NOT the "BTC Up or Down - Weekly" campaign market.
import json, urllib.request, math, time, re, datetime as dt
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25))
B = 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT'
now_ms = int(time.time() * 1000)
slugs = set(re.findall(r'"slug":\s*"(what-price-will-bitcoin-hit-[a-z]+-\d+-\d+-\d{4}-\d+)"', json.dumps(get('https://api.limitless.exchange/markets/active/slugs'))))
if not slugs: raise SystemExit('No live weekly BTC hit ladder found.')
g = max((get('https://api.limitless.exchange/markets/' + s) for s in slugs), key=lambda x: x['expirationTimestamp'])
END = g['expirationTimestamp'] - 60000          # window ends 11:59 PM ET Sunday
START = g['expirationTimestamp'] - 7 * 86400000  # and opens 12:00 AM ET Monday
print(g['title'], '|', f"https://limitless.exchange/markets/{g['slug']}")
k1, t = [], START
while t < now_ms:
    r = get(f'{B}&interval=1m&startTime={t}&limit=1000')
    if not r: break
    k1 += r; t = r[-1][0] + 60000
    if len(r) < 1000: break
P0 = float(k1[-1][4]); M0 = max(float(r[2]) for r in k1); m0 = min(float(r[3]) for r in k1)
print(f'now {P0:,.0f} | window open {float(k1[0][1]):,.0f} | high so far {M0:,.0f} | low so far {m0:,.0f} | {len(k1)} candles')
h, t = [], now_ms - 120 * 86400000
while t < now_ms:
    r = get(f'{B}&interval=1h&startTime={t}&limit=1000')
    if not r: break
    h += r; t = r[-1][0] + 3600000
    if len(r) < 1000: break
C = [float(r[4]) for r in h]; H = [float(r[2]) for r in h]; L = [float(r[3]) for r in h]
lr = [math.log(C[i + 1] / C[i]) for i in range(len(C) - 1)]
def sd(x): m = sum(x) / len(x); return (sum((a - m) ** 2 for a in x) / (len(x) - 1)) ** .5
sig = (sd(lr[-24 * 7:]) + sd(lr[-24 * 30:])) / 2         # blend of 7d and 30d hourly vol
Th = max(0.0, (END - now_ms) / 3600e3)
print(f'hourly vol {sig * 100:.3f}% (~{sig * math.sqrt(24 * 365) * 100:.0f}% annualised) | {Th:.1f}h left\n')
Phi = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
W = max(1, int(round(Th))); win = []
for i in range(len(C) - W):
    s = C[i]; win.append((math.log(max(H[i + 1:i + W + 1]) / s), -math.log(min(L[i + 1:i + W + 1]) / s)))
ex = [a for u, d in win for a in (u, d)]                # pool up- and down-excursions: no trend bias
def need(K, up):
    if up: return None if M0 >= K else math.log(K / P0)
    return None if m0 <= K else math.log(P0 / K)
def fair(K, up):
    b = need(K, up)
    if b is None: return 1.0, 1.0, 1.0
    e = sum(1 for x in ex if x >= b) / len(ex); n = min(1, 2 * (1 - Phi(b / (sig * math.sqrt(Th)))))
    return e, n, (e + n) / 2
print(f"{'level':>9} {'dist':>7} | {'mid':>6} {'buyYES':>6} {'hist':>6} {'norm':>6} {'fair':>6} {'edge@buy':>8}")
rows = []
for m in g['markets']:
    up = m['title'].startswith('↑'); K = float(m['title'][2:].replace(',', ''))
    buy = ((m.get('tradePrices') or {}).get('buy') or {}).get('market') or [None, None]
    e, n, f = fair(K, up); mid = m['prices'][0]
    rows.append((K, up, mid, buy[0], f))
    eb = f'{(f - buy[0]) * 100:+7.1f}' if buy[0] is not None else '     n/a'
    print(f"{('↑' if up else '↓') + format(int(K), ','):>9} {(K / P0 - 1) * 100:+6.1f}% | {mid * 100:5.1f}% {(buy[0] or 0) * 100:5.1f}% {e * 100:5.1f}% {n * 100:5.1f}% {f * 100:5.1f}% {eb}")
# nearest up level above spot and nearest down level below spot: does BTC leave that box?
ups = [r[0] for r in rows if r[1] and need(r[0], True) is not None]; dns = [r[0] for r in rows if not r[1] and need(r[0], False) is not None]
if ups and dns:
    Ku, Kd = min(ups), max(dns); bu, bd = need(Ku, True), need(Kd, False)
    pairs = win + [(d, u) for u, d in win]               # add mirrored windows to cancel drift
    both = sum(1 for u, d in pairs if u >= bu and d >= bd) / len(pairs)
    either = sum(1 for u, d in pairs if u >= bu or d >= bd) / len(pairs)
    print(f'\nBox {Kd:,.0f}-{Ku:,.0f}: P(touch both) {both * 100:.0f}% | P(touch at least one) {either * 100:.0f}%  (historical windows)')
print('\nedge@buy = fair minus the price you would actually pay for YES. Under ~5 points is noise (random-walk model).')
