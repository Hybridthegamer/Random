# phase-1

A tracker for the Limitless **Crypto Up/Down Markets Competition**, covering weeks W40 and W41. Use it to log each campaign post, check it against the six rules before you submit, and follow weekly caps, standings and market coverage.

It's plain HTML, CSS and JS with no build step, plus one serverless function (`api/sync.js`) that syncs your logs across devices.

## Deploy on Vercel

1. Go to Vercel → **Add New → Project** and import `hybridthegamer/Random`.
2. Set **Project Name** to `phase-1`.
3. Set **Root Directory** to `phase-1`.
4. Leave **Framework Preset** as `Other`, with no build command and no output directory.
5. Click Deploy. The site goes live at `phase-1-<something>.vercel.app`, or `phase-1.vercel.app` if that name is free.

## Run locally

```
cd phase-1 && npx vercel dev   # serves the site and api/sync with your env vars
```

`python3 -m http.server` also works, but only in local-only mode because it can't run the sync API.

## Data and sync

Logs are stored in **Upstash Redis**, which is the source of truth, through a small serverless function at `api/sync.js`. Each browser also keeps a copy in `localStorage`, so the tracker works offline and syncs when the connection comes back.

- Each entry is merged separately: when two devices have different versions of the same entry, the most recently edited one wins.
- Deletes are kept as markers ("tombstones"), so an entry deleted on one device doesn't come back from another.
- When a device connects for the first time, its existing local entries are uploaded and merged in.
- The app syncs after every change, when you return to the tab, and every 60 seconds while it's open.
- The API rejects any request without the right `x-sync-key` header, which must match `SYNC_PASSPHRASE`. Each device asks for the passphrase once and remembers it.

### One-time setup on Vercel

1. In the `phase-1` project, go to **Storage → Create Database → Upstash (Redis)**. Pick the free plan and connect it to the project. Set **Custom Prefix** to `KV`, which adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables. The default `STORAGE` prefix also works.
2. Go to **Settings → Environment Variables** and add `SYNC_PASSPHRASE` with a long passphrase of your choice. Make sure it applies to Production.
3. Redeploy the project.
4. On each device, open the site, go to **Your data → Sync across devices**, enter the passphrase and tap **Connect**.

If you set up Upstash directly instead of through Vercel, use the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables instead.

Export JSON, Export CSV and Import JSON still work for backups. Importing now merges the file into your log instead of replacing it.

## Market check

The **Market check** panel calls `api/markets.js`, a serverless function that collects:
- every live campaign market from the Limitless API (BTC/ETH 5m and 15m, BTC/ETH/SOL hourly and daily, BTC weekly)
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

**Post button:** each card can write an X draft from the market's live state: price vs open, time left, the model's odds against the market price, and the reversal pattern. There are separate templates for BUY, LEAN, a near-certain outcome, a coin-flip, too late and weekly markets. **New variant** swaps the hook and CTA wording. The draft always tags @trylimitless and includes the `/markets/` link, with an optional referral code. It's trimmed to 280 characters the way X counts them, and checked against the campaign rules. **Open in X** opens X's post screen with the text filled in (attach your screenshot there), and **Log it** opens the log form with the details filled in.

**Model scorecard:** the first time the panel sees a market, it records the model's call in your synced log. After the market settles, `GET /api/markets?resolve=<slugs>` fetches the result. The scorecard shows:
- hit rate against expected for BUY and LEAN calls, plus P&L per $1 staked at the quoted price (fees not included)
- the same for calls you marked **I took it**
- direction accuracy across all calls
- a Brier score comparing the model with the market

A call is only recorded while the tracker is open somewhere. It also shows "next candle" base rates: how often the next candle closed Up after the last closed candle's direction, measured over the last 1,000 candles.

The panel refreshes every 30 seconds while the tab is open. No setup or keys are needed.

The model is a random walk, so it doesn't account for news or order flow. Treat edges under about 5 points as noise.

## Config

All campaign constants are at the top of `app.js`:

- campaign end (estimated as 11 Oct 2026, 19:06 UTC)
- standings update anchor and 9h interval
- ISO weeks
- eligible markets
- rival-market keywords
- the draft queue

## Brand

No published Limitless brand guide was available. The styling follows limitless.exchange: a near-black UI, `#121212` cards, `#242424` borders, a lime `#C3FF01` primary, blue `#0079FE`, green `#379A57` for YES, orange `#EA5125` for NO/LIVE, and condensed bold display type over a clean sans-serif. Copy is kept plain, in line with the brand's clarity-first principles.

This is an unofficial personal tool. It isn't affiliated with Limitless.
