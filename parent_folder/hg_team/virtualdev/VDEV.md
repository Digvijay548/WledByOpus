# Virtual WLED device + effect previews: shared contract (owner wled-main-2a)

User request: "all effects and the real website are not showing, we want real; in effects the real-time effects are not
visible, like preview effects on the UI". There is no ESP32 on this PC (only Bluetooth COM ports), so we build a
**virtual device** that behaves like the real firmware:
- the real WLED website
- the real effect and palette lists
- strips that really run the chosen effect (6c's JS port of FX.cpp)
- the real /home page with animated previews on every effect and mood

Folder (shared, outside the repo): `C:\Users\DigvijayPatilLM\Downloads\WLED-main\hg_team\virtualdev\`
Node 18+ and CommonJS. **No npm installs.** The repo `C:\Users\DigvijayPatilLM\Downloads\WLED-main\WLED-main` is READ-ONLY.
Run: `node server.js [--port 8091]` → http://127.0.0.1:8091/ (WLED UI) and http://127.0.0.1:8091/home

## Inputs (read-only)

| What | Where |
|---|---|
| Effect engine (6c, still growing) | `FXSIM = C:\Users\DIGVIJ~1\AppData\Local\Temp\claude\c--Users-DigvijayPatilLM-Downloads-WLED-main-WLED-main\b54148d1-217a-4d8e-b591-f4d3d87915c8\scratchpad\fxsim\`: `core.js` (FXS), `fx_p1.js`..`fx_p5.js`, `SPEC.md` (API), `fxmeta.json` (real effect list with ids), `palettes_demo.json` (72 real palettes), `bundle.js` |
| Real built WLED web UI | generated headers in the isolated build copy `C:\Users\DIGVIJ~1\AppData\Local\Temp\claude\c--Users-DigvijayPatilLM-Downloads-WLED-main-WLED-main\1c74d954-61d4-48b6-a5ac-753d266cf64d\scratchpad\buildenv\WLED\wled00\html_*.h` and `js_*.h` (gzip byte arrays, as on the device) |
| Current firmware (source of truth for /home/*) | `hg_team\2a_v22\home_gadgets.cpp` (RC3b + v2.2), `hg_team\2a_v22\SPEC.md` (/home/ws frames) |
| Existing mock of the usermod | `hg_team\testbench\server.js` + `README.md` (coordinator's; reuse code, don't edit) |
| Websocket helper | `virtualdev\wslib.js` (written by 2a): `acceptUpgrade(req, socket)` returns a client with `.on('text')`, `.on('close')`, `.sendText()`, `.sendBinary()`, `.close()`, `.query`, `.bufferedAmount`; plus `refuseUpgrade(socket, status)` |

Load FXS in Node: `const FXS = require(FXSIM + 'core.js'); for (p of ['fx_p1.js', ...]) require(FXSIM + p);`. Wrap each in try/catch,
because 6c may be mid-edit. A missing effect falls back as FXS does. The path can be overridden with `--fxsim <dir>`.

## Modules (each agent owns its files)

| File | Owner | Exports |
|---|---|---|
| `device.js`, `server.js` | agent DEVICE | see below |
| `core_api.js` | agent CORE | `{ handle(req, res, dev) → bool, upgrade(req, socket, dev) → bool }` |
| `home_api.js` | agent HOME | `{ handle(req, res, dev) → bool, upgrade(req, socket, dev) → bool }` |
| `www/home.htm` | agent PAGE | the /home page (served by home_api) |

### device.js (the one shared model; everything else goes through it)

```js
const dev = require('./device.js');   // singleton; starts rendering on first require
dev.LEDS            // 120: LED 1 = segment 0 (LEDs 0-59), LED 2 = segment 1 (60-119)
dev.effects         // string[]: index = effect id, names exactly as /json/eff on the real build (incl. "RSVD" gaps)
dev.fxdata          // string[]: as /json/fxdata (metadata after the name's '@', "" if none)
dev.palettes        // string[]: as /json/pal
dev.palx(page)      // as /json/palx?page=N on ESP32: {m: lastPage, p: {id: [[pos,r,g,b]...] | ["r",..] | ["c1",..]}}, 8 per page
dev.state()         // full /json/state object like WLED (on, bri, transition, ps, pl, lor, mainseg, seg: [...] with id, start, stop,
                    //  len, grp, spc, of, on, frz, bri, cct, set, col [[r,g,b],[r,g,b],[r,g,b]], fx, sx, ix, pal, c1, c2, c3, sel, rev, mi,
                    //  o1, o2, o3, si, m12)
dev.info()          // /json/info-like object (ver "17.0.0-dev (virtual)", leds {count, rgbw:false, ...}, name "Home Gadgets (virtual)",
                    //  fxcount, palcount, ...)
dev.applyState(o)   // WLED /json/state POST semantics: on (bool | "t"), bri, seg (array or object, by id), col, fx (+ fxdef:true
                    //  applies the metadata defaults), sx, ix, c1-3, o1-3, pal, on/bri per seg. A "HomeGadgets" key is emitted
                    //  as the 'usermod' event. Returns the new state
dev.pixels()        // Uint32Array(120) of the CURRENT frame, 0xWWRRGGBB, NOT brightness-scaled (like the device buffer)
dev.on(ev, cb)      // 'state' (after any change, for websocket pushes), 'frame' (every render tick), 'usermod' (obj)
```

Rendering: every 24 ms (about 42 fps, WLED's FRAMETIME), each segment gets FXS.makeSeg / FXS.step with its fx name, sliders,
colours, palette and length. Palettes are loaded with FXS.setPalettes from dev.palx pages. An effect change restarts it.
A segment that is off, or global on=false, renders black.

### server.js (agent DEVICE)

An http server. Route order: `home_api.handle`, then `core_api.handle`, then 404. Upgrades: `/home/ws` → `home_api.upgrade`,
`/ws` → `core_api.upgrade`, anything else → `refuseUpgrade(404)`. Prints both URLs.

## Page previews (agent PAGE)

- The page loads the engine lazily from `GET /home/fx.js` (home_api serves 6c's `core.js` + `fx_p*.js` concatenated,
  or 6c's bundle). It does that when the Adjust panel or the Moods tab first opens. If it's missing (404, e.g. old firmware), the page shows no previews and nothing breaks.
- Palettes: `GET /json/palx?page=0..m`, fetched one at a time (the device has one JSON buffer), then `FXS.setPalettes`.
- **Every effect row** in the Adjust list shows an animated `FXS.preview` bar with the strip's current colours and palette and that effect's
  default sliders (fxdata defaults). Only visible rows animate. The **selected** row keeps the REAL `/home/ws` stream (v2.2).
- **Every mood tile** shows its mood animated. Built-in moods need their look in `GET /home/cfg` `bm` → **contract v2.3**:
  each `bm` item gains `"pal"` (palette name), `"sx"`, `"ix"`, `"bri"` and `"col":[3 x 0xRRGGBB]`, next to `n`, `fx`, `snd`, `g`.
  Custom moods already carry their full look in `cfg.moods`.
- On-screen colour = `c x (bri/255)^(1/2.2)` (the same as 6c and v2.2).
