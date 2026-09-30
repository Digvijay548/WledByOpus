# Agent A notes: idea 10 ("who switched it"), idea 15 (GET /home/stats), /home/live fields, CMD_AWAY

Files: `agentA/home_gadgets.cpp` (edited copy of `base/home_gadgets.cpp`), `agentA/diff.txt` (`diff -u base agentA`).
Line numbers below "A:" refer to `agentA/home_gadgets.cpp`.

## 1. Changes by function / place

| Place (contract anchor) | Change |
|---|---|
| `HgCmdType` (A:108) | + `CMD_AWAY` (appended, existing values unchanged) |
| `struct HgCmd` (A:109) | + `uint8_t src` (HgSource; only CMD_RELAY uses it). Queue item grows 3 → 4 bytes; `xQueueCreate(..., sizeof(HgCmd))` in setup() adapts by itself |
| after `HG_RELAY_TOGGLE` (A:117-129) | `enum HgSource` exactly as contract section 6; stats constants `HG_STAT_SLOTS` (48), `HG_STAT_SLOT_S` (1800), `HG_STAT_DAY_S`, `HG_STAT_TICK_MS` (1000), `HG_STAT_MAX_GAP_MS` (10000) + `static_assert` |
| `struct HgRelay` (A:145-146) | + `uint8_t lastSrc`, `uint32_t lastChange` (**uptime seconds** from hgUptimeSec(), 0 = since boot; see rollover fix R5) |
| after `hgIsDayTime()` (A:293-314) | `static bool hgTimeValid()` = `toki.getTimeSource() > TOKI_TS_UDP`; `static uint32_t hgLocalClock()` = local seconds since 1970, loop() only (see section 3); `static uint32_t hgUptimeSec()` = seconds since boot including millis() wraps (R5) |
| members after `apiKey` (A:333-344) | `uint8_t curSrc = SRC_APP`; `bool settled` (R1); stats: `statOnMs[8]`, `statPir[2][48]`, `statSlot`, `statClock`, `statDay`, `statDayStart` (uptime seconds), `statLast`, `statTick` |
| declarations | `queueCmd(..., uint8_t src = SRC_APP)`; + inline `inputsSettling(now)` (R1), `updateStats(uint32_t)`, inline `resetStats()`; `setRelay(i, on, src)`; inline `autoRelayOff(i, src)` (still skips "keep"); + `serveStats()` |
| `setDefaults()` relay loop | `lastSrc = SRC_BOOT`, `lastChange = 0` (setDefaults only runs in setup(), so uploads never reset them) |
| `initHardware()` | one line `settled = false;` after `settleUntil = ...` (R1, allowed by the coordinator) |
| `setRelay()` | records `lastSrc = src`, `lastChange = hgUptimeSec()` only when the state really changes (after the `r.state == on` early return) |
| `readSwitches()` | `settling = inputsSettling(now)` (R1); wrap-proof AC pulse check (R2); both setRelay calls pass `SRC_SWITCH` |
| `readSensors()` | `settling = inputsSettling(now)` (R1); counts each debounced motion start in `statPir[i][statSlot]` (saturates at 255, skipped during the 1 s settle time); `curSrc = SRC_MOTION` before `runActions()` |
| `handleTimers()` | calls `updateStats(now)` first; wrap-proof restore check (R3); staggered restore sets `lastSrc = SRC_RESTORE`, `lastChange = hgUptimeSec()`; `curSrc = SRC_MOTION` before `undoActions()`; auto-off / state save / config save compare against a fresh `millis()` (R4); auto-off uses `setRelay(i, false, SRC_TIMER)` (still switches "keep" relays off) |
| new `updateStats()` (A:1165, right after handleTimers) | on-time accounting per loop + day / half-hour bookkeeping (section 3); the uptime-based part uses hgUptimeSec() (R6) |
| `runActions()` / `undoActions()` | signatures unchanged; every setRelay/autoRelayOff passes `curSrc` |
| `queueCmd()` / `executeCmd()` | src stored in HgCmd; CMD_RELAY → `setRelay(c.a, ..., c.src)`; CMD_SCENE → `curSrc = SRC_SCENE` then runActions; CMD_ALL_OFF → `autoRelayOff(r, SRC_ALLOFF)`; CMD_AWAY → `setAway(c.a)` (defined by B) |
| `addRoutes()` | `/home/stats` registered right after `/home/live`, before `/home` |
| `serveLive()` | now `new HgPrivateJsonResponse()` (finding X13); adds `"src":[8]`, `"ago":[8]`, `"away":awayNow()`, `"clap":clapArmed()`, `"ts":hgTimeValid()` |
| new `serveStats()` (after serveLive) | `{"ts":0/1,"on":[8],"pir":[[48],[48]]}` via `HgPrivateJsonResponse`, `Cache-Control: no-store`, no key |
| `serveApi()` | relay command queued with `SRC_LINK` |
| `readFromJsonState()` | relay command queued with explicit `SRC_APP`; new independent line after mic/lvl: `if (keyValid && um["away"].is<bool>()) queueCmd(CMD_AWAY, ...)`; comment block lists the away command. Else-if chain otherwise unchanged |

Not touched: loop(), setup(), saveKey() (coordinator handles it), initHardware() apart from the one R1 line, everything in B's and C's anchors.

## 1b. Rollover fixes (requested by the coordinator; bugs in base code inside A's functions)

`now` in these functions is the `millis()` value loop() read at its start. Everything below is marked `rollover fix` in the source.

| # | Where | Bug in the base | Fix |
|---|---|---|---|
| R1 | readSwitches / readSensors (+1 line in initHardware) | `settling = (int32_t)(now - settleUntil) < 0` turns true again once `now - settleUntil` passes 2^31 ms (~24.8 days after initHardware). All switches and PIRs are then ignored for the next ~24.8 days. | Member `bool settled` (false in initHardware) is latched by `inputsSettling(now)` the first time the settle time has passed; `settling = !settled`. The signed compare stays only for the first second, where it is correct (it also handles a `now` older than a settleUntil set by a reinit in the same loop). |
| R2 | readSwitches, AC pulse check | `(int32_t)(now - hgAcLastPulse[i]) < HG_AC_HOLD_MS`: a switch with no pulse for more than 2^31 ms (and a never-pulsed one, since the value starts at 0) reads as ON. That gives a false relay toggle, then the switch is dead for ~24.8 days. | `const uint32_t lastPulse = hgAcLastPulse[i]; raw = level \|\| (millis() - lastPulse < HG_AC_HOLD_MS);` The pulse time is read **before** millis(), so it can never be newer than the value it is compared with (millis is monotonic, `esp32-hal-misc.c:171`). The unsigned age therefore can't be negative. A stale or 0 time reads "recent" only for 60 ms every 49.7 days, shorter than the 100 ms AC debounce, so it never flips. I preferred this over the suggested two-sided check: `last - now < 60` misses pulses when loop()'s `now` is more than 60 ms old (e.g. after a config save earlier in the same loop). That would only cause a debounce-absorbed glitch, but this version has no such case. |
| R3 | handleTimers, staggered restore | `(int32_t)(now - restoreNextAt) >= 0` waits up to another ~24.8 days if the usermod is enabled 24.8–49.7 days after boot (restoreMask is still set). | `(uint32_t)(restoreNextAt - now) > HG_RESTORE_STEP_MS`: restoreNextAt is never set more than one step ahead, so "due" means "no longer 0..400 ms ahead". Wrap-proof, including across the millis() wrap. Fires 1 ms later than before. |
| R4 | handleTimers: auto-off, state save, config save | Same trap the other way round: `setRelay()` (onSince), `markConfigDirty()` and `setRelay()` (stateDirtyAt) store a `millis()` taken **after** loop() read `now` (executeCmd, readSwitches and readSensors run before handleTimers). If millis() ticked in between, `now - r.onSince` wraps to ~4.29e9 and **a relay with an auto-off timer is switched off right after it was switched on** (by app, Siri, wall switch or motion). The 3 s save delays are skipped too, so a mic-level slider can cause a flash write per command. Traced in the code; not reproduced on hardware. | `const uint32_t nowMs = millis();` is used for these three comparisons. All three stamps come from loop()-task millis() calls made earlier, so `nowMs - stamp` can't be negative. |
| R5 | "ago" (setRelay, restore, serveLive) | new code: millis-based `lastChange` would wrap after 49.7 days. That is realistic for a "stays on" fridge relay, which would show "2 min ago". | `lastChange` stores `hgUptimeSec()` = `millis()/1000 + getRolloverMillis()*4294967` (same formula as WLED's `/json/info` uptime, `json.cpp:890`). serveLive reads `lastChange` before the uptime and prints `up > changed ? up - changed : 0`. |
| R6 | updateStats, uptime mode | new code: `now - statDayStart` (millis) could wrap into "same day" if the usermod was disabled for more than 49.7 days. | `statDayStart` and the uptime slot use `hgUptimeSec()`. |

Checked and left as they are (no trap, or harmless):
- `updateStats` gap / tick: unsigned elapsed values, compared every loop. They could only misbehave if the usermod is disabled for more than 49.7 days, and then they count at most 10 s of bogus on-time once.
- `now - s.lastMotion` (hold timer): lastMotion is always the loop's `now`.
- `now - s.rawSince` in readSwitches/readSensors: rawSince is `now`, or `millis()` from initHardware. The latter is newer than `now` after a reinit in processPendingConfig, so the debounce passes at once, but only inside the settle time. Harmless.
- `now > HG_KEY_GEN_DELAY_MS` and `now > HG_AUDIO_APPLY_MS` (loop, not mine): after a wrap they just wait 5 s / 3 s once. The key and audio prefs are long done by then.
- **For B and C:** check your own drafts for the same two traps. (a) `(int32_t)(a - b)` compares that can stay unevaluated for more than 24.8 days. (b) `now - x` where `x` was stored with `millis()` later in the same loop (e.g. after setRelay / applyMood / file writes). In that case use a fresh `millis()`, or read the stamp first and millis() second.

## 2. WLED / library APIs verified (file:line)

WLED repo (read-only):
- `toki` is a global: `wled00/wled.h:761` `WLED_GLOBAL Toki toki`; header included at `wled00/wled.h:136`.
- `Toki::getTimeSource()` `wled00/src/dependencies/toki/Toki.h:142` (non-const, fine on the non-const global); starts at `TOKI_TS_NONE` (`Toki.h:59`); source codes `Toki.h:31-42` (NONE 0, UDP 5, BAD 10, UDP_SEC 20, SEC 40, RTC 60, JSON 70, UDP_NTP 110, MS 120, NTP 150).
- Who sets it: NTP `wled00/ntp.cpp:326` (TOKI_TS_NTP); JSON/HTTP API `ntp.cpp:579-586` (TOKI_TS_JSON), called from `wled00/json.cpp:434-436` ("time") and `wled00/set.cpp:1255`; the WLED UI sends `time` with every command `wled00/data/index.js:1766`; WLED sync UDP `wled00/udp.cpp:382-387` (UDP / UDP_SEC / UDP_NTP); RTC usermod `usermods/RTC/RTC.cpp:17` (TOKI_TS_RTC). Precedent for testing the source in a usermod: `usermods/deep_sleep/deep_sleep.cpp:83`.
- `ntpLastSyncTime` `wled00/wled.h:753` (init `NTP_NEVER`, `wled.h:750`): set after an NTP reply `ntp.cpp:250`, but also on DNS failure to pause 5 min `ntp.cpp:241`, and it ignores JSON/RTC/UDP time. Not used.
- `localTime` `wled00/wled.h:752`; `updateLocalTime()` `wled00/ntp.cpp:348-353` (declared `wled00/fcn_declare.h:227`) = `tz->toLocal(toki.second() + utcOffsetSecs)`; `tz` is `static` in `ntp.cpp:27`, so updateLocalTime() is the only way to get local time.
- `handleTime()` `ntp.cpp:178-193` updates localTime once per second; it runs before usermods in the same loop (`wled00/wled.cpp:82` handleTime, `wled.cpp:104` UsermodManager::loop).
- Countdown mode overwrites localTime: `ntp.cpp:380-385` (`countdownMode`, `wled.h:549`); effects read localTime, e.g. Scrolling Text `wled00/FX.cpp:6392`. Reason for the save/restore in hgLocalClock().
- A synced time is never downgraded: all `toki.setTime` calls pass >= TOKI_TS_UDP (`ntp.cpp:326,586`, `udp.cpp:387`), and UDP only overwrites a worse source (`udp.cpp:382`).
- `setTimeFromAPI` overrides even NTP time if the difference is >= 60 s (`ntp.cpp:584`); NTP resyncs every `NTP_SYNC_INTERVAL` = 42000 s (`ntp.cpp:25`). See risks.
- `getRolloverMillis()` declared `wled00/fcn_declare.h:301`, defined `wled00/wled.cpp:33`. It counts millis() wraps at `wled.cpp:170-172`, which runs after `UsermodManager::loop()` (`wled.cpp:104`). Uptime formula used by WLED itself: `wled00/json.cpp:890`.
- loop() order (base file, loop()): `now = millis()` → processPendingConfig → executeCmd → readSwitches → readSensors → handleTimers. setRelay (`onSince`, `stateDirtyAt`) and markConfigDirty (`cfgDirtyAt`) use `millis()`, which is the basis of R4.

ESPAsyncWebServer (`.pio/libdeps/home_gadgets/ESPAsyncWebServerWLED/src/`):
- Prefix match: `WebHandlerImpl.h:118` (`_uri != url && !url.startsWith(_uri + "/")`), so "/home" would catch "/home/stats" if registered first.
- `beginResponseStream()` = `new AsyncResponseStream(contentType, bufferSize)` `WebRequest.cpp:808-810`, default `TCP_MSS` (`ESPAsyncWebServer.h:256`, `WebResponseImpl.h:123`). `HgPrivateJsonResponse` uses the same constructor with the default buffer size, so the swap in serveLive is equivalent apart from the removed header.
- Default headers are copied into every response `WebResponses.cpp:96-97`; WLED adds `Access-Control-Allow-Origin: *` as a default header `wled00/wled_server.cpp:352`.

arduino-esp32 2.0.18 (`~/.platformio/packages/framework-arduinoespressif32`):
- `Print::printf` has `__attribute__((format(printf,2,3)))` `cores/esp32/Print.h:75`, so -Wformat checks every new printf.
- `millis()` is an out-of-line function `cores/esp32/esp32-hal-misc.c:171`, so the compiler cannot move the `lastChange` load (serveLive) or the `hgAcLastPulse` load (readSwitches, R2) past it.
- `uint32_t`: V4 toolchain (xtensa-esp32-elf, GCC 8) `unsigned int`; V5 toolchain (xtensa-esp-elf) `long unsigned int` (checked with `-dM -E`). All uint32_t printf arguments are cast to `unsigned`.

### What was actually checked
- Full-file syntax check (`-fsyntax-only`) with the V4 toolchain and the exact flags, defines and include paths of the `home_gadgets` env (from `.pio/build/home_gadgets/idedata.json`, read-only; nothing written to the repo), plus `-Wall -Wextra -Wsign-compare -Wformat`, on a scratch copy with 3 test stubs (`setAway`, `awayNow`, `clapArmed`). Result: 0 errors. The warnings are the same 3 as the unmodified base file (2 in WLED's asyncDNS.h, 1 -Wempty-body in resolveBuiltinMoods with -Wextra). Nothing new.
- The new printf/comparison expressions compiled as a snippet with both V4 and V5 toolchains with `-Wformat -Wformat-signedness -Wsign-compare`: no warnings.
- Merge simulation: fake B and C drafts inserting a marker at every contract-section-7 anchor; `git merge-file` A+B → 0 conflicts, (A+B)+C → 0 conflicts, all 17 markers present, the rest identical to my draft. Scratch files are in `agentA_check/`.
- All three checks above were re-run after the rollover fixes, with the same results. The old and new formulas of R1-R4 were also evaluated numerically in 32-bit arithmetic near 2^31 / 2^32 (python). The old ones misbehave as described; the new ones don't.
- Not done: pio link build, V5 full-file build, hardware test.

## 3. Decisions where the contract left room

1. **hgTimeValid() = `toki.getTimeSource() > TOKI_TS_UDP`.** It accepts NTP, WLED app/browser time (JSON), RTC and UDP time copied from a synced instance. It rejects TOKI_TS_NONE (uptime clock since 1970) and TOKI_TS_UDP (copied from an unsynced instance). `ntpLastSyncTime` was rejected: NTP only, and it is also changed on DNS errors (`ntp.cpp:241`). Useful side effect: without internet, opening the WLED main UI and pressing anything sets the clock (index.js:1766). The /home page does not send `time` today (checked home.htm). Suggestion for the page owner: add `"time":Math.floor(Date.now()/1000)` to its /json/state posts.
2. **hgLocalClock()** (extra helper, A-owned name) calls updateLocalTime() but puts the old `localTime` back, so countdown mode and the Scrolling Text effect are not disturbed. loop() only. B may reuse it for schedules/away.
3. **Sources:** c.src is only used by CMD_RELAY. A scene started from a Siri link reports `4 scene`, not `5 link` (contract: CMD_SCENE → SRC_SCENE). "All relays off" inside a scene or motion list reports the caller (`curSrc`); only CMD_ALL_OFF reports `11`. serveApi/readFromJsonState pass an explicit src only on the relay command. The other queueCmd calls keep the default.
4. **"ago"** = `hgUptimeSec() - lastChange` (seconds; `lastChange` is uptime seconds, see R5, a change from the task's "uint32_t millis"). `lastChange` is read before the uptime, and a negative difference prints 0, so a change made by loop() at the same moment can't produce a wrapped value. Relays that never changed show uptime, also beyond 49.7 days.
5. **"ts"**: /home/live sends `hgTimeValid()` (clock now). /home/stats sends `statClock` ("counters follow the clock"). The two differ for at most 1 s after the first sync.
6. **On-time accounting** is separate from `onSince`. Each loop, updateStats() adds the time since the previous loop to every relay whose `state` is on, in ms (`statOnMs`, max ~90 M per day, no overflow). So "on" always includes the running period, accurate to about one loop. A gap of 10 s or more between two calls is not counted: it means the usermod was disabled and the relay pins were released.
7. **Day / half hour** are checked once per second (updateStats, max 1 s late at midnight).
   - Clock valid: day = local seconds / 86400. Reset when it changes. Slot = local second of day / 1800 (DST days simply have 46 or 50 half hours of real time).
   - No clock: a "day" is 24 h of uptime starting at boot. Slot = uptime in that period / 1800, reset every 24 h. For the first day this is exactly "since boot".
   - **First sync:** if everything counted so far happened after last local midnight (counted seconds <= local second of day), the on-times are kept. The motion counters are shifted from "half hours since boot" to the local half hour in which each boot-relative half hour began (up to 30 min early). Otherwise (counting started before midnight) everything is reset. If the clock were ever lost again (WLED never does this), the counters reset and uptime mode restarts.
8. **Motion starts** = debounced LOW→HIGH of the PIR output, outside the 1 s settle time after boot or reconfiguration. They are counted even if the sensor's actions are disabled or "night only" blocks them: the stats show presence, not automations. To count only enabled sensors, add `s.enabled &&` in readSensors.
9. **Privacy (X13):** /home/live and /home/stats both use `HgPrivateJsonResponse` (no `Access-Control-Allow-Origin`). No key is needed.

## 4. Risks

- [code] **B and C:** `awayNow()` and `clapArmed()` are called from serveLive, i.e. in the AsyncTCP task. They must be plain reads of members kept up to date in loop(). No `updateLocalTime()`/`hgLocalClock()` (it may `delete`/`new` WLED's `tz`), no TimeLib `hour()/minute()` (shared static cache), and no segment or file access. Please check this at merge time.
- [code] My draft does not compile alone (`setAway`, `awayNow`, `clapArmed` missing, as agreed). It compiles with stubs, see section 2.
- [code] **Breaking change:** /home/live no longer sends `Access-Control-Allow-Origin: *`. The /home page is same-origin and not affected. Any cross-origin browser dashboard that polled /home/live will stop working. Non-browser clients (curl, Home Assistant REST) are fine.
- [code] **Time can be moved by any web page:** WLED accepts `"time"` in /json/state from any origin and applies it even over NTP time if it differs by 60 s or more (`ntp.cpp:584`), until the next NTP sync (up to 42000 s later). This can shift the stats midnight, and more importantly B's schedules and away window (relays). This is WLED-wide behaviour, not new code, but relays now depend on the clock. Worth a line in the readme or a board finding.
- [code] **R4 is a real functional bug in the base** (auto-off relays can switch off right after being switched on). I traced it in the code but did not reproduce it on hardware. It only affects relays with an auto-off time, and only when millis() ticks between loop()'s `now` and the setRelay call. That is likely whenever a mood or file write runs earlier in the same loop.
- [code] hgUptimeSec() can be 49.7 days too small during the single loop iteration in which millis() wraps (WLED counts the wrap after the usermods). Worst cases, once per 49.7 days: a relay switched in exactly that iteration shows "ago" 49.7 days too high until its next change; in uptime-only stats mode (no clock) the counters could reset once. Negligible.
- [code] At the first clock sync, statPir is shifted in loop() while the web task may read it. One /home/stats response per boot can show a half-shifted array (plain-read pattern, X8).
- [code] On-time counts `state`, even if the relay's pin is not usable (`pinError`). Such a relay reports on-time while nothing is switched.
- [code] Motion counted before the first sync may land up to 30 min early (section 3.7). Counting that started before local midnight is dropped at first sync.
- [code] Stats are RAM only (contract): a reboot or power cut restarts "today" from zero.
- [code] updateLocalTime() may allocate (`new Timezone`) if the timezone setting changed after WLED's own handleTime() in the same loop. That is rare, and WLED does the same every second. The base `hgIsDayTime()` (not changed) still leaves localTime overwritten in countdown mode for up to 1 s, which is cosmetic.
- [code] `curSrc` is sticky. Any future caller of runActions()/undoActions() must set it first, or the previous source is reported.
- [unverified] Not built with pio (no link), not built as a whole with the V5 toolchain, and not run on hardware. The page's use of the new fields was not tested.

## 5. readme.md section (plain English)

(The labels in the table are suggestions. Match them to the words the page actually shows.)

### Who switched it?

Each appliance on the Home tab shows who switched it last and when, for example "Wall switch · 5 min ago" or "Motion 1 · just now". Possible sources:

| Shown as | Meaning |
|---|---|
| Start | not switched since the device started |
| App | this page, the WLED app or the JSON API |
| Wall switch | its wall switch |
| Motion | a motion sensor (switched on, or back off after the hold time) |
| Scene | a scene (also when started from a Siri link) |
| Siri link | a `/home/api?relay=...` link |
| Schedule | a schedule |
| Auto-off | the auto-off timer |
| Away | the away simulation |
| Clap | a clap command |
| Power-on | switched back on after a power cut |
| All off | "All off" |

The time counts from the last restart, so it resets after a power cut.

### Today's statistics

The Stats view shows, for today:
- **How long each appliance was on** (the time it is on right now is included).
- **How often each motion sensor saw movement**, in half-hour blocks (00:00-00:30, 00:30-01:00, ...). Each block counts up to 255.

The numbers start again at midnight. They are kept only in memory, so a restart or power cut also starts them from zero.

"Today" needs the correct time. The device gets it from the internet (Settings → Time & Macros), or from your phone when you use the normal WLED page. Until then the page shows "since start" and the half-hour blocks count from the moment the device started. When the time arrives, the counts from this morning are moved to the right half hours (up to 30 minutes off).

API additions (for the API section): `GET /home/stats` returns `{"ts":1,"on":[seconds x 8],"pir":[[48 counts],[48 counts]]}` (`ts`:0 = no clock yet, counting since start). JSON: `{"HomeGadgets":{"away":true,"k":"KEY"}}` switches the away simulation on or off (needs the key). `/home/live` and `/home/stats` can only be read by the device's own page, not by other web sites.
