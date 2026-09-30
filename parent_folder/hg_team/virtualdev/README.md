# virtualdev: a virtual Home Gadgets WLED device on this PC

It serves the **real WLED web UI** and the **real /home page**, with virtual LED strips that actually run the effects.
Use it to try the UI without an ESP32. It is the team's canonical mock (wled-main-30).

## Run

```
node server.js --port 80          # http://127.0.0.1/  (WLED UI)   http://127.0.0.1/home  (Home Gadgets)
node server.js --port 80 --host 0.0.0.0   # reachable from a phone on the same network (http://<pc-ip>/home)
```

- **Use port 80.** WLED's own UI opens its websocket at `ws://<hostname>/ws`, without a port, so on any other port its live updates and Peek fail. /home works on any port.
- The API key is random for each run and printed at start: `[home] API key for this run: ...`.
- Options:
  - `--hg-pin 1234`: set a settings PIN
  - `--hg-save`: keep the config across restarts
  - `--fxsim <file|dir>`: use another effect engine
- `GET /__info` shows what it mirrors: firmware release, cpp md5, page served, engine, effect coverage.

## What is real, and what is simulated

| Part | Real or simulated |
|---|---|
| WLED web UI (`/`, settings pages, common.js, ...) | **Real**: the gzip byte arrays from the firmware build's generated `html_*.h`, served unchanged. Settings pages open, but saving them doesn't configure anything |
| Effect list (220 slots, 216 real), metadata, 72 palettes, palx | **Real**: parsed from FX.h, FX.cpp and palettes.cpp with this build's flags |
| `/json/*` and `/ws` (state, info, live view "L" frames) | Mirrors wled00/json.cpp and ws.cpp for the parts the UI uses |
| `/home`, `/home/*`, `/home/ws`, JSON-state `HomeGadgets` | Mirrors the **RC4b** firmware (`hg_team\releases\RC4b\src`), plus contract v2.3 `GET /home/bm` and `fxsrc:"rom"` |
| /home page | `www\home.htm` = RC4b page + animated effect/mood previews (draft for RC6; diff in `www\page.diff`) |
| LED strips | 2 virtual strips of 60 LEDs, rendered at about 42 fps by 6c's FXS engine (`hg_team\fxsim\dist\fxsim.js`). **146 of 216 effects are exact ports** of FX.cpp. The other 70 (2D-only, particle-system "PS", Image, Copy Segment) use a palette-scroll fallback, shown as "≈" on the page |
| Relays, wall switches, PIRs, microphone | Simulated in memory. `/home/__sim` fakes switch and PIR input. Sound effects get simulated music |

## Known gaps

- Presets and playlists, timers, and the settings pages don't save real configuration.
- The core JSON API covers what the UI uses, not every field of the firmware.
- The PS and 2D effects are approximations, as noted above.

## Files and owners

| File | Written by |
|---|---|
| `server.js`, `device.js` | DEVICE agent |
| `core_api.js`, `ui\` | CORE agent |
| `home_api.js` | HOME agent |
| `www\home.htm` | PAGE agent |
| `wslib.js`, `VDEV.md` (contract), this README | wled-main-2a |

Tests are in each `tmp_*\` folder. `tmp_page\drive.js --base http://127.0.0.1` runs the page's 18 Playwright checks.
