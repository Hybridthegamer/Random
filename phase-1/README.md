# dragoncalls

Model-driven calls on crypto Up/Down markets from [Limitless](https://limitless.exchange), plus a scorecard of how those calls did. It has three tabs:

- **Predictions**: every live market with the model's fair odds, the market's price, the edge, and a one-shot call.
- **Calls**: the scorecard, which logs each call and checks it after the market settles.
- **Data**: sync across devices, and JSON backup.

It's plain HTML, CSS and JS with no build step, plus two serverless functions: `api/markets.js` for the market data and `api/sync.js` for syncing across devices.

## Deploy on Vercel

The folder and the Vercel project are still called `phase-1`. Don't rename the folder, or the project's Root Directory setting will stop matching.

1. Go to Vercel → **Add New → Project** and import `hybridthegamer/Random`.
2. Set **Root Directory** to `phase-1`.
3. Leave **Framework Preset** as `Other`, with no build command and no output directory.
4. Click Deploy.

## Run locally

```
cd phase-1 && npx vercel dev   # serves the site and the api/ functions with your env vars
```

`python3 -m http.server` also works for the layout, but it can't run the API, so there is no market data and no sync.

## Predictions

The **Predictions** tab calls `api/markets.js`, a serverless function that collects:
- every live market the panel covers from the Limitless API (BTC/ETH 5m and 15m, BTC/ETH/SOL hourly and daily, BTC weekly)
- spot prices and candles from Binance (`data-api.binance.vision`) and Coinbase

For each market, it estimates **the chance of Up** by averaging two drift-free models:
1. historical moves over the same time window, mirrored so there's no trend bias (1-minute candles up to 2 hours ahead, 41 days of hourly candles beyond that)
2. a normal-distribution model using volatility from the last 6 hours (beyond 2 hours ahead it is averaged with 7-day hourly volatility, so one quiet morning cannot set a whole day's range)

For 5m, 15m and hourly markets, this estimate is then adjusted by the **reversal pattern**: how often a candle closed Up after the previous candle closed the way the one before this market did. The adjustment counts fully at the start of the period and fades as time runs out. The 5m and 15m markets settle on a Chainlink price that sits a few dollars away from exchange prices. The function measures that gap from the Binance minute just before each market opens and corrects for it.

It compares that estimate with the Limitless buy prices to get the **edge**. Each market then gets a **one-shot call**:
- `BUY <side>` for an edge of 5 points or more
- `LEAN <side>` for 2–5 points
- `SKIP` (priced fairly, too late or no sellers), with the model's likely side

Calls on markets with almost no volume are tagged *(thin book)*.

The tab also shows "next candle" base rates: how often the next candle closed Up after the last closed candle's direction, measured over the last 1,000 candles. It refreshes every 30 seconds while the page is open. No setup or keys are needed.

The model is a random walk, so it doesn't account for news or order flow. Treat edges under about 5 points as noise.

## Calls

The first time the page sees a market, it records the model's call in your synced data. After the market settles, `GET /api/markets?resolve=<slugs>` fetches the result. The **Calls** tab shows:
- hit rate against expected for BUY and LEAN calls, plus P&L per $1 staked at the quoted price (fees not included)
- the same for calls you marked **I took it**
- direction accuracy across all calls
- a Brier score comparing the model with the market
- the most recent settled calls

A call is only recorded while the page is open somewhere.

## Data and sync

Calls are stored in **Upstash Redis**, which is the source of truth, through `api/sync.js`. Each browser also keeps a copy in `localStorage`, so the page works offline and syncs when the connection comes back.

- Each record is merged separately: when two devices have different versions of the same record, the most recently edited one wins.
- Deletes are kept as markers ("tombstones"), so a record deleted on one device doesn't come back from another.
- When a device connects for the first time, its existing local data is uploaded and merged in.
- The app syncs after every change, when you return to the tab, and every 60 seconds while it's open.
- The API rejects any request without the right `x-sync-key` header, which must match `SYNC_PASSPHRASE`. Each device asks for the passphrase once and remembers it.

### One-time setup on Vercel

1. In the project, go to **Storage → Create Database → Upstash (Redis)**. Pick the free plan and connect it to the project. Set **Custom Prefix** to `KV`, which adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables. The default `STORAGE` prefix also works.
2. Go to **Settings → Environment Variables** and add `SYNC_PASSPHRASE` with a long passphrase of your choice. Make sure it applies to Production.
3. Redeploy the project.
4. On each device, open the site, go to **Data → Sync across devices**, enter the passphrase and tap **Connect**.

If you set up Upstash directly instead of through Vercel, use the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables instead.

**Export JSON** saves a copy of everything, and **Import JSON** merges a backup file into your data.

### Old competition log

The site used to include a post log, weekly progress, standings snapshots and a draft queue for the Limitless Crypto Up/Down Markets Competition, which has ended. Those features are gone, but the records they saved are still kept in the synced data and in Export JSON, and they merge as before. They are not shown anywhere. The storage keys (`phase1-tracker-v1`, `phase1-sync-key`, `phase1:doc`) keep their original names so nothing already saved is lost. To remove the old records for good, delete the `entries`, `standings` and `usedDrafts` fields from the stored doc.

## Config

The markets the panel covers are the `TRACKED` set at the top of `api/markets.js`.

## Brand

No published Limitless brand guide was available. The styling follows limitless.exchange: a near-black UI, `#121212` cards, `#242424` borders, a lime `#C3FF01` primary, blue `#0079FE`, green `#379A57` for YES, orange `#EA5125` for NO, and condensed bold display type over a clean sans-serif.

This is an unofficial personal tool. It isn't affiliated with Limitless.
