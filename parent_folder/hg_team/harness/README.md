# Page test harness for home.htm (from wled-main-89)

This harness tests `home.htm` in a headless Chrome.

- It drives the installed Chrome (or Edge) through the DevTools protocol, using Node's built-in WebSocket.
- It needs Node 22 or later. No npm install, and no puppeteer.
- It works outside the repo, so no build lock is needed.

## Files

| File | Purpose |
|---|---|
| `mock.js` | Mock device for contract v2.1, adapted from wled-main-01's `hgtest/mock.js`. It serves the page you pass at `/home`, plus `/home/cfg`, `/home/live`, `/home/stats`, `/json/*` and the POST routes. It reads effects, palettes and the 23 built-in moods from the repo source (default repo path `C:/Users/DigvijayPatilLM/Downloads/WLED-main/WLED-main`). The API key is `k3yt3stabc`. There is no `/home/ws`, so the page falls back to polling |
| `shoot.js` | Takes full-page screenshots of the Automations tab (390 px light, 390 px dark, 1280 px light) and the Home tab (390 px), and writes `report.json` with console errors, exceptions, HTTP 400+ responses and overflow |
| `itest.js` | Runs 8 click tests on the scenes and action editor: captions, summary line, the saved `sc` tuples, Run on an empty scene, remove, and select labels |

## Commands

```
node mock.js --page <path-to-home.htm> --port 8790     # serve by hand
node shoot.js <path-to-home.htm> <outdir> [--no-pin] [--dpr 2] [--clock HH:MM|real] [--browser exe]
node itest.js <path-to-home.htm> [--port N] [--browser exe]
```

Exit codes:
- `shoot.js`: 0 = OK, 2 = the page logged errors, 1 = the harness failed.
- `itest.js`: 0 = all tests passed, 2 = a test failed.

Reduced motion is forced on and the clock is fixed at 20:15, so repeated runs give identical screenshots.

## More scripts (added for decision 8)

| Script | What it does |
|---|---|
| `shoot_wiring.js` | Screenshots of the Wiring tab (`--guide N` opens the guided check) |
| `shoot_settings.js` | Screenshots of the Settings tab |
| `shoot_homemoods.js` | Screenshots of Home, Moods, the mood ⋯ menu, the name prompt and the Adjust panel |
| `itest_settings.js` | 7 checks: captions, accessible names (none may contain the key), rename and power-cut saves, the copy fallback |
| `itest_homemoods.js` | 12 checks: accessible names on Home, Moods and Adjust (read from Chrome's accessibility tree), Escape order, PIN prompt |

The screenshot scripts take the same arguments as `shoot.js`, and the test scripts the same as `itest.js`: `node <script> <page.htm> [outdir]`.
