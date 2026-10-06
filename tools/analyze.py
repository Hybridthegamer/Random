# Usage: python3 tools/analyze.py   (live fair-value check of Limitless campaign markets; needs network)
# Fair-value check for the Limitless campaign markets (BTC/ETH 5m+15m, BTC/ETH/SOL 1h+1d, BTC 1w).
import json, urllib.request, re, time, math, datetime as dt
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20))
now = time.time() * 1000
ELIG = {('BTC','5m'),('ETH','5m'),('BTC','15m'),('ETH','15m'),('BTC','1h'),('ETH','1h'),('SOL','1h'),('BTC','1d'),('ETH','1d'),('SOL','1d'),('BTC','1w')}
def tf_of(t):
    return '15m' if '15 Min' in t else '5m' if '5 Min' in t else '1h' if 'Hourly' in t else '1d' if 'Daily' in t else '1w' if 'Weekly' in t else None
# all active markets
allm, p = [], 1
while True:
    d = get(f'https://api.limitless.exchange/markets/active?page={p}&limit=25'); allm += d['data']
    if len(d['data']) < 25 or p > 40: break
    p += 1
mk = []
for m in allm:
    g = re.match(r'^(BTC|ETH|SOL|Solana) Up or Down', m['title'])   # Limitless titles SOL markets "Solana ..."
    if g and ('SOL' if g[1] == 'Solana' else g[1], tf_of(m['title'])) in ELIG: mk.append(m)
kl = {}
def klines(sym, iv, n=1000):
    k = (sym, iv)
    if k not in kl: kl[k] = [[float(x) for x in r[:6]] for r in get(f'https://data-api.binance.vision/api/v3/klines?symbol={sym}USDT&interval={iv}&limit={n}')]
    return kl[k]
spot = {a: float(get(f'https://data-api.binance.vision/api/v3/ticker/price?symbol={a}USDT')['price']) for a in ['BTC','ETH','SOL']}
cb = {a: float(get(f'https://api.exchange.coinbase.com/products/{a}-USD/ticker')['price']) for a in ['BTC','ETH','SOL']}
def phi(x): return 0.5 * (1 + math.erf(x / math.sqrt(2)))
def p_up(asset, open_, cur, mins, strict=False):
    # Two drift-free estimates of P(final >= open), averaged:
    #  (a) empirical: symmetrised historical moves over the same horizon (longer lookback, fat tails)
    #  (b) normal model using volatility from the most recent window (current regime)
    iv, step = ('1m', 1) if mins <= 240 else ('5m', 5) if mins <= 1440 else ('1h', 60)
    c = [r[4] for r in klines(asset, iv)]
    h = max(1, round(mins / step))
    lr = [math.log(c[i + h] / c[i]) for i in range(len(c) - h)]
    lr += [-x for x in lr]                              # symmetrise: no trend bias
    need = math.log(open_ / cur)
    emp = sum((x > need) if strict else (x >= need) for x in lr) / len(lr)
    m1 = [r[4] for r in klines(asset, '1m')][-360:]     # last 6h of 1m returns
    sd = (sum(math.log(m1[i + 1] / m1[i]) ** 2 for i in range(len(m1) - 1)) / (len(m1) - 1)) ** 0.5
    norm = phi(-need / (sd * math.sqrt(mins))) if sd else 0.5
    return (emp + norm) / 2, (emp, norm)
def end_ms(m, tf):
    s = dt.datetime.fromisoformat(m['startAt'].replace('Z', '+00:00')).timestamp() * 1000
    if tf == '1d': return s + 86400e3       # noon ET to noon ET
    if tf == '1w': return m['expirationTimestamp']
    return s + {'5m': 300e3, '15m': 900e3, '1h': 3600e3}[tf]
rows = []
for m in mk:
    a = 'SOL' if m['title'].startswith('Solana') else m['title'][:3]; tf = tf_of(m['title'])
    meta = m.get('metadata') or {}
    op = meta.get('openPrice')
    if not op:
        g = re.search(r'Price to Beat[^$]*\$([\d,\.]+)', m['description']) or re.search(r'captured[^$]*\$([\d,\.]+)', m['description'])
        op = g[1].replace(',', '') if g else None
    if not op: continue
    op = float(op)
    cur = cb[a] if tf in ('5m', '15m', '1w') else spot[a]   # Chainlink/Pyth are USD; hourly/daily settle on Binance USDT
    mins = (end_ms(m, tf) - now) / 60e3
    if mins <= 0: continue
    pu, (pe, pn) = p_up(a, op, cur, mins, strict=(tf == '1w'))
    buy = m.get('tradePrices', {}).get('buy', {}).get('market') or [None, None]
    rows.append(dict(pe=pe, pn=pn, a=a, tf=tf, slug=m['slug'], op=op, cur=cur, mins=mins, pu=pu, mid=m['prices'][0], bu=buy[0], bd=buy[1], vol=m.get('volumeFormatted')))
order = {'5m': 0, '15m': 1, '1h': 2, '1d': 3, '1w': 4}
print(f"{dt.datetime.utcnow():%H:%M:%S} UTC  spot Binance {spot}  Coinbase {cb}\n")
for r in sorted(rows, key=lambda r: (order[r['tf']], r['a'])):
    eu = r['pu'] - r['bu'] if r['bu'] else None; ed = (1 - r['pu']) - r['bd'] if r['bd'] else None
    best = max([('UP', eu), ('DOWN', ed)], key=lambda x: x[1] if x[1] is not None else -9)
    print(f"{r['a']} {r['tf']:>3} | {r['mins']:6.0f}m left | open {r['op']:.2f} now {r['cur']:.2f} ({r['cur']-r['op']:+.2f}) | fair Up {r['pu']*100:4.1f}% (hist {r['pe']*100:.0f} / 6h-vol {r['pn']*100:.0f}) | mkt Up {r['mid']*100:4.1f}% | buy Up {r['bu']} Down {r['bd']} | best {best[0]} edge {best[1]*100 if best[1] is not None else float('nan'):+.1f}pts | vol {r['vol']} | {r['slug']}")
missing = sorted(ELIG - {(r['a'], r['tf']) for r in rows})
print('\nNo live market found for:', missing)
# next-period priors from history (mean reversion)
print('\nNext-period base rates (Binance candles, last 1000):')
for a in ['BTC','ETH','SOL']:
    for iv in ['5m','15m','1h']:
        k = klines(a, iv)[:-1]
        up = [x[4] >= x[1] for x in k]
        last = up[-1]
        nxt = [up[i] for i in range(1, len(up)) if up[i-1] == last]
        print(f"  {a} {iv:>3}: last closed {'UP' if last else 'DOWN'} -> next Up {sum(nxt)/len(nxt)*100:4.1f}% (n={len(nxt)}), overall Up {sum(up)/len(up)*100:4.1f}%")
