# Handoff: Limitless ambassador work (Hybridthegeek)

Last updated: **Tue 6 Oct 2026, ~02:45 UTC**. Branch: `claude/eager-gauss-qyeyli` (continues `ccr-70f53186-90dxlk`; all work is pushed).

## Who / what
- **User:** Franklin (@hybridthegeek), a Web3 content creator in Port Harcourt (WAT = UTC+1). Use the **`hybridthegeeks-voice`** skill for any X post written for him.
- **His X Premium has expired**, so every post must be **≤ 280 characters as X counts them**. A URL counts as 23 and emoji/bullets count as 2. Check with `python3 tools/xcount.py <<< "text"`.
- **Network:** the environment needs **Full** network access (set by the user) to reach Binance, Coinbase, the Limitless API and `api.fxtwitter.com` (used to read X post stats).

## 1. Limitless "Crypto Up Down Markets Competition" (main goal)
- **Window:** 10 Sep → **11 Oct 2026, ~19:06 UTC**. **Only the top 8** win a share of Limitless airdrop points (the dashboard's "top 40%" band is wider, but only 8 are eligible).
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
  - BTC Weekly UP (strike $83,325.71, settled 5 Oct 03:59 UTC): **won** (resolved Up).
  - **No W41 BTC weekly market is live yet** (6 Oct 02:40 UTC): `btc-weekly-price` still points at last week's resolved market. Re-check `?resolve`/`/markets/btc-weekly-price` before planning a weekly post.
- **Dashboard (6 Oct ~02:45 UTC, Mini App):** rank **#27**, score 43, 7 qualifying posts, "12 place(s) outside the top 40%" (so the top-40% cutoff is ~#15). W40: 9 of 10 submitted, **7 verified** (2 undecided/rejected, unknown which; the app says totals are a lower bound). W41: 1 of 10 submitted, 1 verified.
- **Payout rule (confirmed by Franklin 6 Oct):** only the top 8 are eligible. At #27 he must climb **19 places**. Still unknown: the score at #8 and what drives score (post count vs engagement). Ask for a leaderboard screenshot.
- **Why 2 W40 posts weren't verified:** Franklin shared his direct/share link instead of the market link, i.e. no `limitless.exchange/markets/`. **Always use `https://limitless.exchange/markets/<slug>?r=J3H8LSQBZG`** (his ref code). The tracker's rule check already fails links without `/markets/`, and the Post button appends `?r=CODE` once the code is entered (stored in the browser).

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
- **The user's post** https://x.com/hybridthegeek/status/2106824297800970666 went viral: about **1.38M views, 2,330 likes, 1,563 bookmarks, 432 quotes** (6 Oct 02:40 UTC). Most replies drag him, which he's fine with.
- **Done:**
  - A pinned credit reply under the viral post (Etche/Ahoada/Elele version).
  - Advised pinning the viral post to his profile.
- **Follow-up posted** 5 Oct 16:14 UTC as a quote of the viral post (https://x.com/hybridthegeek/status/2107142300761555430). Underperformed the original: **2.4K views, 38 likes, 13 replies, 2 quotes** at 6 Oct 02:40 UTC. Remaining job: reply to people tagging their cities. Text posted (263/280):
  ```
  Crazy scenes 😂 1 million of you came to drag me for one PH post 😭

  Fair, but hear me: Lagos built first, PH followed.

  Truth is, nobody owns "our city as a game." Lol!

  So who's next? Abuja? Enugu? Calabar? Owerri?

  Builders, the brief is open. Tag your city 👇
  ```
  Afterwards, reply to people tagging their cities for the first hour.

## 4. User-generated market (UGM): waiting on Limitless
- **Limitless says UGM creation is fixed (6 Oct).** Franklin has not retried yet. Create the market **once**; if it errors, check his profile for a duplicate before retrying. (Earlier it failed with "Network Error" then HTTP 429.)
- **What the create flow actually is:** a **custom, self-resolved pool market**. You set opening odds and a liquidity amount, and **the user is the resolver** ("funds locked if not resolved").
- **Create form as filled in 6 Oct:** Yes 20% / No 80%, **liquidity $25** (planned $10; his call), trading until Sun 11 Oct 17:00 (browser local time, presumably WAT = 16:00 UTC), resolving wallet `0xf675ea47ffb3e4744922174a5b5FbC77E3b5694B`. He ticked the box: if he doesn't resolve, funds stay locked and Limitless can't resolve it for him. **Set an alarm for Sun 11 Oct 18:00 UTC (19:00 WAT).** Not yet confirmed created.
- **Decided market:** **"Will PH Lifestyle's launch post reach 500 likes by Oct 11, 2026, 18:00 UTC?"**
  - Post: https://x.com/danieldxdere/status/2106247857514688541
  - Likes: 35 (Oct 4) → 114 → 145 (Oct 5 16:00 UTC) → **189** (Oct 6 02:40 UTC, 31K views). Growth is slowing as the viral traffic decays, so 500 by Oct 11 looks unlikely (guess: ends ~250-320). Re-check before launch and open **lower** than the table below if it's still <250.
  - **Opening odds (revised 6 Oct):** need +311 likes in ~135h from 189. The last 10.7h ran ~4/hr; if that rate decays (half-life 24–48h) it ends ~330–430, and 500 needs a half-life of ~3 days or a new spike. Open at **~20% YES**. A 400 threshold would be near a coin flip if a more balanced market is wanted. Re-check the count right before creating.
  - **Decided against** a market about the Lagos Life / PH-in-Lagos-Life update: subjective, unresolvable by a number, and it points at a third party's work.
  - **Trading ends:** consider 16:00 UTC (reading still at 18:00 UTC) so informed late traders can't drain a $10 pool.
  - **Liquidity:** $10 (user has ~$20 total).
  - **Trading ends:** Oct 11, 19:00 WAT (18:00 UTC).
  - **Resolution text** (update the reference count on launch day):
    ```
    Resolves YES if the like count shown on @danieldxdere's PH Lifestyle launch post (x.com/danieldxdere/status/2106247857514688541) is 500 or more at 18:00 UTC on Oct 11, 2026. Otherwise NO. Source: the public like count on X, screenshotted at 18:00 UTC and cross-checked against a second source. If the post is deleted or hidden before then, it resolves NO. Reference: <N> likes at <time> UTC on <date>.
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
    Use "1M+" instead of "800K" (viral post is at 1.38M views). Fill in the live like count.
  - **Image:** `ugm-art/ph-500-likes.png`. Ring re-rendered 6 Oct at 189/500. To re-render: set `stroke-dasharray` to `likes/500*282.74` in the `.html` (circumference of r=45), then screenshot the `#art` element at 1024x1024 with Playwright (`/opt/node-tools`, chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
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
