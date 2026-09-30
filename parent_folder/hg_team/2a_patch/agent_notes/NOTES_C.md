# Agent C notes: idea 16 (5 new moods) + idea 11 (clap control)

Files: `agentC/home_gadgets.cpp` (edited copy of `base/home_gadgets.cpp`), `agentC/diff.txt` (`diff -u base agentC`).
Not compiled (as instructed). It needs agent A's `SRC_CLAP` and `curSrc` to build.
I ran a trial `git merge-file` in the scratchpad against dummy A/B edits placed at their contract anchors
(including B's line right after `handleTimers(now);`). It merged with no conflicts, and I then deleted the test files.

## 1. Changes (only at the section-7 anchors for C; every other line is byte-identical)

| Anchor | Change (line numbers are for agentC/home_gadgets.cpp) |
|---|---|
| after `HG_JSON_LOCK_ID` | `HG_CLAP_*` constants (l.75-86): 150/800 ms gap, 1000 ms evaluate, 2000 ms cooldown, 50 ms peak hold, max 3, music level 30, loudness history 10 x 100 ms |
| after "Spring Bloom" | moods 18-22 (l.226-230) |
| after `stripSeg[...]` | `struct HgClap { en, a2[8], a3[8] } clap;` with in-class initialisers, plus detector state (l.315-334). All values default to off/zero; `setDefaults()` is untouched |
| after `applyAudioPrefs();` | declarations `handleClap(now)`, `clapSoundFx()`, `clapLoudBefore() const`, `clapArmed() const` |
| applyConfig, after "pir" | `"clap":{"en","a2","a3"}` parsed. Missing keys keep their current values; actions go through `parseActions` |
| fillConfig, after "pir" | `"clap"` written with `writeActions`, both to /home.json and to the page |
| new section before `web` | `hgIsSoundEffect()`, `clapSoundFx()`, `clapLoudBefore()`, `clapArmed()`, `handleClap()` (l.1301-1414) |
| loop() | `handleClap(now);` right after `readSensors(now);` |

How the clap state machine works:

1. Every pass checks whether it came "late", meaning more than max(50 ms, frame time) after the previous pass. If it did, it sets `clapBlindAt`.
2. It is armed only when `clap.en`, `micOn`, `getUMData(AUDIOREACTIVE)` is valid, and there is no sound-reactive effect on a visible LED 1/2 segment. When it is not armed, it clears the sequence, sets `peakPrev = true` so an already-running peak isn't counted, and clears the loudness history to 255 ("unknown").
3. A late pass during a running sequence marks it bad.
4. One second after the last clap, the sequence is evaluated: 2 claps run `a2` and 3 claps run `a3`, via `curSrc = SRC_CLAP; runActions(...)`. Firing starts a 2 s cooldown.
5. A clap is a rising edge of `samplePeak`, ignored during the cooldown.
   - First clap: it starts a sequence only if volumeSmth stayed at or below 30 from about 1.0 s to 0.2 s before the clap (history slots 2-9; the two newest slots may already hold the clap). There must also have been no late pass in the last 800 ms.
   - A following edge less than 150 ms after the last clap is treated as an echo and ignored.
   - A following edge more than 800 ms after the last clap, or a 4th clap, makes the sequence bad.
6. The loudness history keeps the loudest volumeSmth in each 100 ms slot.

No heap use, no String, no printf except one `DEBUG_PRINTF_P("%u", (unsigned)n)`.

## 2. WLED APIs verified (file:line in REPO)

| API / fact | Where |
|---|---|
| `UsermodManager::getUMData(um_data_t**, uint8_t)` | wled00/fcn_declare.h:406, wled00/um_manager.cpp:33-39 |
| `um_data_t {u_size, u_type, u_data}` | wled00/fcn_declare.h:344-358 |
| AR getUMData returns false when AR is disabled | usermods/audioreactive/audio_reactive.cpp:1714-1719 |
| u_data[0] = `&volumeSmth` (float), u_data[3] = `&samplePeak` (bool) | audio_reactive.cpp:1396, 1402 (declared `static bool samplePeak` at l.135) |
| `USERMOD_ID_AUDIOREACTIVE` = 32 | wled00/const.h:230 |
| samplePeak set in the FFT task (`detectSamplePeak`, every >=100 ms) | audio_reactive.cpp:768-776, called at l.600 inside `FFTcode` (task on core 0, l.1758-1766), cycle `FFT_MIN_CYCLE` 21 ms (l.277) |
| samplePeak set in AR `loop()` (`getSample`, new sampleMax, every >=80 ms, only if binNum<12 or maxVol<1) | audio_reactive.cpp:1165-1171, called at l.1628 |
| samplePeak set from UDP sound sync (receive mode) | audio_reactive.cpp:1296-1299, 1324-1327 |
| cleared by `autoResetPeak()` when `millis()-timeOfPeak > max(50, strip.getFrameTime())` | audio_reactive.cpp:781-787; called from the FFT task (l.599) and AR loop (l.1646) |
| No effect writes samplePeak (reads only) | FX.cpp:61, 6661, 7134, 7495 |
| Ripple Peak (also Puddlepeak, Waterfall) write AR `maxVol`/`binNum` from their sliders | FX.cpp:6675-6676, 7140-7141, 7510-7511; AR defaults maxVol=31, binNum=8 at audio_reactive.cpp:157-158 |
| volumeSmth rise limited to 196 per 80 ms (limiter) | audio_reactive.cpp:1190-1213 |
| `strip.getModeData(id)` (PROGMEM, id 0 and out of range give "Solid") | wled00/FX.h:961 |
| Metadata format: flags = field [3] after splitting on ';' ("1v", "01f", empty = 1D) | wled00/data/index.js:956-967; wled00/json.cpp:1303-1306 (fxdata = text after '@'); e.g. FX.cpp:6717 |
| `strip.getSegmentsNum()`, `getSegment(id)`, `getFrameTime()` | FX.h:937, 964, 947 (default 1000/42 ms, FX.h:61-62) |
| `Segment::mode` (uint8_t), `on` (bitfield), `isActive()` | FX.h:450, 435, 636 |
| Effects run for every active segment, on or off | FX_fcn.cpp:1339 ff. (`if (seg.isActive())`) |
| `bri` global | wled00/wled.h:616 |
| `pgm_read_byte` in the codebase | wled00/src/dependencies/json/ArduinoJson-v6.h:818; FX.cpp:7712 (`_near`) |
| `DEBUG_PRINTF_P` | wled00/wled.h:882/887 |
| Usermod loop rate (up to 2000/s, usually 20-300/s, worst case 1-3/s) | AGENTS.md:259-265; `UsermodManager::loop()` once per pass, wled00/wled.cpp:104 |
| `extractModeName` for effects reads `getModeData` (JSON_mode_names is a stub) | wled00/util.cpp:323-338; FX_fcn.cpp:2293 |

Moods: effect names, registration and flags:

| Mood (id) | Effect | Metadata | Registered | Flags | Palette |
|---|---|---|---|---|---|
| Beat Ripple (18) | Ripple Peak | FX.cpp:6717 | FX.cpp:11130, unconditional | `1v` = 1D + volume, so sound = true | Candy = 57 (FX_fcn.cpp:2294-2303, palettes.cpp:852) |
| Popcorn Party (19) | Popcorn | FX.cpp:3492 | FX.cpp:11086 | empty = 1D (index.js:960) | Rainbow = 11 |
| Lighthouse (20) | Lighthouse (= FX_MODE_COMET) | FX.cpp:1285 | FX.cpp:11070 | missing = 1D | Icefire = 36 (palettes.cpp:831) |
| Night Path (21) | Solid | FX.cpp:139, always id 0 (FX.cpp:10975-10977) | - | - | none |
| Focus (22) | Solid | same | - | - | none |

All palettes are below `FIXED_PALETTE_COUNT` = 72 (const.h:9-12), so `hgFindPalette` finds them. `hgFindEffect` matches the full name case-insensitively, so "Candy" does not match "Candy2" and "Solid" does not match "Solid Pattern".

Slider choices, checked in the effect code:
- **Ripple Peak**: `ix/16` = number of ripples (FX.cpp:6681). `sx` is unused because the fade is fixed at 240 (l.6678-6679). `col[1]` is the colour the ripples fade to, so it is black.
- **Popcorn**: `sx` = gravity, `ix` = kernel count (FX.cpp:3451-3455). `col[1]` = background, so it is black.
- **Lighthouse**: `sx` 64 gives one sweep every 65536/17 ≈ 3.9 s (FX.cpp:1267-1268). `ix` = fade rate toward `col[1]` (FX_fcn.cpp:1096-1108), so `col[1]` is black and 160 leaves a long glow.
- **Preview colours** are taken from the palette stops: Candy palettes.cpp:609-614, Icefire l.315-322.

## 3. Decisions and deviations

- **Contract deviation (confirmed by the coordinator):** the contract says the flags are "after the 4th ';'". The real format is `Name@sliders;colors;palette;flags;defaults`, so the flags come after the **3rd** ';'. The code uses the 3rd.
- **Moods: no deviation.** All effect and palette names exist, are registered on this build, and are 1D.
- **Meaning of "runs a sound effect":** a strip counts only if its segment is on and active and WLED `bri > 0`. Without this, a sound mood left on a strip that is switched off would silently block clap control forever (for example, "clap to switch the light on" would not work). Checking only `seg.mode` would be one line: drop the `bri`, `isActive` and `on` checks in `clapSoundFx()`.
- **Cheap check:** the result is cached per strip and effect id (`clapFxMode`/`clapFxSound`). The PROGMEM string is only parsed when a strip's effect changes. The zero-initialised cache is already correct, because id 0 = Solid is not sound reactive.
- **`clapArmed()` = `enabled && clap.en && micOn && clapReady`** (`clapReady` = audioreactive present and not suppressed). It adds the usermod's `enabled` flag, because `loop()` stops updating `clapReady` when the usermod is disabled. The cooldown and the "music before" rule are per sequence and do not show up in `clapArmed()`.
- **Polling limits, and why polling is still reliable:**
  - `samplePeak` stays true for more than max(50 ms, frame time). Peaks are re-armed only after 80/100 ms.
  - A `loop()` pass at least every 50 ms therefore always sees every peak (at 20 or more passes per second; AGENTS.md says the usual rate is 20-300 per second).
  - Slower passes can miss a peak, so I added a "blind pass" guard. A sequence that contains a late pass is ignored. A first clap needs 800 ms without a late pass. The worst case is then a refused command, never a wrong count (for example 3 claps running the 2-clap actions).
  - At 1-3 passes per second (file system writes, heavy API traffic), clap control simply does not react.
- **Timing rules:**
  - A peak less than 150 ms after a counted clap is ignored as an echo. It does not break the sequence.
  - A gap longer than 800 ms (before the 1 s evaluation) or a 4th clap cancels the sequence.
  - A 3rd clap more than 1 s after the 2nd arrives after the evaluation: the 2-clap actions run and the 3rd clap falls into the cooldown.
- **"volumeSmth just before the first clap"** is implemented as the loudest value in 100 ms slots from about 0.2 s to 1 s before the clap. The newest ~0.1-0.2 s is skipped because the limiter lets volumeSmth reach 30 about 12 ms after the clap starts (audio_reactive.cpp:1201-1204). After suppression or after enabling, one second of quiet has to be recorded first (history = 255).
- **Cooldown** of 2 s after firing (relay clicks can themselves be loud peaks).
- **Wrap-safe timing:** all comparisons use `now - t` with unsigned values. There are no `(int32_t)(now - until)` deadlines; the cooldown uses a flag plus the firing time.
- **"Keep" relays:** relay-off and toggle-off in `runActions` go through `autoRelayOff`, so clap actions never switch off "stays on" relays.

## 4. Risks

- **[code] samplePeak is not a clap detector.**
  - The FFT path detects "high activity in a frequency bin" (comment at audio_reactive.cpp:764). The loop path detects "a new maximum of the loudness" (l.1166).
  - Knocks, door slams, a dropped object, a dog bark, or claps in a video on a quiet TV can form a valid 2- or 3-clap pattern.
  - Clap actions switch mains relays without the API key: the sound itself is the only "authentication".
  - Recommend in the readme: no heaters, irons or similar on clap actions.
- **[unverified] Softer follow-up claps may be missed.** The loop-path peak needs the loudness to go above `sampleMax`, which decays slowly (0.9994 per call, audio_reactive.cpp:227/1176). If the 2nd or 3rd clap is clearly softer than the 1st, only the FFT path (bin 8 ≈ 340 Hz > maxVol 31) can catch it. Then 3 claps can be counted as 2 and `a2` runs. The readme advises making a2 and a3 harmless for each other. This needs a real test with the MAX4466 analog mic.
- **[unverified]** The music threshold 30 depends on the mic, gain, AGC and squelch. With AGC, normal talking may exceed it (claps refused), and quiet music may stay below it.
- **[code]** Ripple Peak, Puddlepeak and Waterfall copy their sliders into AR's `maxVol`/`binNum` (FX.cpp:6675-6676). Moving those sliders changes clap sensitivity until reboot. With binNum >= 12 and maxVol >= 1 the loudness path (audio_reactive.cpp:1167) is off. With binNum <= 4 or maxVol = 0 the FFT path (l.768) is off. With the defaults (Beat Ripple mood) nothing changes: the effect copies AR's values into its sliders on the first call.
- **[code]** In UDP sound-sync receive mode, samplePeak comes from another device's microphone (audio_reactive.cpp:1293-1299). Claps are then heard wherever that device is.
- **[code]** In realtime mode (DDP, E1.31, ...), AR stops processing (audio_reactive.cpp:1583-1592). `"clap":1` is shown, but nothing is detected.
- **[code]** `samplePeak` and `volumeSmth` are plain statics written by the FFT task (core 0) and AR's loop. Single byte and 32-bit reads are atomic on Xtensa, so the worst case is an edge seen one pass later. Effects read them the same way (FX.cpp:6661).
- **[code]** `clapReady` is read by `serveLive` (AsyncTCP task) without a lock. It is a bool, the same practice as the other `serveLive` fields.
- **[code]** Only LED 1 and LED 2 are checked. A sound effect on another segment, or music from a phone, is caught only by the volume rule.
- **[code]** The effect cache assumes an effect id never changes its metadata at runtime. `addEffect` refuses to overwrite (FX.cpp:10958).
- **[unverified] Compile:** not compiled. Points I reviewed by hand:
  - The nested struct with in-class initialisers is used only as a plain member. There are no `{}`, default arguments or traits inside the class, which avoids the GCC "default member initializer required before the end of its enclosing class" error.
  - `pgm_read_byte(++p)` expands its argument once.
  - `(unsigned)` matches `%u`.
  - The conditional `n == 2 ? clap.a2 : clap.a3` yields `HgAction[8]`, which decays to `const HgAction*`.

**Out of scope: found in the base file, not changed (please route to the owner).**
- **[code] "Cozy Fire" (id 6) uses "Fire 2012".** That effect is only registered when a particle system is disabled (FX.cpp:11071-11074, 21-37). The home_gadgets env (platformio_override.ini:9-13 → esp32dev_V4) disables neither, so the mood falls back to Solid (base l.1153). A possible replacement is "PS Fire 1D" (FX.cpp:10484, flags `1`).
- **[code] millis() wrap, agent A's area.**
  - `settling = (int32_t)(now - settleUntil) < 0` (base l.1003, 1026) becomes true about 24.9 days after `initHardware()`. It then stays true for 24.9 days: wall switches and motion sensors stop working.
  - `(int32_t)(now - hgAcLastPulse[i]) < HG_AC_HOLD_MS` (base l.1009), with `hgAcLastPulse` = 0 at init (l.913), makes an AC input that never pulsed (or not for 24.9 days) read "on". Because the settling bug starts ~1 s later, this can toggle the relay once.
- **Stale "0-17" mood id range after adding moods 18-22:**
  - the `serveApi` comment "0-17 built-in" (base l.1345, A's function)
  - readme line 8 ("18 ready-made") and line 117 (mood id list)

## 5. readme.md sections (plain English)

The page wording is not known to me. Adjust "Clap control" labels to match the page.

---

### Clap control (experimental)

Clap your hands 2 or 3 times to run a list of actions, for example "2 claps = ceiling light on/off, 3 claps = all off". It is **off by default**.

**You need:** the audioreactive usermod with a working microphone, and the microphone switched on on the Home page.

**Set it up:** turn on **Clap control** in the Home Gadgets settings. Then choose the actions for **2 claps** and **3 claps**, up to 8 each, the same kind of actions as scenes. Actions never switch off appliances marked "stays on".

**How to clap:**
- Clap clearly, about half a second apart. Claps must be between 0.15 s and 0.8 s apart.
- After the last clap, wait 1 second. Then the action runs.
- After an action there is a 2-second pause before new claps are heard.

**It does not listen when:**
- the microphone is off, or audioreactive is missing or disabled
- LED 1 or LED 2 shows a 🎵 sound mood (music is probably playing). Switch that strip off or pick another mood.
- it was loud (music, talking) in the second before your first clap
- the device is very busy (saving files, many app requests). The claps are ignored rather than counted wrong.

The page shows whether clap control is listening right now.

**Good to know:**
- The microphone hears "loud bangs", not real claps. Knocking, a door slam or claps in a video can trigger it now and then.
- **Don't put heaters, irons or other appliances that must not switch on by accident on clap actions.**
- Make the 2-clap and 3-clap actions "safe" for each other: a soft third clap may be missed, and then the 2-clap actions run.
- If the device receives sound from another WLED device (audio sync "receive"), the claps are heard there, not in your room.

### New moods

Five more built-in moods (ids 18-22). They work on LED 1, LED 2 or both, like the others.

| Id | Mood | Look |
|---|---|---|
| 18 | Beat Ripple 🎵 | colourful ripples (Candy colours) that pop up on every beat |
| 19 | Popcorn Party | rainbow "popcorn" jumping up the strip |
| 20 | Lighthouse | an ice-blue beam that sweeps slowly along the strip and leaves a glow |
| 21 | Night Path | very dim warm amber, as a night light for the hallway (pairs well with a motion sensor) |
| 22 | Focus | bright cool white for working or reading |

(Update the "Built-in mood ids" list: … 17 Spring Bloom, 18 Beat Ripple, 19 Popcorn Party, 20 Lighthouse, 21 Night Path, 22 Focus. Also change "18 ready-made LED looks" to "23".)
