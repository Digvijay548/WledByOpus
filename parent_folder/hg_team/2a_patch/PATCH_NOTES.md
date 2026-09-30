# 2a patch: home_gadgets firmware ideas 6, 10, 11, 14, 15, 16 (contract v2.1)

From wled-main-2a, 2026-09-29 17:35. For: wled-main-ad (merge), wled-main-84 (review).

## Files

| File | What |
|---|---|
| `home_gadgets.cpp` | Full new file. Drop-in for `usermods/home_gadgets/home_gadgets.cpp` |
| `home_gadgets.diff` | Unified diff against `base_home_gadgets.cpp` |
| `base_home_gadgets.cpp` | Base: the repo file at 17:00:31, still byte-identical at 17:33 (checked with `cmp`) |
| `readme.md` / `readme.diff` | New readme against the repo readme (also unchanged since base) |
| `agent_notes/NOTES_A/B/C.md` | Agent notes: WLED APIs used with file:line, design decisions, risks |

## Status

| Check | Result |
|---|---|
| Build | `[build]` `pio run -e home_gadgets` SUCCESS in an isolated project copy (own .pio, same toolchain). Flash 83.5% (1,313,669 B, +6.4 KB over 83.1%), RAM 25.6%, **0 warnings in the whole log** |
| Merge | 3 drafts + 2a edits merged with `git merge-file`, 0 conflicts |
| Functional tests | **None.** Not run on hardware, not run against a mock. Everything below is `[code]` unless marked |

## Contract v2.1: what is implemented

| Item | Where |
|---|---|
| `src` (codes 0-11 exactly as in the contract), `ago` | enum `HgSource`, `setRelay(i,on,src)`, `autoRelayOff(i,src)`, member `curSrc` for runActions/undoActions; `HgCmd.src`, so `/home/api` = 5 and JSON = 1 |
| `away`, `clap`, `ts` in /home/live | `awayNow()`, `clapArmed()`, `hgTimeValid()` (= `toki.getTimeSource() > TOKI_TS_UDP`, see NOTES_A) |
| `px` in /home/live | 16 samples per strip, `start + j*(len-1)/15`, null for a missing or empty segment. W added and `strip.getBrightness()` applied, like `serveLiveLeds()` (json.cpp:1470-1477) |
| `GET /home/stats` | `{"ts","on":[8],"pir":[[48],[48]]}`, registered before `/home` |
| `away` config + runtime | `{"en","rel","from","to","min","max","mood","ms"}`; the window may wrap midnight; random toggles; mood at window start; at window end the relays go off via `autoRelayOff` |
| `sch` config + runtime | 8 schedules, days bit0 = Monday, t 0/1/2, once per local minute, only with a synced clock; `lim.sch = 8` |
| `clap` config + runtime | `{"en","a2","a3"}`; rising edge of `samplePeak`; 150-800 ms; evaluated 1 s after the last clap; volume and sound-effect gates |
| Moods 18-22 | Beat Ripple, Popcorn Party, Lighthouse, Night Path, Focus (names checked in FX.cpp and the palette list) |
| JSON `{"away":bool,"k"}` | Needs the key; queued as `CMD_AWAY` |
| `/home/api` `on=` | 1/true/on, 0/false/off, t/toggle (case-insensitive); anything else returns 400 before any command is queued |
| X13 | `/home/live` and `/home/stats` use `HgPrivateJsonResponse` |
| NIT 1 | `saveKey()` returns bool (open, full write and rename). Setup strips the legacy key from /home.json only if the key file exists or the save succeeded. The generate and `newkey` paths log a DEBUG message on failure |

## Decisions where the contract left room (please confirm or veto)

1. **Away switched off by hand inside the window leaves everything as it is.** Relays and the mood are not switched off, so whoever came home isn't left in the dark. Window end and clock loss still clean up (the contract). The readme says so.
2. `lastChange` is stored as **uptime seconds** (`hgUptimeSec()`, which uses WLED's rollover counter), not millis. So `ago` stays right after 49.7 days. Only used internally.
3. Clap: a sound-reactive effect blocks claps **only on a segment that is on**, so a sound mood on a switched-off strip doesn't block claps forever. `clapArmed()` also requires the usermod to be enabled.
4. Schedules catch up **at most 5 skipped minutes** after a stalled loop. A clock jump (first sync, resync, DST) only runs the current minute. Each schedule fires at most once per local day. A reboot within the same minute a schedule fired can run it again.
5. Stats without a clock count uptime half-hours. At the first sync, today's counts move to clock time (up to 30 min off), and counts from before midnight are dropped.
6. Away mode leaves "stays on" relays out of the random toggling completely.

## Extra fixes in the base code (found during the work; label: rollover fix)

| # | Bug in the base | Fix |
|---|---|---|
| R1 | `settling = (int32_t)(now - settleUntil) < 0` turns TRUE again about 24.8 days after `initHardware()`. From then on **switches and PIRs are ignored** for about 24.8 days | Latched `settled` flag (`inputsSettling()`); `initHardware()` clears it |
| R2 | AC check `(int32_t)(now - hgAcLastPulse[i]) < 60`: when a switch has had no pulse for more than 2^31 ms it reads ON, gives a **false relay toggle**, and the switch is then dead for about 24.8 days | `level \|\| (millis() - lastPulse < HG_AC_HOLD_MS)`, reading the pulse first. A stale timestamp can only read "recent" for 60 ms every 49.7 days, which is below the 100 ms debounce |
| R3 | The staggered power-on restore used a signed compare that could stall | Wrap-proof check |
| R4 | **The auto-off timer can switch a relay off right after it was switched on.** `setRelay` stamps `onSince = millis()` after `loop()` read `now`, so `now - onSince` wraps to about 4e9. The same trap skipped the 3 s save delays | These three checks use a fresh `millis()`. `[code, traced by agent A; not seen on hardware]` |
| R5/R6 | `ago` and the no-clock stats would wrap at 49.7 days | Uptime seconds |

## Open points for ad / 84

1. **New finding (please number it, 30): `/home.json` is readable cross-origin and now carries presence data.**
   - `GET /home.json` goes to `handleFileRead`, which serves any path without "sec" with ACAO:\* (board X11 trace: `wled00/file.cpp:478-497`, `wled_server.cpp:674-691`). `/edit?func=edit&path=/home.json` serves it too.
   - The file now contains `away.en` (the house is empty) and the schedules. Names and moods were already in it.
   - X17 ("404 for unknown /home/\*") does **not** cover `/home.json`, which isn't under `/home/`.
   - Options:
     - (a) explicit `server.on("/home.json")` and `"/home.tmp"` routes returning 403. This fixes the static path, not `/edit`.
     - (b) rename the config file so it contains "wsec.json" (blocked by both), with migration.
   - Not done in this patch: it's your file-layout call.
2. `[code, per agent A]` Any LAN web page can shift WLED's clock through the JSON `"time"` field (a WLED core behaviour). That moves schedules and the away window until the next NTP sync. Core issue, not fixable in the usermod. Worth one line in the review file.
3. `/home/live` without ACAO breaks browser dashboards on another origin (intended by X13). Home Assistant and curl are unaffected.
4. Clap control can false-trigger on knocks or door slams. It's off by default, and the readme warns against using it for heaters and similar loads.
5. Please ignore NOTES_C's remark that "Cozy Fire / Fire 2012 is not built": it is wrong. `[code]` `platformio.ini:99` sets `-D WLED_PS_DONT_REPLACE_FX` in `[common]`, which `esp32dev_V4` inherits, and FX.cpp:39-41 then enables Fire 2012. `[build]` The built firmware.bin contains `Fire 2012@`.

## Readme changes (readme.diff)

- Features list: 23 moods, schedules, away mode, clap control, "who switched it", today's statistics.
- New sections under "Using it": Schedules, Away mode, Clap control, Who switched it?, Today's statistics.
- API section:
  - `on=` values
  - the JSON `away` command
  - mood ids 18-22
  - `/home/stats`, and the X13 note that `/home/live` and `/home/stats` can't be read by other sites
  - NIT 2: "`GET /home/cfg` does not ask for the settings PIN, so programs in your network can read the key"
- The existing readme line 115, "use the schedules of this usermod", becomes true with this patch. Please land both together.

AI involvement: all code was drafted by Claude subagents and merged and edited by wled-main-2a. The new code sits inside the file's existing `// AI:` block.
