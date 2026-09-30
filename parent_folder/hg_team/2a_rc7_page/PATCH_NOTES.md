# 2a: animated effect and mood previews on /home (for RC7)

From wled-main-2a, 2026-09-29. For wled-main-ad (merge), wled-main-84 (review).
**Base = RC6 page `releases\RC6\src\home.htm` md5 5cecea33** (= the repo page at packaging time). Drop-in: `home.htm` (md5 f7c65548).

## User request

"All effects and real-time effect previews visible in the UI." Every effect in the Adjust list and every mood tile shows its
own animation in the strip's real colours, so the user sees an effect before tapping it. Tap = apply is unchanged.
The selected effect keeps the REAL `/home/ws` stream (v2.2), not a simulation.

## What the page does

- It loads 6c's effect engine lazily from `GET /home/fx.js` (`hg_team\fxsim\dist\`) the first time the Adjust panel or the Moods tab opens.
  Then it fetches `/json/palx` pages and `GET /home/bm` (v2.3, in RC6) one request at a time.
- **Fail-closed X22 gate:** the engine loads only if `cfg.fxsrc === "rom"`, or `cfg.fxsrc === "fs"` with `cfg.pinSet === true`. RC6 firmware sends no
  `fxsrc`, so **on the device the previews stay off until decision 9** (tier + packaging) adds the firmware line and serves `/home/fx.js`.
  Nothing else changes, and the live `/home/ws` bar works as before.
- Effect rows: an animated bar using the effect's own defaults (`fxdata`) plus the strip's colours, palette and brightness. Effects the engine
  doesn't implement show a "≈" marker (about 17 PS effects plus Copy Segment and Image). Only visible rows animate, re-renders stop the old previews, and nothing runs while the page is hidden.
- Mood tiles: built-in moods from `/home/bm`, custom ones from `cfg.moods`. Without the engine or `/home/bm`, tiles keep the RC6 `g` gradient.

## Merge onto RC6

A 3-way merge (base RC4b 54348e10, theirs RC6 5cecea33) gave 2 conflicts, both resolved by hand, **keeping all of 89's decision-8 changes**:
- the mood card: RC6's aria-labels, `margin-left:auto`, and the name on its own line, plus the animated canvas
- the effect list: RC6's search `aria-label` and `aria-current` on the selected effect, plus the row previews

The RC6 429 "wait" toast and the modal role=dialog / Escape handling are untouched (outside the conflicts).

## Size

- Raw 85,674 → 88,997 B (+3,323).
- gzip -9: 29,982 → 31,304 B (**+1,322 B flash**).
- The engine itself (`/home/fx.js`) isn't included. Its tiers (27.3 / 24.7 / 13.0 KB gzip) are decision 9.

## Tests

All against `hg_team\virtualdev`, a spare instance serving this page. `[test: virtual device]`; not on the ESP32.
- `virtualdev\tmp_page\drive.js`: **18/18 pass**, 0 console errors.
  - 162 row previews
  - 7/7 visible rows animate
  - the selected row keeps its live ws bar
  - filter and close don't leak previews
  - colour and palette follow
  - 23/23 mood tiles animate
  - no horizontal scroll at 390 px
- Accessibility spot check at 390 px:
  - dialog role present, and Escape closes it
  - the search box and the select are labelled
  - `aria-current` is on the selected effect
  - "More options for …" labels are present
  - mood names sit on their own line
  - 0 errors
- Screenshot: `moods_rc7.png`.

## Firmware for decision 9 (not in this page patch)

Once the user picks the tier:
1. gzip the chosen `fxsim*.min.js` into PROGMEM (like `home_page_gz.h`, via gen_page.py)
2. register `GET /home/fx.js` before the "/home" catch-all
3. add `root["fxsrc"]="rom"` in fillConfig's forPage part

That's about 10 lines. I'll draft it when asked.
