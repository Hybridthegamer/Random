# Handoff: Limitless ambassador work (Hybridthegeek)

Last updated: **Mon 5 Oct 2026, ~16:00 UTC**. Branch: `ccr-70f53186-90dxlk` (all work is pushed).

## Who / what
- **User:** Franklin (@hybridthegeek), a Web3 content creator in Port Harcourt (WAT = UTC+1). Use the **`hybridthegeeks-voice`** skill for any X post written for him.
- **His X Premium has expired**, so every post must be **≤ 280 characters as X counts them**. A URL counts as 23 and emoji/bullets count as 2. Check with `python3 tools/xcount.py <<< "text"`.
- **Network:** the environment needs **Full** network access (set by the user) to reach Binance, Coinbase, the Limitless API and `api.fxtwitter.com` (used to read X post stats).

## 1. Limitless "Crypto Up Down Markets Competition" (main goal)
- **Window:** 10 Sep → **11 Oct 2026, ~19:06 UTC**. **Top 8 of 18** win a share of Limitless airdrop points.
- **Weeks:** W40 = 28 Sep–4 Oct (now closed). **W41 = 5–11 Oct (current).**
- **Weekly rules:** a week needs **4 qualifying posts** to count, and **max 10** submitted per week.
- **Rules for a post to count:**
  1. An original post or quote post (no replies, no reposts).
  2. Tags **@trylimitless**.
  3. Contains a **`limitless.exchange/markets/...`** link. A `/share/...` link does **not** count.
  4. The market is a campaign market:
     - 5m: BTC, ETH
     - 15m: BTC, ETH
     - Hourly: BTC, ETH, SOL
     - Daily: BTC, ETH, SOL
     - Weekly: BTC
  5. Submitted in the ambassador Mini App.
  6. **Never names a rival prediction market** (Polymarket, Kalshi…). This applies to all of his posts, not just campaign posts.
- **Settlement sources:**
  - Hourly/daily: Binance BTC/USDT candles (a close equal to the open counts as Up).
  - 5m/15m: Chainlink 60-second TWAP.
  - Weekly: Pyth, and Up must be **strictly** above the opening price.
- **Calls/trades so far:**
  - 3 Oct, 07:00 BTC hourly UP: lost (by $26).
  - 3 Oct, 09:00 BTC hourly DOWN at 39¢: won (by $16).
  - BTC Daily DOWN and ETH Daily DOWN: both won.
  - BTC Weekly UP (strike $83,325.71, settled 5 Oct 03:59 UTC): **result not checked yet.**
- **Unknown:** how many W40 posts were verified, and his current rank. Ask him.

## 2. The tracker site: `phase-1/` (Vercel project "phase-1", root dir `phase-1`)
Plain HTML/CSS/JS with no build step, plus serverless functions. See `phase-1/README.md` for details.
- **Submission log:** weekly 4/10 progress, a rule checker, coverage grid, standings snapshots, draft queue, JSON/CSV backup.
- **Sync** (`api/sync.js` + `merge.js`):
  - Upstash Redis is the source of truth, protected by the `SYNC_PASSPHRASE` env var.
  - Entries merge per item; deletes are kept as tombstones.
  - The Upstash env prefix can be `KV_` or `STORAGE_`.
  - **The user started the Upstash setup in Vercel. It's unconfirmed whether `SYNC_PASSPHRASE` is set and the site redeployed.**
- **Market check** (`api/markets.js`): live campaign markets from the Limitless API, plus Binance/Coinbase data.
  - **Fair P(Up)** = average of (symmetrised historical moves over the same window) and (normal model using 6-hour volatility), then nudged by the **reversal prior** (P(Up) given the previous candle's direction) for 5m/15m/1h, weighted by the fraction of time left.
  - **Basis correction:** 5m/15m adjust for the Chainlink-vs-Binance gap, measured from the Binance minute before the market opens.
  - **One-shot calls:** BUY (edge ≥ 5 points) / LEAN (2–5) / SKIP.
  - `?resolve=slug,...` returns market winners.
- **Model scorecard:** calls are auto-logged into the synced doc (`calls`) and resolved later. It shows hit rate vs expected, P&L per $1, and Brier score vs the market.
- **Post button:** writes X drafts from live market data (trimmed to 280, rule-checked) and opens the X post intent with the text filled in.
- **Local dev:** `cd phase-1 && npx vercel dev`.
- **Quick model check from the CLI:** `python3 tools/analyze.py`.
- **Known limits:**
  - It's a random-walk model, so edges under 5 points are noise.
  - Calls are only logged while the page is open.
  - 5m markets often have thin order books.

## 3. Viral post + PH Lifestyle (side project)
- **@danieldxdere** (the user's friend) built **PH Lifestyle** (https://www.phlifestyle.fun/), a Sims-style Port Harcourt game inspired by @Shalom_HeyEliy's "Lagos Lifestyle".
- **The user's post** https://x.com/hybridthegeek/status/2106824297800970666 went viral: about **1.06M views, 1,972 likes, 1,361 bookmarks** (5 Oct 16:00 UTC). Most replies drag him, which he's fine with.
- **Done:**
  - A pinned credit reply under the viral post (Etche/Ahoada/Elele version).
  - Advised pinning the viral post to his profile.
- **Next:** post this follow-up as a **quote of the viral post**, ideally in the evening WAT. Final version (263/280):
  ```
  Crazy scenes 😂 1 million of you came to drag me for one PH post 😭

  Fair, but hear me: Lagos built first, PH followed.

  Truth is, nobody owns "our city as a game." Lol!

  So who's next? Abuja? Enugu? Calabar? Owerri?

  Builders, the brief is open. Tag your city 👇
  ```
  Afterwards, reply to people tagging their cities for the first hour.

## 4. User-generated market (UGM): waiting on Limitless
- **Creation fails** with "Network Error", then **HTTP 429** (rate limit / daily cap). **The user reported it to the Limitless team, who are fixing it.**
- **What the create flow actually is:** a **custom, self-resolved pool market**. You set opening odds and a liquidity amount, and **the user is the resolver** ("funds locked if not resolved").
- **Decided market:** **"Will PH Lifestyle's launch post reach 500 likes by Oct 11, 2026, 18:00 UTC?"**
  - Post: https://x.com/danieldxdere/status/2106247857514688541
  - Likes: 35 (Oct 4) → 114 → **145** (Oct 5 16:00 UTC)
  - **Opening odds by like count at launch:** ~25–30% YES if 150–200 likes, ~40% if >250.
  - **Liquidity:** $10 (user has ~$20 total).
  - **Trading ends:** Oct 11, 19:00 WAT (18:00 UTC).
  - **Resolution text** (update the reference count on launch day):
    ```
    Resolves YES if @danieldxdere's PH Lifestyle post (x.com/danieldxdere/status/2106247857514688541) shows 500+ likes at or before Oct 11, 2026, 18:00 UTC. Otherwise NO. Source: like count displayed on X, screenshotted at resolution. Reference: <N> likes on <date/time> UTC.
    ```
  - **Launch post:** post as a reply under the viral post. Update the like count first.
    ```
    800K of you saw PH Lifestyle this weekend.

    Daniel's launch post: <N> likes.
    Can PH push it to 500 by Oct 11? 👀

    I made it a market on @trylimitless. Pick a side 👇
    [market link]

    (Full disclosure: Team PH 💚)
    ```
    "800K" is now out of date. Use "1M+".
  - **Image:** `ugm-art/ph-500-likes.png`. Its ring shows 113/500; re-render from the `.html` if needed.
  - **Other images:**
    - `ph-vs-lagos.png` is for the PH vs Lagos market, which is effectively dead (Lagos has 15K+ likes).
    - `ph-1500-likes.png` is unused.
- **Rules to keep repeating to the user:**
  - Create the market **once**, and check his profile for duplicates before retrying.
  - Never ask people to like the post so YES wins (it's manipulation, and he's the resolver).
  - **Screenshot and resolve at 18:00 UTC on Oct 11.**
  - A $10 pool means **heavy price impact**: a $10 buy moves 20% → ~86%. Explain this if asked about big buyers.
- **Not campaign-eligible:** UGMs, packs and football don't count for the campaign. Packs have a fixed 10% cut and were all negative expected value when analysed.

## 5. Suggested next steps (in order)
1. Ask how the follow-up post performed. Check stats via `curl -s https://api.fxtwitter.com/status/<id>`.
2. **W41 campaign posts.** He needs **4+ qualifying posts by 11 Oct**. Use Market check / `tools/analyze.py` to make data-backed calls. Keep the market spread varied (ETH/SOL hourly and daily, BTC weekly).
3. Confirm the tracker's Vercel sync setup works (status button shows "Synced").
4. When Limitless fixes UGM creation, launch the 500-likes market (section 4).
5. **11 Oct 18:00 UTC:** resolve the UGM, and wrap up the campaign with a recap post.

## Handy endpoints
- **Limitless:**
  - `https://api.limitless.exchange/markets/active?page=N&limit=25` (max limit 25)
  - `/markets/<slug>` (the `metadata.openPrice`, `tradePrices`, `winningOutcomeIndex` fields: 0 = Up/Yes, 1 = Down/No)
  - Docs: `https://docs.limitless.exchange/llms.txt`
- **Binance:** `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000`
- **Coinbase:** `https://api.exchange.coinbase.com/products/BTC-USD/ticker`
- **X post stats:** `https://api.fxtwitter.com/status/<id>`
