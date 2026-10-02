# phase-1

A tracker for the Limitless **Crypto Up/Down Markets Competition**, covering weeks W40 and W41. Use it to log each campaign post, check it against the six rules before you submit, and follow weekly caps, standings and market coverage.

It's a static site with plain HTML, CSS and JS. There's no build step and no backend.

## Deploy on Vercel

1. Go to Vercel → **Add New → Project** and import `hybridthegamer/Random`.
2. Set **Project Name** to `phase-1`.
3. Set **Root Directory** to `phase-1`.
4. Leave **Framework Preset** as `Other`, with no build command and no output directory.
5. Click Deploy. The site goes live at `phase-1-<something>.vercel.app`, or `phase-1.vercel.app` if that name is free.

## Run locally

```
npx serve phase-1
# or
python3 -m http.server -d phase-1
```

## Data

- Entries are stored in `localStorage` under the key `phase1-tracker-v1`. They stay on the device and browser where you logged them.
- Use **Export JSON** to back up your entries, and **Import JSON** to restore them on another device.
- **Export CSV** gives you a spreadsheet copy.

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
