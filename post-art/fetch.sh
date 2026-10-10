#!/usr/bin/env bash
# Usage: [SET=sat|sun] post-art/fetch.sh <dataDir>
# Pulls the live data post-art/build.js needs (Binance candles, Limitless prices, ladder model output).
# SET=sat: dailies that opened Fri 9 Oct 16:00 UTC. SET=sun: dailies that opened Sat 10 Oct 16:00 UTC (settle Sun 11 Oct 16:00 UTC).
# Update the daily slugs below when new markets open.
set -euo pipefail
D="${1:?usage: fetch.sh <dataDir>}"; SET="${SET:-sat}"; mkdir -p "$D"; cd "$D"
date -u +%s > now.txt
K="https://data-api.binance.vision/api/v3/klines"
if [ "$SET" = sun ]; then
  START=1791648000000
  SLUGS="eth-up-or-down-daily-p-1791637523482 btc-up-or-down-daily-p-1791637522268 solana-up-or-down-daily-p-1791637529851"
else
  START=1791561600000
  SLUGS="eth-up-or-down-daily-p-1791551121858 btc-up-or-down-daily-p-1791551120692 solana-up-or-down-daily-p-1791551127527"
fi
# ETH 5m closes since the current daily opened
curl -s -m 30 "$K?symbol=ETHUSDT&interval=5m&startTime=$START&limit=1000" -o eth5m.json
# BTC hourly since the weekly open (Mon 5 Oct 04:00 UTC = 1791172800000)
curl -s -m 30 "$K?symbol=BTCUSDT&interval=1h&startTime=1791172800000&limit=500" -o btc1h_week.json
for a in BTC ETH SOL; do curl -s -m 30 "$K?symbol=${a}USDT&interval=1h&limit=168" -o "$(echo $a | tr A-Z a-z)1h_168.json"; done
for s in $SLUGS; do
  curl -s -m 20 "https://api.limitless.exchange/markets/$s" | jq -c '{slug, open:.metadata.openPrice, buy:.tradePrices.buy.market, prices}'
done > daily_prices.jsonl
curl -s -m 20 "https://api.limitless.exchange/markets/80000-1791173121619" | jq -c '{slug, buy:.tradePrices.buy.market, prices}' > ladder80.json
uv run python "$(dirname "$0")/../tools/hit_ladder.py" > ladder.txt 2>/dev/null || true
echo "fetched into $D at $(date -u)"
