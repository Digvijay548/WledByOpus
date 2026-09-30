# Core WLED bug-fix patches (drafts, not applied)

Prepared 2026-09-29 by an AI session (Claude) for review. **Nothing under `WLED-main/` was modified.**
Source of the bug list: `WLED_ESP32_Review.md` section 12 and `TEAM_BOARD.md` section 6 (X1, X2, X4).
All line numbers refer to the repo as of 2026-09-29 (the pristine copies in `_work/a/` were byte-compared with the repo just before writing this).

Evidence labels (as on the team board): `[code]` read in the code, `[compile]` compiled, `[test: host]` host-side logic test of a Python port, `[reasoning]` not verified.

## Summary

| ID | Bug | Status | Patch | Files | Risk | How to verify |
|---|---|---|---|---|---|---|
| H1 | `fixInvalidSegments` skips segment 0 -> heap overflow when the LED count shrinks | **fixed** | `H1.patch` | `wled00/FX_fcn.cpp` | medium-low | JSON/UI steps, see H1 |
| H2 | Segment offset not re-clamped after the length is trimmed -> heap overflow | **fixed** | `H2.patch` | `wled00/FX_fcn.cpp` | low | `{"seg":[{"id":0,"stop":600,"of":500}]}` on 300 LEDs |
| H3 | `_milliAmpsTotal` is `uint16_t` -> current limiter wraps above 65.5 A per output | **fixed** | `H3.patch` | `wled00/bus_manager.h`, `wled00/bus_manager.cpp` | low | 1200 LEDs white, read `leds.pwr` |
| H4 | `BusDigital` returns before `_busPtr`/`_pins` are set -> `cleanup()` deletes a garbage pointer | **fixed** | `H4.patch` | `wled00/bus_manager.cpp` | low | LED output on an invalid pin, re-init twice |
| X1 / M8a | Candle Multi: missing `return` after `candle(false)` | **fixed** (real effect differs from the review, see X1) | `X1.patch` | `wled00/FX.cpp` | very low | regression check only |
| X2 / M8b | Flow divides by zero on 1-LED segments | **fixed** | `X2.patch` | `wled00/FX.cpp` | very low | 1-LED segment with fx 110 |
| M8c | PS Volcano uses particle pointers before `updateSystem()` (stretch) | **fixed** | `M8c.patch` | `wled00/FX.cpp` | low | 2D only, see M8c |
| M1 | `{` or `}` in a preset/segment name corrupts `presets.json` (stretch) | **fixed** | `M1.patch` | `wled00/file.cpp` | low-medium | preset named `a{b`, then delete it |
| M2 | "Save & reboot" can reboot before the config is written (stretch) | **fixed** | `M2.patch` | `wled00/wled.cpp` | low | timing race, code review |
| M3 | Crash-loop "reset config" step restores the same backup (stretch) | **deferred** (confirmed, needs a design decision) | none | (`cfg.cpp`, `file.cpp`, `fcn_declare.h`) | - | - |
| M4 | OTA check can report a random "release name mismatch" (stretch) | **fixed** | `M4.patch` | `wled00/wled_metadata.cpp` | very low | OTA of the same build |
| M5 | `POST /json/cfg` turns I2C off permanently (stretch) | **deferred** (confirmed, needs a design decision; no I2C in the Home Gadgets build) | none | (`cfg.cpp`) | - | - |
| M6 | Low-memory "heap panic" recovery leaves the LEDs dead (stretch) | **deferred** (confirmed, needs a design decision) | none | (`wled.cpp`) | - | - |

`ALL_core_fixes.patch` = every patch above in one file (each touched file appears exactly once).

## What was verified for the patches

- **Applies cleanly** `[test]`: every per-bug patch was dry-run (`patch -p1 --dry-run`) alone against fresh copies of the repo files, and all of them were applied stacked in the order below (offsets only, no fuzz). `ALL_core_fixes.patch` was dry-run against fresh copies and its result is byte-identical to the stacked result.
- **Compiles (ESP32, syntax/type level)** `[compile]`: `xtensa-esp32-elf-g++ -fsyntax-only -Wall -Wextra` with the exact defines, flags and include paths of the last `home_gadgets` build (`.pio/build/home_gadgets/idedata.json`, read only), on a shadow copy of `wled00/` with the patches applied. Checked: `FX_fcn.cpp`, `FX.cpp`, `bus_manager.cpp`, `file.cpp`, `wled.cpp`, `wled_metadata.cpp`, plus `json.cpp`, `cfg.cpp`, `xml.cpp`, `set.cpp`, `udp.cpp` (they include the changed `bus_manager.h`). Result: no errors, and exactly the same warnings as the unpatched baseline. Script: `_work/syntax_check.py`. This is **not** a full build or link; pio/npm were not run (build lock).
- **Not compiled for ESP8266**: no ESP8266 libdeps exist locally. All changes use only portable C++ (no ESP32-only APIs), but `pio run -e nodemcuv2` is still needed.
- **Host logic tests** `[test: host]` (`_work/logic_tests.py`, Python ports, not firmware):
  - M1: 2510 random preset objects with names full of `{ } " \`, spanning 256-byte read blocks: original scanner wrong in 2019 cases, patched scanner wrong in 0.
  - H2: index math of the 1D fast path: the example writes index 499 into a 300-entry buffer before, max 299 after; exhaustive small cases all in range.
  - H3: 1200 LEDs x 55 mA = 67,200 mA is stored as 1,664 mA in `uint16_t`; the worst case (65535 LEDs, 254 mA) fits `uint32_t`.
- **No runtime test on hardware** was done for any patch.

## Apply order (applied by wled-main-84, after the user's AGENTS.md yes in THAT session; build by wled-main-ad, which holds the build lock; only after the merged home_gadgets build is green)

> Reviewer notes (wled-main-84, about 17:35): all 10 patches are verified correct. Optional refinements before applying:
> - N1 (H4): store `bc.pins[]` into `_pins[]` at the start of the constructor instead of 255, so a failed output keeps its configured pin in cfg.json and the UI
> - N3 (H2): wrap `ofs` BEFORE the `boundsUnchanged` comparison in `setGeometry`, so re-sending the same oversized offset does not restart the effect every time
> - N2 (H3): `_gMilliAmpsUsed` stays uint16 (display only; cosmetic)

Either apply `ALL_core_fixes.patch` in one step (preferred: one build), or apply the per-bug patches in this order. Each file is only touched by consecutive patches, so apply a whole group before building.

| Step | Group (file) | Patches, in order |
|---|---|---|
| 1 | `wled00/FX_fcn.cpp` | `H1.patch`, `H2.patch` |
| 2 | `wled00/bus_manager.h`, `wled00/bus_manager.cpp` | `H3.patch`, `H4.patch` |
| 3 | `wled00/FX.cpp` | `X1.patch`, `X2.patch`, `M8c.patch` |
| 4 | `wled00/file.cpp` | `M1.patch` |
| 5 | `wled00/wled.cpp` | `M2.patch` |
| 6 | `wled00/wled_metadata.cpp` | `M4.patch` |

Each patch also applies alone on the pristine repo, so any subset works (verified for each patch alone and for the full order above; other orders were not tested).

```bash
cd /c/Users/DigvijayPatilLM/Downloads/WLED-main/WLED-main
P=../hg_team/drafts/core_fixes
patch -p1 --dry-run < $P/ALL_core_fixes.patch   # must print only "checking file ..."
patch -p1 --no-backup-if-mismatch < $P/ALL_core_fixes.patch
pio run -e home_gadgets        # ESP32 V4 (esp32dev_V4 based)
pio run -e nodemcuv2           # ESP8266: all touched files are shared code
```

Build notes: `bus_manager.h` is included through `wled.h`, so step 2 recompiles nearly all of `wled00/`. `FX.cpp` is the slowest single file. Files are LF; the patches are LF.

Prerequisites from AGENTS.md: the user's explicit "yes" in the applying session, and the file claims on the team board (these are core files that `wled-main-ad` compiles). If this goes upstream, the PR must declare AI assistance; added multi-line blocks carry `// AI:` markers, and one-line edits are unmarked, as `docs/cpp.instructions.md:65` allows.

**Safety for runtime tests:** several tests below change the LED configuration or provoke a former crash. Use a bench board (no mains relays connected), or download `/cfg.json` and `/presets.json` first.

---

## H1: `fixInvalidSegments` skips segment 0

- **Where (current):** `wled00/FX_fcn.cpp:2081` `for (size_t i = getSegmentsNum()-1; i > 0; i--)`. The pixel buffer is sized to `getLengthTotal()` (`:1332-1335`). The 1D render writes `strip[start + p + off]` up to `stop-1` (`:1520-1528`).
- **Verified `[code]`:** after an LED-count change, `wled.cpp:242-245` calls `makeAutoSegments()` only if the old segments were aligned with the buses; otherwise it calls `fixInvalidSegments()`, which never looks at segment 0. `makeAutoSegments()` resizes only when exactly one segment is active (`:2063`).
- **Broader than the review says `[code, traced]`:** a *single* segment 0 that is not aligned (e.g. 100-600 on one 600-LED output) also takes the `fixInvalidSegments()` path, so the bug is not limited to 2+ segments.
- **Fix:** loop with a signed index down to 0. The loop body is unchanged, so segment 0 is clamped, or erased if it starts beyond the new length. Two guard lines follow the loop:
  - if no segment is left, `resetSegments()` (one full-length segment);
  - if `_mainSegment` is now out of range, `setMainSegmentId(0)`.
- **Why the second guard:** erasing shifts the indices of later segments, so the main segment index can point past the end. `getMainSegment()` then indexes out of bounds. This already happens today when a segment `i > 0` at or below the main index is erased `[code]`; including segment 0 makes it more likely.
- **Side effects:**
  - Segment 0 can now be erased, so later segment IDs shift down. Other segments already behaved this way.
  - An inactive segment 0 whose `start` lies beyond the new length is also erased.
  - No hot-path code is touched.
- **Verify** (any env; on 1D):
  1. LED settings: one output, length 600. Save.
  2. `POST /json/state {"seg":[{"id":0,"start":0,"stop":400},{"id":1,"start":400,"stop":600}]}`
  3. LED settings: length 300. Save.
  4. `GET /json/state`: `seg[0].stop` must be <= 300 and segment 1 must be gone. **Before the fix: `seg[0].stop` stays 400**, a deterministic sign of the bug; heap corruption may follow.
  5. Variants:
     - single segment: `{"seg":[{"id":0,"start":100,"stop":600}]}`, reduce to 300, expect 100-300;
     - erase segment 0: `{"seg":[{"id":0,"start":400,"stop":600},{"id":1,"start":0,"stop":400}]}`, reduce to 300, expect one segment 0-300 and a valid main segment (`mainseg` in `/json/state` < number of segments).

## H2: segment offset not re-clamped

- **Where (current):**
  - `wled00/json.cpp:174-182` checks `of` against the *requested* length;
  - `Segment::setGeometry` trims `i2` (`FX_fcn.cpp:461-471`) but stores `offset` unchecked (`:528`);
  - the render wraps only once (`:1526-1527`, `:1704-1711`).
- **Verified `[code]`:**
  - With 300 LEDs, `{"seg":[{"id":0,"stop":600,"of":500}]}` gives `len=600`, so `of=500` passes the JSON check. `setGeometry` trims `stop` to 300 and keeps `offset=500`, so the render writes index 499 into a 300-entry buffer `[test: host]`.
  - UDP segment sync passes the raw received offset to `setGeometry` (`udp.cpp:296, 300, 342`).
  - `fixInvalidSegments()` shrinks `stop` without touching `offset` (`FX_fcn.cpp:2087, 2091, 2096`).
- **Fix:**
  - In `setGeometry`, where the new length is known to be > 0, add `if (offset >= length()) offset %= length();`. This covers JSON, UDP, `/win` and presets.
  - In `fixInvalidSegments`, the final per-segment loop re-applies the same clamp (with a `len > 0` guard for inactive segments).
- **Side effects:**
  - An offset >= length is now wrapped (modulo), which keeps the phase. `json.cpp:182` clamps to `len-1` instead; both are safe. Before the fix, such values produced out-of-bounds writes, so no valid behaviour changes.
  - 2D rendering does not use `offset`. The FX.cpp:2761 hack that stores `random16(SEG_H-1)` in `offset` stays below `length()` and is unaffected.
- **Verify:**
  1. On a 300-LED output, `POST /json/state {"seg":[{"id":0,"start":0,"stop":600,"of":500}]}`.
  2. `GET /json/state`: expect `stop` 300 and `of` 200. **Before the fix: `of` 500.**
  3. Second case: segment 0-300 with `of` 250, then reduce the LED count to 200. Expect `of` 50.

## H3: current limiter wraps above 65.5 A per output

- **Where (current):**
  - `wled00/bus_manager.h:290` declares `static uint16_t _milliAmpsTotal`;
  - it is assigned from a 64-bit expression at `bus_manager.cpp:205`;
  - it is returned by `getUsedCurrent()` (`bus_manager.h:264`, virtual base at `:144`);
  - it is consumed at `bus_manager.cpp:212-223` (per-output limit) and `:1533` (sum for the global limit).
- **Verified `[code]`:** 1200 LEDs x 55 mA + 1200 mA standby = 67,200 mA, stored as 1,664 mA. The per-output limit (`uint16_t`, at most 65,535) therefore never triggers, and the global sum is too small as well.
- **Fix:** `_milliAmpsTotal` and both `getUsedCurrent()` declarations become `uint32_t`, plus the definition at `bus_manager.cpp:1582`.
- **Callers checked `[code]`:**
  - Only `BusDigital` overrides `getUsedCurrent()`, and its only caller is `applyABL()`, which sums into an `unsigned`.
  - No printf, JSON or usermod uses it (grep over `wled00/` and `usermods/`).
  - All arithmetic in `applyBriLimit()` is already 32-bit.
  - On ESP8266, `uint32_t` is native.
  - The code is per bus per frame, not per pixel, so there is no hot-path cost.
- **Residual, not changed:** `BusManager::_gMilliAmpsUsed` is still `uint16_t`, so the `leds.pwr` value in `/json/info` can wrap. That only happens with per-output limits whose *sum* exceeds 65.5 A. It is display-only (used by `json.cpp:725-727` and two display usermods); widening it would change the `currentMilliamps()` API.
- **Verify** (no LEDs need to be attached; the estimate comes from the pixel buffer):
  1. LED settings: one output, length 1200, LED current 55 mA, max current 60000 mA (the UI allows up to 65000).
  2. `POST /json/state {"on":true,"bri":255,"seg":[{"id":0,"fx":0,"col":[[255,255,255]]}]}`
  3. `GET /json/info`: expect `leds.pwr` of about 60,000 and dimmed output. **Before the fix: a small wrapped value, and no dimming.**

## H4: `BusDigital` cleanup deletes an uninitialised pointer

- **Where (current):**
  - The constructor `wled00/bus_manager.cpp:129-180` returns early at `:138`, `:140` and `:142`, before `_busPtr` (set at `:161`) and `_pins` (`:145`, `:152`) are assigned. Neither has a default (`bus_manager.h:280-288`).
  - `cleanup()` (`:385-393`, also run by the destructor at `bus_manager.h:251`) passes `_busPtr` to `PolyBus::cleanup()`, which only checks for `nullptr` (`bus_wrapper.h:1027-1028`), and deallocates `_pins[0..1]`.
- **Verified `[code]`:**
  - Buses are created with `make_unique<BusDigital>(bc)` (`bus_manager.cpp:1317`), so unlisted members are indeterminate.
  - They are destroyed at the next re-init (`BusManager::removeAll()`, `FX_fcn.cpp:1227`, `cfg.cpp:266`).
  - **Extra:** for 2-pin types (APA102, WS2801, ...), a failed clock pin calls `cleanup()` *inside the constructor* (`:147-148`), so the garbage `delete` happens immediately.
  - A garbage pin number that happens to be owned by another `BusDigital` would be freed from that bus (`pin_manager.cpp:28-41` only checks the owner tag).
  - `getFrequency()` of a failed bus (garbage `_frequencykHz`) is saved to cfg.json (`cfg.cpp:1014`) and shown in the UI (`xml.cpp:401`).
- **Fix:** at the top of the constructor body, set `_pins` to 255, `_iType` to `I_NONE` and `_busPtr` to `nullptr`, and move the existing `_frequencykHz = 0` and `_colorSum = 0` there. `deallocatePin(255)` is a no-op (`pin_manager.cpp:30`); `PolyBus::cleanup(nullptr)` returns immediately.
- **Deliberately not changed:**
  - `_hasRgb`, `_hasWhite`, `_hasCCT` and `_milliAmpsLimit` are only read for buses with `isOk()` (`FX_fcn.cpp:1063, 1302, 1951, 1961`; `bus_manager.cpp:1508, 1528, 1553`).
  - `cleanup()` is not made idempotent. Resetting `_pins` there would make `getPins()` return 255 for buses whose `PolyBus::create()` failed, and the user's pins would then be dropped from cfg.json.
- **User-visible change:** a bus whose pin allocation failed now reports pin 255, so the LED settings page shows an empty pin field and the next save writes 255. Before the fix it reported random values. Possible follow-up: store the configured pins separately so the user sees what they entered.
- **Verify:**
  1. Bench board, with `/cfg.json` backed up.
  2. `GET /json/cfg`, copy `hw.led`, set one output's `pin` to `[34]` (input-only on ESP32, so allocation fails), and `POST /json/cfg` with that `hw.led`.
  3. Change something in LED settings and save it twice, so the failed bus gets destroyed.
  4. Expect no crash, the other outputs still working, and the pin field empty. **Before the fix: a crash or heap corruption at the re-init (not deterministic).** A 2-pin type with an invalid clock pin crashes more reliably.
  5. With `WLED_DEBUG`, the log shows `Pin 0 allocated!` then `Digital Cleanup.`

## X1 / M8a: Candle Multi missing `return`

- **Where (current):** `wled00/FX.cpp:3503` `if (!SEGENV.allocateData(dataSize)) candle(false);`, then execution falls through to `:3508-3575`.
- **The review's claim does not hold as stated `[code, traced]`.** The fall-through cannot reach the multi-candle loop with a 4-byte buffer:
  - When `candle(false)` gets its 4-byte buffer, it either sets `*lastcall = strip.now` (`:3513`), or returns at the same rate-limit test.
  - Back in `candle(true)`, the identical test `strip.now - *lastcall < FRAMETIME_FIXED` (`:3512`) is then true, so it returns before the loop. `strip.now` is fixed during one `service()` call.
- **The real failure:** if `candle(false)` itself cannot allocate its 4 bytes, `FX_FALLBACK_STATIC` returns with `SEGENV.data == nullptr`. `candle(true)` then reads `*lastcall` through a null pointer, which is a crash on ESP32. This happens when segment-data memory is exhausted (`MAX_SEGMENT_DATA` reached, `FX_fcn.cpp:163-167`) or heap allocation fails.
- **Fix:** `{ candle(false); return; }`. It is still worth doing because it removes a latent hazard, but the severity is lower than "heap overflow".
- **Verify:** compile, then a regression check: Candle Multi (fx 102) still flickers per LED on a normal segment. The failing path needs memory exhaustion and is not practical to reproduce.

## X2 / M8b: Flow divides by zero on 1-LED segments

- **Where (current):** `wled00/FX.cpp:4427-4432`. With `SEGLEN` = 1: `maxZones=0`, `zones=2`, `zoneLen = 1/2 = 0`, then `(SEGLEN + zoneLen - 1) / zoneLen` divides by zero.
- **Verified `[code]`.** On ESP32 (Xtensa), integer division by zero raises an exception, which is a crash `[reasoning: architecture behaviour, not tested]`. For `SEGLEN >= 2`, `zoneLen >= 1` `[code]`.
- **Fix:** `if (SEGLEN <= 1) FX_FALLBACK_STATIC;`, the same guard 38 other effects in FX.cpp use (e.g. `:263`).
- **Verify:**
  1. `POST /json/state {"seg":[{"id":2,"start":0,"stop":1,"fx":110}]}`. Expect a static colour. **Before the fix: a reboot.**
  2. Also 2 LEDs mirrored: `{"seg":[{"id":2,"start":0,"stop":2,"mi":true,"fx":110}]}`.
  3. Clean up with `{"seg":[{"id":2,"stop":0}]}`.
  4. In Home Gadgets, the mood "Spring Bloom" uses Flow.

## M8c: PS Volcano uses the particle system before `updateSystem()` (stretch)

- **Where (current):** `wled00/FX.cpp:8313-8328` write `PartSys->sources[]` and call `sprayEmit()` (which writes `particles[]`, `FXparticleSystem.cpp:180-213`) before `updateSystem()` at `:8332`.
- **Verified `[code]`:**
  - `updateSystem()` re-derives the absolute `particles`/`sources` pointers from `this` (`FXparticleSystem.cpp:1015-1035`). Its own comment says not to access the PS before calling it.
  - With a transition, the old segment copy gets a new `data` buffer via `memcpy` (`FX_fcn.cpp:58-73`), so the copied PS still points into the original buffer.
  - Before the old copy runs, the original segment's `resetIfRequired()` frees that buffer (if larger than `FAIR_DATA_PER_SEG`) or zeroes it (`FX_fcn.cpp:210-219`), and the new effect then allocates or uses it. `service()` runs the new mode before the old copy (`FX_fcn.cpp:1357-1383`).
  - So the old copy's first Volcano frame writes through stale pointers whenever `call % n == 0`: into freed memory, or into the new effect's buffer. That is a use-after-free or cross-effect corruption `[code, traced; not reproduced]`.
- **Scope check:** a scan of every `PartSys == nullptr` ... `updateSystem()` window in FX.cpp finds this ordering only in Volcano.
- **Fix:** call `updateSystem()` right after the null check, as every other PS effect does, and remove the later call. `updateSystem()` only sets the size and pointers, so the order of the other settings is unchanged.
- **Relevance:** Volcano is 2D-only, so the Home Gadgets 1D strips cannot reach it.
- **Verify:** on a 2D setup, with a transition time of about 2 s, switch PS Volcano (fx 187) to another effect repeatedly. Expect no crash or corruption. Before the fix the failure is intermittent.

## M1: braces in names corrupt `presets.json` (stretch)

- **Where (current):** `wled00/file.cpp:160-161` counts every `{`/`}`, including inside JSON strings. The result sets the region that `writeObjectToFile()` overwrites or blanks (`:300-334`).
- **Verified `[code]`:** ArduinoJson does not escape braces inside strings. With an unbalanced `{`, the scan runs to the end of the file, so deleting or re-saving that preset blanks every later preset. With `}`, it stops early and leaves broken JSON.
- **Fix:** track "inside a string" and "after a backslash" while scanning; the state persists across the 256-byte read blocks. Normal files give identical results `[test: host]`, 0/2510 wrong.
- **Not changed:** `bufferedFind(key)` cannot match a key inside a string, because quotes inside strings are escaped as `\"`.
- **Verify:**
  1. Save a preset named `a{b`, then another preset named `c`.
  2. Delete preset `a{b` (or re-save it with more content).
  3. `GET /presets.json` must parse and still contain `c`. **Before the fix: `c` is blanked or the JSON is broken.**
  4. Repeat with `a}b`.

## M2: "Save & reboot" can skip the pending config write (stretch)

- **Where (current):** `wled00/wled.cpp:277` `if (doReboot && (!doInitBusses || !configNeedsWrite))`. `set.cpp:904-905` sets `configNeedsWrite` before `doReboot` so that the loop saves first.
- **Verified `[code]`:**
  - `doInitBusses` is already cleared earlier in the same loop iteration (`:240`), so `!doInitBusses` is almost always true. The loop then reboots even when `configNeedsWrite` became true after the save check at `:254`, for example when the async web task handles "Save & reboot" on the Usermods page in that window.
  - The race itself is timing-dependent `[reasoning]`.
- **Fix:** `if (doReboot && !doInitBusses && !configNeedsWrite)`, which matches the comment.
- **Side effects checked `[code]`:**
  - The reboot is delayed by at most one or two loop iterations. `serializeConfigToFS()` clears the flag and retries next loop if the JSON lock is busy (`cfg.cpp:837, 848`).
  - The factory-reset path (`set.cpp:650-654`, `:904`) and the cfg.json upload path (`wled_server.cpp:226-227`) never set `configNeedsWrite`, so their behaviour is unchanged.
- **Verify:** code review; then 10 x "Save & reboot" on the Usermods page with a changed value each time. The value must persist every time.

## M4: OTA release-name check reads uninitialised bytes (stretch)

- **Where (current):** `wled00/wled_metadata.cpp:137-141`. It copies `real_len` bytes but writes the terminator at `sbuf[len]`, so the bytes in between are stack garbage. The result is compared at `:157-165`.
- **Verified `[code]`.**
- **Fix:** `sbuf[real_len] = '\0';`
- **Verify:** OTA-upload the same build several times. "Firmware release name mismatch" must never appear. Before the fix it depended on stack contents and could not be forced.

## Deferred (confirmed by reading, not patched)

- **M3, crash-loop reset:**
  - What happens: `resetConfig()` only renames `cfg.json` (`cfg.cpp:803-811`). At the next boot, `setup()` finds no valid `cfg.json` and restores the backup again (`wled.cpp:523-527`, `file.cpp:594-615`).
  - Proposal: a small helper next to `backupFile()`/`restoreFile()` in `file.cpp`, using the private `s_backup_fmt`, that renames the backup (e.g. to `/rst.bkp.cfg.json`) or deletes it. Declare it in `fcn_declare.h` and call it from `resetConfig()`.
  - Decision needed: rename (keeps data for manual recovery, costs flash) or delete. This touches 3 files, and `fcn_declare.h` forces a full rebuild.
- **M5, `POST /json/cfg` kills I2C:**
  - What happens: every config load runs the I2C block (`cfg.cpp:491-505`). `allocateMultiplePins()` succeeds again for the same owner and increments `i2cAllocCount` each time (`pin_manager.cpp:108-121`). `Wire.setPins()` then fails because Wire is running, so the pins become -1.
  - Proposal: skip the block when the pins are unchanged and already owned by `HW_I2C`. For a real change, follow `set.cpp:736-751` (free the old pins, reboot needed).
  - Not relevant to Home Gadgets: GPIO 21/22 are switch inputs, so I2C pins are -1 and the block does nothing.
- **M6, heap panic recovery:**
  - What happens: `wled.cpp:226-227` destroys and re-creates `strip`. The constructor leaves `_segments` empty and `_pixels` null (`FX.h:824-875`), so `getSegment()` then indexes an empty vector (`FX_fcn.cpp:1982-1984`).
  - Proposal: set `doReboot = true` in that branch. A full in-place re-init is not simple, because `busConfigs` were cleared after the first `finalizeInit()`.
  - Decision needed: rebooting under low memory is a behaviour change.

## Files in this folder

- `ALL_core_fixes.patch`: all fixes, one hunk set per file (apply this for one build).
- `H1.patch`, `H2.patch`, `H3.patch`, `H4.patch`, `X1.patch`, `X2.patch`, `M8c.patch`, `M1.patch`, `M2.patch`, `M4.patch`: per bug.
- `_work/a/`: pristine copies of the touched files.
- `_work/<ID>/`: each fix alone.
- `_work/seq/`: all fixes stacked (equals `ALL_core_fixes.patch` applied).
- `_work/syntax_check.py`: the ESP32 `-fsyntax-only` harness (read-only use of the repo and `idedata.json`).
- `_work/logic_tests.py`: the host-side logic tests.
