# Agent B: schedules (idea 6) + away mode (idea 14)

Files: `agentB/home_gadgets.cpp` (edited copy of `base/home_gadgets.cpp`), `agentB/diff.txt` (`diff -u base agentB`).
The diff only adds lines: 228 added, 0 removed, 9 hunks, all at the B anchors of contract section 7.
Line numbers below: "B:" = agentB file, "base:" = base file.

The copy does not compile on its own, as expected. It uses A's names from contract section 6:
`hgTimeValid()`, `curSrc`, `SRC_SCHEDULE`, `SRC_AWAY`, `setRelay(i, on, src)`, `autoRelayOff(i, src)`. No stubs were added.

## 1. Changes, by function

| Where (anchor) | B: line | What |
|---|---|---|
| after `HG_CUSTOM_MOODS` | 46 | `HG_SCHEDULES = 8` |
| after `struct HgScene` | 173-204 | constants `HG_MIN_PER_DAY`, `HG_SCH_OFFSET_MAX` (180), `HG_SCH_CATCHUP_MIN` (5), `HG_CLOCK_CHECK_MS` (500), `HG_AWAY_GAP_MAX_MIN` (720); `enum HgSchedType {SCH_CLOCK, SCH_SUNRISE, SCH_SUNSET}`; `struct HgSchedule` and `struct HgAway`, both with in-class default member initialisers. `setDefaults()` is not touched. |
| members after `moods[]` | 337-346 | `schedules[8]`, `away`, runtime: `clockCheckAt`, `clockMin`, `awayActive`, `awayRelMask`, `awayMoodMask`, `awayNextAt[8]` |
| declarations after `captureMood()` | 386-391 | `handleClock()`, `checkSchedules()`, `handleAway()`, `setAway()`, inline `awayNow() const` |
| `applyConfig()` after "sc" | 732-767 | parses `"sch"`: name through `hgCopyName`, fallback "Schedule N". `en`; `d & 0x7F`; `t` 0-2; `m` 0-1439 (clock) or -180..180 (sun); actions through `parseActions()`. `firedDay` resets when `t`/`m` change. Parses `"away"`: `en`; `rel` 0-255; `from`/`to` 0-1439; `min` 1-720; `max` min-720; `mood` -1 or `isValidMood`; `ms` 1-3. |
| `fillConfig()` after "sc" | 848-874 | writes all 8 schedules (name fallback "Schedule N" if never named) and the `"away"` object with the contract field names |
| `fillConfig()` forPage | 907 | `lim[F("sch")] = HG_SCHEDULES` |
| new section `/* ---- schedules, away */` | 1313-1421 | `hgInWindow()`, `handleClock()`, `checkSchedules()`, `handleAway()`, `setAway()` |
| `loop()` | 1685 | `handleClock(now);` right after `handleTimers(now);` |

- `handleClock(now)` runs every 500 ms. If `!hgTimeValid()`, it sets `clockMin = 0`. Otherwise it calls `updateLocalTime()` and computes `m = localTime / 60` (local minutes since 1970). On a new minute: if the gap from the last minute is 1..6, it evaluates every skipped minute (at most 5) plus the current one. Otherwise it evaluates only the current minute: first valid clock, backward jump, DST, or a big forward jump. Then it calls `handleAway(now)` on every loop, so `setAway(false)` or a `/home/cfg` change takes effect in the same loop iteration.
- `checkSchedules(localMin)` takes minute of day, weekday bit and day number from TimeLib. It skips a schedule that is disabled, not due on this weekday, or already run today (`firedDay`). Sun schedules use `hour/minute(sunrise|sunset) + m`, clamped to 0..1439, and are skipped when `sunrise`/`sunset` is 0. Firing runs `curSrc = SRC_SCHEDULE; runActions(s.actions);`.
- `handleAway(now)`: `active = away.en && clockMin && hgInWindow(clockMin % 1440, from, to)`.
  - Rising edge: `applyMood(mood, ms)` if mood >= 0, and remembers the strips.
  - Falling edge: `autoRelayOff(i, SRC_AWAY)` for every relay the simulation switched, then `setStrips(moodStrips, false)`.
  - While active: relays joining the selection get `now + random(min..max) min`. A relay whose time has passed toggles: on is `setRelay(i, true, SRC_AWAY)`, off is `autoRelayOff(i, SRC_AWAY)`, then it gets a new time. A relay taken out of `rel` while active goes off.
  - The random gap is computed in ms with `esp_random()`.
- `setAway(on)` sets `away.en`, calls `markConfigDirty()` only if the value changed, then `notifyUi()`. `awayNow()` returns `awayActive`.

## 2. WLED APIs verified (file:line in the repo, read-only)

| API | Where | Notes |
|---|---|---|
| `updateLocalTime()` | wled00/fcn_declare.h:227, wled00/ntp.cpp:348-353 | `localTime = tz->toLocal(toki.second() + utcOffsetSecs)` |
| `localTime` | wled00/wled.h:752 | refreshed only once per second: `handleTime()` ntp.cpp:178-192 (updateLocalTime at 190) |
| loop order | wled00/wled.cpp:82 (`handleTime`), :91 (`handleNotifications`), :104 (`UsermodManager::loop`) | a UDP time sync (udp.cpp:383-387) sets toki without `updateLocalTime()` in the same loop, so B calls `updateLocalTime()` itself before reading the minute |
| `sunrise`, `sunset` | wled00/wled.h:759-760 | local `time_t`; 0 without location or without sunrise/sunset (ntp.cpp:525-576, `= 0` at 554/573); recalculated at 00:01 (ntp.cpp:433), after NTP (ntp.cpp:343-344) and after API time (ntp.cpp:587-590) |
| TimeLib `hour/minute/day/weekday/year(time_t)` | wled00/src/dependencies/time/TimeLib.h:97-106, Time.cpp:49-100 | `weekday()`: 1 = Sunday (Time.cpp:128, TimeLib.h:77). `day()` is day of month despite the "(0-6)" comment (Time.cpp:82). `elapsedDays()` = t / 86400 (TimeLib.h:78) |
| WLED's own weekday mapping | wled00/ntp.cpp:396-401 (`weekdayMondayFirst`), :457 | WLED timers use Monday = bit 1 (bit 0 = enabled). The contract uses Monday = bit 0, so B uses `(weekday(t) + 5) % 7` (checked: 2026-09-29 is a Tuesday, giving bit 1) |
| WLED timer reference | wled00/ntp.cpp:429-466 (`checkTimers`) | same "once per minute change, sun offset" idea |
| toki time sources | wled00/src/dependencies/toki/Toki.h:31-42 | for A's `hgTimeValid()` |
| `esp_random()` | base:852 (`generateKey`) | same hardware RNG. WLED maps `random` to `hw_random` (fcn_declare.h:503), so B avoids `random()` |
| `constrain` | Arduino core macro (not in repo) | used exactly like base:595-599 |
| ArduinoJson 6.18.1 | src/dependencies/json/ArduinoJson-v6.h:231 | `const char*` is stored by address (614-642), `char*` by copy (645-659): the local `fallback` name in `fillConfig` is copied |
| slot size | ArduinoJson-v6.h:28-37 (embedded mode), 66-72 (no double/long long), 86 (offset 2 bytes), 1035-1052 | `VariantSlot` = 16 bytes on ESP32; nesting limit 10 (79-81); `sch` depth is 5 |
| `JSON_BUFFER_SIZE` | wled00/const.h:657-666 (32767 on ESP32, 24576 on S2) | `gDoc` wled.h:853-857; with PSRAM 2x, wled.cpp:455-462 |
| static file server | wled00/wled_server.cpp:141, :352, :674-690; wled00/file.cpp:478-496 (:481 blocks only "sec") | see risk R1 |
| AsyncWebServer URI match | .pio/libdeps/home_gadgets/ESPAsyncWebServerWLED/src/WebHandlerImpl.h:121 | "/home" matches "/home" and "/home/...", not "/home.json" |
| `DEBUG_PRINTF_P` | wled00/wled.h:882/887 | compiles to nothing without WLED_DEBUG |
| `-Wshadow=compatible-local` | platformio.ini:307, :331 | checked, see below |
| base helpers | base:226 `hgCopyName`, :326 `markConfigDirty`, :521 `parseActions`, :549 `writeActions`, :559 `isValidMood`, :996 `notifyUi`, :1075 delayed `saveConfig`, :1085 `ACT_RELAY_OFF` goes through `autoRelayOff`, :1109 `setStrips`, :1127 `applyMood`, :1220-1241 `processPendingConfig` (apply then save) | |

Compile check without pio and without touching the repo: `scratchpad/tmpB/harness.cpp` includes the B code blocks, extracted verbatim from the agentB file by line range, with stubs for A's names. Both runs are clean except 2 expected "stub never defined" warnings:
- `xtensa-esp32-elf-g++` 8.4.0 (the V4 toolchain), `-std=gnu++17 -fsyntax-only -Wall -Wextra -Wshadow=compatible-local`
- `xtensa-esp32-elf-g++` 15.2.0 with `-std=gnu++2b`

`tmpB/sim.js` is a JS port of the minute logic. It checked:
- a normal run fires once
- a 10-minute clock jump back gives no second run
- a 4-minute stall catches up
- a 20-minute forward jump skips the schedule
- a clock that becomes valid at hh:mm:40 fires that minute
- window edges: 1110..1409 is inside; a wrap window 1320..359 works; from == to is empty

Not verified: the full firmware build (it needs A's code), and behaviour on hardware.

### /home.json size (tmpB/size.js, worst case: every name at max length, 8 actions everywhere, 12 moods, C's clap with 2x8 actions)

| | bytes | limit |
|---|---|---|
| file / upload text | ~6.6 KB (sch + away = 1.3 KB) | `HG_MAX_CFG_BODY` 12,288 |
| upload if the page echoes the read-only page fields (key, lim, bm...) | ~8.9 KB | 12,288 |
| `pDoc` when loading /home.json (stream, strings copied) | 1,020 slots x 16 = 16.3 KB + ~1.8 KB strings = ~18 KB | `JSON_BUFFER_SIZE` 32,767 |
| `pDoc` for GET /home/cfg (forPage) | 1,217 slots = ~19.5 KB + <1 KB copied strings | 32,767 |
| schedules + away alone | 322 slots = ~5.2 KB | |

Everything fits. The smallest margin is about 12 KB in `pDoc` and about 3.4 KB in the upload limit.

RAM: `schedules` 8 x 56 B, `away` 14 B, runtime 44 B, about 0.5 KB in total. No heap use in `loop()`; the `gapMs` lambda does not allocate.

## 3. Decisions where the contract left room

1. **Window end is not included**: active while `from <= now < to`, so "to 23:30" stops at 23:30. `from > to` wraps past midnight. `from == to` is an empty window (never active); the page should stop users from choosing it.
2. **When away ends, strips that got the away mood go off** (`setStrips(ms, false)`), next to the relays. This happens on every falling edge: window end, `en` off from `setAway()` / JSON / `POST /home/cfg`, or clock lost. The strips are remembered at window start, so a later change of `ms` still turns off the right strips.
3. **Relays taken out of `rel` while the window is open go off** (`autoRelayOff`), the same as at window end. Relays added while it is open join after a random pause.
4. **"Stays on" relays are ignored by away mode**: away could switch them on, but `autoRelayOff()` never switches them off, so they would stay on for good.
5. **The first toggle comes after a random pause** (`min`..`max`), as specified. Nothing happens on the relays at window start; only the mood is applied.
6. **Random gaps have ms resolution** between `min` and `max` minutes, which looks more natural than whole minutes. `max` is capped at 720 min (12 h).
7. **Clock handling** runs every 500 ms and calls `updateLocalTime()` itself (see the loop-order row in section 2). Calling it on every loop would mean several TimeLib `breakTime()` calls per loop.
8. **The first valid clock evaluates the current minute**: a sync at 18:30:40 still runs an 18:30 schedule. Earlier minutes never run.
9. **Catch-up of skipped minutes** only applies to gaps of 2..6 minutes (up to 5 skipped minutes). A backward jump, or a forward jump of more than 6 minutes (DST spring forward, clock correction), evaluates only the current minute. So on the day summer time starts, schedules between 02:00 and 02:59 do not run.
10. **Once per day** uses `firedDay` = local day number (`localMin / 1440`, the same as `elapsedDays`), kept in RAM. It resets when a schedule's `t` or `m` is changed, so a schedule moved to later today runs again today. Renaming or other edits keep it.
11. **`d` is masked** (`& 0x7F`), not clamped, because it is a bitmask. `rel` is clamped 0-255 as specified.
12. **Default names**: `setDefaults()` must not be edited, so never-named schedules have an empty `name`. `fillConfig` sends "Schedule N" for them; the next save stores that name.
13. **`setAway()`** only marks the config dirty (flash write) when `en` actually changes, but it always calls `notifyUi()`.
14. **`curSrc`** is set right before `runActions()` and not restored afterwards, as in contract section 6. Every other caller sets it first too.
15. **Sun schedules** read the current `sunrise`/`sunset`, including for caught-up minutes. WLED recalculates them at 00:01.

## 4. Risks

- **R1 [code] privacy: "away" is readable by any web site.**
  - `/home.json` is served by WLED's static file handler: the `/home` route does not match it (WebHandlerImpl.h:121), `onNotFound` falls through to `handleStaticContent` and then `handleFileRead` (wled_server.cpp:141 → file.cpp:478-496), and only names containing "sec" are blocked (file.cpp:481). Every response has `Access-Control-Allow-Origin: *` (wled_server.cpp:352).
  - So a web page opened on a phone in the home network can read `away.en`, the away window and the schedules, meaning "the owner is away". The contract's `/home/live` `"away":0|1` leaks the same.
  - Relay config was already readable, but "house is empty" is new, more sensitive information.
  - Proposal for the spec owner: move the config to a file name containing "sec" (e.g. `/hgsec.json`, migrating like the key file), and/or leave `away` out of the CORS-open `/home/live`.
  - Not changed here, because the contract fixes those names.
- **R2 [code] turning away off while you are home switches the lights off.** `setAway(false)` inside the window runs the falling edge, so the simulated relays and the mood strips go off. This follows the task spec, but someone who comes home and turns away off at 20:00 ends up in the dark. Alternative: only switch off at the natural window end.
- **R3 [code] a reboot within the minute of a run fires again.** `firedDay` is in RAM. If the device restarts in the same minute a schedule ran (e.g. a power blip at 18:30:10) and the clock syncs before 18:31, the schedule runs again. This is harmless for on/off/mood; a "toggle" action would toggle back.
- **R4 [unverified] "clock lost" may never happen.** That depends on A's `hgTimeValid()`. toki normally keeps its time source once synced, so the "clock lost" falling edge may be unreachable in practice. That is fine; it is just not tested.
- **R5 [unverified] sun schedules with UDP-only time.** If the time comes only from WLED UDP sync (udp.cpp:387), `calculateSunriseAndSunset()` is not called until 00:01 (ntp.cpp:433), so sun schedules are skipped until then. NTP and JSON time do recalculate.
- **R6 [code] the away mood depends on the segment.** The away mood silently does nothing if the strip's segment does not exist, or if a custom mood id no longer exists. `applyMood` returns early in both cases, the same as scenes.
- **R7 [unverified] merge.** My `loop()` line is 1 line after C's insertion point (`readSensors` / `handleTimers`). My declaration block ends 1 line before `// runtime`, near A's possible `queueCmd` change. `git merge-file` only reports a conflict when hunks overlap or touch, so these should merge cleanly; check after the merge. The locals `awayCfg`, `lo`, `hi`, `mood` in `applyConfig` could clash with a same-named local from C's clap block (C++ error, easy to rename).
- **R8 [code] edge values.** `max`/`min` from an old file are re-clamped on load. `from`/`to` are not checked against each other; see decision 1.
- **R9 [unverified] no hardware test.** Relay timing, NTP start-up and DST behaviour have not been run on a device. The logic was only checked in the JS port.

## 5. readme.md section (plain English)

### Schedules

Schedules switch things at set times, even when your phone is off. You can have up to 8. Each schedule has:

- **When**: a clock time (e.g. 23:00), or **sunrise / sunset** plus or minus up to 3 hours (e.g. "sunset, 15 min before").
- **Days**: any days of the week (Monday to Sunday).
- **What**: up to 8 actions, the same list as scenes: relay on / off / toggle, a mood, LED strips on / off, all relays off.

Good to know:

- Schedules need the right time. The device gets it from the internet, so set your **time zone** in WLED's *Time & Macros* page. Sunrise / sunset also need your **location** (latitude / longitude) there.
- If the device doesn't know the time (no internet, just switched on), schedules wait. Times that were missed are **not** run later. Only a short hiccup (up to 5 minutes) is caught up.
- Each schedule runs at most **once a day**, even when the clock changes for summer / winter time. On the night summer time starts, times between 02:00 and 02:59 don't exist and are skipped.
- Schedules never switch off appliances marked **"Stays on"**.
- Schedules are part of the Home Gadgets settings, protected by the security key. **Don't** use WLED's own timers or presets to switch relays.

**Example: porch light on at sunset, off at 23:00**

| Schedule | Days | When | Action |
|---|---|---|---|
| Porch on | every day | sunset, 0 min | Relay 3 (Porch) on |
| Porch off | every day | 23:00 | Relay 3 (Porch) off |

**Example: weekday wake-up**: Monday to Friday at 06:45, mood "Wake Up" on LED 1 and Relay 5 (coffee machine) on. Give Relay 5 an auto-off timer of 30 minutes.

### Away mode

Away mode makes the house look lived-in while you are away:

- Pick the appliances (lamps work best) and a time window, e.g. **18:30 to 23:30**. The window may pass midnight (e.g. 22:00 to 01:00).
- Inside the window each chosen lamp switches on or off at random, every **10 to 45 minutes** (you choose the range). The first switch comes after such a pause, not right at the start.
- Optional: a **mood** for the LED strips when the window opens, e.g. "Away" (TV simulator) on LED 1.
- When the window ends, the chosen lamps switch **off**, and the LED strips that got the mood switch off too.
- Switching away mode **off** ends it at once, the same way: the lamps and the mood strips switch off.
- It needs the right time (see Schedules). After a power cut away mode stays on and starts again once the time is known.
- "Stays on" appliances are left alone.
- The JSON API can switch it too: `{"HomeGadgets":{"away":true,"k":"KEY"}}`.

**Example: evening away**: window 18:30 to 23:30, Relay 1 (living room lamp) and Relay 4 (hall light), every 10 to 45 minutes, mood "Away" on LED 1. At 23:30 both lamps and LED 1 go off.
