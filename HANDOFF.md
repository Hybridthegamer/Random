# Handoff: Limitless ambassador work (Hybridthegeek)

Last updated: **Tue 6 Oct 2026, ~02:45 UTC**. Branch: `claude/eager-gauss-qyeyli` (continues `ccr-70f53186-90dxlk`; all work is pushed).

## Who / what
- **User:** Franklin (@hybridthegeek), a Web3 content creator in Port Harcourt (WAT = UTC+1). Use the **`hybridthegeeks-voice`** skill for any X post written for him.
- **His X Premium was renewed on 6 Oct**, so the 280-character cap is lifted (long posts allowed). Keep the hook and the question inside the first ~280 characters, because X folds longer posts behind "Show more". If Premium lapses again, posts must be **≤ 280 as X counts them**: a URL counts as 23 and emoji as 2; check with `python3 tools/xcount.py <<< "text"`.
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
  - **No W41 "BTC Up or Down - Weekly" market exists** (6 Oct 03:20 UTC): `btc-weekly-price` still points at last week's resolved market and the expected next slug `btc-up-or-down-weekly-1791172800` is a 404. Re-check before planning a weekly post.
  - **The only BTC weekly market this week is the one-touch ladder** "What price will Bitcoin hit October 5-11?" (group slug `what-price-will-bitcoin-hit-october-5-11-2026-1791173121609`; Binance 1m candle High/Low, 12:00 AM ET Mon to 11:59 PM ET Sun = 5 Oct 04:00 to 12 Oct 03:59 UTC). It is **not Up/Down, so assume it is not campaign-eligible** (a post about it is reach content, not one of the 4). Its metadata says it is mirrored from a rival market: **never name that source**. The official @trylimitlessfin post 2107108551974109491 is about it.
  - **6 Oct analysis:** priced fairly. At the YES prices you would actually pay, every level is within ~3 points of fair (noise), books are thin with ~7% spreads. BTC is in a low-vol regime (~33% annualised); range so far 84,972-86,725. P(touch 88K) ~50%, P(touch 84K) ~68%, P(touch both) ~24%, P(leave the 84-88K box) ~96%. Call: no trade; content stance is "84K dip" because it is the closer target (~61% to be hit before 88K).
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
  - **Fair P(Up)** = average of (symmetrised historical moves over the same window) and (normal model using 6-hour volatility; beyond 2h ahead: hourly-candle history and 6h vol averaged with 7-day hourly vol, changed 6 Oct because the old short windows put ~92% on daily leads that longer data prices at ~80-86%), then nudged by the **reversal prior** (P(Up) given the previous candle's direction) for 5m/15m/1h, weighted by the fraction of time left.
  - **Basis correction:** 5m/15m adjust for the Chainlink-vs-Binance gap, measured from the Binance minute before the market opens.
  - **One-shot calls:** BUY (edge ≥ 5 points) / LEAN (2–5) / SKIP.
  - `?resolve=slug,...` returns market winners.
- **Model scorecard:** calls are auto-logged into the synced doc (`calls`) and resolved later. It shows hit rate vs expected, P&L per $1, and Brier score vs the market.
- **Post button:** writes X drafts from live market data (trimmed to 280, rule-checked) and opens the X post intent with the text filled in.
- **Local dev:** `cd phase-1 && npx vercel dev`.
- **Quick model check from the CLI:** `python3 tools/analyze.py` (Up/Down markets) and `python3 tools/hit_ladder.py` (weekly one-touch BTC ladder: fair touch probabilities vs market, edge at the real buy price, 84-88K style box stats).
- **Known limits:**
  - It's a random-walk model, so edges under 5 points are noise.
  - Calls are only logged while the page is open.
  - 5m markets often have thin order books.

### W41 plan (Market check run 6 Oct 08:47 UTC; Franklin has 1 of 4 verified, cap 10, week ends 11 Oct 19:06 UTC)
- After the model fix, **nothing on the board is a real BUY**: dailies BTC 87.7% fair vs 84.3% market, ETH 80.8 vs 82.5, SOL 82.3 vs 83.0 (edges -1.7..+1.5). Only the BTC 15m showed 9-12 points, with 13 minutes left and thin volume.
- Dailies open at 16:00 UTC (noon ET) and settle 24h later. Posts only need to be honest and well-formed, so pick markets by timing and variety, not by edge.
- Suggested spread: BTC Daily now (UP, +$742 lead) -> new dailies at 16:00 UTC (17:00 WAT) -> an hourly during the Nigerian evening / US session -> a 15m around the US open -> final daily Sat 10 Oct 16:00 UTC. Keep 1-2 spare for rejections. Every post: original/quote, tags @trylimitless, link `https://limitless.exchange/markets/<slug>?r=J3H8LSQBZG`, no rival names, paste into the tracker's rule check first.
- BTC Up/Down Weekly still not created (404). The BTC "hit" ladder is not a campaign market.

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
- **Create form as filled in 6 Oct:** Yes 20% / No 80%, **liquidity $25** (planned $10; his call), trading until Sun 11 Oct 17:00 (browser local time, presumably WAT = 16:00 UTC), resolving wallet `0xf675ea47ffb3e4744922174a5b5FbC77E3b5694B`. He ticked the box: if he doesn't resolve, funds stay locked and Limitless can't resolve it for him. **Set an alarm for Sun 11 Oct 18:00 UTC (19:00 WAT).**
- **UGM is LIVE** (created 6 Oct 03:11 UTC): https://limitless.exchange/markets/will-ph-lifestyles-launch-post-have-500-likes-on-oct-11-2026-at-1800-utc-394086e7-1791256304636?r=J3H8LSQBZG . AMM pool, $25 liquidity, trading closes 11 Oct 16:00 UTC, resolution text as intended. Zero volume at 6 Oct 06:45 UTC. Launch reply posted 6 Oct 03:17 UTC as a reply under the viral post (https://x.com/hybridthegeek/status/2107309113055019477): 1.6K views, 1 like, **no image attached**, buried among 275 replies. **Quote of the viral post published 6 Oct 06:59 UTC** (https://x.com/hybridthegeek/status/2107365159761059967), image attached, ref link, tags @trylimitless + @danieldxdere. At 08:40 UTC: 21 likes, 439 views, market volume still $0. It omitted the "I seeded the pool / I'm the resolver" disclosure and the 1-hour edit window has passed, so add it as a self-reply. Daniel's post was at 200 likes (needs 2.3/hr; daytime pace ~2.9/hr, overnight ~1.5/hr; fair YES still ~10%).
- **Pace check 6 Oct 06:45 UTC:** Daniel's post 195 likes (+6 since 02:50 UTC, ~1.5/hr overnight vs ~4/hr the evening before). 500 by 18:00 UTC 11 Oct needs +305 in 131h = **2.3/hr** sustained while the post is 3 days old and decaying. My 20% opening estimate now looks high; fair is probably ~5-10%. So YES is the overpriced side; do not hype it, and **never ask people to like the post** (he is resolver + LP).
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

## 10 Oct 2026 update (Sat, ~10:00 UTC), W41 final stretch
- **Dashboard (10 Oct ~09:43 UTC):** rank **#18 of 19**, score **50.8**, 13 qualifying posts. #8 @ademolabegone 83.2 (30 posts), #9 78.3 (28), #10 72.4 (25), #1 98.5 (40). Fit of the 10 visible rows: **score ~ 34.4 + 1.52 x posts (residual sd ~4)**. So +4 posts ~ +6 pts, +10 (the weekly cap) ~ +15; reaching #8 would need ~32 posts-equivalent. Top 8 is out of reach on post count alone; realistic goal is to climb a few places. The Mini App says a submitted post earns campaign share INSTEAD of XP (XP already earned is withdrawn), so submitting is a trade-off if top 8 is out of reach.
- **No BTC Up/Down Weekly market exists in W41** (Oct 5's resolved Up; none created after). The only BTC weekly-horizon market is the one-touch ladder (not Up/Down, eligibility unconfirmed).
- **Daily markets settle on the Binance 1-minute close at 12:00 ET (16:00 UTC); an exactly equal close splits 50-50** (not "Up"). The daily opening 10 Oct 16:00 UTC settles 11 Oct 16:00 UTC (inside the 19:06 UTC deadline); the one opening 11 Oct 16:00 UTC does not.
- **Posts drafted:** `posts/2026-10-10-w41-posts.md` (ETH/BTC/SOL dailies with live slugs, BTC 80K ladder, fill-in templates for the 16:00 UTC daily and an evening hourly, plus the 100K LMTS Packs quote post). The pack campaign text (100,000 $LMTS, rewards trading activity, Oct 7-28) was only seen via a KuCoin community repost; verify against the official @trylimitless post.
- **Vol-regime note:** the model's 7-day hourly vol includes the 7-8 Oct flush (BTC 0.33%/h, ETH 0.45%, SOL 0.51%) while the last 24-36h are calmer (BTC 0.25%, ETH 0.23%, SOL 0.49%). ETH Daily "edge" and the 80K touch odds swing a lot between the two; treat edges under ~5 pts as noise.
- **UGM:** Daniel's post is at **233 likes** (10 Oct 09:56 UTC). Needs 500 by 11 Oct 18:00 UTC = ~8/hr; the last 4 days ran ~0.4/hr. YES is near-certain to lose; do not hype it. **Resolve at 18:00 UTC on 11 Oct (19:00 WAT): screenshot first.**
- **Viral post:** 1.54M views, 2,447 likes, 1,560 bookmarks (10 Oct 09:56 UTC).
- **Tooling note:** in this environment a hook rejects any command containing `python3` (even `uv run python3`); `uv run python ...` works.
- **Images for the 10 Oct posts:** `post-art/*.png` (1600x900: A-eth-daily, B-btc-daily, C-sol-daily, F-btc-80k-ladder, D-last-daily-window, E-hourly-cheatsheet, QT-packs-100k-lmts), stamped with their data time (10:16 UTC). Regenerate with `bash post-art/fetch.sh <dir> && node post-art/build.js <dir> post-art` (needs network; update the daily slugs in `fetch.sh` when new markets open). `post-art/numbers.json` holds the numbers used. ¢ prices drift within minutes (SOL daily UP went 73¢ -> 59¢ in 15 min), so refresh before posting if more than ~1 hour old.
- **Correction:** an early B draft said BTC sat "inside a 1% box for 36 hours". The data says 24h inside a 1.5% range (36h = 2.4%). Fixed in the post and image.
- **10 Oct 19:55 UTC:** the morning dailies (ETH DOWN call, BTC DOWN lean, SOL no call) all settled UP, so Franklin's two DOWN leans lost. New dailies (settle 11 Oct 16:00 UTC): `eth-up-or-down-daily-p-1791637523482` (strike 2512.52), `btc-up-or-down-daily-p-1791637522268` (83048.75), `solana-up-or-down-daily-p-1791637529851` (110.54); all ~coin flips. C2/D2 posts and images are in `posts/2026-10-10-w41-posts.md` and `post-art/` (`SET=sun` mode in `fetch.sh`/`build.js`). Last-24h vol is unusually low (BTC 0.10%/h vs 0.33% over 7d), so edges flip with the volatility window; E card now uses 7-day vol.
- **Packs campaign (official post https://x.com/trylimitless/status/2108499306475118904, 9 Oct):** total pool 200,000 $LMTS; first 1,000 new users to stake $50+ in Packs get 100 $LMTS each (sent after the challenge; 812/1,000 left at post time); friend gets 100 $LMTS, referrer earns a share of their fees; ends Oct 28. The Oct 7 post: top 5 by staked amount share 100,000 $LMTS. Referral link format `limitless.exchange?r=<code>`. $LMTS ~$0.041, so the bonus (~$4) is about the 10% Pack fee on $50 (~$5). The QT text and `post-art/QT-packs-100k-lmts.png` (file name kept) were rewritten for these terms.
