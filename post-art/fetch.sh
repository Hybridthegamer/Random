#!/usr/bin/env bash
# Usage: post-art/fetch.sh <dataDir>
# Pulls the live data post-art/build.js needs (Binance candles, Limitless prices, ladder model output).
# Update the three daily slugs and the ladder leg slug below when new markets open.
set -euo pipefail
D="${1:?usage: fetch.sh <dataDir>}"; mkdir -p "$D"; cd "$D"
date -u +%s > now.txt
K="https://data-api.binance.vision/api/v3/klines"
# ETH 5m closes since the current daily opened (Fri 9 Oct 16:00 UTC = 1791561600000)
curl -s -m 30 "$K?symbol=ETHUSDT&interval=5m&startTime=1791561600000&limit=1000" -o eth5m.json
# BTC hourly since the weekly open (Mon 5 Oct 04:00 UTC = 1791172800000)
curl -s -m 30 "$K?symbol=BTCUSDT&interval=1h&startTime=1791172800000&limit=500" -o btc1h_week.json
for a in BTC ETH SOL; do curl -s -m 30 "$K?symbol=${a}USDT&interval=1h&limit=168" -o "$(echo $a | tr A-Z a-z)1h_168.json"; done
for s in eth-up-or-down-daily-p-1791551121858 btc-up-or-down-daily-p-1791551120692 solana-up-or-down-daily-p-1791551127527; do
  curl -s -m 20 "https://api.limitless.exchange/markets/$s" | jq -c '{slug, open:.metadata.openPrice, buy:.tradePrices.buy.market, prices}'
done > daily_prices.jsonl
curl -s -m 20 "https://api.limitless.exchange/markets/80000-1791173121619" | jq -c '{slug, buy:.tradePrices.buy.market, prices}' > ladder80.json
uv run python "$(dirname "$0")/../tools/hit_ladder.py" > ladder.txt 2>/dev/null || true
echo "fetched into $D at $(date -u)"
