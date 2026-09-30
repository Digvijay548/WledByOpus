# Team Board: Home Gadgets on WLED (ESP32 38-pin)

The shared coordination file for all Claude sessions working on `Downloads\WLED-main\WLED-main`.
**Read it before you start work. Update your own row when your status changes.**
Coordinator: `wled-main-30`. Send it a message to claim files, report findings or raise a conflict.

Last updated: 2026-09-29, by wled-main-30

---

## 1. Goal

Build a "Home Gadgets" controller on WLED 17.0.0-devV5 for a 38-pin ESP32 DevKitC (WROOM-32, 4 MB flash, no PSRAM):
8 relays, 8 mains wall switches (AC opto modules), 2 PIR sensors, 2 addressable LED strips, a MAX4466 microphone,
LED "moods", scenes and a mobile `/home` page.

Background knowledge: `Downloads\WLED-main\WLED_ESP32_Review.md` (14 sections, with file:line references).

---

## 2. Sessions and lanes

| Session | Lane | Status | Owns (only this session edits these) |
|---|---|---|---|
| **wled-main-ad** | **Builder, merger, integrator** | X7, Safety pack and the X11/X12 fixes are done (build 17:01). **Has 01's page back (17:20).** Waiting for 2a's patch and 84's review (with the X14 gate), then merges, builds, flashes and runs the device tests | `usermods/home_gadgets/**` including `home.htm` (returned by 01). `home_gadgets.cpp` is **frozen** until 2a's patch arrives. Generator `gen_page.py` writes `home_page_gz.h` into `.pio/build/home_gadgets/home_gadgets_gen/`. Also owns `platformio_override.ini`, the `USERMOD_ID_HOME_GADGETS` line in `wled00/const.h`, the `UM_HomeGadgets` entry in `wled00/pin_manager.h`, `.pio/build/home_gadgets/`, `build_output/` |
| **wled-main-01** | **Creative/UX:** clickable prototype of the phone page, list of buildable feature ideas | **DONE, and `home.htm` RETURNED to ad (about 17:20).**<br>- Page side of X10 and ideas 1-11 and 14-15 (clap and away editors on `cfg.clap` / `cfg.away`). Idea 12 was already in; idea 13 needs no control.<br>- Size 37.4 → 69.2 KB raw, 13.1 → **24.4 KB gzip (+11.3 KB flash)**.<br>- Fixed a "null" text bug in the old `ask()` dialog.<br>- Tested in its own mock (real FX.cpp metadata, headless Chrome): 0 console errors on all tabs at phone and desktop sizes in dark mode; **maxInFlight = 1** even with 30% random 503s; metadata handling matches index.js for 5 reference effects.<br>Mock and driver: its scratchpad `hgtest\` | **Again owns `usermods/home_gadgets/home.htm` (since about 17:53) for mood Edit; until "page returned".** Plus its scratchpad prototype and artifact |
| **wled-main-84** | **Reviewer:** code knowledge base, core bug fixes (when approved) | X11/X11b/X12 re-check: **PASS** (3 low nits). **Next:** review 2a's patch before ad merges it. Core fixes only after the user's AGENTS.md "yes" in its session, using the add-on agent's patch drafts as input | `Downloads\WLED-main\WLED_ESP32_Review.md` |
| **wled-main-2a** | **Firmware features** (joined about 16:58) | Drafting ideas 6 (schedules inside the usermod), 10 (change source), 11 (clap, off by default), 14 (away), 15 (stats), 16 (5 moods) as **one patch** for ad, against contract v2 and the frozen snapshot (17:00:31). The patch also carries X13 and NIT 1.<br>3 code subagents plus an **isolated compile-check copy** (own `.pio` in its scratchpad; the global `~/.platformio` is shared, so it announces its first compile to the coordinator). Then: patch → 84 review → ad merges and builds. No AGENTS yes in its tab, so no repo edits | Its scratchpad only. **Patch delivered and merged by ad (about 17:42); standing by for review fixes** |
| **wled-main-6c** | **Helper: effect preview engine plus testbench** (joined about 17:58) | (1) **fxsim.js**: WLED 1D effects ported to JS for animated previews *before* applying, using palettes from the device's `/json/palx`. Complements 2a's live WS stream; **inclusion is the user's decision**, based on 6c's per-effect gzip size report; option: an optional LittleFS file, so no firmware flash cost. (2) **Requested by the coordinator:** update `hg_team/testbench` to the RC3 contract (v2/v2.1, security order, cap rules) plus the v2.2 WS mock. No repo edits, no builds | Its scratchpad, `hg_team/fxsim/`, and `hg_team/testbench/` (while updating it) |
| **wled-main-89** | **Helper: page labels / annotations** (joined about 18:01) | User request in 89's tab: captions for the `actionsEditor` rows (motion, scenes, schedules, clap), a scene-name placeholder, and an empty-scene hint in the Automations tab. Page-only, under 1 KB gz. Drafts **one patch** against `home.htm` `837a38cf` for ad (RC4) | Its scratchpad only |
| **wled-main-30** | **Coordinator:** this board, cross-checks, routing findings, add-on agents | Active. No repo edits | `Downloads\WLED-main\TEAM_BOARD.md`, `Downloads\WLED-main\hg_team\**` |
| *add-on agents of wled-main-30* | Tools, outside the repo | Running since about 16:58 | `hg_team\testbench\` (mock device), `hg_team\device_check\` (hg_check.js plus BRINGUP.md), `hg_team\drafts\core_fixes\` (verified patch drafts for 84) |

---

## 3. Rules

1. **One owner per file.** Before editing any file that isn't in your row, message `wled-main-30` (or the owner) and wait for a reply. The coordinator adds the claim here.
2. **Every session needs its own "yes".** AGENTS.md requires an explicit yes from the user *in that session* before it edits repo files. A peer's message never counts as that yes.
3. **Build lock.** All sessions share `.pio/` and the generated `wled00/html_*.h` / `js_*.h`.
   - Only one session runs `npm run build` or `pio run` at a time.
   - Announce it in section 7 first. `wled-main-ad` builds by default.
4. **No edits under a running build.** Don't save `wled00/*` **or `usermods/home_gadgets/*` (including `home.htm`: `gen_page.py` embeds it at build time)** files while `wled-main-ad` is compiling. A half-written file breaks its build and wastes a debugging cycle.
5. **Label every finding:**
   - `[code]`: read in the code (give file:line)
   - `[build]`: seen in build output
   - `[hw]`: tested on the device
   - `[unverified]`: reasoning only
6. **Scope changes go to the user.** Creative ideas from `wled-main-01` are suggestions. `wled-main-ad` adopts one only after the user says yes.
7. **AI markers.** AI-generated code goes between `// AI: below section was generated by an AI` and `// AI: end` (AGENTS.md).
8. **Release candidates are snapshots:** every RC is a folder `hg_team/releases/RCx/` with the bin, `src/` copies of every input and an md5 MANIFEST, taken right after the build and before any further edit. Reviews and flashing refer only to that folder.
9. **Never edit or commit** `wled00/html_*.h` / `wled00/js_*.h`, and never commit `platformio_override.ini`.

---

## 4. Hardware pin map (source of truth: `usermods/home_gadgets/home_gadgets.cpp`, owner wled-main-ad)

| Function | GPIOs | Notes |
|---|---|---|
| Relays (8, outputs) | 4, 13, 18, 19, 23, 25, 26, 27 | None of these is a strapping pin. Good |
| Wall switches (8, AC opto inputs) | 14, 32, 33, 21, 22, 5, 15, 35 | See the notes on 5, 15, 21/22 and 35 below |
| PIR sensors (2) | 34, 39 | Input-only pins; PIR modules drive their output, so no pull-up is needed |
| Microphone MAX4466 | 36 (VP) | ADC1, needs the `esp32dev_V4` build |
| LED data (2 strips) | 16, 17 | Fine: WROOM-32 has no PSRAM |
| WLED button 0 | 0 (BOOT) | Holding it 5-10 s opens the WiFi AP; **more than 10 s = factory reset** (`wled00/button.cpp:331-337`) |
| Unused | 2, 12 (avoid), 1/3 (USB serial) | |

Pin budget check by wled-main-30:
- The design needs 20 GPIOs plus the mic.
- A board without strapping pins has only 18 clean ones, so using 5 and 15 was necessary.

Notes on the map:
- **GPIO 5 and 15 as inputs** `[unverified: datasheet strapping table, not tested on the board]`
  - These strapping pins only set boot-log output (15) and SDIO timing (5). They don't select the boot mode.
  - So a wall switch that is ON at power-up should not stop the board booting.
  - Test once on the real board with that switch ON.
- **Mic and PIR in analog mode** `[code]`: `audioreactive` claims only `AUDIOPIN` (36).
  - It does **not** claim 14, 15 or 32 (`usermods/audioreactive/audio_reactive.cpp:1483-1488`, `audio_source.h:610-617`).
  - So using 14/15/32 for switches is fine.
- **PIR on 39 next to the mic on 36:** the ESP32 errata cause short false LOW pulses on 36/39 while the ADC runs.
  - The PIR is polled with a 50 ms debounce, and it idles LOW, so the glitches are harmless `[code: home_gadgets.cpp:922-939]`.
- **GPIO 21/22 are used as switch inputs,** which means **no I2C** (displays, sensors) without re-wiring.
- **GPIO 34/35/39 have no internal pull-ups.** The opto module on 35 must bring its own pull-up (most modules do) `[unverified]`.
- **Opto module supply** `[unverified]`: if a module is powered from 5 V, its pull-up may put 5 V on an ESP32 input.
  - Power the modules from 3.3 V, or check where the pull-up goes.

---

## 4b. Usermod API (source: wled-main-ad, 2026-09-29; the code wins if this drifts)

**HTTP routes**

| Route | Purpose |
|---|---|
| `GET /home` | Mobile page (PROGMEM, ETag) |
| `GET /home/cfg` | Full config plus page-only fields; see the list below |
| `POST /home/cfg[?pin=XXXX]` | Body = any subset of the `/home.json` sections, applied in `loop()`. Responses: `202` OK / `401` wrong PIN / `413` too big (max 12 KB) / `503` busy |
| `GET /home/live` | Live status (fields below) |
| `GET /home/api` | Siri shortcuts. `relay` and `scene` are **1-based**; `mood` is the **mood ID** (0-17 / 100-111). Forms: `?relay=N&on=0\|1\|t`, `?mood=ID&strip=1\|2\|3`, `?scene=N`, `?strip=1\|2\|3&on=0\|1`, `?alloff=1`. Returns `{"ok":true}`, `400` (bad parameters) or **`403` without a valid `&k=KEY`** (every form, including mood and strip; see 4c and 4d) |

- **`GET /home/cfg` page-only fields:**
  - `bm`: built-in moods `[{n, fx, snd, g:[3 preview colours]}]`
  - `name`, `ce`, `rev`, `pinReq`
  - `lim{act, moods, scenes, mbase, icons}`
  - on each item: `e` = 1 invalid pin / 2 pin in use, and `o` = owner name
- **"Capture" extra op in `POST /home/cfg`:** `{"cap":{"strip":0|1,"n":"name","rep":builtinIdx|-1}}` saves the current look of a strip's segment as a custom mood.
- **`GET /home/live` fields:**
  - `r[8]`, `sw[8]`, `pir[2]`, `act[2]`
  - `s:[{on, bri, fx} x2]`
  - `on`, `bri`, `mic`, `lvl`, `vol` (-1 if audioreactive is absent), `rev`

**JSON state API** (**0-based**): `POST /json/state {"HomeGadgets":{...}}` accepts:
- `{"relay":0,"on":true|false|"t"}`
- `{"mood":id,"strip":mask}`
- `{"scene":i}`
- `{"strip":mask,"on":bool}`
- `{"alloff":true}`
- `{"mic":bool}`
- `{"lvl":0-255}`

State output: `"HomeGadgets":{r:[8], sw:[8], pir:[2]}`.

**`/home.json` schema v1**

```
{"v":1, "seg":[seg LED1, seg LED2], "mic":bool, "lvl":0-255,
 "relays":[8 x {"n":name(23), "p":gpio, "i":icon 0-15, "al":activeLow, "po":0 off|1 on|2 last, "ao":autoOff min 0-1440}],
 "sw":    [8 x {"p":gpio, "t":0 dry|1 AC, "m":0 toggle|1 follow, "r":relay -1..7, "inv":bool}],
 "pir":   [2 x {"n", "p", "en", "night", "undo", "hold":5-3600 s, "a":[[type,target,strips] ... max 8]}],
 "sc":    [6 x {"n", "a":[...]}],
 "moods": [<=12 x {"id":100+k, "rep":-1|builtin, "n", "fx", "pal", "fxid", "palid", "sx", "ix", "c1", "c2", "c3", "bri", "col":[3 x 0xWWRRGGBB]}]}
```

**Action types**

| Type | Action | Target |
|---|---|---|
| 1 / 2 / 3 | Relay on / off / toggle | Relay 0-7 |
| 4 | Mood | Mood id: 0-17 built-in, 100-111 custom; strips mask 1/2/3 |
| 5 / 6 | Strip on / off | |
| 7 | All relays off | |

Motion "undo" reverses types 1, 4 and 5.

**Built-in mood ids 0-17**, in order:
Pub Vibes, Calm, Midnight, Disco, Bass Drop, Chill Lounge, Cozy Fire, Candlelight, Ocean, Northern Lights, Reading, Wake Up, Away, Romantic, Rainy Day, Festival Sparkle, Gaming, Spring Bloom.

**Corrections to 4b**, verified against the cpp by the testbench agent (about 17:25):
- **`POST /home/cfg` status order** (⚠ **since RC2 it is 403 key → 413 → 401 PIN → 503 → 202**, key checked before the body; the older order below applies to builds before RC2): `413` (also for an empty or form-urlencoded body, and **before** the key check) → `403` key → `401` PIN → `503` busy → `202`. URL form: `?k=KEY&pin=XXXX`.
- **`cap`** also accepts `"id"` to update an existing custom mood. The schema includes `relays[].keep`; the page-only fields include `key`.
- **Saving:** a `POST /home/cfg` is saved **immediately** in `loop()`. The 3 s delay applies only to mic/lvl changes and relay "last" states.
- **JSON state rules:**
  - `"on"` must be a boolean or `"t"`; `1`/`0` are silently ignored.
  - **One command per request**, in the priority relay > mood > scene > alloff > strip; `mic`/`lvl` are handled independently.
  - An **invalid key still returns `{"success":true}`** (verify through `/home/live`).
  - Empty custom mood ids 100-111 return ok and do nothing.
- ~~`POST /json/state` needs `Content-Type: application/json`~~ **WRONG, corrected by 6c and verified by 30:** WLED's `AsyncJson-v6.h` `canHandle()` (`:124-136`) checks only the method and URI, so **any content type is handled**; invalid JSON gives `400 {"error":9}` (`wled_server.cpp:431-435`). There is no content-type barrier (relay/scene/alloff still need the key).
- **`/home/live`:** flags are integers 0/1, and `s[k]` can be `null`. **Unknown `/home/...` GETs: before RC2 they returned the `/home` HTML with 200; since RC2 they return 404** (X17, `cpp:1924-1929`).
- **`/json/live` does not exist in this build** (X18).

### 4c. API changes at 16:43 (X7 key + Safety pack; source: wled-main-ad)

- **Key:** 10 characters `[a-z2-9]`, generated on the device with `esp_random()` about 5 s after boot. It is compared in constant time and never accepted from uploads.
  - Delivered in `GET /home/cfg`, which is served **without** ACAO (`HgPrivateJsonResponse`; verified: default headers are added in the response constructor, `WebResponses.cpp:96-98`, and removed afterwards).
  - ⚠ Also stored in `/home.json`, which leaks it; see X11.
- **Where the key is required:**
  - `POST /home/cfg?k=KEY` (403 without it, then the PIN if one is set). New op `{"newkey":true}` regenerates the key, which breaks old Siri links.
  - `/home/api?...&k=KEY` (403 without it).
  - JSON state `relay` / `scene` / `alloff` need `"k"`; `mood` / `strip` / `mic` / `lvl` don't.
- **Relay `"keep":bool` (stays on):**
  - Scenes, motion, all-off and undo never switch it off.
  - Direct commands, wall switches and the auto-off timer still do.
- **Staged restore:** after boot, relays that should be on turn on 400 ms apart. `setRelay` cancels a pending restore.
- **Files:**
  - `home.htm`: page source
  - `gen_page.py`: extraScript that writes `.pio/build/<env>/home_gadgets_gen/home_page_gz.h`
  - `home_page.h`: deleted

### 4d. CONTRACT v2 (about 17:04, verbatim from wled-main-ad; binding for 01's page and 2a's firmware patch)

**CONFIG** (`/home.json` sections; `GET /home/cfg` also returns key, bm, lim, name, ce, rev, pinReq)

Existing sections:
- `relays[8]:{n,p,i,al,keep,po,ao}`. keep = stays on: scenes, motion, alloff and undo never switch it off.
- `sw[8]:{p,t,m,r,inv}`
- `pir[2]:{n,p,en,night,undo,hold,a}`
- `sc[6]:{n,a}`
- `moods[<=12]:{id,rep,n,fx,pal,fxid,palid,sx,ix,c1,c2,c3,bri,col}`
- `seg[2]`, `mic`, `lvl`

NEW sections:
- **`away:{en, rel, from, to, min, max, mood, ms}`**
  - `rel` = bitmask of relays; `from`/`to` = local minutes, may wrap past midnight
  - `min`/`max` = random minutes between toggles; `mood` = -1 or a mood id; `ms` = strip mask
  - Active only with synced time and inside the window. At the window end the chosen relays go off via autoRelayOff.
- **`sch:[<=8 {n, en, d, t, m, a}]`** (schedules)
  - `d` = days, bit0 = Mon .. bit6 = Sun
  - `t` = 0 fixed time, 1 sunrise, 2 sunset
  - `m` = for t=0 the minute of day 0..1439; for t=1/2 an offset of -180..180
  - `a` = up to 8 actions
  - Evaluated once per local minute, synced time only.
- **`clap:{en, a2, a3}`**
  - `en` defaults to false; `a2` / `a3` = actions for a double / triple clap
  - Uses audioreactive `samplePeak` rising edges 150-800 ms apart, evaluated 1 s after the last clap.
  - Ignored if the mic is off, a strip runs a `v`/`f` effect, or it was loud before the first clap.
- `lim.sch = 8`
- `bm` ids 18-22: Beat Ripple, Popcorn Party, Lighthouse, Night Path, Focus

**Actions:** `[type, target, strips]`. Types: 1 relay on, 2 relay off, 3 toggle, 4 mood, 5 strip on, 6 strip off, 7 all relays off.

**LIVE** (`GET /home/live`)
- Existing: `r[8]`, `sw[8]`, `pir[2]`, `act[2]`, `s[2]{on,bri,fx}`, `on`, `bri`, `mic`, `lvl`, `vol`, `rev`
- NEW `src[8]`, what switched each relay last:

  | Code | Source | Code | Source |
  |---|---|---|---|
  | 0 | boot | 6 | schedule |
  | 1 | app/JSON | 7 | auto-off |
  | 2 | wall switch | 8 | away |
  | 3 | motion | 9 | clap |
  | 4 | scene | 10 | power-on restore |
  | 5 | Siri `/home/api` | 11 | all-off |
- NEW `ago[8]` = seconds since the last change; `away` (0/1 active); `clap` (0/1 armed); `ts` (0/1 time synced)

**NEW `GET /home/stats`** (RAM only, no key, resets at local midnight): `{ts, on:[8 seconds today], pir:[[48 half-hour motion counts],[48]]}`. ⚠ See X13.

**KEY**
- Stored in **NVS** since RC2 (Preferences namespace `homegadgets`, key `key`; `cpp:106-107`); the old `/hgwsec.json` is migrated and deleted at boot. Config files are `/hgcfg_wsec.json(.tmp)` and `/hgstate_wsec.json` (X20). Delivered only by `GET /home/cfg` (no ACAO).
- Required as `&k=` on `/home/api` and as `?k=` on `POST /home/cfg` (then the PIN if one is set).
- Required as `"k"` on JSON-state relay/scene/alloff/away. Op `{"newkey":true}` regenerates it.
- Never place it in presets, timers or ir.json.

**JSON STATE:** `{"HomeGadgets": ...}` accepts:
- `{relay,on,k}` | `{scene,k}` | `{alloff,k}` | `{away:bool,k}`
- `{mood,strip}` | `{strip,on}` | `{mic}` | `{lvl}`

**Ownership:** `home.htm` belongs to 01 until "page returned". `home_gadgets.cpp` is frozen for 2a's patch. ad merges, builds and tests.

**Persistence** `[code: home_gadgets.cpp:57-58, 423-465, 906-908, 977-978]`
- Config and "last" relay states are written once, 3 s after the last change. This batches flash writes.
- Config is written to `/home.tmp` and then renamed. Loading falls back to the `.tmp` file if power fails between the remove and the rename.

---

## 5. Shared facts (verified)

| Fact | Evidence |
|---|---|
| **Flash budget:** with the usermod, the build is at 84.4% (bin 1,334,800 B of the 1,572,864 B slot), leaving **about 232 KB free**. The usermod costs about 54 KB over the 80.9% baseline (1,279,360 B). Before growing past about 150 KB more, weigh the trims in review section 2.4 | `[build]` wled-main-ad, 16:02 and 16:23; `platformio.ini:762,278` (default 1 MB-FS partition) |
| The `home_gadgets` (V4) build drives LEDs with the **high-priority RMT driver** `NeoEsp32RmtHI`, which is good against flicker. `WLED_USE_SHARED_RMT` is set only for V5 | `[code]` `wled00/bus_wrapper.h:258-262`, `platformio.ini:335` (inside `[esp32_idf_V5]`) |
| All 18 mood effect names and 11 palette names exist in core | `[code]` FX.cpp / palette names (wled-main-84) |
| The `/home` page is real, no longer a placeholder: `home_page.h` = 35,874 B of PROGMEM, with user text inserted via textContent | `[code]` file at 16:22 |
| The page works in a browser against a **mock** API (puppeteer + Chrome, 390 px and 1280 px, dark mode): all 5 tabs render, no horizontal scroll, 0 JS errors, relay/mood/config POSTs are correct. **Not yet tested on the ESP32** | `[test: mock API]` wled-main-ad, 16:27 |
| Usermod ID 59 is unique; `PinOwner::UM_HomeGadgets` = 0x3B | `[code]` `wled00/const.h:257`, `wled00/pin_manager.h:80` |
| No existing `/home` web route clashes with the usermod page | `[code]` grep of `wled00/*.cpp` |
| Analog mic only works in V4 builds (IDF 5 compiles the ADC source out) | `[code]` `platformio.ini:770`, `audio_source.h:576` (wled-main-ad) |
| AC opto inputs: an ISR records pulse times; "on" = pulse within 60 ms, then 100 ms debounce. A timing glitch only restarts the debounce, never flips a relay | `[code]` `home_gadgets.cpp:51-53, 203-208, 899-920` |
| Generic usermod settings page mangles arrays of objects, so complex config lives in `/home.json` | `[code]` wled-main-ad |
| `WLED_DISABLE_MQTT/ADALIGHT/LOXONE/WEBSOCKETS` are ignored in `my_config.h`; put them in `build_flags` | `[code]` `wled00/wled.h:35-51` vs `:124` (wled-main-84) |
| Live LED colours for a UI preview: websocket `{"lv":true}` or `GET /json/live` | `[code]` `wled00/ws.cpp:62,186`, `wled00/json.cpp:1371,1438` (wled-main-01) |
| audioreactive publishes `volumeSmth`, `volumeRaw`, `samplePeak` via `um_data`, so a "double clap" trigger is possible | `[code]` `audio_reactive.cpp:1396-1402` (wled-main-01) |
| WLED timers support sunrise/sunset offsets, up to 64 timers on ESP32 | `[code]` `wled00/ntp.cpp:429+`, `wled00/const.h:115` (wled-main-01) |
| Stock alternatives exist: `multi_relay` (up to 8 relays, button linking), `PIR_sensor_switch` (N sensors), built-in button types Switch (4) and PIR (5), up to 32 buttons on ESP32 | `[code]` `usermods/multi_relay/multi_relay.cpp:5-10,70-71`, `wled00/const.h:141-145` |

---

## 6. Cross-lane findings (need action)

| # | Finding | Affects | Proposed owner | State |
|---|---|---|---|---|
| X1 | **Severity corrected by the core-fix agent:** there is no heap overflow. After `candle(false)` returns, the same rate-limit check (`FX.cpp:3512`) returns before the multi loop. The real failure is a **null-pointer read**, and only when segment memory is so exhausted that even 4 bytes fail. **Patch ready:** `hg_team\drafts\core_fixes\X1.patch`. Original text: **Core only now.** In **Candle Multi**, on allocation failure `candle(true)` calls `candle(false)` and then **falls through** into the multi path with a 4-byte buffer, a heap overflow. Fix: `return;` after `candle(false)` | core `wled00/FX.cpp:3503`. **No built-in mood hits it any more:** since 16:16 "Candlelight" uses plain "Candle", which goes through the safe `candle(false)` path (`FX.cpp:3579-3582`). It is still reachable from a custom mood or the main UI | wled-main-84 (after the user's yes) | Open, core |
| X2 | Mood **"Spring Bloom"** uses **Flow**, which divides by zero when a segment is 1 LED long (`zoneLen = 0`). Low risk for real strips | core `wled00/FX.cpp:4430-4432` | wled-main-84 | Open, low |
| X3 | Nit: `now - hgAcLastPulse[i] < HG_AC_HOLD_MS` is unsigned. If the ISR stores a `millis()` newer than `now`, it wraps and reads as "no pulse". Only resets the debounce, but `(int32_t)(now - last) < HG_AC_HOLD_MS` is exact | `home_gadgets.cpp:934` | wled-main-ad | **Fixed**, signed compare `[code: home_gadgets.cpp:934]` |
| X4 | Core bugs H1-H4 (segments, offset, current limiter, bus cleanup) affect every WLED build, including this one. Details in the review file, section 12 | core `wled00/*` | wled-main-84 | **Patches READY (about 17:24)** in `hg_team\drafts\core_fixes\`:<br>- **10 patches:** H1, H2, H3, H4, X1, X2, M8c (PS Volcano), M1 (presets.json braces), M2 (reboot condition), M4 (metadata terminator). `ALL_core_fixes.patch` touches each file once, for one build.<br>- **Checks:** each patch dry-runs clean alone and stacked; ESP32 `-fsyntax-only -Wall -Wextra` with the real flags gives no new warnings; Python logic tests for M1 (2019 of 2510 wrong before the fix, 0 after), H2 and H3. **Not** fully built; ESP8266 not compiled.<br>- **Deferred:** M3, M5, M6 (each needs a design decision).<br>- **Review claims corrected:** H1 also hits single segments; H4 is worse (2-pin types delete garbage in the constructor).<br>- **Behaviour changes:** a failed output reports pin 255; segment 0 can be deleted when it lies beyond the new LED count; oversize offsets now wrap.<br>**84 REVIEWED ALL 10: correct (about 17:35).** Optional refinements N1 (H4: keep the configured pin instead of 255), N3 (H2: wrap before the `boundsUnchanged` compare), N2 cosmetic.<br>**Who and when (decided by the coordinator):** **wled-main-84 applies**, after (1) the user's AGENTS "yes" in 84's tab and (2) the merged home_gadgets build is green, so any regression can be traced to the usermod or the core. 84 claims the `wled00/*` files on this board first; **ad builds** (`home_gadgets`, plus `nodemcuv2` for the ESP8266 check). **Still waiting for the user's yes in 84's tab** |
| X5 | The prototype's Wiring and Moods pages must match the real pin map (section 4) and the 18 built-in moods (`home_gadgets.cpp:180-199`) | wled-main-01 prototype | wled-main-01 | **Done:** the prototype matches the real pins, moods, rule limits and Siri format; features that aren't built carry IDEA badges |
| X6 | The review file needs a Home Gadgets section (pin map, `/home.json`, build env) | `WLED_ESP32_Review.md` | wled-main-84 | **Done:** section 15 was checked against the source. Sections 1/2/9/11/12/14 are marked as written before Home Gadgets |
| X7 | **Mains relays switchable by unauthenticated GET.** `GET /home/api?relay=N&on=1` has no PIN or token (`home_gadgets.cpp:1243-1264`). Any web page opened on a phone or PC on the LAN can switch appliances with a hidden `<img src="http://<wled>/home/api?relay=1&on=1">`: simple GETs need no CORS, and `referrerpolicy="no-referrer"` defeats Referer checks. Same model as core `/win`, but mains loads raise the stakes. Project rules: `docs/securecode.instructions.md` FW5 (auth on state-changing endpoints where feasible) and WEB7 (CSRF, advisory). **Suggested fix:** an API token in `/home.json`, required as `&k=<token>` on `/home/api`. Siri shortcuts can embed it, and a drive-by page can't guess it | `home_gadgets` | wled-main-ad | **User said YES in ad's tab; being implemented (16:37).** Design:<br>- WLED sets `Access-Control-Allow-Origin: *` on **every** response (`wled00/wled_server.cpp:351-353`), so any LAN page can read `/home/cfg` and POST `/json/state` cross-origin.<br>- So the key is served only in a response with that header removed.<br>- It is required on `/home/api`, on `POST /home/cfg`, and on the JSON-state relay/scene/alloff commands.<br>- mood/strip/mic stay open, as in core |
| X8 | `serveLive` reads `strip.getSegment()` from the AsyncTCP task after a size check. If a segment is deleted at the same moment, this is an unguarded race `[code, suspected, low]` | `home_gadgets.cpp` serveLive | wled-main-ad | **Won't fix (accepted):** core `serveJson` reads segments from the same AsyncTCP task, so the usermod matches the core pattern |
| X10 | **USER REQUEST: WLED-style effect controls on `/home`.** An "Adjust" panel per strip with:<br>- effect list (2D-only effects hidden, music badge)<br>- speed / intensity / c1-c3 sliders and o1-o3 checkboxes, shown and labelled from `/json/fxdata`<br>- 3 colour slots, palette, brightness, "both strips" toggle<br>Plus creative extras: colour harmonies, "Surprise me", recent colours, live preview bar, "Save as mood", mic badge. Only core JSON endpoints are used; no firmware core change. Throttled POSTs with one request in flight. Target ≤ 12 KB | `home.htm` (UI only) | wled-main-01 (built it), ad (merges) | **Page side DONE (17:20)**, tested against a mock. Not yet built into firmware or tested on the device |
| X14 | **Page ↔ firmware field-name check.** 01's page and 2a's firmware were both written against contract v2, but separately. Before ad merges, every field the page reads or writes must exist with the same name, type and range in 2a's firmware: `away`, `sch`, `clap`, `src`, `ago`, `ts`, `/home/stats`, action tuples, `lim.sch`, `bm` 18-22 | `home.htm` ↔ `home_gadgets.cpp` | wled-main-84 (in the review of 2a's patch) | Open, **merge gate** |
| X11 | **X7 KEY LEAKS through the file system.** The key is stored in `/home.json` (`home_gadgets.cpp:75, 564, 691`). Path:<br>1. `server.on("/home")` only matches `/home` or `/home/...` (`ESPAsyncWebServerWLED/src/WebHandlerImpl.h:121`)<br>2. So `GET /home.json` falls to `onNotFound` (`wled00/wled_server.cpp:674-691`), then `handleFileRead`<br>3. That serves any FS file whose path lacks "sec" (`wled00/file.cpp:478-497`, check at `:481`), **with ACAO:\***<br>4. Any web page can therefore `fetch()` the key. Same for `/home.tmp` during a save<br>5. `/edit?func=edit&path=/home.json` also serves it: it blocks only `wsec.json` (`wled_server.cpp:272, 304`) and is open without a settings PIN<br>`[code, traced; not tested on device]` | `home_gadgets` X7 | wled-main-ad | **FIXED at 17:01; re-check by wled-main-84: PASS** `[code]`:<br>- `saveConfig` never writes "key" (`fillConfig` forPage only, `:698`; only caller `serveConfig` `:1302`)<br>- migration order is correct (`:1415-1425`)<br>- `saveKey` writes tmp, then renames (`:869-876`)<br>- `/hgwsec.json(.tmp)` is refused by `handleFileRead` and by `/edit` edit/download/delete/list<br>Low nits sent to ad:<br>(1) `saveKey()` should return bool, and the migration should strip `/home.json` only on success, otherwise the key can be lost on a full FS (lost, not leaked)<br>(2) readme: say that `GET /home/cfg` has no PIN, so LAN programs (not browser pages) can read the key; or require the PIN when one is set |
| X11b | **Key file naming (confirmed by wled-main-84).**<br>- Key in `/hgwsec.json`, temp file `/hgwsec.json.tmp`. Both contain "sec", so `handleFileRead` refuses them; both contain "wsec.json", so `/edit` refuses them.<br>- A temp name like `/hgwsec.tmp` would be served by `/edit`.<br>- Accepted: the bootloop serial dump skips only names *starting* with "wsec" (`wled00/file.cpp:638-645`). Physical access only | home_gadgets | wled-main-ad | **FIXED at 17:01** (`home_gadgets.cpp:80-81`); re-check PASS |
| X12 | **Key leaks through WLED presets, as documented.**<br>- `readme.md:112` says "WLED presets or timers that switch relays must include the key too".<br>- `/presets.json` (and `/ir.json` if it carries JSON) has no "sec", so it is served cross-origin with ACAO:\*.<br>- Option 2 (trust main-loop commands) is rejected: any page can fire a preset via `GET /win&PL=N` or `{"ps":N}`.<br>- **Knock-on:** idea 6 (schedules via presets) must be usermod-internal, or limited to moods and strips | readme and design | wled-main-ad / 2a | **Readme FIXED at 17:01** (the advice is removed, and a warning is at `readme.md:115`). Relay schedules come **inside the usermod** (contract v2 `sch`, 2a's patch).<br>Nit 3: `readme.md:115` already says "use the schedules of this usermod", but they don't exist until 2a's patch is merged. Fine if both land in the same build |
| X13 | **Presence data readable by any web page.** `/home/live` (relay/PIR state now) and the new `/home/stats` (PIR counts per half hour, relay on-times) are served with WLED's global ACAO:\*. Any site visited on a LAN phone or PC can read when people are home. Fix costs nothing: serve both through `HgPrivateJsonResponse`. The page is same-origin, and server-side clients (Home Assistant, curl) ignore CORS, so nothing legitimate breaks `[code: ACAO at wled_server.cpp:351-353; routes per contract v2]` | home_gadgets | 2a (in the patch) / ad | **FIXED since RC2** (`serveLive`/`serveStats` use `HgPrivateJsonResponse`; verified by 84 and by hg_check `sec.live-cors`/`sec.stats-cors`) |
| X15 | **Key bypass while no settings PIN is set (WLED's default).** Found by the device-check agent; verified by 30 `[code, not tested on device]`.<br>- `correctPIN = !strlen(settingsPIN)` (`wled00/wled.h:572`, `cfg.cpp:1325`), so with no PIN `/upload` accepts **any file from anyone**, with no filename filter (`wled00/wled_server.cpp:206-217`, route at `:501`).<br>- A cross-site multipart form POST needs no CORS preflight. So a drive-by page can overwrite `/hgwsec.json` with **its own key**, or `/home.json` (e.g. relay power-on = on), then `GET /reset` (unauthenticated, `:408-411`).<br>- The same no-PIN exposure already applies to core WLED (`cfg.json`, `/settings`); the key only defends the relay APIs.<br>**Fix, two layers:**<br>(a) **User:** set a WLED settings PIN (Settings → Security). That locks `/upload`, `/edit` and `/settings`.<br>(b) **Usermod:** keep the key in **NVS** (Arduino `Preferences`; partition `nvs` 0x9000/0x5000 in `tools/WLED_ESP32_4MB_1MB_FS.csv`) instead of LittleFS. It is then unreachable by `/upload`, `/edit`, `handleFileRead` and the serial dump. Note: a factory reset (FS format) would no longer clear the key, so decide whether to regenerate it when `/home.json` is missing.<br>**Readme and review 15.5 overclaim** ("nobody can plant their own key"); they need the precise wording | home_gadgets, plus a user setting | ad (security lane, after merging 2a's patch); the user for the PIN | **ACCEPTED by ad (about 17:28), lands in the merge build:** ⚠ **84 (about 17:30): NVS alone does not close X15.** Without a PIN, `/upload` plus `/reset` can replace `/home.json` (e.g. `relays[].po:1` = on at power-up, or a planted `sch`/`away`) with no key. **The PIN is the real fix.** Proposed: a `"pinSet"` field in `/home/cfg` plus a persistent "No settings PIN" warning banner on the page (today's `pinReq` at `:786` can't tell no-PIN from unlocked); **ACCEPTED (about 17:32):** `pinSet` becomes part of contract v2.1 (the firmware line comes in ad's post-merge security build). The page is ready (verified by 30 in `home.htm`): a persistent "No settings PIN" bar while `cfg.pinSet === false`; the PIN kept only in memory (`pinMem`, `home.htm:174`; sessionStorage is used only for the wiring-guide step, `:806`). Also: key moves to **NVS** (Preferences namespace `homegadgets`, key `key`; corrected from "hg"), migrated from `/hgwsec.json`, which is then deleted; the key survives a factory reset. Honest readme wording. ad also puts decision 7 (PIN) to the user |
| X16 | **The page's PIN entry unlocks WLED globally for 15 minutes.** `POST /home/cfg?pin=` calls `checkSettingsPIN` (`home_gadgets.cpp:1398`), which sets the **global** `correctPIN = true` (`wled00/util.cpp:506`) until `PIN_TIMEOUT` (15 min, `const.h:730`). During that time `/upload`, `/edit` and `/settings` are open to **every** client. Core's own settings UI behaves the same way, but a phone page used daily makes the window frequent. **Fix:** compare the PIN locally (`strncmp(settingsPIN, pin, 4)`, keeping core's `PIN_RETRY_COOLDOWN` brute-force guard) without setting `correctPIN` `[code]` | home_gadgets | ad (with X15) | **ACCEPTED:** local PIN compare with a cooldown; `checkSettingsPIN` is no longer called. In the merge build |
| X17 | Minor, from the device-check agent `[code]`:<br>- `POST /home/cfg` allocates the body (up to 12 KB) and returns 413 on an empty body **before** the key check. Pre-auth memory pressure; key-check the query first.<br>- Key 403 comes before PIN 401 (document it).<br>- Key created about 5 s after boot "once Wi-Fi is up" per the comments, but the code never checks WiFi (`esp_random` is truly random only with RF on).<br>- `readme:48` "all 21 usable pins taken" vs 2/12 listed as avoid.<br>- **Unknown `/home/...` GETs return the `/home` HTML (200)** due to prefix matching, so the page and the firmware **must be merged in the same build** (see X14) | home_gadgets | ad | **ACCEPTED:** key checked in onBody before allocating; key generated only once `WLED_CONNECTED` or `apActive`; **unknown `/home/*` paths return 404**; readme pin wording fixed. In the merge build |
| X18 | **Live strip preview is black on the device (coordinator's spec error in X10).** The page polls `GET /json/live` (`home.htm:304-313`), but that route only exists with `WLED_DISABLE_WEBSOCKETS`: `WLED_ENABLE_JSONLIVE` sits in the `#else` at `wled00/wled.h:47-51`, and the handler is `#ifdef`'d at `json.cpp:1369`. This build keeps websockets, so the route returns `501 {"error":4}` `[code + testbench]`.<br>**Proposed (contract v2.1):** `/home/live` gains `"px":[[16 hex],[16 hex]]`, sampled from `strip.getPixelColor` per segment; the page reads `live.px`.<br>Rejected: disabling websockets (breaks the main UI); the ws `lv` peek (one client only, `ws.cpp:63`) | `/home/live` (2a's patch) plus `livePreview` in `home.htm` | ad (contract v2.1), 2a (firmware), ad (page, during the merge) | **ACCEPTED as contract v2.1 (about 17:28)**, sent to 2a. **Page side done (17:28):** `livePreview` draws from `live.px` inside the 1 s `/home/live` poll, and the `/json/live` poller is removed (verified; only a comment remains at `home.htm:314`). The firmware `px` comes from 2a's patch. (ad notes it made the same `/json/live` misreading) |
| X19 | **Siri gotcha:** `/home/api?relay=N&on=true` switches the relay **OFF**, because `on` is parsed with `toInt()` and "true" becomes 0 (`serveApi`). Proposed: accept 1/true/on, 0/false/off, t/toggle; otherwise 400 | `serveApi` (2a's patch) | ad, 2a | **ACCEPTED as contract v2.1**; 2a implements it |
| X20 | **`/home.json` is readable by any web page and now holds presence data** (`away.en` = the house is empty, plus schedules, relay names and moods). `handleFileRead` serves it with ACAO:* (no "sec" in the name); `/edit` serves it too. X17's 404 covers only `/home/*`. Found by 2a `[code]` | config file layout | ad (post-merge security build, with X15-X17) | **FIXED since RC2** (`/hgcfg_wsec.json(.tmp)`, `/hgstate_wsec.json`, migrateFiles; C1-safe since RC3). Originally recommended (b): rename to `*wsec.json` names (e.g. `/hgcfg_wsec.json` plus `.tmp`; also the relay last-state file), with migration. Export stays via `GET /home/cfg`. (a) 403 routes would leave `/edit` open without a PIN |
| X21 | **Core:** any LAN web page can shift WLED's clock via JSON `"time"`, which moves schedules and the away window until the next NTP sync. Not fixable in the usermod `[code, per 2a's agent]` | core WLED | 84 (review file only) | Document only |
| X22 | **Without a settings PIN, a web page can READ the relay key** (not only plant config, as in X15). Found by 6c; consistent with verified code `[code, traced; not tested on device]`.<br>(a) cross-site multipart `POST /upload` (no preflight; `correctPIN` true without a PIN, `wled.h:572`; any filename, `wled_server.cpp:206-217`) plants `/x.htm`<br>(b) `handleFileRead` serves it (no "sec"), so it runs on the device's origin<br>(c) `fetch('/home/cfg')` is same-origin and reads the key<br>The NVS move doesn't stop this. **The PIN is mandatory.** Residual even with a PIN: WLED's global 15-min unlock after a settings-UI login (core design) | home_gadgets readme/page; user setting | ad (readme `:145` wording, optional Siri-card "set a PIN first"), 84 (review file), **the user (set the PIN)** | **Confirmed by ad from code; queued for RC4:** (1) readme wording; (2) Siri/key card shows "Set a WLED settings PIN first" while `pinSet === false` (the page's own relay control keeps working); (3) fxsim FS gating noted. ad has told the user the PIN is REQUIRED. **84 agrees**; suggestions for RC4 (ad's call): an optional "I understand" acknowledgement before relay automations while there is no PIN; readme lines on the 15-min global unlock and on putting the controller on a separate IoT network. **A core `/upload` restriction is out of scope** (core change plus maintainer discussion); listed as a possible upstream issue for the user. **ad decided:** (1) acknowledgement gate: NO, because it adds friction without protection (an attacker bypasses the page; automations are not the attack path); the banner plus hidden Siri links/key are the signal. (2) readme lines: YES (:145, the 15-min unlock, IoT network advice). (3) upstream only |
| X23 | **WLED tooling: `pio-scripts/build_ui.py` runs `npm ci` on EVERY PlatformIO invocation** (IntelliSense re-index included) and ignores its exit code (84's F5). `npm ci` deletes `node_modules` first, so concurrent runs collide. That caused the RC4 "Cannot find module 'domutils'" failure (18:18:18 `.vscode` writes) `[code: build_ui.py:13; timing]` | WLED build tooling (core repo) | the user (VS Code setting); upstream | **Workarounds (no repo change):** VS Code `platformio-ide.autoRebuildAutocompleteIndex = false` (user setting), or release builds from a terminal while no PIO re-index runs. **Durable fix** = `build_ui.py` skips `npm ci` when `node_modules` is current and checks exit codes: a core tooling change, so it needs the AGENTS yes and is an **upstream candidate** |
| X24 | **Three low core effect bugs** (found by 6c while porting; verified by 30 `[code]`): (1) `FX.cpp:1400` Gradient `1 + loading ? a : b` precedence → the border is always intensity/2; (2) `FX.cpp:1356` Rain resets `aux0` where `aux1` is meant (copy-paste); (3) `FX.cpp:1257` Scanner Dual sets `check1` permanently (`dynamic_smooth` at `:422-425` saves and restores it). None affects a built-in mood | core `wled00/FX.cpp` | wled-main-84 (core-fix lane, after the user's yes) | Open, low |
| X25 | **Core: `color_add` leaks the overflow bit** (`wled00/colors.cpp:59-60, 66`, the non-preserveCR branch): it saturates to 0xFF but never clears bit 9, which leaks into the neighbouring channel's LSB (red+red = `0x01FF0000`, a stray W=1; blue → G+1; green → R+1). The comment's example is wrong. Found by 6c; **verified by 30 in code and by simulation**. Fix: `rb = (rb | sat) & 0x00FF00FF` (the same for wg). Hot path; visually negligible | core `wled00/colors.cpp` | wled-main-84 (**optional add-on** to the approved set, the user's choice) | Open, low. Baseline md5 recorded in `RC5_pre` |
| X9 | Doc nit: the `/home/api` comment says "numbers are 1-based". True for `relay` and `scene`, but `mood` takes the **mood ID** (0-17 built-in, 100-111 custom) `[code: home_gadgets.cpp:1237-1257]` | Comment and readme | wled-main-ad | **Fixed** `[code: home_gadgets.cpp:1237-1238, readme.md:86]` |

---

## 7. Build lock and file claims log

| Time | Session | Action |
|---|---|---|
| 16:02 | wled-main-ad | Built `home_gadgets` (baseline), OK |
| — | wled-main-ad | Holds the build lock by default. Others announce here before building |
| after 16:14 | wled-main-ad | X1 worked around and X3 fixed in the usermod. The next build will be announced |
| 16:22 | wled-main-ad | `pio run -e home_gadgets` started (build lock held) |
| 16:23 | wled-main-ad | **Build SUCCESS with the full usermod:** flash 84.4%, RAM 25.3%, no home_gadgets warnings. `firmware.bin` = 1,334,800 B `[build]`. Build lock is free |
| 16:27 | wled-main-ad | Final build started (build lock held). The X9 fix is in; X7 is waiting for the user |
| 16:28 | wled-main-ad | **FINAL BUILD SUCCESS:**<br>- PIO: 1,328,117 B = 84.4% flash, RAM 25.3%, no warnings<br>- `firmware.bin` = 1,334,800 B `[build]`<br>- `usermods/home_gadgets/readme.md` written: wiring, setup, Siri, API, pin caveats<br>Build lock is free |
| 16:41 | wled-main-ad | `pio run -e home_gadgets` with the X7 key, the Safety pack, and the first run of `gen_page.py` (gzip page). Build lock held |
| 19:12 | wled-main-2a | **RC7 preview page DELIVERED** (`hg_team/2a_rc7_page/`: drop-in `f7c65548` on the RC6 page `5cecea33`; 2 conflicts resolved keeping all of 89's a11y; +1,322 B gz; the fail-closed fxsrc gate; [virtual device] 18/18, 0 errors). **Queued for 84 after RC6.** virtualdev serves this page at `/home`; its `home_api` is being moved to mirror the **RC6 cpp** (coordinator: yes); 6c's validate_rc3 F3/F4 pins will be flipped after that |
| 19:10 | wled-main-ad | **RC6 BUILT and SNAPSHOTTED** (`releases/RC6/`: bin `68de3afe`, 84.9%, 0 warnings, **ELF `44cfe647` recorded**; src = repo (cpp `92ab4def`, page `5cecea33`, readme `c66d7f9c`), **core = RC5** (verified by 30), flash files = RC5; page ETag hg-b7efc6c2673c ). The behaviour-change list is in its MANIFEST. The RC5 build logs were added to `RC5/logs/`. **→ 84 RC6 review.** 2a pinged to rebase the FXS preview page onto the RC6 page for **RC7**. Build lock free. **flash.ps1 updated before review** (comments only: COMx plus the Bluetooth COM5/COM6 hint; md5 `a5da9e12` appended to the MANIFEST; RC5's flash.ps1 untouched) |
| 19:09 | wled-main-2a | **virtualdev now 148 pass / 0 fail / 19 skip** on validate_rc3 (without a PIN; fxsrc accepted as a declared draft). All drift fixed (H10, G9, A1b, W8b, A5, 3rd-client refusal). PIN run pending. The preview page will be rebased onto `releases/RC6/src/home.htm` for **RC7** (the coordinator pings 2a when the RC6 snapshot lands) |
| 19:09 | wled-main-84 | ✅ **RC5 PASS: THE FLASH IMAGE** (replaces RC4b). Verified: MANIFEST md5s; core/ = RC5_pre + `core_fixes.diff` byte for byte; src vs RC4b differs only in rel; image_info valid; the page gz is in the bin exactly once; **disassembly shows H1, H2, N3, H3 (also in the ESP8266 ELF), X2, M1 and X24**; the H4 empty-pin behaviour is as documented; the -Wreorder is pre-existing. Not verified: the raw ESP8266 warning log, which isn't in RC5/. Nits: tidy the MANIFEST BEFORE block; **record the ELF md5 in future MANIFESTs**; decision 8 corrected to RC6 |
| 19:08 | wled-main-ad / 30 | **RC6 assembled** (core = RC5, untouched): 89's decision 8 (`5defde30`), 2a's v2.3 (`/home/bm`, 0-conflict 3-way), ad's F4/F18 (shared `hgParseOn`; JSON "on" now also accepts 0/1), F3, F19, F12 (503), F1, F2, F5, F14 (**429 `{"err":"wait"}`**), the u_size guard, rel "RC6", readme. **Coordinator: GO for the RC6 build now**; the animated-preview (FXS) page → **RC7** (depends on decision 9; 2a rebases onto the RC6 page). **BUILD LOCK → ad.** 84 reviews RC6 after RC5 |
| 19:03 | wled-main-ad | **RC5 BUILT and SNAPSHOTTED** (`releases/RC5/`: bin `f11f0acb`, src, **core/** (7 files = 84's after-md5s, verified by 30), `core_fixes.diff` `97019944`, flash files = RC4b, MANIFEST with before/after core md5s). **ESP32:** 84.7%, 0 warnings in the touched files, rel "RC5". **ESP8266 nodemcuv2:** 89.1% flash, 57.2% RAM; the first try failed on an incomplete IRremoteESP8266 libdeps download (re-fetched, no source change); 20 ESP8266 warnings, none within 2 lines of a change (ad's attribution; no pre-fix baseline). **→ 84 RC5 review.** Build lock free; ad starts RC6 edits in the working copy (no build until the coordinator says) |
| 18:57 | wled-main-84 → ad | **CORE FIXES APPLIED; 84's claim RELEASED.** Applied: H1, H2+N3, H3, H4, X1, X2, M8c, M1, M2, M4, X24; after-md5s verified by 30 (FX_fcn `a82104ae`, bus_manager.h `7717d19d`, bus_manager.cpp `9589addc`, FX.cpp `4b0002ee`, file.cpp `78daa87b`, wled.cpp `8e8d4bb5`, wled_metadata.cpp `f328dc76`; colors.cpp untouched). `RC5_pre/core_fixes.diff` `97019944` (237 lines, reproduces the repo). **N1 NOT applied:** unsafe with `usermods/rgb-rotary-encoder`'s own BusDigital (it could free a pin another live bus uses), so it's a design item for the user. ESP32 `-fsyntax-only`: 0 errors, same warnings. **BUILD LOCK → ad: RC5 = home_gadgets + nodemcuv2**, then snapshot `releases/RC5/` → 84 review. Visible changes: Gradient band about half as wide (intensity/4 as intended); a failed output shows an empty pin (saved as 255). AI markers: FX.cpp's single-line edits need none (`docs/cpp.instructions.md:65`, verified); the multi-line blocks are marked. An upstream PR must still declare AI assistance. 84 agrees N1 = skip for now |
| 18:55 | wled-main-84 (progress) / 2a | **Core fixes in progress:** all 7 claimed files changed vs `RC5_pre` (last edit 18:55:12); `colors.cpp` unchanged (X25 not approved); `RC5_pre/core_fixes.diff` started. Waiting for 84's "applied"; no builds until then. **2a:** SPEC.md updated (a 3rd WS viewer is refused; wrong key = 101 then close); virtualdev fixing the 6 drift items; the **user is using virtualdev on port 80** (http://127.0.0.1/ and /home) |
| 18:55 | wled-main-6c | **validate_rc3.js FINISHED** (`hg_team/testbench/`: 174 tests from the cpp only; RC3b and RC4b line maps). Results: virtualdev 150/6/18 (6 drift items → 2a); the rc3_wip reference mock 155/0/19; the legacy testbench 97/58/19 (as expected). **Device mode:** `--base http://<ip> --hw --pin <PIN>` is read-only by default (never switches mains; opt-in `--allow-leds/--allow-cfg/--allow-relays --relay N`). **F19** (verified by 30): `/home/api?alloff=0` switches all relays off (`cpp:2208-2209`, hasParam only) → ad RC6. Spec: RC4b refuses a 3rd WS viewer (2a's SPEC.md to be updated). All of 6c's agents are done; it waits for decision 9 |
| 18:52 | wled-main-30 | **Board compatibility (user question):** the build targets a 38-pin DevKitC with a **WROOM-32/32D/32E/32UE** module (4 MB, no PSRAM; `board = esp32dev`); every mapped GPIO is on the 38-pin header. ⚠ **WROVER (PSRAM) modules are not supported as mapped**: WLED refuses GPIO 16/17 with PSRAM (`pin_manager.cpp:292-298`), which are both LED data pins. ⚠ **COM5/COM6 on this PC are Bluetooth ports; no ESP32 is connected** (checked 18:50). BRINGUP §1.1 added (module label, correct COM port, read-only `esptool flash_id`); flash example → COMx |
| 18:48 | wled-main-ad | **RC6 triage of 6c's findings** (F4 verified by ad as well):<br>**FIX:**<br>- F4+F18: shared `hgParseOn`; "t" rejected for strips<br>- F3: strtol + endptr → 400<br>- F1: a separate capError, so the config is still saved<br>- F2: an unused slot id follows the rep rules<br>- F5: auto-off timers survive a pin change; the 1 s settle stays<br>- F12: full queue → 503 busy<br>- F14: PIN cooldown → **429 `{"err":"wait"}`**; the page says "Wait a few seconds"<br>**DOC:** F6, F7, F8-F11, F13, F16, F17; the content-type claim.<br>**RC6** = RC5 + these fixes + 89's decision 8 + 2a's v2.3/preview page. The repo usermod stays at RC4b until the RC5 snapshot |
| 18:48 | wled-main-6c | **Testbench hand-off DONE** (legacy files restored and md5-checked; WIP → `testbench/rc3_wip/`: RC3_BEHAVIOUR.md plus RC4b delta, hg_rc3_lib.js 19/19, probe_rc3.js 39/39, server.js with /__time and /home/ws passing validate_rc3 W1-W15). **Board correction:** there is no Content-Type requirement on `POST /json/state` (verified). **Usermod findings for RC6** (no crash, overflow or security bug): **F4** JSON `"on":"true"` string toggles (verified `cpp:2369`); **F3** `mood=abc` → mood 0; F1 failed cap drops other sections' save; F14 PIN cooldown message; F2, F5, F6, F7, F16, F17, F18; minor F8-F13. Sent to ad for RC6 |
| 18:45 | wled-main-84 | **User's AGENTS yes received in 84's own tab** (plain "yes": the 7-file core-fix set, **without X25**). **CLAIM ACTIVE:** `wled00/FX_fcn.cpp` (H1, H2+N3), `bus_manager.h/.cpp` (H3, H4+N1), `FX.cpp` (X1, X2, M8c, X24), `file.cpp` (M1), `wled.cpp` (M2), `wled_metadata.cpp` (M4). `colors.cpp` not claimed. Coordinator gave the go at 18:45 (no build running). **No builds until 84 reports "applied"** |
| 18:43 | wled-main-2a / 30 | **X22 gate for FXS previews refined:** previews also load without a PIN when fx.js is compiled into **PROGMEM** (`/home/fx.js` is a `server.on` route matched before `handleFileRead`, so an upload can't shadow it). Coordinator requires it **fail-closed**: contract v2.3 field **`fxsrc`** = "rom" | "fs" (absent = no engine); the page loads only if `fxsrc==="rom"` or (`fxsrc==="fs"` && `pinSet===true`). Also fixed: a virtualdev `wslib.js` WS GUID typo (every handshake had failed; verified against the RFC 6455 sample). Target **RC6**. ✅ **Implemented fail-closed by 2a**: virtualdev sends `"fxsrc":"rom"`; the real firmware sends nothing until decision 9, so no previews on the device yet, by design. 2a drafts the one-line fxsrc firmware change once the tier and packaging are chosen |
| 18:39 | wled-main-89 | **Decision 8 accessibility patch DELIVERED to ad**: a drop-in on `54348e10` (RC4b src) → `5defde30`, +2,132 B gz, 27/27 interaction checks, 0 page errors (5 tabs plus dialogs at 390 light/dark and 1280). **Target RC6** (RC5 = core fixes only). User-visible wording: the power-cut option "Last state" → **"As before"**; the Adjust mic slider → **"Microphone sensitivity"**. Harness extended (shoot_/itest_ for wiring/settings/homemoods). Not in scope: Moods cards and board-map pins can't be reached with the keyboard (small structural change; possible follow-up). **ad review PASS** (no sinks, no key in labels, API call count unchanged); held for RC6 |
| 18:36 | wled-main-6c / 84 | **fxsim released** (`hg_team/fxsim/`; release hashes in its README: fxsim.js `7235d1d4`, fxsim.min.js `7081b90b`). virtualdev uses the **same release** (`device.js:34-37`, `home_api.js:47, 1023`). **84 verified X25** and offers it to the user as an optional add-on (colors.cpp baseline `0917adb8` recorded in `RC5_pre`). Still no user yes in 84's tab |
| 18:30 | wled-main-30 / 84 / ad | **Naming agreed:** **RC5** = RC4b usermod + core fixes; **RC6** = 89's captions + 2a's v2.3 + animated previews. ad holds usermod merges and builds until RC5 is green. **Core baseline saved:** `releases/RC5_pre/CORE_BEFORE.txt` (md5s of the 7 core files, unchanged since 15:13) plus copies in `RC5_pre/wled00/` (for the diff and rollback). 84 is showing the user the AGENTS notice in its own tab; no `wled00` edits before the user's yes there |
| 18:29 | user → wled-main-30 | **The user said "yes" in the coordinator tab to the core WLED bug fixes** (H1-H4 + N1/N3, X1, X2, M8c, M1, M2, M4, X24). Per AGENTS.md this must be confirmed **in wled-main-84's tab** (the tab that edits); 84 has been asked to show the notice now. Plan: 84 claims and applies to `wled00/*` → ad builds `home_gadgets` **and `nodemcuv2`** → snapshot → 84 reviews. ad holds RC5 usermod merges until the core-fix build is green |
| 18:27 | wled-main-84 | ✅ **RC4b FINAL CHECK: PASS. RC4b = THE FLASH IMAGE** (replaces RC3b). Verified: src md5s = repo; delta vs RC4 = mig one-liner + rel + comment; the embedded page gunzips to src; flash files identical to RC2; `flash.ps1` read in full (md5 checks, erase opt-in, NVS and LittleFS kept; PIO esptool 4.11.0). MANIFEST status appended. BRINGUP.md → RC4b (plus ExecutionPolicy and baud tips). `hg_check.js` **1.1.2** accepts the RC4b page ETag `hg-c962f3f563cc`. 84 is taking X24 into its core-fix set |
| 18:24 | wled-main-6c | **Dedupe done:** testbench `server.js` = legacy (originals restored, md5-checked); RC3 WIP → `testbench/rc3_wip/` + `RC3_BEHAVIOUR.md` for 2a; `validate_rc3.js` → virtualdev (extending to RC4b). **fxsim:** 146/146 1D effects ported (check.js PASS; Copy Segment/Image fall back); gallery shows all 23 moods animating; sizes: core 12.5 KB + effects 42 KB gzip, **all ≈ 29.2 KB terser+gzip**; tier table pending |
| 18:24 | wled-main-ad | **RC4b BUILT and SNAPSHOTTED**: `releases/RC4b/` (bin `f4afbc33`, 84.7%, 0 warnings; src cpp `31eb074a` / page `54348e10` / readme `746000ab`, **verified = repo by 30**; flash files plus `flash.ps1` `a7d915a0` with erase opt-in; MANIFEST; embedded page = src). Build lock free. **Sent to 84 for the final delta check.** RC3b stays the flash image until it passes. RC5 page base = `54348e10` |
| 18:23 | wled-main-2a | **NEW USER REQUEST (2a's tab): virtual WLED device plus real-time effect previews everywhere.** `hg_team/virtualdev/` (4 agents): real effect/palette lists, strips rendered by 6c's FXS at 42 fps, the **real WLED UI** from the generated `html_*.h`, `/json/*` plus `/ws` lv peek, `/home/*` mirroring the latest firmware, `/home/fx.js`. Page: FXS previews on every effect row and mood tile; the selected row keeps the real `/home/ws` stream. **Contract v2.3 proposal:** `bm` items gain pal/sx/ix/bri/col (for ad). **Coordinator decision:** virtualdev = the **canonical shared mock**; 6c stops extending `testbench/server.js` (now legacy) and points its independent `validate_rc3.js` at virtualdev as a drift check. v2.3 and the page previews → ad for **RC5**; `/home/fx.js` from firmware waits for 6c's size tiers plus the user's decision |
| 18:21 | wled-main-89 | **Decision 8 APPROVED by the user (89's tab)**: accessibility captions for Wiring and Settings, toggles/sliders, icon-only buttons, `ask()` and the connection dot. Drafting against the page `fbe4671a`; one drop-in plus a diff for ad, re-merged onto ad's page at delivery. **Target: RC5** (RC4b is already building) |
| 18:21 | wled-main-ad | **RC4 built OK on retry** (84.7%, 1,331,933 B) and snapshotted at `releases/RC4/` (bin `7ede6775`, src cpp `964c4f29` / page `fbe4671a` / readme `746000ab`; embedded page = src). **Superseded by RC4b** (84's note 1: set "mig" on boards upgraded from RC2/RC3b; keyTry comment; rel = "RC4b"). **BUILD LOCK HELD: RC4b build**; snapshot `releases/RC4b/` → 84's final check |
| 18:20 | wled-main-ad / 30 | **RC4 build FAILED** in WLED's UI step (cdata.js: "Cannot find module 'domutils'"). **Likely cause (timing, not proven):** the VS Code **PlatformIO IntelliSense re-index** at 18:18:18 (all `.vscode/*.json` rewritten) ran the pre-scripts, and `pio-scripts/build_ui.py:13` runs `npm ci`, racing ad's build. No session or agent ran npm in the repo (only mock.js servers in their own folders; 2a's copy has its own real node_modules; package files unchanged since 15:13). **Mitigation:** the user turns off `platformio-ide.autoRebuildAutocompleteIndex` in VS Code during builds. ad is retrying.<br>**84's early review of the RC4 sources: PASS** (cpp `964c4f29`, page `fbe4671a`, readme `746000ab`); non-blocking note 1: set "mig" on boards upgraded from RC2/RC3b (a one-liner) |
| 18:19 | wled-main-30 | `hg_check.js` **1.1.1**: new `fw.rel` INFO row reports the release tag from `GET /home/cfg` ("RC4"; RC3b and older: "no rel field"). Tested against a stub |
| 18:18 | wled-main-ad | **BUILD LOCK HELD: RC4 RELEASE BUILD.** Contents: v2.2 WS preview (+n1, (b) mutex, e2), p1/p2, X22(2) PIN card, readme items, **89's captions** (ad's own 3-way merge = `fbe4671a`, 0 conflicts), **`"rel":"RC4"`** in `/home/cfg` and `/json/info`, **NVS "mig" flag** (once a key was saved, file keys are never adopted again). ad snapshots `releases/RC4/` right after the build. Nobody saves usermod or core files until the lock is free |
| 18:17 | wled-main-ad / 89 | **Captions MERGED into the repo** (`home.htm` `fbe4671a`, 18:17:12; identical to 89's drop-in; the shared `itest.js` passes 8/8 against the repo file). **New shared tool:** `hg_team/harness/` (shoot.js screenshots, itest.js interaction tests, mock.js contract v2.1; CDP without puppeteer). RC4 inputs are nearly complete; waiting for ad's rel/migrated-flag decision, then build → snapshot → 84 |
| 18:16 | wled-main-89 | **Automations captions DELIVERED to ad**: a drop-in onto ad's page `64472fe7` (0 conflicts; also available as a diff vs `837a38cf`), action tuples unchanged, +1,135 B gz, mock 8/8, 0 errors at 390 light/dark and 1280. Its audit found further unlabeled controls (**not approved by the user; decision 8**) |
| 18:16 | wled-main-ad | **RC4 WIP compile check: SUCCESS**: 84.6% (1,330,481 B), RAM 25.7%, no warnings; page 74.3 KB / 26.4 KB gz. Browser suite 54/54 without a PIN (PIN card, key hidden, banner) and 54/54 with a PIN (44 links carry the key). Working copy: cpp `7267f62b`, page `64472fe7`, readme `746000ab`. Build lock free. **Next:** merge 89's captions (plus the rel string and NVS migrated flag, if taken) → build → snapshot `releases/RC4/` → 84 |
| 18:16 | add-on agent (30) | **`hg_check.js` 1.1.0 for RC3b** (`hg_team/device_check/`; BRINGUP §9 updated). New read-only checks: `sec.pin-set` (WARN plus banner when there is no PIN), `home.unknown` 404, no ACAO on live/stats, stats shape, wsec files not served, migration leftovers, the old key file via /edit, live px/src/ago fields, firmware/page ETag, an `fw.rc3b` summary; 23 moods. Validated (node --check, dead port, stub 59 PASS). Not tested on a device. **Board corrected** (key namespace `homegadgets`; RC2+ POST order and 404; X13/X20 FIXED). To ad for RC4: a **release string** ("rel") so the flashed release can be identified (RC3 = RC3b over the network today); an NVS "migrated" flag so a planted `/hgwsec.json` can't be adopted later |
| 18:13 | wled-main-ad | **BUILD LOCK HELD: compile check (RC4 WIP, not a release; waiting for 89's captions).**<br>- 84's v2.2 notes folded in: **n1** (`cleanupClients` removed), **(b)** `hgWsLock` mutex (pushLive 0 ms try, skip frame if busy; WS_EVT_DISCONNECT 20 ms, proceed on timeout: no deadlock, no portMAX_DELAY), **e2** (wss:// on https)<br>- Page: p1 (noSlot check on "Replace with look"), p2 ("Saving…" at 202, "Saved ✓" only after the rev reload with ce=false), **X22(2)** (a PIN card replaces the Siri links while `pinSet===false`)<br>- Readme: X22 wording at :145, :82 "download your settings", the 15-min unlock, IoT-WiFi advice<br>ad's browser suite: 53/53 |
| 18:11 | wled-main-84 | **v2.2 REVIEW: PASS, no blockers** (a/c/d/e/f with library evidence: key check fails closed; close() in CONNECT only queues; 2 slots plus a 16 KB heap cut-off; the WS matches its exact URL, so it can't be shadowed; page lifecycle/backoff/frame validation/gamma correct; colours only). **Fold into RC4:** n1 (`cleanupClients` can kick an accepted viewer while a refused 3rd is closing). Coordinator also recommends **(b)**, a timed mutex around the client-list use in `pushLive` and `WS_EVT_DISCONNECT` (µs use-after-free window, same as core), and **e2** (wss:// on https). Cosmetic: e1, e3, n2 |
| 18:07 | wled-main-ad | **v2.2 self-review PASS** (the connect-time key check fails closed via the upgrade request arg, `AsyncWebSocket.cpp:398`; route order; 2 clients; empty-queue send; heap gate; keepalive like core's `sendLiveLedsWs`). **Merged into the repo working copy, not a release:** cpp `8231d910`, page `d27a3830` (= `2a_v22`). Next: ad's p1/p2 + X22(2) + readme on top, then 89's captions (89 told of the new base). **RC4 build and snapshot only after 84's PASS** |
| 18:07 | wled-main-2a | **v2.2 DELIVERED** (`hg_team/2a_v22/`: the real-time effect preview over usermod WS `/home/ws?k=KEY`). Drop-in on RC3b (`f8f0ae43`/`837a38cf`, still the repo state). [build] +924 B flash, +432 B RAM, 0 warnings; page +998 B gz; [mock] Playwright 23/23 including the px fallback. `/home/ws` is registered before the `/home` catch-all. The frame spec went to 6c for the testbench. **Routed to 84** (focus: connect-time key check/close, loop-vs-AsyncTCP client list, per-frame heap copy, page ws lifecycle). Merge after the PASS |
| 18:02 | wled-main-84 | ✅ **RC3b PASS: THE FLASH IMAGE** (replaces RC3 and RC2). 84 reconstructed RC2 and diffed it against RC3b `src/` (`f8f0ae43`): 11 hunks, all previously reviewed, plus 2 comment lines. Page `837a38cf` PASS; readme `c03b5176` PASS (nit :82 → RC4). MANIFEST now records the build environment (const.h/pin_manager.h/audioreactive md5s, platform Tasmota 2024.06.00 / Arduino 2.0.18 / IDF 4.4.8). **Flash when `flash.ps1` has the erase opt-in:** bench first → `hg_check.js` read-only → set the PIN → back up cfg/presets |
| 18:01 | wled-main-ad | **RC3b verified by ad** (bin and src md5s match the repo); flash files added to `RC3b/` (bootloader, partitions, boot_app0, `flash.ps1`; esptool image_info valid). ad now snapshots every RC itself. ⚠ `flash.ps1` always runs `erase_flash` (wipes WiFi, LED settings, presets and the NVS key); coordinator asked for **erase opt-in** (`-Erase` plus a YES prompt) and md5 checks before the user uses it. ad holds p1/p2 until 2a's v2.2 page patch lands (one rebase only). r3 is already in the readme (:82) |
| 18:01 | wled-main-30 | **RC4 page queue** (all based on `837a38cf`; ad merges with 3-way merges): 2a's v2.2 WS preview page part; ad's p1/p2; **89's Automations labels**. Not queued: 6c's fxsim (user decision). **Update 18:05:** merge order = 2a v2.2 → 89 captions → ad p1/p2 + X22(2) |
| 18:00 | wled-main-30 / 84 | **84: RC3 content PASS** (page gate on `837a38cf` PASS: cap rep/id/n vs captureMood, 12/12 pre-checks, ce "rejected"; o1-o3 was only a note). **Process issue:** the source moved after the RC3 build, so it isn't reproducible. → **RC3b snapshot** `hg_team/releases/RC3b/`: bin md5 `4bc1b85f` (ad's 17:59:30 build, 84.4%) plus `src/` (cpp `f8f0ae43` 17:58:37, page `837a38cf`, readme `c03b5176`, library.json, gen_page.py, override.ini) plus MANIFEST. 84 confirms the last delta (`e497c7dd` → `f8f0ae43`). **If it passes, RC3b = THE flash image.** Build lock free; stable base for 2a's v2.2 = RC3b sources. Page notes p1-p3 and r3 → ad for RC4 |
| 17:59 | wled-main-ad | **BUILD LOCK HELD: compile check, RC4 work-in-progress** (cpp changed since RC3: o1-o3 in custom moods, 84's r1/r2, readme r3; page unchanged `837a38cf`). **Not a release.** RC3 stays the flash candidate (image preserved). ad's browser suite on the RC3 page: 54/54, including mood edit (slider 222 → Save → `cap {strip:0,rep:0}` with sx=222 stored). 2a asked to rebase its v2.2 firmware draft onto ad's post-RC3 cpp |
| 17:57 | wled-main-30 | **RC3 CANDIDATE = the 17:54:27 build.** Inputs verified by file times and md5: 01's final page (`837a38cf`, 17:53:14, returned unchanged at 17:55: mood ✎ Edit / Save / Save as new), cpp 17:53:44 (C1, N-a, N-b/N-c), readme 17:53:57. Preserved as `hg_team/releases/home_gadgets_RC3_firmware.bin` (1,334,384 B, md5 c5ca9254…) plus `RC3_MANIFEST.txt`. **No rebuild.** 84's early cpp review: **PASS** (C1, N-a, N-b/N-c; `pinOk` writes `lastEditTime` only on failure, so no X16 regression). Final page gate running. Optional r1-r3 → ad |
| 17:57 | wled-main-2a | **NEW USER REQUEST (2a's tab), contract v2.2 → RC4:** real-time effect preview over a usermod websocket `/home/ws?k=KEY` (key checked at connect, max 2 clients, 50 ms binary frames with skip-identical and a 1 s keepalive, ≤48 samples per strip). Page: requestAnimationFrame, gamma-aware brightness, live bar inline on the selected effect row, falls back to `live.px`. 2a drafts **both** patches for ad (the owner of both files). ⚠ The WS handler must be registered **before** the `/home` catch-all (`cpp:1924`), otherwise the upgrade gets a 404. Heap guards required (no PSRAM) |
| 17:55 | wled-main-ad | **RC3 firmware compile check: SUCCESS**, 84.4% (1,327,689 B), no warnings. **Build lock free.** Not a flash image (it embedded 01's in-progress page). The RC3 cpp delta has gone to 84 for a pre-read. Focus: `pinOk` must write the shared `lastEditTime` only on **failed** attempts, otherwise page saves extend core's 15-min unlock (`wled.cpp:190`). **RC2 stays the flash image** |
| 17:54 | wled-main-ad | **BUILD LOCK HELD: RC3 firmware build** (C1, N-a, N-b/N-c, N-d). ⚠ It embeds **01's in-progress `home.htm`** (saved 17:53:14, md5 837a38cf…, not RC2's e7c3e5fa…), because `gen_page.py` reads the page from disk at build time. So this is a **firmware check only, NOT a flash image.** The real RC3 is rebuilt after 01's "page returned". 01 pauses saves until the lock is free. **Rule for the future: the page owner doesn't save `home.htm` while any `home_gadgets` build runs** |
| 17:52 | wled-main-ad → 01 | **`home.htm` HANDED OVER to 01** (RC2 page, md5 e7c3e5fa…) for mood Edit / Save / Save as new. **01 owns `home.htm` until "page returned".** ad keeps `home_gadgets.cpp` and `readme.md` for **RC3 (firmware-only):** C1 (old-name fallback, delete old files only after validation), N-a, N-b/N-c (shared `lastEditTime` cooldown), N-d. **RC2 image preserved:** `hg_team/releases/home_gadgets_RC2_firmware.bin` |
| 17:52 | wled-main-01 | **Requested `home.htm`** for a new user request (its tab): mood **Edit** plus Save / Save as new via the `cap` op (page-only, under 1.5 KB). Coordinator suggested that ad lends it during RC3, since ad's RC3 is cpp and readme only. **Pending ad's "page handed over".** RC2 stays today's flash image |
| 17:51 | wled-main-84 | **RC2 FINAL CHECK: PASS FOR FLASHING**, with condition **C1**. B1 (model B) and B2 pass; the whole security layer passes (X15 NVS pairing, key never lost or leaked; X16; X17 order and 404 can't shadow real routes; (c); (a); N3; pinSet bool). bin 1,333,472 B = 84.8% of the slot.<br>**C1:** if the board ran a 16:43/17:01 build and the `/home.json` rename fails, the config can be lost. Fix: loadConfig falls back to the old names, and old files are deleted only after validation. **Not a risk on a fresh board.**<br>Non-blocking: N-a (prefer the key file over the legacy key), **N-b** (separate PIN cooldown doubles the brute-force rate, so share `lastEditTime`), N-c, N-d.<br>**Plan:** flash RC2 now on a fresh board (or back up `/home.json` first); RC3 = C1 + N-a + N-b in parallel, via OTA later |
| 17:50 | wled-main-ad | **RC2 BUILT: SUCCESS**: 84.4% (1,326,781 B), no warnings, 50/50 browser checks. Build lock free. Since RC1: the Add default is now `{en:false, t:0, m:1200, a:[]}` (inert); n3 capture on a missing segment → `cfgError`; src 5 label "Siri / link"; readme src 0 fixed. Accepted as minor: n4, n7, the away min>max display, stats dimming by the phone clock (UTF-8 is now cut at a character boundary). **Waiting for 84's final check** |
| 17:48 | wled-main-ad | **RELEASE CANDIDATE BUILT: SUCCESS** at about 17:48: 84.4% (1,326,785 B), RAM 25.6%, no warnings; page 69.0 KB / 24.4 KB gzip. **Build lock free.** Contents:<br>- **B1 via model (B)**: variable `sch` list, `used` flag, a posted list = complete, `firedDay` carried<br>- B2, N1, N2, N3, N5, N6<br>- security layer X15 (NVS `homegadgets/key`, safe migration), X16, X17 (403→413→401→503→202, 404 for unknown `/home/*`), X20 (`*_wsec.json` names plus migrateFiles), `pinSet` (bool), (c) `hgLocalClock`, (a)<br>- readme<br>ad's tests: 50/50 puppeteer, 0 JS errors. **Waiting for 84's final re-check**, then flash plus `hg_check.js` plus BRINGUP. Open non-blocking: the Add default `en:true` (`home.htm:707`), n3-n7 |
| 17:48 | wled-main-84 | **G1 re-check (page 17:43, 975 lines): B2 FIXED** (`home.htm:918`); also fixed: N5 (key polling every 3 s, commands blocked until the key exists), keep boxes disabled in away, from==to warning, keep texts, lvl slider, pinSet copy. **B1 STILL BLOCKING.** Firmware reset alone doesn't fix it, so one model must be chosen: **(A) fixed 8 slots** or (B) a variable list; **ad implemented (B)**, which matches contract "<=8". New notes n3-n7 (silent capture failure on a missing segment, a toast overwrite, src 0/5 labels, the uptime-day label). **`pinSet` must be a JSON boolean.** Decision with ad |
| 17:41 | wled-main-84 | **G1 (X14) result: 2 BLOCKERS.** Everything else matches.<br>**B1 (firmware, sch):** always 8 slots emitted and merge-by-index without clearing, vs the page's variable list. Phantom schedules, no Add; after a delete a duplicate fires twice and the deleted one comes back. Fix: emit only used entries; a posted `sch` = the complete list.<br>**B2 (page):** restore whitelist (`home.htm:905`) drops sch/away/clap.<br>Non-blocking N1-N6 (keep text, from==to hint, UTF-8 name cut, stats clock, **N5 empty key at load → commands silently dropped until reload**, sensitivity slider/pinSet copy/dead code).<br>Safety scan clean. **The candidate is NOT final until B1/B2 are fixed and re-checked.** Routed to ad; 2a on standby for B1 |
| 17:40 | wled-main-ad | **BUILD LOCK HELD:** merged build = 2a's patch plus ad's security layer (X15 NVS key, X16 local PIN, X17, X20 wsec file names, `pinSet`, `hgLocalClock` everywhere, 84's (a) mic/lvl saved only on change, readme (d)/(f)/decision 4/X21). **Candidate for the first real flash** once 84 passes G1 and reviews the security layer |
| before 17:40 | wled-main-84 | **Review of 2a's patch, part 1: G2 security PASS, G3 correctness PASS, G4 loop and heap PASS; decisions 1-6 accepted.** G1 (page↔fw, X14) pending. Notes sent to ad:<br>(c) `handleClock` overwrites the global `localTime` (breaks countdown mode, `ntp.cpp:383-385`); ad's `hgLocalClock` should fix it, 84 to verify<br>(d) sunrise/sunset offset past midnight is clamped: wrap or document<br>a readme line for decision 4 (a schedule can run twice after a same-minute reboot)<br>optional: (a) keyless mic/lvl force a `/home.json` rewrite every 3 s (flash wear); (b) page warning when clap targets a relay (acoustic trigger); (e) px on 2D shows the first row only; (f) document src 11 |
| before 17:40 | wled-main-ad | **Merged 2a's patch into the repo working copy** (base byte-identical, readme.diff clean). ad's self-review: R1/R2/R4 confirmed, 2a's decisions 1-6 accepted, v2.1 matches. **Not final or flashable until 84's gates G1-G4 pass.** Now layering the security build: X15 (key → NVS "hg"), X16 (local PIN compare; correctPIN honoured, never set), X17 (auth before the body; keygen after WiFi/AP; 404 for unknown `/home/*`), **X20(b)** (`/hgcfg_wsec.json` + `.tmp`, `/hgstate_wsec.json`, migrated by renaming), `pinSet`, X21 readme note, `hgLocalClock`. **This layer also goes to 84 for review.** `home_gadgets.cpp` is no longer frozen (back with ad) |
| about 17:33 | wled-main-2a | **PATCH READY:** `hg_team/2a_patch/` (full `home_gadgets.cpp` plus a 1067-line diff against the frozen 17:00:31 base, readme, notes). [build] OK in the isolated copy: 83.5%, RAM 25.6%, 0 warnings. Contract v2.1, X13 and NIT 1 included, plus base-code rollover fixes **R1** (switches and PIRs dead after about 24.8 days), **R2** (AC false toggle after 2^31 ms without a pulse), **R4** (auto-off fires right after turn-on). **Routed to 84** (gates G1 page↔fw/X14, G2 security, G3 correctness, G4 cost). Not tested on hardware or a mock |
| about 17:36 | wled-main-84 | **Planned claim (not active yet)** for the core fixes: `wled00/FX_fcn.cpp` (H1, H2+N3), `wled00/bus_manager.h` and `.cpp` (H3, H4+N1), `wled00/FX.cpp` (X1, X2, M8c), `wled00/file.cpp` (M1), `wled00/wled.cpp` (M2), `wled00/wled_metadata.cpp` (M4). **No overlap** with ad's `const.h`/`pin_manager.h` lines. Becomes active only after the user's yes in 84's tab and the merged build is green |
| about 17:28 | wled-main-ad | **Test build SUCCESS:** page 67.6 KB, 23.8 KB gzipped; **flash 83.8%**. Build lock free. ad's browser test of 01's page against its mock: 30/30 layout checks (5 tabs × phone/dark/desktop), Adjust controls correct for Candle, Ripple Peak and Solid, Swirl (2D) hidden, 60 slider inputs → 9 POSTs, maxInFlight 1, 0 JS errors. **Test only: don't flash as final** |
| about 17:27 | wled-main-2a | Compiling its merged draft in the isolated copy (`W:\WLED`, own `.pio`, packages already installed) |
| about 17:24 | wled-main-ad | Test build with 01's returned `home.htm` on the **pre-2a** firmware (build lock held). It is a TEST build: the page's `/home/stats`, `sch`/`away`/`clap` and live preview won't work until 2a's patch (X14, X18). 2a was warned |
| about 17:24 | add-on agents | **All three finished:** `hg_team\testbench\` (70/70 self-checks), `hg_team\device_check\` (hg_check.js plus BRINGUP.md), `hg_team\drafts\core_fixes\` (10 patches) |
| 17:08 | wled-main-2a | Baseline compile in its **isolated copy** (its scratchpad, own `.pio`). Coordinator checked first: no build processes running, repo `.pio` untouched since 17:01. It doesn't use the repo build lock, but ad should tell the coordinator before building so 2a can pause if needed |
| 17:01 | wled-main-ad | **Build SUCCESS with the X11/X12 fixes:** PIO 1,307,225 B = 83.1%; bin 1,313,920 B = 83.5% of the slot, 258,944 B free `[build]`. Build lock free. 84's re-check passed, so **the flash block from 16:43 is lifted**. The next build merges 2a's patch and 01's page |
| 16:43 | wled-main-ad | **Build SUCCESS:**<br>- PIO 1,306,801 B = 83.1% (21 KB saved by gzip); bin 1,313,488 B `[build]`<br>- Page 36.5 KB, 12.8 KB gzipped<br>- Browser test on the real gzip bytes: 5 tabs, 0 JS errors, key carried everywhere, 403 without it<br>**Build lock is free.** ⚠ **Don't flash yet: X11 key leak** |

---

## 8. Decisions waiting for the user

> **SCOPE CONFLICT (16:37). The user gave different answers in different tabs:**
>
> | Tab | Answer |
> |---|---|
> | wled-main-ad | X7 = yes; extras = **Safety pack only** (12, 13, 17) |
> | wled-main-01 | "do this all": **all 17** ideas |
> | wled-main-30 | **X10** effect controls |
>
> wled-main-ad builds nothing from a relayed answer. **The user must confirm the final scope in the wled-main-ad tab.** Until then only X7 and the Safety pack are being built.
>
> **Update (about 16:50):** in wled-main-01's tab the user was shown the conflict explicitly and chose **"Everything now"** (all 17 ideas plus X10), over "Safety + effects now, rest later" and "Only what I picked there". It still has to be confirmed in wled-main-ad's tab.
>
> Siri requirement from the user: spoken phrases like "turn on light / lamp / lamp1". The key only goes into the shortcut's URL, never into the phrase.
>
> ✅ **RESOLVED (11:28 UTC, about 16:58 local):** in wled-main-ad's tab the user confirmed **"Effect controls + all ideas"**. Decision 2 (creative scope) is settled, and decision 5 (timed relays) is settled by it (idea 6, built inside the usermod as `sch`).

1. **Core bug fixes:** should `wled-main-84` fix X1 (Candle Multi) and H1-H4 in `wled00/`?
   - That session needs your explicit AGENTS.md "yes".
   - Those fixes touch core files that `wled-main-ad` compiles, so they are sequenced with its builds.
2. **Creative scope:** which of `wled-main-01`'s ideas go into the usermod?
   - Prototype (private): https://claude.ai/artifact/8sBzrHkGtxF5UxqRXCAt3X. Anything not yet in the module carries an IDEA badge.
   - None of the ideas needs a core change. All 17 together cost about 40-55 KB of the ~232 KB free.

   | # | Idea | Kind | Size | Coordinator's pick |
   |---|---|---|---|---|
   | 1 | Live strip preview via polling `GET /json/live` (the websocket live view allows only **one** client, `wled00/ws.cpp:63`) | UI | S | **Bundle A** |
   | 2 | Animated mood previews from `bm[].g` | UI | S | **Bundle A** |
   | 3 | "Save look" button (uses `cap`) | UI | S | **Bundle A** |
   | 4 | Guided wiring check | UI | M | Later: most useful at first install |
   | 5 | Interactive pin diagram | UI | M | Later |
   | 6 | Schedules via WLED presets and timers (existing `readFromJsonState`) | UI | M | Bundle B |
   | 7 | Mood from a photo | UI | M | Skip: novelty for the flash cost |
   | 8 | SVG icons instead of emoji | UI | S | **Bundle A** |
   | 9 | Header glow in the LED colours | UI | S | Optional |
   | 10 | Change source per relay (who switched it) | usermod | S | Bundle B |
   | 11 | Clap control (experimental) | usermod | S-M | **Defer:** audio-reactive party moods would likely trigger their own "claps" `[unverified]` |
   | 12 | "Stays on" relay flag (skipped by all-off and away mode, e.g. a fridge) | usermod | S | **Bundle A: safety** |
   | 13 | Gentle start after a power cut (relays switch on one after another) | usermod | S | **Bundle A: safety, limits inrush** |
   | 14 | Away mode | usermod | S-M | Bundle B |
   | 15 | Today stats (RAM only) | usermod | S + M page | Optional |
   | 16 | Five more moods: Beat Ripple, Popcorn Party, Lighthouse, Night Path, Focus | usermod | S | Bundle B |
   | 17 | Serve `home_page.h` gzipped (about 20 KB saved, estimated) | flash saver | — | **Defer until flash > 90%**: it needs an extra build step to keep maintained |

   **Update:** ideas 1 (live preview) and 3 (save look) are now built as part of X10, which the user requested.

   **Recommendation:**
   - **Bundle A** (1, 2, 3, 8, 12, 13; about 10-15 KB): two safety features plus cheap polish.
   - **Bundle B** (6, 10, 14, 16) as a second round.
   - Decide X7 (API token) before either bundle, because it changes the Siri URLs.
3. **Hardware check:** power up once with the switches on GPIO 5 and 15 in the ON position, to confirm the board still boots.
4. ~~**Relay API protection (X7)**~~ **Decided: YES** (in wled-main-ad's tab). Implemented at 16:43; leak fixes X11/X12 pending.
7. **Set a WLED settings PIN: REQUIRED (X15, X22):** Settings → Security & Updates → Settings PIN.
   - Without it, any web page you open on the home network could plant its own relay key via WLED's file upload and reboot the device.
   - The PIN costs one prompt when you open WLED's settings pages.
10. **N1 (keep a failed LED output's configured pin, not applied in RC5):** 84 found the simple version unsafe, because `usermods/rgb-rotary-encoder` creates its own LED bus, so cleanup could free a pin another live bus uses. A safe version needs `cleanup()` to free only pins the bus actually owns (a small core design change, likely also worth reporting upstream). **Coordinator recommends: skip for now**; with plain H4, a failed output shows an empty pin field instead of random memory, which is already an improvement.
9. **Effect previews on the device (6c's fxsim, released in `hg_team/fxsim/`; see the preview quality in the gallery: https://claude.ai/artifact/5prraNxY5NNEetTYze98Lo, all 23 moods plus 148 1D effects, tap a card for sliders):** size tiers (terser + gzip): core-only fallback 7.6 KB · **21 mood effects 13.0 KB** · 122 non-music effects 24.7 KB · **all 146 27.3 KB**. Packaging: firmware PROGMEM costs that much flash (about 245 KB free), while an optional LittleFS file `/fxsim.js.gz` costs **0 flash** and is loaded only while `pinSet === true` (X22). Accuracy: 146/148 1D effects ported 1:1 and helpers bit-exact (151/151); differences: seeded PRNG, music effects on a synthetic 120 BPM song, a single plain segment. **Coordinator recommends: all 146 as the LittleFS file** (no flash cost, updatable without reflashing), or the 13 KB mood tier in PROGMEM if a file upload is unwanted.
8. **More accessibility captions (from 89's audit):** Wiring tab (4 unlabeled dropdowns per wall switch, pin dropdowns), Settings icon dropdown, toggles without accessible names, the `ask()` dialog (Escape key, placeholder), and the connection dot title. Small (about 1 KB). ✅ **APPROVED by the user in 89's tab (about 18:21)**, delivered and **in RC6** (not RC5; RC5 = core fixes only, corrected per 84). Scope: Wiring (switch-row dropdowns, pin captions, relay board type), Settings (icon dropdown, name placeholders), accessible names for toggles and sliders, aria-labels on the icon-only buttons (✎ ⋯ ‹ › 📋), `ask()` Escape key and placeholder, the connection-dot title.
6. **Optional hardening (after the merge; ad will offer it):** when a settings PIN is set, withhold the key from `GET /home/cfg` until the page supplies the PIN. This closes the "LAN programs can read the key" gap, at the cost of a PIN prompt on the page.
5. **Timed relays (X12):** do you want relays on a schedule (e.g. porch light at sunset)?
   - If yes, it's built inside the usermod (key-protected), **not** with WLED presets or timers, which would leak the key.
   - Moods and strips can still use WLED presets and timers freely.
