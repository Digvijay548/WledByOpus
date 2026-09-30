# home_gadgets RC3 / RC4b: /home/* behaviour checklist (hand-off for the virtualdev HOME agent)

Written by an AI agent (testbench session, 2026-09-29 about 18:45) from reading the firmware source. Nothing here was tested on hardware.

- **`cpp:N`** = line N of the **RC3 snapshot**: `hg_team/testbench/ref/home_gadgets.RC3.cpp`, md5 `f8f0ae437355f2d2bfa4125b886cf603`. It is identical to `releases/RC3b/src`.
- **RC4b** is the live repo file since 18:21 and the flash image since 18:26: md5 `31eb074a5ef486852148f2df21f1cf19`, with a copy at `rc3_wip/home_gadgets.live_1821.cpp`. Its delta is in section 16. Everything in sections 1-15 is unchanged in RC4b.
- **RC3 to RC4b line offsets.** Add these to a `cpp:N` reference:

  | RC3 lines | Add |
  |---|---|
  | 1-61 | 0 |
  | 62-108 | 8 |
  | 109-304 | 10 |
  | 305-547 | 17 |
  | 548-1097 | 26 |
  | 1098-1205 | 27 |
  | 1210-1896 | 37 |
  | 1897-1900 | 120 |
  | 1901-2135 | 128 |
  | 2145-2191 | 147 |
  | 2192-2251 | 150 |
  | 2253-2273 | 151 |

  This map comes from validate_rc3.js; I spot-checked it on serveLive, receiveConfig, addRoutes and setup.
- Every item below is **[code]**, meaning derived from source reading. Core and library references point to `WLED-main/wled00/...` and to `.pio/libdeps/home_gadgets/ESPAsyncWebServerWLED/src/...` (**lib**).
- **Working mock code:** `rc3_wip/server.js` implements all of this, and `rc3_wip/hg_rc3_lib.js` has pure functions you can lift (self-test: `node hg_rc3_lib.js`). Section 18 has the test results.

---

## 1. Routes, headers, 404 [code]

Routes are registered in `addRoutes()` (cpp:1897-1941).

**Prefix matching.** AsyncWebServer's `"/x"` handler also matches `"/x/anything"` (lib `WebHandlerImpl.h:121`). So these hold:
- `GET /home/live/foo` → serveLive
- `GET /home/cfg/x` → serveConfig
- `POST /home/cfg/x` → receiveConfig
- `GET /home/api/x` → serveApi

| Route | Handler | ACAO | Other headers | Notes |
|---|---|---|---|---|
| `GET /home`, `GET /home/` | cpp:1924-1940 | `*` | `Content-Encoding: gzip`, `Cache-Control: no-cache`, `ETag: "hg-<12 hex of sha1(gz)>"` (gen_page.py) | `If-None-Match` equal to the ETag → 304. The page is always sent gzipped, whatever `Accept-Encoding` says |
| `GET /home/<anything else>` | cpp:1926-1929 | `*` | `text/plain` | **404 `Not found`**. Only paths that no earlier route claimed; `/home/live/x` etc. are claimed |
| `GET /home/cfg` | serveConfig cpp:1943-1956 | **none** (`HgPrivateJsonResponse`, cpp:1886-1891, removes only ACAO; `-Methods` and `-Headers` stay) | `Cache-Control: no-store` | Contains the key |
| `GET /home/live` | serveLive cpp:1959-2019 | **none** | `no-store` | Presence data (X13) |
| `GET /home/stats` | serveStats cpp:2022-2036 | **none** | `no-store` | |
| `GET /home/api` | serveApi cpp:2045-2087 | `*` | JSON | |
| `POST /home/cfg` | onBody cpp:1909-1923, receiveConfig cpp:2107-2130 | `*` | JSON | |
| `GET /home/ws` (upgrade) | RC4b only, section 16 | | | |
| other methods on `/home/*` | none: falls to `onNotFound` (`wled_server.cpp:674-692`) | `*` | | `OPTIONS` → 200 with `Access-Control-Max-Age: 7200`; everything else → WLED 404 page (HTML) |

WLED's default headers are `Access-Control-Allow-Origin: *`, `-Methods: *` and `-Headers: *` (`wled_server.cpp:352-354`).

**Files.** `GET /<path>` goes through `handleFileRead`, which refuses any path containing `sec` (`file.cpp:481`) → WLED 404 page. So `/hgcfg_wsec.json`, `/hgcfg_wsec.json.tmp` and `/hgstate_wsec.json` are never served. `/home.json` doesn't exist after the migration (section 13).

## 2. API key [code]

- **Format:** 10 characters from `abcdefghjkmnpqrstuvwxyz23456789` (cpp:59-60).
- **Created** by `esp_random()` (cpp:1165-1170).
- **Timing:** generated in the first loop where `millis() > 5000` **and** (`WLED_CONNECTED` or `apActive`) (cpp:1406-1410).
  - Until then `GET /home/cfg` returns `"key":""`.
  - Every key check fails while the key is empty, even `k=` (cpp:1212).
- **`keyOk`** (cpp:1211-1216): exact length 10 (`strnlen(k, 11)`), constant-time compare. The check is case-sensitive, so an upper-case key fails.
- **Storage:** stored in NVS `homegadgets/key` (cpp:107-108, 1177-1208), never in the configuration file. A factory reset keeps it.
- **Where the key is needed:**
  - `/home/api` (every form, cpp:2046-2050)
  - `POST /home/cfg` (cpp:2108-2112, and in onBody before any allocation, cpp:1914-1915)
  - JSON state `relay`, `scene`, `alloff`, `away` (cpp:2224, 2230, 2232, 2238)
  - `/home/ws` (RC4b)
- **Not needed:** JSON state `mood`, `strip`, `mic`, `lvl`.
- **Rejection response:** `403 {"ok":false,"err":"key"}` (cpp:1893-1895).
- **`{"newkey":true}` in POST /home/cfg:** regenerates the key and saves it to NVS (cpp:1753-1756). Only the boolean `true` counts.

## 3. POST /home/cfg [code]

**Order of checks** (cpp:2106 comment, 2107-2130):

| Order | Check | Status and body |
|---|---|---|
| 1 | key | **403** `{"ok":false,"err":"key"}` |
| 2 | no collected body | **413** `{"ok":false,"err":"size"}` |
| 3 | PIN | **401** `{"ok":false,"err":"pin"}` |
| 4 | busy (previous upload not yet taken by loop()) | **503** `{"ok":false,"err":"busy"}` |
| 5 | accepted | **202** `{"ok":true}` |

**Body collection** (onBody cpp:1909-1923):
- The body is kept only if all of these hold:
  - it is the first chunk
  - `0 < total <= 12288`
  - the key is valid (checked before `d_malloc`)
- A body of 12288 bytes is accepted; 12289 → 413.
- AsyncWebServer never calls onBody for these bodies (lib `WebRequest.cpp:171-181`), so they get **413 `size`** (misleading name):
  - `application/x-www-form-urlencoded`
  - `multipart/*`
  - `text/plain` whose first chunk looks like `name=...` (param characters followed by `=`)
- The content type is the header text before `;`, compared case-sensitively.
- Form parameters are never read as `k` or `pin`: `getParam()` without the post flag sees only the query.

**PIN** (`pinOk`, cpp:2093-2104):
- No settings PIN, or WLED already unlocked (`correctPIN`) → pass.
- Otherwise:
  - A missing `pin` parameter → 401, and the cooldown is **not** started.
  - Within 3 s (`PIN_RETRY_COOLDOWN`, `const.h:729`) of the last failed attempt → 401, even for the right PIN. This attempt doesn't extend the cooldown.
  - The compare is exact: `strnlen(p, 5) == strnlen(pin, 5) && strncmp(..., 5) == 0`. PIN + 1 character → 401.
  - A wrong PIN sets `lastEditTime` (only on failure).
- `lastEditTime` is **shared** with WLED core's `checkSettingsPIN` (`util.cpp:502-507`, reached from JSON `{"pin":...}` at `wled_server.cpp:438`): a wrong core attempt starts the page's cooldown too.
- `lastEditTime == 0` (no attempt since boot) means no cooldown.
- **It never sets `correctPIN`**, so the page never unlocks WLED (X16), and `pinReq` stays true.
- Core quirk: `checkSettingsPIN` ignores every attempt in the first 3 s after boot (`util.cpp:504` with `lastEditTime` 0).

**Applying** (`processPendingConfig`, cpp:1743-1765, in loop()):
1. `deserializeJson` (section 14).
2. `ce` (cfgError) = parse error or root not an object.
3. If OK: `applyConfig(root)`, then `cap` if it is an object, then `newkey`.
4. Then **`rev++` always**, also on errors.
5. Then **`saveConfig()` at once**, but only if `!ce`.

The 3 s delayed save applies only to mic/lvl/away changes from commands (cpp:1735-1737, 1707) and relay "last" states (cpp:1323-1326, 1429). A failed `cap` sets `ce` and therefore skips the save (F1).

## 4. applyConfig parse rules (cpp:782-956) [code]

Sections that are missing keep their values.

**ArduinoJson `|` semantics:**
- `x | int` takes only integers in the int range. Floats like `60.0` or `1e3`, strings and bools → default.
- `x | bool` takes only booleans.
- `x | ""` takes only strings.

| Section | Rules |
|---|---|
| `seg` | Array; for k<2: `seg[k] \| current`, clamped to 0..31 (`getMaxSegments()-1`) (cpp:792-798) |
| `mic` | bool only. `lvl`: any non-null value → `as<int>()` (parses numeric strings, truncates floats), clamped 0..255 (cpp:799-800) |
| `relays[i<8]` | Non-objects skipped.<br>`n`: if non-null → hgCopyName(value if string, else fallback `"Relay N"`).<br>`p`: null → keep; else `as<int>()`, outside 0..39 → **-1**.<br>`i` 0..15, `al`, `keep`, `po` 0..2, `ao` 0..1440 (cpp:802-818) |
| `sw[i<8]` | `p` as above, `t` 0..1, `m` 0..1, `r` -1..7, `inv` (cpp:820-832) |
| `pir[i<2]` | `n` (fallback `"Motion N"`), `p`, `en`, `night`, `undo`, `hold` 5..3600, `a` (only if an array) (cpp:834-851) |
| `clap` | Object: `en`, `a2`, `a3` (arrays) (cpp:853-860) |
| `moods` | Array = the **complete** list: all 12 slots are cleared first (cpp:863-895).<br>Each object needs `id` 100..111. A duplicate id is skipped.<br>`rep` must be 0..22, else -1.<br>`n` fallback `"Mood k+1"`; `fx` (default `"Solid"`) and `pal` are cut at 32 bytes without a UTF-8 fix.<br>`fxid`, `palid`, `sx`, `ix`, `c1`, `c2`: uint8 truncation, defaults 0/0/128/128/128/128.<br>`c3` 0..31 (default 16). `o1`-`o3`: bool (**RC3 added these**).<br>`bri`: uint8, default 255.<br>`col[c]`: `\| 0UL` (a non-negative integer that fits 32 bits, else 0).<br>**Parsed before `sc`.** |
| `sc[i<6]` | `n` (fallback `"Scene N"`), `a` (cpp:897-908) |
| `sch` | Array = the **complete, variable-length list** (cpp:910-939).<br>All 8 slots are reset to defaults (`used` false, `n` "", `en` false, `d` 0x7F, `t` 0, `m` 0, no actions, `firedDay` 0).<br>Slot i takes `sch[i]` if it is an object, otherwise the slot stays **unused** (a hole). Elements past 8 are ignored.<br>`n` only if present (fallback `"Schedule N"`); `en`; `d = (d \| 0x7F) & 0x7F`; `t` 0..2.<br>`m` clamped 0..1439 for `t`=0, -180..180 for sunrise/sunset. `a`.<br>`firedDay` is copied from the **first old used slot with the same `t`, `m` and `d`** |
| `away` | Object: `en`, `rel` 0..255, `from`/`to` 0..1439, `min` 1..720, `max` `min`..720 (so `max < min` becomes `min`).<br>`mood`: `\| current`, then kept only if 0..255 and a valid mood id, else **-1**. `ms` 1..3 (cpp:941-952) |

**Actions** (`parseActions`, cpp:738-764):
- Format `[type, target, strips]`, at most 8.
- Invalid entries are skipped (not zero-filled):
  - `type` must be 1..7
  - relay types 1-3 need `target` 0..7
  - type 4 needs a valid mood id (0-22 or 100-111)
- `strips` is `\| 3`, clamped 1..3.
- Output keeps the order.

**Names** (hgCopyName, cpp:310-326):
- Bytes below 0x20 are dropped; at most 23 bytes.
- If the name was cut, an incomplete UTF-8 character at the end is dropped.
- An empty result → fallback.

**Hardware reinit** (cpp:955, 959-966, 1272-1281):
- It happens only if any of these change: relay pin or `al`, switch pin, type or `inv`, sensor pin.
- A reinit then:
  - resets debounced switch and PIR states
  - sets `onSince = now` for every relay that is on
  - starts the 1 s input settle time

## 5. GET /home/cfg output (fillConfig forPage, cpp:969-1115) [code]

**Key order:** `v:1, key, seg, mic, lvl, relays, sw, pir, clap, sc, sch, away, moods, name, ce, rev, pinReq, pinSet, lim, bm`. RC4b inserts `rel` after `pinSet`.

- **relays / sw / pir:** add `e` (1 = pin not usable, 2 = in use) and, for `e`=2, `o` (owner name) only when there is an error (cpp:988-991).
- **sch:** only used slots. An unnamed slot is output as `"Schedule <slot index+1>"`; this is not stored (cpp:1038-1055).
- **away:** `{en, rel, from, to, min, max, mood, ms}`.
- **moods:** only used slots: `{id, rep, n, fx, pal, fxid, palid, sx, ix, c1, c2, c3, o1, o2, o3, bri, col[3]}`.
- **pinReq:** `settingsPIN set && !correctPIN`.
- **pinSet:** a JSON **boolean**, `settingsPIN set` (cpp:1096-1097).
- **lim:** `{act:8, moods:12, scenes:6, sch:8, mbase:100, icons:16}`.
- **bm:** 23 entries `{n, fx, snd, g:[3]}` (ids 0-22, cpp:274-298, 1105-1114).
- **Saved file** (`fillConfig(false)`): the same without `key` and without the page-only tail.

## 6. cap: "save current look" (captureMood, cpp:1118-1160) [code]

- `strip = cap.strip | 0`. It must be 0..1 and its segment must exist, **else `ce=true`**.
- `rep = cap.rep | -1`, valid 0..22.
- **Slot choice:**
  1. `id` in 100..111 → that slot. If the slot is used, its existing `rep` wins over the posted `rep`.
  2. Else if `rep >= 0` → the used slot that already overrides that built-in.
  3. Else, or if nothing was found → the first free slot.
  4. No slot → `ce=true`.
- **Name:** `hgCopyName(cap.n | "", fallback)`. Fallback = the slot's old name if it was used, else the built-in's name if `rep >= 0`, else `"My mood"`.
- **Copied from the segment:** effect and palette names (32 characters) plus ids, `sx`, `ix`, `c1`-`c3`, `o1`-`o3`, `bri` = segment **opacity**, `col[3]`.

## 7. GET /home/live (cpp:1959-2019) [code]

**Key order:** `r[8], sw[8], pir[2], act[2], s[2], on, bri, mic, lvl, vol, rev, src[8], ago[8], away, clap, ts, px[2]`. Flags are the integers 0/1.

- **`s[k]`:** `{"on":seg.on, "bri":seg.opacity, "fx":"<effect name without \" \\ and control characters>"}`, or `null` if the mapped segment doesn't exist.
- **`on`:** `bri>0`. **`bri`:** WLED's global `bri` (0 while off).
- **`vol`:** audioreactive `volumeSmth` clamped 0..255, or **-1 whenever getUMData fails**. That includes the mic being off, because audioreactive's `getUMData` returns false while disabled (`audio_reactive.cpp:1716`).
- **`src`:** see section 11.
- **`ago[i]`:** `uptimeSec - lastChange`. For a relay never changed since boot, `lastChange` is 0, so `ago` = **uptime**; use `src`==0 to hide it.
- **`away`:** simulation running now.
- **`clap`:** `clapArmed()` = enabled && `clap.en` && mic on && clapReady (clapReady: audioreactive present and on, and no sound-reactive effect on a lit strip; section 12).
- **`ts`:** `hgTimeValid()` = toki source > `TOKI_TS_UDP` (5): NTP, JSON `time`, RTC and so on.
- **`px[k]`:** 16 samples of `strip.getPixelColor(start + j*(len-1)/15)` (integer maths).
  - White is added: `qadd8(w, r)`, and so on.
  - Then `scale8(x, strip.getBrightness())`, with `scale8(i,s) = i*(1+s) >> 8`.
  - Format: 6 upper-case hex digits.
  - `null` if the segment is missing or empty.
  - While WLED is off, every sample is `"000000"`.

## 8. GET /home/stats (cpp:2022-2036, updateStats cpp:1435-1477) [code]

- **Format:** `{"ts":statClock, "on":[8 x seconds], "pir":[[48],[48]]}`. `ts` is **statClock, not live.ts**.
- **on[i]:** `statOnMs/1000` (floor).
  - Accumulated every loop for relays that are on.
  - A loop gap of 10 s or more isn't counted.
- **pir[s][k]:** motion **starts** per half hour.
  - Counted even if the sensor's actions are disabled, but not during the settle time.
  - Saturates at 255 (cpp:1378).
- **With a valid clock:**
  - Day = local day; reset at local midnight.
  - When the clock first becomes valid: if everything counted so far fits into today, the PIR counters shift from "half hours since start" to clock slots; otherwise everything is reset.
- **Without a clock:** 24-hour periods of uptime.
- The day/slot check runs every 1 s. RAM only.

## 9. GET /home/api (cpp:2045-2087) [code]

1. **Key first:** 403.
2. **Then `on`, if present:**
   - `1`, `true`, `on` → on; `0`, `false`, `off` → off; `t`, `toggle` → toggle.
   - The words (not the digits) are case-insensitive.
   - **Anything else, including `on=` (empty) → 400 `{"ok":false}`**, even for a command that doesn't use `on` (e.g. `?scene=1&on=x`).
3. **Numbers** use Arduino `String::toInt()` (`atol`): leading digits, `""` or `abc` → 0.
4. **`strip` = constrain(toInt, 1, 3)**, default 3.
5. **One command**, priority relay > mood > scene > alloff > strip:
   - `relay` (1-based; needs `on`)
   - `mood` (id; `mood=` or `mood=abc` → **mood 0**, F3)
   - `scene` (1-based)
   - `alloff` (presence only: `alloff=0` also switches everything off)
   - `strip` with `on` 0/1 (`on=t` → 400)
6. **Result:** 200 `{"ok":true}` when queued, else 400 `{"ok":false}`. A full queue (16 entries) is also 400 (F12).

Relay commands carry src 5 (LINK).

## 10. JSON state `{"HomeGadgets":{...}}` (cpp:2211-2239; output cpp:2194-2203) [code]

- **Response:** always WLED's `{"success":true}`, whether the key is right or not; check the result through `/home/live`.
- **`on`:**
  - bool → 0/1
  - **any string starting with `t` → toggle** (so `"true"`, a string, toggles; F4)
  - numbers are ignored
- **`strip`:** `| 3`, clamped 1..3.
- **One of** (priority): `relay` (0-based, key, `on` needed), `mood` (no key), `scene` (0-based, key), `alloff` (`| false`, so boolean `true` only, key), `strip` (`on` 0/1 only; `"t"` ignored).
  - A present but rejected higher-priority command still blocks the lower ones. Example: `relay` without a key blocks a `mood` in the same object.
- **Independent of that choice:** `mic` (bool only), `lvl` (`as<int>`: `"42"` → 42, `true` → 1, clamped 0..255), `away` (bool, **key**).
- **mic/lvl:** saved 3 s later, **only if the value changed** (cpp:1735-1736). They always forward `{"AudioReactive":{"enabled","inputLevel"}}`.
- **State output:** `"HomeGadgets":{"r":[8 bool],"sw":[8],"pir":[2]}`.
- **Info output:** `u["Home Gadgets"] = [onCount, " relays on &middot; <a href=\"/home\">open</a>"]`. RC4b appends `" &middot; "` and `"RC4b"`.

## 11. src codes (HgSource cpp:145-148; set in setRelay cpp:1313-1328) [code]

| Code | Name | Set by |
|---|---|---|
| 0 | BOOT | Never changed since boot |
| 1 | APP | JSON state `relay` (cpp:2224) |
| 2 | SWITCH | Wall switch (cpp:1361-1362) |
| 3 | MOTION | PIR actions and motion "undo" (cpp:1381, 1416) |
| 4 | SCENE | `/home/api?scene`, JSON `scene` (cpp:1728) |
| 5 | LINK | `/home/api?relay` (cpp:2073) |
| 6 | SCHEDULE | Schedule actions (cpp:1649) |
| 7 | TIMER | Auto-off, **also for "stays on" relays** (cpp:1427) |
| 8 | AWAY | Away toggles and window end (cpp:1670, 1694-1697) |
| 9 | CLAP | Clap actions (cpp:1849) |
| 10 | RESTORE | Staged power-on restore (cpp:1400) |
| 11 | ALLOFF | Direct all-off (`/home/api?alloff`, JSON `alloff`) (cpp:1733) |

- An "all relays off" **action** (type 7) inside a scene, schedule or clap list carries that list's src.
- `setRelay` changes `src`/`ago` **only when the state changes** (cpp:1317).
- It always cancels a pending power-on restore for that relay (cpp:1315).
- **"Stays on"** (`keep`): automations use `autoRelayOff`, which never switches a keep relay **off** (cpp:525). That covers action types 2 and 3 (when the relay is on) and 7, undo, all-off, away and schedules. Direct relay commands, wall switches and auto-off do switch it off.

## 12. Schedules, away, clap runtime [code]

**Clock** (handleClock cpp:1608-1626):
- Every 500 ms. Clock invalid → `clockMin=0`, nothing runs.
- On a new local minute m:
  - if the previous minute is known and `0 < m-prev <= 6`, the skipped minutes run late (catch-up);
  - otherwise only m runs (first sync, jumps backwards or more than 6 minutes forward).
- `handleAway` runs every loop.

**checkSchedules** (cpp:1629-1652):
- **Day bit:** bit 0 = Monday .. bit 6 = Sunday (`(weekday+5)%7`, TimeLib 1 = Sunday).
- **Skipped when** `!en`, or the day bit is not set, or `firedDay == today` (local day number).
- **Due minute:**
  - `t=0` → `m`
  - `t=1`/`2` → sunrise/sunset minute + `m`, clamped to 0..1439 (never wraps)
  - no location (sunrise 0) → never runs
- When due: `firedDay = today`, then the actions run with src 6.
- A reboot loses `firedDay`, so a schedule can run twice in the same minute after a reboot (documented in the readme).

**Away** (handleAway cpp:1658-1701):
- **active** = `en` && clock valid && the current minute is in `[from,to)`. `from>to` wraps past midnight; `from==to` is empty.
- **Window opens:** apply `mood` to strips `ms` (if `mood>=0`) and remember those strips.
- **Window closes or the clock is lost while `en`:**
  - `autoRelayOff` for every relay the simulation used (src 8)
  - the remembered strips go off
- **Away switched OFF (`en` false) inside the window:** nothing is switched ("someone came home").
- **While active,** for each relay in `rel` minus the `keep` relays:
  - first toggle after a random pause of `min`..`max` minutes (uniform, ms resolution);
  - then it toggles each time the pause runs out (off through `autoRelayOff`, on through `setRelay`, src 8);
  - a relay deselected while active → `autoRelayOff` at once.

**setAway** (JSON `away`): changes `en` and saves 3 s later (cpp:1704-1710).

**Clap** (cpp:1771-1880):
- **Ready only if** `clap.en`, mic on, audioreactive present and enabled, and no lit strip (WLED `bri>0`, segment active and on) shows an effect with `v` or `f` in the metadata flags field (after the 3rd `;`).
- **Claps** are rising edges of `samplePeak`:
  - a peak within 150 ms of the last clap is ignored;
  - a gap over 800 ms or a 4th clap spoils the sequence;
  - the first clap needs a quiet second (the loudest `volumeSmth` of the 100 ms slots 0.2-1 s before must be 30 or less) and no late loop in the last 800 ms.
- **Evaluated** 1 s after the last clap:
  - 2 claps → `a2`, 3 claps → `a3`, src 9;
  - then a 2 s cooldown.
  - A late loop during a sequence spoils it.

**Timers** (handleTimers cpp:1389-1431):
- **Staged restore:** 400 ms after setup, then one relay per 400 ms, lowest index first, src 10. It does not mark the state dirty.
- **Motion:** "undo" runs `hold` s after the last motion, if `undo` is set (types 1 → autoRelayOff, 4/5 → strips off).
- **Auto-off:** `ao` minutes after `onSince`.
- **Saves:** relay "last" state (only when `po==2`) and the config, 3 s after the last change.

**Inputs** (cpp:1337-1387):
- 1 s settle time after `initHardware()`: states follow the inputs, but no actions run and nothing is counted.
- A toggle-mode switch flips its relay on every change. A follow-mode switch sets the relay to the switch level.
- "Only at night": without a location, `hgIsDayTime()` is false, so it always counts as night (cpp:369-376).

## 13. Files, NVS, migration (cpp:96-108, 635-729, 2134-2170) [code]

- **Config:** `/hgcfg_wsec.json`, written to `/hgcfg_wsec.json.tmp` first and then renamed. The size is checked; a short write keeps the old file.
- **Relay "last" state:** `/hgstate_wsec.json` = `{"r":<mask of all relays>}`. On boot only `po==2` relays take their bit.
- **C1 (RC3):**
  - `loadConfig` tries `cfg`, `cfg.tmp`, then the old names `/home.json` and `/home.tmp`, and uses the first that parses.
  - `migrateFiles` renames old names; it deletes an old copy only when a valid new file exists.
  - `saveConfig` removes old names after a successful save.
  - `loadRelayStates` falls back to `/hgstate.json`.
- **Key:**
  - NVS first.
  - Else the old key file `/hgwsec.json` (or `.tmp`), which wins over a legacy `key` inside the config (N-a).
  - Then it is saved to NVS and the old files are removed.
  - The config is rewritten when it still held the key, unless NVS failed.
- **Power-on (setup):** `po==1` → on, `po==2` → last state, all through the staged restore.

## 14. Parser and web-server edge cases [code]

- **`\uXXXX` escapes are not decoded:** `ARDUINOJSON_DECODE_UNICODE 0` (`wled.h:166`).
  - ArduinoJson 6.18.1 keeps the backslash and the characters `u` + 4 hex digits **as literal text** (`ArduinoJson-v6.h:5778-5789`).
  - So `{"n":"Café"}` stores the 10 characters `Café`, and `"Lamp\u0001 One"` stores `Lamp\u0001 One`.
  - hgCopyName only drops **raw** bytes below 0x20. ArduinoJson accepts raw control characters inside strings.
- **Other ArduinoJson rules:**
  - Nesting limit 10 (embedded mode) → TooDeep → `ce`.
  - Text after a root object/array is ignored.
  - Single quotes and unquoted keys are accepted.
  - `1.0` and `1e3` are floats: `| int` ignores them.
  - Integers are 32-bit: outside -2^31..2^32-1 they become floats.
- **POST /json/state (core):**
  - WLED compiles **its own** `AsyncJson-v6.h` (`wled.h:167`; same include guard as the library's), whose `canHandle` has **no content-type check** (`AsyncJson-v6.h:124-136`). So `text/plain` with a JSON body is accepted.
  - The body is kept only if `0 < size < 16384` and it is not a plain post; otherwise a bare 400 (or 413 when over 16384).
  - A parse error or a non-object → **400 `{"error":9}`** (`wled_server.cpp:431-435`).
  - The library's `AsyncJson.h:208` content-type check is not used.
- **JSON `time`:** from any client it sets the clock (`json.cpp:434-437`, `ntp.cpp:579-592`). It is ignored only if the current source is better than JSON (NTP) **and** the difference is under 60 s. It moves schedules and away (X21).

## 15. Limits (cpp:44-91, 151-156, 217-221)

| Item | Value |
|---|---|
| Relays / switches / PIRs / strips | 8 / 8 / 2 / 2 |
| Actions per list | 8 |
| Scenes | 6 |
| Custom moods | 12 (ids 100-111) |
| Built-in moods | 23 (ids 0-22) |
| Schedules | 8 |
| Name length | 23 bytes |
| Effect / palette name | 32 bytes |
| Upload body | 12288 bytes |
| Command queue | 16; 8 commands per loop |
| `hold` | 5-3600 s |
| `ao` | 0-1440 min |
| Sunrise/sunset offset | ±180 min |
| Away pause | 1-720 min |
| Catch-up | up to 6 minutes |
| `px` | 16 samples |
| Stats | 48 slots × 30 min |
| Clap timing | 150 / 800 / 1000 / 2000 ms |
| Clap quiet threshold | volume 30 |

## 16. RC4b delta (live cpp `31eb074a`, 18:21; line numbers are RC4b) [code]

1. **`rel`:** `"rel":"RC4b"` in GET /home/cfg after `pinSet` (:118, :1124). The JSON info array gets `" &middot; "` and `"RC4b"` (:2402-2403).
2. **NVS `mig` flag** (:117, :1233, :1239-1245, :2272-2291):
   - Once any key has been stored in NVS, keys are **never** again taken from files (the old key file or a legacy config key).
   - If NVS loses the key, a new one is generated.
   - RC2/RC3b boards get the flag at their first RC4b boot.
3. **`/home/ws`** (contract v2.2):
   - Registered **before** `/home` (:2019-2027).
   - **Handshake:** `AsyncWebSocket::canHandle` needs `GET`, the exact URL and `Upgrade: websocket` (lib `AsyncWebSocket.cpp:1154-1167`). A missing `Sec-WebSocket-Version`/`-Key` → 400; a version other than 13 → 400 with `Sec-WebSocket-Version: 13` (:1170-1193).
   - **On connect** (:1937-1951), after the 101: the key is checked with `keyOk` (an empty key also fails), and the usermod must be enabled.
     - Up to 2 slots.
     - Otherwise `client->close()`: a close frame **without** a status code (lib :484-506).
     - A 3rd client is refused. Accepted viewers are never dropped: there is no `cleanupClients` (:1967-1968).
     - A new client resets the hash, so a frame follows at once.
   - **Disconnect:** frees the slot under a mutex (20 ms wait).
   - **pushLive** (:1964-2014), called from loop():
     - Every 50 ms. Skipped while nobody is connected or the largest free heap block is under 16 KB.
     - **Frame:** `'H', 1, bri, n0, n1`, then RGB. `n = min(48, len)`; 0 if the segment is missing. The sample index is `start + (n>1 ? j*(len-1)/(n-1) : 0)`.
     - White is added; the colours are **not** brightness-scaled; all 0 while `bri` is 0.
     - An identical frame (FNV-1a hash) is skipped until 1 s after the last sent frame.
     - A client with a non-empty send queue is skipped.
     - Frames are skipped if the mutex is busy.
     - Client data is ignored. Ping → pong and close → echo are done by the library.

## 17. Firmware bugs and oddities (all [code], none tested on hardware)

| # | Sev | Finding | Lines |
|---|---|---|---|
| F1 | low | **A failed `cap` drops the save of the whole upload.** `captureMood` sets `ce` (no free slot, bad strip, missing segment), so `saveConfig()` is skipped. The other sections of the same POST are live in RAM but lost at the next reboot, unless a later mic/lvl/away change saves them. `newkey` in the same POST is still saved to NVS | cpp:1120, 1138, 1750-1764 |
| F2 | low | `cap` with the `id` of an **unused** slot plus `rep` of a built-in that already has an override creates a **second** override. applyMood uses the lower slot; a later rep-only cap updates only that one | cpp:1129-1134, 1538-1540 |
| F3 | low | `/home/api?mood=abc` or `?mood=` (empty) applies **mood 0 (Pub Vibes)** and answers 200: `toInt()` returns 0. `strip=abc` → LED 1 | cpp:2051-2054, 2068, 2075-2076 |
| F4 | info | JSON state `"on":"true"` (a string) **toggles** (any string starting with `t`), while `/home/api on=true` switches on | cpp:2219 vs 2060 |
| F5 | low | Any config upload that changes a pin, `al`, switch type or `inv` **restarts the auto-off timer of every relay that is on** (`onSince = now`), resets switch/PIR states and starts a 1 s blind time | cpp:955, 959-966, 1232, 1249, 1262, 1266 |
| F6 | low | The "ran today" carry matches only type, minute and days. A **new** schedule with the same time and days as one that already ran today will not run until tomorrow. Of two identical-time schedules, both copy the first | cpp:935-937 |
| F7 | info | An unnamed schedule's name is computed from its slot at output time, so "Schedule 3" becomes "Schedule 2" after an earlier one is deleted. A non-object `sch` element leaves a hole | cpp:919-920, 1043-1049 |
| F8 | info | `live.ago` of a never-switched relay = uptime (`lastChange` 0) | cpp:1993-1995 |
| F9 | info | `live.vol` is **-1 when the mic is off** (audioreactive disabled → `getUMData` false), the same value as "no audioreactive" | cpp:1984; `audio_reactive.cpp:1716` |
| F10 | info | `stats.ts` = statClock, but `live.ts` = hgTimeValid. They can differ (e.g. the first second after sync) | cpp:2025, 1997 |
| F11 | low | `\u` escapes are stored literally (section 14). JSON.stringify escapes control characters and **lone surrogates**, so e.g. a half emoji left by a cut in the page ends up as literal `\ud83d` text in a name | `wled.h:166`, `ArduinoJson-v6.h:5778-5789` |
| F12 | low | A full command queue (16) answers `/home/api` with 400 `{"ok":false}`, indistinguishable from bad parameters. JSON-state commands are dropped silently | cpp:1714-1718, 2085-2086 |
| F13 | info | A form-urlencoded, multipart or `name=` text/plain body on POST /home/cfg answers **413 "size"** (misleading) | lib `WebRequest.cpp:171-181`; cpp:1913, 2114-2116 |
| F14 | info | After one wrong PIN, even the right PIN gets 401 for 3 s. The page must not treat that 401 as "wrong PIN" | cpp:2098 |
| F15 | info (core) | POST /json/state accepts **any** Content-Type, and invalid JSON gets 400 `{"error":9}`. **TEAM_BOARD 4b "needs application/json, otherwise 404" is wrong.** A cross-site text/plain POST (no CORS preflight) reaches /json/state; relay commands still need the key | `AsyncJson-v6.h:124-136`; `wled.h:167`; `wled_server.cpp:431-435` |
| F16 | info | At the away window end, the away-mood strips go off even if someone chose another look meanwhile (but did not switch away mode off) | cpp:1671 |
| F17 | info | A forward clock correction of 6 minutes or less (NTP resync, or JSON `time` from any LAN page, X21) runs the skipped minutes' schedules late: intended for stalls, but indistinguishable | cpp:1619 |
| F18 | info | `/home/api?strip=1&on=t` → 400, while JSON `"on":"t"` for a strip is silently ignored | cpp:2082, 2233 |

No crash, overflow or security bug found. X13, X15-X17 and X20 are implemented as the board describes, except that the status order is **403 → 413 → 401 → 503** (key first; the board's 4b correction "413 before 403" is outdated).

## 18. Mock code and test results in `rc3_wip/`

| File | md5 | What |
|---|---|---|
| `server.js` | see the report | The full testbench mock updated to RC3 + RC4b: every behaviour above, plus a mock clock, the sim routes and `/home/ws`. Run it with `--repo ../../../WLED-main` from `rc3_wip` (the default path is relative to `testbench/`).<br>**Options:** `--time`, `--ts 0\|1`, `--sun HH:MM,HH:MM`, `--ws on\|off`, `--fxsim <module>` (replaceable LED colour function `simplePixel`).<br>**Routes:** `/__time?set=18:59:50&advance=15m&ts=1&sun=06:30,18:45`, `/__reboot` (keeps the files and the NVS key; staged restore), `/__fs` (mock file system + NVS), `/__sim {"clap":2}` besides `pir`/`sw`/`vol`/`key` |
| `hg_rc3_lib.js` | | Pure, self-contained functions to lift:<br>- `ajParse`, `asInt`/`orInt`/`orBool`/`orStr`, `isPlainPost`, `routeMatches`, `keyOk`<br>- `cfgPostStatus`, `pinOk`, `parseApiOn`, `apiCommand`, `jsonStateCommands`<br>- `copyName`, `parseActions`, `applySchedules`/`schedulesOut`, `applyAway`, `captureSlot`<br>- `minutesToCheck`, `dueSchedules`, `inWindow`, `awayStep`, `updateStats`/`statsJson`, `pxSamples`<br>`node hg_rc3_lib.js` → 19/19 self-test |
| `probe_rc3.js` | | 39 end-to-end checks; `node probe_rc3.js [--server <mock>] [--port 18081]` → **39/39** against `server.js` |
| `home_gadgets.live_1821.cpp` | `31eb074a` | Copy of the RC4b source this was checked against |

**`validate_rc3.js` (the independent suite) against `rc3_wip/server.js` (RC4b):**

| Instance | Pass | Fail | Skip | Why skipped |
|---|---|---|---|---|
| Main (no PIN) | 141 | 6 | 19 | PIN tests need a PIN instance |
| PIN instance (`--pin 4321 --apply-delay 700 --leds 10,60`) | 149 | 6 | 11 | Tests that need the spawn-only instances (key-delay, fresh start) |

**The same 6 failures in both runs, analysed:**
- **H10:** a test error. It posts `"Lamp\u0001 One"` (escaped) and expects `"Lamp One"`. Per F11/section 14 the device stores `Lamp\u0001 One` literally. Send a **raw** 0x01 byte to test hgCopyName.
- **C21, C22, D10, D16e:** a cascade. H10 leaves relay 1 set to "stays on" because its restore didn't run after the failed assertion. All four pass when run without H10 (`--only`).
- **D3:** a test error. It expects 404 for text/plain on /json/state from the library's `AsyncJson.h:208`, which the build doesn't compile (F15).
