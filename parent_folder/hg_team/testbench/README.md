# WLED home_gadgets mock

This is a zero-dependency Node.js (18+) mock of a WLED ESP32 running the `home_gadgets` and `audioreactive` usermods. Use it to test the phone page (`/home`) without hardware. It reads the WLED tree at `../../WLED-main` but never writes to it.

## Run

```
node server.js [options]
```

Then open `http://127.0.0.1:8080/home`. By default the page is re-read from `WLED-main/usermods/home_gadgets/home.htm` on every request, so edits show up on reload.

| Option | Default | Meaning |
|---|---|---|
| `--page <path>` | usermod `home.htm` | Page served at `/home` (re-read on every GET) |
| `--port <n>` / `--host <ip>` | 8080 / 127.0.0.1 | Use `--host 0.0.0.0` to test from a phone on the LAN |
| `--latency <ms>` or `<min-max>` | 0 | Delays every response (random value inside the range) |
| `--fail503 <0..1>` | 0 | Probability of a 503 on POST `/json/state` (bare 503: no body, no CORS header) and on POST `/home/cfg` (`{"ok":false,"err":"busy"}`) |
| `--log` | off | Prints one line per request: time, in-flight count, method, URL, status, duration and POST body |
| `--queue <n>` | 6 | Answers with a bare 503 when more than n requests are in flight (`WLED_REQUEST_MAX_QUEUE`). 0 turns it off |
| `--key <10 chars>` | random | Fixed API key from `[a-z2-9]` without `i l o 0 1` |
| `--key-delay <ms>` | 0 | The key stays `""` for this long, like the device's first 5 s after boot |
| `--pin <XXXX>` | none | WLED settings PIN. Enables `pinReq`, `401` responses, the 3 s retry cooldown and the 15 min timeout |
| `--apply-delay <ms>` | 20 | Delay before an accepted `/home/cfg` upload is applied (the device does it in `loop()`) |
| `--jsonlive on\|auto\|off` | on | `auto` and `off` answer `/json/live` with `501 {"error":4}`, like the real home_gadgets build (see deviations) |
| `--name <text>` | WLED | Device name (`serverDescription`) |
| `--leds <a,b>` | 60,60 | LED counts of segment 0 (LED 1) and segment 1 (LED 2) |
| `--env <name>` | home_gadgets | PlatformIO environment whose build flags decide the effect list |
| `--define A,B` / `--undef A,B` | | Extra or removed preprocessor flags, for example `--define WLED_DISABLE_2D` |
| `--repo <path>` | `../../WLED-main` | WLED source tree |

## Tests

- `node validate.js` starts the mock on free ports and runs 70 checks against the contract in `home_gadgets.cpp`, then stops it. The checks cover every endpoint, key and PIN rules, headers, chaos options and stats.
- `node smoke.js [--start] [--url http://host/home] [--shots <dir>] [--dark] [-- <server options>]` loads `/home` at 390x844 in headless Chromium and clicks every tab. It prints page errors, console errors, failed requests and horizontal-scroll problems.
  - It uses an already-installed Playwright or Puppeteer and installs nothing. On this PC it finds Playwright 1.62 in the global npm tree (`%APPDATA%\npm\node_modules\omniroute\node_modules\playwright`).
  - To use a different copy, set `PLAYWRIGHT_PATH` or `PUPPETEER_PATH`.
  - `--url` also works against a real device.

## Endpoints

**home_gadgets usermod** (mirrors `home_gadgets.cpp`)

| Route | Notes |
|---|---|
| `GET /home` (and `/home/<anything else>`) | The page, with an ETag. AsyncWebServer's `/home` route also matches `/home/...`, so the unimplemented `GET /home/stats` returns the HTML page, just like the device |
| `GET /home/cfg` | `fillConfig(forPage)`, including `key`, `bm`, `lim`, `name`, `ce`, `rev`, `pinReq` and pin errors `e` / `o`. Sent **without** `Access-Control-Allow-Origin` (Allow-Methods and Allow-Headers stay), with `Cache-Control: no-store` |
| `POST /home/cfg?k=KEY[&pin=XXXX]` | Checks run in this order: `413 {"err":"size"}` (empty body, over 12 KB, or a form-urlencoded body), then `403 {"err":"key"}`, then `401 {"err":"pin"}`, then `503 {"err":"busy"}` (previous upload not applied yet), otherwise `202 {"ok":true}`. The upload is applied later, and then `rev` increases. Ops: config sections, `{"cap":{strip,n,rep,id}}`, `{"newkey":true}` |
| `GET /home/live` | `r, sw, pir, act, s[{on,bri,fx}], on, bri, mic, lvl, vol, rev`. Flags are the integers 0/1. `s[k]` is `null` when the segment doesn't exist |
| `GET /home/api?...&k=KEY` | `relay=1-8&on=0\|1\|t\|toggle`, `mood=ID&strip=1-3`, `scene=1-6`, `strip=1-3&on=0\|1`, `alloff=1`. Returns `200 {"ok":true}`, `400 {"ok":false}` or `403` |
| `GET /home.json` | The "saved file". It is 404 until the first save and never contains the key |

**WLED core** (mirrors `json.cpp` and `wled_server.cpp`)

| Route | Notes |
|---|---|
| `GET /json/state`, `/json/si`, `/json/info`, `/json` | Same URL matching order as `serveJson()`. State includes `HomeGadgets:{r,sw,pir}` and `AudioReactive:{on}` |
| `POST /json/state` (also `/json/si`, `/json`) | Needs `Content-Type: application/json`; otherwise the device answers with a 404 page.<br>Handles top-level `on` (bool or `"t"`), `bri` and `transition`; `seg` as an array or object, merged by `id` (`on, bri, col, fx, fxdef, sx, ix, pal, c1-c3, o1-o3, sel, rev, mi, n, ...`); `HomeGadgets`; and `AudioReactive:{enabled,inputLevel}`.<br>Returns `{"success":true}`, or the state when `"v":true`. Invalid JSON gives a bare 400, a non-object gives `400 {"error":9}` |
| `GET /json/eff`, `/json/fxdata` | Parsed from FX.cpp and FX.h at start-up. 220 entries: 216 effects plus `"RSVD"` / `""` for the unused ids 142, 169, 170 and 171 |
| `GET /json/pal`, `/json/palx?page=N` | The exact `JSON_palette_names` string. `palx` returns 8 per page with `m` = 9, and the colour stops are parsed exactly from `palettes.cpp` |
| `GET /json/live` | `{"leds":["RRGGBB",...],"n":1}`: synthetic, animated colours from the segment state (see deviations) |
| `GET /json/pins` | ESP32 classic pin list with `c` capability bits and the `a` / `o` / `n` allocation fields |
| `GET /json/<other>` | `501 {"error":4}` |
| `OPTIONS *` | 200 with CORS headers and `Access-Control-Max-Age: 7200` |

Every response except `GET /home/cfg` and the bare 503s carries `Access-Control-Allow-Origin: *`, `-Methods: *` and `-Headers: *`, as set in `wled_server.cpp:352-354`.

**Mock control** (not counted in the stats)

| Route | Notes |
|---|---|
| `GET /__stats[?reset=1]` | `{totalRequests, inFlight, maxInFlight, inFlightStatePosts, maxInFlightStatePosts, byRoute:{"POST /json/state":{count,status:{200:n}}}}`. "State posts" are POSTs to `/json`, `/json/state` or `/json/si` |
| `GET /__reset[?newkey=1]` | Resets the device to its boot defaults and resets the stats. The key is kept unless `newkey=1` |
| `POST /__sim` | Simulated inputs:<br>`{"pir":0,"motion":true}` flips a sensor and runs its actions; motion `false` starts the hold timer.<br>`{"sw":0,"on":true}` flips a wall switch (toggle or follow).<br>`{"vol":120}` sets the sound level (`null` = automatic).<br>`{"key":""}` simulates "key not generated yet".<br>Only allocated inputs react |
| `GET /__info` | Environment, flags, effect and palette counts, parser notes, current key |

## Parsed from the source at start-up (no drift)

- **Build flags:** from `platformio.ini` plus `platformio_override.ini` (`[env:home_gadgets]` extends `esp32dev_V4`, which uses `[common]` and `[esp32_idf_V4]`), with `build_unflags` and `custom_usermods` applied. The result is `WLED_PS_DONT_REPLACE_FX` and `WLED_ENABLE_GIF`, with 2D and both particle systems on.
- **Effect list:** the preamble of `FX.cpp` is evaluated to get the derived flags (`WLED_PS_DONT_REPLACE_1D_FX` and `_2D_FX`). Then `setupEffectData()` runs through a small preprocessor and `WS2812FX::addEffect()` is simulated: reserved gaps, id 255 and appending. Effects added by the environment's usermods are included (none today).
- **Palettes:**
  - Names come from `JSON_palette_names` in `FX_fcn.cpp`.
  - Colour stops come from `palettes.cpp`: the `TProgmemRGBPalette16` tables, where `CRGB::Name` is resolved through `fastled_slim.h`, and the gradient byte tables, in `fastledPalettes` / `gGradientPalettes` order.
- **Usermod:** the limits (`HG_*`), default pins, key alphabet and the full `HG_BUILTIN_MOODS` table come from `home_gadgets.cpp`.
  - Start-up fails loudly if anything can't be parsed.
  - The `setDefaults()` scenes and sensor actions are copied by hand: Party, Movie, All off; Calm on LED 1, Midnight on LED 2.

## Known deviations from the firmware

1. **`/json/live`:** the mock serves it by default (with an `X-Mock-Warning` header). The real home_gadgets build answers `501 {"error":4}`, because `WLED_ENABLE_JSONLIVE` is only defined when `WLED_DISABLE_WEBSOCKETS` is set (`wled.h:47-51`), and this environment keeps websockets. Use `--jsonlive auto` to reproduce the device. The colours are a synthetic animation (palette or segment colours, speed, opacity and brightness), not the real effect output.
2. **Busy and 503:** the real firmware defers a request while WLED's JSON buffer is locked, which delays it but doesn't return 503. A real 503 comes from request-queue overflow (over 6 queued or active requests, or low heap), as a bare `HTTP/1.1 503` without headers or body, or as the usermod's `{"err":"busy"}` while an upload is still pending. `--fail503` injects those two 503 forms at random; `--queue` approximates the overflow from the in-flight count.
3. **Timing:** commands go through a 16-entry queue that is drained 8 at a time every 10 ms, and uploads are applied after `--apply-delay`. There is no 1 s input settle time, no debounce or AC pulse detection, no staged relay restore after boot, and no power-on or "last state" handling. The API key appears immediately unless `--key-delay` is set. It is not persisted across mock restarts.
4. **LED engine:**
   - The segment layout is fixed at 2 RGB segments (`lc` 1, no white channel); segment create and delete requests are ignored.
   - There are no transitions, presets, playlists, nightlight, sync, time or websockets.
   - `getVal()` string forms are only partly supported (`"~"`, `"~-"`, `"r"`, digits).
   - A Kelvin `col` value is approximated.
   - `/json/info` has only plausible values.
   - `/json/cfg` and the `/`, `/settings*` pages are placeholders.
5. **Pins:** WLED core is assumed to own GPIO0 (button) and GPIO16/17 (LED outputs), and audioreactive owns `AUDIOPIN` (36). The real allocation depends on the LED settings (`cfg.json`). PSRAM is assumed absent.
6. **"Only at night":** always counts as night, which matches a device without a configured location. The mic sound level `vol` is a synthetic wave while the mic is on.
7. **Type rules:** ArduinoJson's type rules are emulated for the fields the usermod reads (`| int` accepts only integers, `| bool` only booleans). Unusual JSON (huge numbers, duplicate keys, invalid UTF-8) may behave differently.
8. **Contract version:** this is contract v1 plus TEAM_BOARD 4c, as in `home_gadgets.cpp` at 17:00. The v2 items in TEAM_BOARD 4d aren't in the cpp yet and aren't simulated: `away`, `sch`, `clap`, `lim.sch`, `src` / `ago` / `away` / `clap` / `ts` in `/home/live`, `GET /home/stats` and `{"away":bool}`. New built-in moods and limits will be picked up automatically once they are in the cpp.
