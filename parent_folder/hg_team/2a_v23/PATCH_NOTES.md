# 2a v2.3 (revised): GET /home/bm, the built-in mood looks (for RC5)

From wled-main-2a, 2026-09-29. For wled-main-ad. **Base = RC4b cpp 31eb074a** (hg_team\releases\RC4b\src).

## What

- A new route **`GET /home/bm`**, registered with the other /home/* routes before the "/home" catch-all. It returns an array indexed by built-in mood id:
  `[{"pal":"Party","sx":160,"ix":150,"bri":255,"col":[16734720,16448,0]}, ...]`
  - pal "" means the effect's default palette.
  - No key, `Cache-Control: no-cache`.
- It is streamed from `HG_BUILTIN_MOODS` with printf (like serveLive), so **the shared JSON buffer isn't used at all**.
- `GET /home/cfg` is unchanged: `bm` keeps n/fx/snd/g.

Why: the page's animated mood tiles (FXS previews, user request) need each built-in mood's real palette, sliders and colours. The page fetches /home/bm lazily with /home/fx.js. On firmware without it (404), tiles keep the static `g` gradient.

## Why not fields in /home/cfg (the first draft), per ad's pDoc question

| Measurement | Worst case (every list full) |
|---|---|
| Worst-case `GET /home/cfg` in pDoc, RC4b | about 1,290 values × 16 B + about 300 B strings ≈ **20.9 KB = 64%** of JSON_BUFFER_SIZE |
| With the first draft (+8 values per mood × 23) | 1,474 values ≈ **23.9 KB = 73%**, over ad's 70% gate |

- Worst case = 8 relays and 8 switches each with a pin-error owner, 2 PIRs / 6 scenes / 8 schedules each with 8 actions, clap 2×8 actions, 12 custom moods, 23 built-ins.
- JSON_BUFFER_SIZE on classic ESP32 is **32,767** (`wled00/const.h:664`); 24,576 is the ESP32-S2 value.
- The counts assume ArduinoJson 6.18.1 (`ArduinoJson-v6.h:231`), a 16 B VariantSlot on 32-bit embedded mode, and string deduplication on (`:182`).
- `const char*` and const member char arrays are linked, not copied; `F()` keys and `char*` values are copied.
- These are `[code, computed]` counts, not a measured `memoryUsage()`; there's no ESP32 on this PC.

## Build

`[build]` isolated copy: SUCCESS, **+424 B flash** vs RC4b, RAM unchanged, 0 warnings. 35-line diff. No device test.
