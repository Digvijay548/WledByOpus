# WLED on a 38-pin ESP32: Code Review and Customization Guide

| | |
|---|---|
| **Date** | 29 September 2026 |
| **Code reviewed** | WLED `17.0.0-devV5` (snapshot of the `main` branch) in `Downloads\WLED-main\WLED-main`. It is not a git repository |
| **Your board** | 38-pin ESP32 DevKitC-style board, ESP32-WROOM-32/32E module, 4 MB flash, no PSRAM |
| **Build target** | Your project builds **`home_gadgets`**, which extends `esp32dev_V4` (ESP-IDF 4.4) because of the analog microphone (section 15). For a board without an analog mic, the standard target is `esp32dev` (ESP-IDF 5.5 / Arduino core 3.3), described in sections 2 and 4 |
| **How this was made** | A read-only review of the whole codebase: six parallel reviews, plus manual re-checks of the important findings. The review itself compiled, flashed and changed nothing. Section 15 was added later the same day, after another Claude session built the Home Gadgets firmware |
| **Team coordination** | Several Claude sessions work on this project in parallel. Who owns which file, the build lock and open findings are in `Downloads\WLED-main\TEAM_BOARD.md` |

**Code references:** `wled00/wled.cpp:277` means file `wled00/wled.cpp`, line 277. Paths are relative to the project folder `WLED-main\WLED-main`. In VS Code, press `Ctrl+P` and type for example `wled.cpp:277` to jump there. Line numbers are for this snapshot and will move when the code is edited.

**Status labels for bugs:**
- **Re-checked**: found by a review and confirmed again by reading the code.
- **Reviewed**: found by one review that traced the code, but not re-checked.
- **Suspected**: likely, but not fully traced.

None of the bugs were reproduced on a real board.

---

## Contents

1. Start here: the 12 most important points
2. Build and flash for your board
3. How WLED works
4. Build system
5. Hardware: pins, LED outputs, buttons, relay, IR
6. Effects engine
7. Network, APIs and security
8. Web UI
9. Usermods (plugins) and audio
10. Where to change what
11. Gotchas
12. Bug list
13. Glossary
14. Next steps
15. Home Gadgets build (your current project)

---

## 1. Start here

1. **Build the right target.**
   - Your Home Gadgets firmware uses the target `home_gadgets`, based on `esp32dev_V4` because the analog microphone needs it. `platformio_override.ini` makes it the only default target (section 15.2).
   - A plain ESP32 board without an analog mic would use `esp32dev`.
   - When this review started, PlatformIO had only processed `nodemcuv2`, an ESP8266 target (section 2).
2. **Never press Upload while the "Default" environment is selected.** It works through about 30 targets in a row and may flash several different firmwares onto your board.
3. **Default wiring:** LED data on GPIO16, button 0 on GPIO0 (the board's BOOT button), relay and IR off. Your Home Gadgets wiring is in section 15.3.
4. **Pins for your own wiring:**
   - Safe: 4, 13, 16, 17, 18, 19, 23, 25, 26, 27, 33.
   - Input-only: 34, 35, 36, 39.
   - Avoid: 0, 1, 2, 3, 5, 6-11, 12, 15.

   See section 5.2.
5. **The audio usermod is built in by default.**
   - With the default digital (I2S) microphone settings, it claims GPIO 14, 15 and 32 even while it is switched off.
   - With an analog mic, as in your Home Gadgets build, it only claims its `AUDIOPIN` (GPIO36).
   - Remove it if you don't use a microphone. See section 9.4.
6. **Settings saved in the web UI always win** over compile-time defaults such as `DATA_PINS`. Those defaults only apply on the first boot or after a factory reset.
7. **Put `WLED_DISABLE_*` feature flags in `build_flags`**, not in `my_config.h`. Some of them are checked before `my_config.h` is loaded.
8. **The current limiter defaults to 850 mA.** With many LEDs the strip looks dim until you enter your power supply's real limit in LED Preferences.
9. **The web server runs in parallel with the main loop.** Many bugs are timing clashes between the two, so keep this in mind when you change code.
10. **Never edit `wled00/html_*.h` or `wled00/js_*.h`.** Edit the files in `wled00/data/` and run `npm run build`.
11. **Holding the BOOT button (button 0) for more than 10 s formats the filesystem.** All settings and presets are lost. Holding it 5-10 s opens the WiFi access point.
12. **Set a settings PIN before connecting mains appliances** to the Home Gadgets relays. Without one, any web page opened on your network can change files on the device and reboot it (section 15.5).
13. **Four high-severity bugs affect normal use.** They are memory corruption when shrinking the LED count or using big offsets, a current limiter overflow above about 1170 LEDs per pin, and a crash on pin clashes. See section 12.

---

## 2. Build and flash for your board

### 2.1 What was wrong with the original setup

> **Update:** this describes the project before the Home Gadgets work started. `platformio_override.ini` now exists with `default_envs = home_gadgets`, and that firmware has been built (section 15.2). The points below still apply to any new setup.

- `platformio.ini:13-42` lists about 30 build targets in `default_envs`, starting with `nodemcuv2` (ESP8266).
- `.pio/build/` contains only `nodemcuv2`, because PlatformIO indexed that target for VS Code.
  - No ESP32 firmware has been built yet.
  - VS Code's code navigation (`.vscode/c_cpp_properties.json`) currently uses ESP8266 headers.
- Uploading without choosing a target processes every target in the list and continues after failures. That happens with `pio run -t upload` without `-e`, and with the Upload button while the "Default" environment is selected.
  - The last ESP32 target that uploads successfully wins.
  - That could be `usermods`, which uses a 16 MB partition layout (`platformio.ini:1067-1072`) on your 4 MB board.
  - The PlatformIO behaviour was checked in its source code. The effect on your board is suspected, not tested.

### 2.2 Create `platformio_override.ini`

> **Your project already has this file** (section 15.2). It belongs to the Home Gadgets builder session, so don't replace it with the example below. The example is kept as a reference for a plain `esp32dev` build.

Put this file in the project root: `WLED-main\WLED-main\platformio_override.ini`.
- It is ignored by git and loaded automatically (`platformio.ini:47-49`).
- Its `default_envs` replaces the long list.
- You don't need to touch `platformio.ini`. Changes there need maintainer approval if you ever send them upstream.

```ini
[platformio]
default_envs = esp32dev_mine          ; build only this target

[env:esp32dev_mine]
extends = env:esp32dev                ; IDF 5.5 platform, dio flash, 4 MB layout, audio usermod
upload_speed = 921600                 ; use 460800 or 115200 if uploads fail
; upload_port = COMx                  ; your ESP32's USB port (CP210x/CH340 in Device Manager; COM5/COM6 are Bluetooth here)
custom_usermods = audioreactive       ; leave empty ("custom_usermods =") if you won't use an I2S microphone
build_flags = ${env:esp32dev.build_flags}
  ; --- first-boot defaults only; settings saved in the web UI win afterwards ---
  ; -D DATA_PINS=16                   ; LED data pin(s), e.g. 16,17 for two outputs
  ; -D PIXEL_COUNTS=60                ; LEDs per output, e.g. 60,60
  ; -D LED_TYPES=TYPE_WS2812_RGB      ; LED chip type
  ; -D BTNPIN=0                       ; button 0 pin
  ; -D RLYPIN=25 -D RLYMDE=1          ; relay pin; RLYMDE=1 = relay on when the pin is HIGH
  ; -D IRPIN=34                       ; IR receiver pin (input-only pins are fine)
  ; -D ABL_MILLIAMPS_DEFAULT=850      ; power-supply current limit in mA (0 = limiter off)
  ; --- remove features you don't need (smaller firmware) ---
  ; -D WLED_DISABLE_ALEXA -D WLED_DISABLE_HUESYNC -D WLED_DISABLE_MQTT
  ; -D WLED_DISABLE_INFRARED -D WLED_DISABLE_2D
  ; -D WLED_DEBUG                     ; extra debug output on the serial monitor
```

Rules:
- Always start `build_flags` with `${env:esp32dev.build_flags}`. Otherwise you lose the parent target's flags. The same applies to `build_unflags` and `lib_ignore`.
- Remove the `;` in front of a line to activate it.
- `-D WLED_DISABLE_ESPNOW` needs a matching `lib_ignore` entry, or the build fails (section 11):
  ```ini
  lib_ignore = ${env:esp32dev.lib_ignore}
    wled-espnow
  ```
- If you change `WLED_RELEASE_NAME`, wireless updates to or from official builds need "Ignore firmware validation" ticked (section 7.6).

### 2.3 Build, flash, first start

1. In VS Code, pick `env:esp32dev_mine` in PlatformIO's environment picker in the status bar. This also fixes code navigation.
2. Build with `pio run -e esp32dev_mine`.
   - The web UI is built automatically first: `pio-scripts/build_ui.py` runs `npm ci` and `npm run build`.
   - You need Node.js 20 or newer, and internet access for `npm ci`.
3. Flash over USB with `pio run -e esp32dev_mine -t upload`. This writes the bootloader, the partition table and the firmware.
4. Watch the log with `pio device monitor -b 115200`. Crash traces are decoded automatically.
5. First start:
   - Connect your phone or PC to the WiFi network **WLED-AP** (password **wled1234**).
   - Open **http://4.3.2.1** and enter your WiFi details.
   - Afterwards the device is at its IP address or at `http://wled-xxxxxx.local`, where `xxxxxx` is the last 6 hex digits of its MAC address.
6. For later wireless updates, use the file in `build_output/release/` (named `WLED_<version>_<release name>.bin`) on the device's Update page.
7. The board may reboot in a loop right after start, with `CONFLICT! driver_ng...` in the log. If so, remove the audio usermod or use the `esp32dev_V4` target (section 9.4).

### 2.4 Flash space (4 MB)

If the firmware doesn't fit, the build stops with a size error. You can't flash an oversized image by accident.

| Partition table (in `tools/`) | Firmware slot (x2, for OTA) | Filesystem | Crash dump |
|---|---|---|---|
| `WLED_ESP32_4MB_1MB_FS.csv` (default) | 1,572,864 B (1.5 MB) | 960 KB | no |
| `WLED_ESP32_4MB_700k_FS.csv` (`${esp32.extended_partitions}`) | 1,703,936 B | 704 KB | no |
| `WLED_ESP32_4MB_512KB_FS.csv` | 1,769,472 B | 512 KB | 64 KB |
| `WLED_ESP32_4MB_256KB_FS.csv` (`${esp32.big_partitions}`) | 1,900,544 B | 256 KB | 64 KB |

- **Changing the table:** set `board_build.partitions = ...` in your target.
  - It needs a USB flash and will probably erase the filesystem.
  - Before that, download **Backup presets** and **Backup configuration** from Settings → Security & Updates.
- **Web UI size:** about 120 KB of flash. The main page alone is about 40 KB.
- **If the firmware is too big,** remove things in this order:
  1. The audio usermod.
  2. PixelForge (`-D WLED_DISABLE_PIXELFORGE`) and GIF support (`-D WLED_ENABLE_GIF` added to `build_unflags`).
  3. Alexa, Hue, MQTT, Loxone, IR.
  4. `-D WLED_PS_DONT_REPLACE_FX`, removed via `build_unflags`. This lets particle-system versions replace some classic effects.
  5. The particle systems.
  6. 2D.

---

## 3. How WLED works

### 3.1 Map of the code

| Area | Main files | What it does |
|---|---|---|
| Startup, main loop | `wled00/wled.cpp`, `wled.h`, `const.h`, `wled_boards.h` | Starts everything, then runs every part in turn |
| Saved settings | `cfg.cpp`, `file.cpp`, `presets.cpp`, `playlist.cpp` | Reads and writes files on the flash filesystem |
| State changes | `led.cpp` | Brightness, colours, notifications, nightlight |
| LED outputs and pins | `bus_manager.*`, `bus_wrapper.h`, `pin_manager.*` | Drives the strips, tracks which feature owns each GPIO, current limiter |
| Effects | `FX.cpp`, `FX.h`, `FX_fcn.cpp`, `FX_2Dfcn.cpp`, `FXparticleSystem.*`, `palettes.cpp`, `colors.*` | Segments, effects, transitions, 2D, palettes |
| Inputs | `button.cpp`, `ir.cpp`, `dmx_input.cpp` | Buttons, IR remotes, DMX |
| Network | `wled_server.cpp`, `json.cpp`, `set.cpp`, `xml.cpp`, `ws.cpp`, `udp.cpp`, `e131.cpp`, `mqtt.cpp`, `alexa.cpp`, `hue.cpp`, `ntp.cpp`, `improv.cpp`, `remote.cpp`, `network.cpp` | WiFi, web server, APIs, sync, lighting protocols |
| Updates | `ota_update.cpp`, `wled_metadata.cpp` | Firmware updates and compatibility checks |
| Helpers | `util.cpp`, `wled_math.cpp`, `prng.h`, `dynarray.h` | Maths, memory, strings, random numbers |
| Web UI | `wled00/data/` → `tools/cdata.js` → `wled00/html_*.h` | Browser interface compiled into the firmware |
| Plugins | `um_manager.cpp`, `usermod.cpp`, `usermods/` | Optional features |
| Bundled libraries | `wled00/src/dependencies/` | ArduinoJson 6, E1.31, Espalexa, time/timezone, DMX, ... |
| Build | `platformio.ini`, `pio-scripts/`, `tools/`, `package.json` | Build targets, scripts, partition tables |

### 3.2 Startup order (`WLED::setup`, `wled00/wled.cpp:388-659`)

1. Optionally turn the brownout detector off, pull down the RX pin, and start the serial port at 115200 baud (`:390-402`).
2. Mount the flash filesystem, LittleFS (`:485`). **If mounting fails, the filesystem is formatted automatically.**
3. Run the crash-loop check `handleBootLoop` (`:494`) and create the presets file if it is missing (`:495`).
4. Check `cfg.json`. If it is broken, restore the backup. If that fails, rename it (`:523-527`).
5. Load settings with `deserializeConfigFromFS` (`:529`), reading `wsec.json` and then `cfg.json`.
   - Buttons, IR, relay and I2C/SPI **take their pins now**.
   - LED outputs are only queued.
6. Start the LEDs with `beginStrip` (`:541`, `:661-703`): create the outputs (they take their pins now), segments, relay, boot brightness, and queue the boot preset.
7. Start the usermods (`:545-546`). They take their pins last. Save the config if a usermod asked for it (`:549`).
8. Apply the boot preset or playlist (`:551-555`).
9. Start WiFi and a background network scan (`:560-580`).
10. Start the web server (`:635`), IR (`:641`) and the optional watchdog (`:651`). Mark the firmware as good for OTA rollback (`:658`).
11. The actual WiFi connection starts in the first `loop()`, in `handleConnection`.

**Pin order matters.** If two features want the same GPIO, the one that starts first gets it. The order is buttons/IR/relay/I2C, then LED outputs, then usermods.

### 3.3 Main loop (`WLED::loop`, `wled00/wled.cpp:59-359`)

Every pass:
1. Time/NTP, IR, WiFi connection handling, serial input (Adalight, Improv, JSON), UDP notifications, transitions.
2. The usermods' `loop()` (`:103-104`).
3. Buttons and relay, ESP-NOW, Alexa, closing files.
4. Unless live (realtime) data is being received (`:131`): DNS, Hue, playlist, presets, and **`strip.service()`**. That renders a frame when one is due, 42 times per second by default.
5. Every 30 s, MQTT and node tasks (`:177-187`). Every 5 s, a memory check (`:195-235`).
6. LED re-initialisation after a settings change (`:239-248`), config save (`:254`), WebSocket updates, watchdog, delayed reboot (`:277`).

There is no `delay()` in the loop on ESP32. A usermod's `loop()` is called up to 2000 times per second when idle, and as rarely as 1-3 times per second under heavy load (AGENTS.md).

### 3.4 What runs in parallel (FreeRTOS tasks)

| Task | Core | Runs |
|---|---|---|
| Arduino `loopTask` | 1 | `setup()` and `loop()` |
| AsyncTCP (web) | any | Web pages, JSON API, WebSocket, settings saves, OTA, MQTT callbacks (8 KB stack) |
| FFT (audio usermod) | 0 | Sound analysis, priority 1, only when audio is enabled |
| DMX input | 0 | Priority 2, only when configured |

Web handlers run **at the same time** as `loop()`.
- Only segment changes made through the JSON API are protected, with `strip.suspend()` + `strip.waitForIt()` (`wled00/json.cpp:464-491`).
- Other paths are not protected: the `/win` API, settings saves and usermod callbacks.
- That is the source of several race bugs.

### 3.5 Global variables and where defaults come from

- Globals are declared with `WLED_GLOBAL` / `_INIT(...)` in `wled00/wled.h:268-280`. `wled.cpp` owns their storage.
- Defaults are layered like this, and later layers win:
  1. Build flags and `my_config.h`.
  2. Macros in `wled.h` / `const.h`.
  3. `cfg.json` / `wsec.json`, read at boot.
  4. Changes from the settings pages or `POST /json/cfg`.
- Changes are written to flash when `configNeedsWrite` is set.

### 3.6 Files on the flash filesystem (LittleFS, 960 KB)

| File | Content |
|---|---|
| `/cfg.json` | All settings. Passwords are stored only as their length |
| `/wsec.json` | Passwords and secrets. Can't be read over HTTP (`wled00/file.cpp:481`) |
| `/bkp.cfg.json` | Copy of the previous `cfg.json`, made before every save (`wled00/cfg.cpp:833`) |
| `/rst.cfg.json` | A broken or reset `cfg.json`, renamed |
| `/presets.json` | All presets and playlists in one JSON object, edited in place |
| `/ledmap*.json`, `/2d-gaps.json` | Custom LED order, 2D matrix gaps |
| `/palette*.json` | Custom palettes |
| `/ir.json` | Custom IR remote codes |
| `/skin.css` | Your own UI styling (optional) |
| GIF files | Images for the image effect |

A save writes `wsec.json` (no backup), then backs up and rewrites `cfg.json` (`wled00/cfg.cpp:831-849`). Write errors and a full filesystem are not detected.

### 3.7 Presets and playlists

- **Applying a preset** only queues it. The main loop loads and applies it later (`wled00/presets.cpp:127-215`).
- **Saving a preset** is queued too; the main loop captures the state (`:29-85`).
  - Exception: API-command presets and preset deletions are written immediately from the web task (`:252-266`, `:280-285`).
- **Preset 255** is a temporary preset kept in RAM on ESP32 (`:58-69`).
- **Playlists** hold up to 100 entries, with one level of nesting (`wled00/playlist.cpp:58-182`).
- **`presets.json`** is edited in place. Freed space isn't reused until a reboot, so the file only grows.

### 3.8 How a change reaches the LEDs (`wled00/led.cpp`)

1. `colorUpdated()` applies the new values to the selected segments.
2. It then calls `stateUpdated()`, which:
   - sends the UDP sync,
   - schedules a WebSocket/MQTT update (at most once per second),
   - calls the usermods' `onStateChange`,
   - starts the brightness transition.

`handleTransitions()` fades the brightness. The nightlight timer runs 10 times per second.

### 3.9 Memory (your board has no PSRAM)

- **One shared 32 KB JSON buffer** in RAM (`wled00/wled.h:851-857`).
  - A lock with a 250 ms wait protects it (`wled00/util.cpp:267-318`).
  - Each failed wait can pause the LED loop for up to 250 ms.
- **Allocations are refused** if less than **15 KB** of contiguous free RAM would remain (`MIN_HEAP_SIZE`, `wled00/util.cpp:837-870`). A web request needs about 12 KB.
- **Low-memory watchdog** (`wled00/wled.cpp:195-235`):
  - After 15 s of low memory, all effects switch to Solid.
  - After 30 s, segments are reset.
  - After 45 s, the LED strip object is recreated and WiFi reconnects. This last step is buggy (bug M6).
- **Crash-loop protection** (`wled00/util.cpp:980-1123`) triggers after 5 crashes, each less than 2 minutes after boot. It then escalates:
  1. Restore the config backup.
  2. Reset the config. This step doesn't work (bug M3).
  3. Roll back the firmware (OTA).
  4. Print the files to the serial port.
- **Brownouts** (power dips) are only reported (`ERR_SYS_BROWNOUT`). There is no safe mode.
- **Pixel buffers** live in a special RAM area that only allows 32-bit access (`wled00/util.cpp:915-923`). Never read them byte by byte.

---

## 4. Build system

### 4.1 The `esp32dev` target (`platformio.ini:765-777`)

- **Platform:** Tasmota `platform-espressif32` 2026.05.50, which is Arduino core 3.3.8 on ESP-IDF 5.5.4 (`platformio.ini:318-320`).
- **Basics:** flash mode `dio`, the default 4 MB partition table, `custom_usermods = audioreactive`, release name `ESP32`.
- **Important IDF 5 flags** (`platformio.ini:327-345`):
  - `WLED_USE_SHARED_RMT`.
  - `ESP32_ARDUINO_NO_RGB_BUILTIN`, which prevents an RMT driver conflict at boot.
  - `-D__unreachable=__builtin_unreachable`.
  - `WLED_ENABLE_DMX_INPUT`.
  - Also `WLED_ENABLE_GIF` and `CONFIG_ASYNC_TCP_STACK_SIZE=8192` (`:263-266`), and `ARDUINO_USB_CDC_ON_BOOT=0`.
- **Common flags** (`platformio.ini:84-99`):
  - `-DWLED_USE_MY_CONFIG`.
  - `NDEBUG`, which turns asserts off.
  - The IR decoders NEC, Sony, Samsung, LG and hash.
  - `WLED_PS_DONT_REPLACE_FX`.
- **Libraries:**
  - Included: NeoPixelBus (CORE3 branch), AsyncTCP 3.4.10, ESPAsyncWebServer (WLED fork), AsyncMqttClient 0.9.0, IRremoteESP8266 2.9.0, esp_dmx (fork), AnimatedGIF, GifDecoder.
  - Excluded: `NeoESP32RmtHI`.

Other targets for a classic ESP32:

| Target | Use it when |
|---|---|
| `esp32dev_V4` | You need an **analog microphone** (IDF 4.4, no DMX input) |
| `esp32dev_debug` | Debugging (`WLED_DEBUG`, no LTO so crash traces are readable) |
| `esp32dev_8M`, `esp32dev_16M` | Your module has 8 or 16 MB flash |
| `esp32_eth` | Boards with Ethernet (the LED moves to GPIO4, button and relay are disabled) |
| `esp32_wrover` | Modules with PSRAM (WROVER) |

### 4.2 Build steps (`platformio.ini:112-123`)

Before compiling:
1. **`set_metadata.py`** reads the version from `package.json` and puts the version and repo name into `wled_metadata.cpp` only.
2. **`user_config_copy.py`** creates `wled00/my_config.h` from `my_config_sample.h` if it's missing. It is included via `-DWLED_USE_MY_CONFIG` (`wled00/wled.h:122-124`).
3. **`load_usermods.py`** turns each name in `custom_usermods` into a library.
   - For each name it tries `usermods/<name>`, then `<name>_v2`, then `usermod_v2_<name>`.
   - `*` means all usermods. URLs and registry names pass straight through.
   - Each usermod's `library.json` must contain `"build": {"libArchive": false}`, or the build stops.
   - Any library named `wled-*` counts as a module.
4. **`build_ui.py`** runs `npm ci`, then `npm run build`.

After linking:
- **`output_bins.py`** copies the firmware to `build_output/release/WLED_<version>_<release>.bin`, and the map file to `build_output/map/`.
- **`strip-floats.py`** removes float support from `printf`/`scanf` to save flash.
- **`dynarray.py`** patches the linker script so the usermod registry is kept.
- **`validate_modules.py`** uses `readelf` to check that every module contributed code, and fails the build otherwise.

**Release name (`WLED_RELEASE_NAME`):**
- It is stored inside the firmware. Without it, the default is `"Custom"` and the build shows a warning (`wled00/wled_metadata.cpp:13-16`).
- OTA refuses a firmware whose release name is different (`:151-166`; a `_V4` suffix is ignored). Ticking "Ignore firmware validation" bypasses this (`wled00/ota_update.cpp:248-252`).
- This folder isn't a git clone, so the repo name may show as "unknown". That hides "Latest release" and "Auto update" on the update page (`wled00/wled_metadata.cpp:5-20`). Which case applies here was not verified.

### 4.3 Web UI build (`tools/cdata.js`)

- `index.htm`, `index.css`, `rangetouch.js` and `index.js` are inlined into one page, minified, gzipped and stored as `PAGE_index` in `html_ui.h`. `pixart`, `pxmagic` and `pixelforge` are built the same way.
- The other pages (settings, edit, update, ...) are minified and gzipped without inlining:
  - into `html_settings.h`, `html_other.h`, `html_edit.h`, `html_cpal.h`;
  - `iro.js` and `omggif.js` into `js_iro.h` and `js_omggif.h`.

  The settings pages load `common.js` and `style.css` from the device at runtime.
- **Rebuild rule** (`tools/cdata.js:226-240`): everything is rebuilt if an output file is missing, or if any file in `wled00/data`, `package.json` or `cdata.js` is newer than the oldest output.
  - **Only file dates are compared.** A file copied in with an old date is skipped.
  - Use `npm run build -- -f` to force a rebuild.
- Page sizes are stored as 16-bit numbers. Keep every page under 64 KB after gzip.
- Run the tests with `npm test` (`tools/cdata-test.js`).

### 4.4 CI (GitHub Actions)

- On every push and pull request: `npm test`, a build of all default targets, and a check of usermod linkage.
- All usermods are compiled only against IDF 4.4 (`[env:usermods]`). Most usermods are **not tested with your IDF 5 target**.

---

## 5. Hardware

### 5.1 Defaults for `esp32dev`

| Item | Default | Defined in |
|---|---|---|
| LED output | WS2812 RGB, 30 LEDs, colour order GRB, **GPIO16** | `wled00/const.h:720-724`, `wled00/cfg.cpp:13-23` |
| Button 0 | **GPIO0**, push button (the board's BOOT button) | `wled00/wled.h:296-301` |
| Relay | Off. When set: active-high, push-pull, 50 ms delay | `wled00/wled.h:302-319`, `wled00/const.h:155` |
| IR receiver | Off | `wled00/wled.h:320-325` |
| I2C / SPI | Not set. The UI suggests SDA 21 / SCL 22, and SPI SCLK 18 / MOSI 23 / MISO 19 | `wled00/wled.h:817-847`, `wled00/const.h:747-784` |
| Serial | RX GPIO3, TX GPIO1, 115200 baud | `wled00/wled.h:329-337` |
| Current limit | 850 mA total, 55 mA per LED | `wled00/const.h:622`, `:632` |
| Audio usermod (disabled) | Mic SD 32, WS 15, SCK 14. The pins are claimed anyway | `usermods/audioreactive/audio_reactive.cpp:802-832` |

### 5.2 GPIO guide for the 38-pin board

In the table, "WLED" is what the firmware enforces and "Chip" is general ESP32 hardware knowledge.

| GPIO | WLED | Chip | Use for |
|---|---|---|---|
| 6-11 | Blocked (`wled00/pin_manager.cpp:290`) | Wired to the flash chip | **Never** |
| 16, 17 | Allowed; blocked only if PSRAM is found (`:292-299`) | Free on WROOM | LED data (16 is the default), relay |
| 4, 13, 18, 19, 23, 25, 26, 27 | Free | No analog while WiFi is on (ADC2). Touch on 4/13/27. 18/19/23 are SPI | **Best general pins**: LED data, relay, buttons |
| 21, 22 | Free | Standard I2C | Keep for I2C displays and sensors |
| 32, 33 | Free | ADC1 (analog works with WiFi), touch | Analog input, touch, LED data. 32 is taken by the audio usermod |
| 34, 35, 36 (VP), 39 (VN) | Input only; refused for outputs (`:301`) | No internal pull-up or pull-down | IR receiver, potentiometer, PIR. Buttons only with an external resistor |
| 14, 15 | Free | 15 is a boot-strapping pin. Both output a signal during boot | Taken by the audio usermod in the stock build |
| 2, 5 | Free (2 is flagged in the UI) | Boot-strapping pins | Only if a short glitch at boot is acceptable |
| 12 | Free (flagged in the UI) | The board won't boot if this pin is HIGH at power-on | **Avoid** |
| 0 | Free; default button | BOOT button, strapping pin | Button 0 only |
| 1, 3 | Free (1 is reserved in debug builds). Serial features switch off if they are used (`wled00/wled.cpp:583-584`) | USB serial port | **Avoid** |

- Analog buttons and potentiometers must use **ADC1 pins (32-39)**. The UI only offers those pins, but the firmware doesn't check.
- For touch buttons, use 4, 13, 27 or 33, plus 32 if you remove the audio usermod.

### 5.3 How pin ownership works (`wled00/pin_manager.*`)

- WLED keeps a 64-bit "in use" map plus an owner tag for each GPIO (`wled00/pin_manager.cpp:16-25`).
- `PinManager::allocatePin(gpio, output, owner)` fails if the pin is already taken or not allowed.
- `isPinOk()` (`:206-310`) is the only place that decides which pins are allowed.
- I2C, SPI and DMX-input pins must use `allocateMultiplePins()` (`:92-140`). The owner of I2C or SPI pins may "allocate" them several times.
- `deallocatePin()` only works for the owner that allocated the pin.
- The settings pages learn which pins are reserved from `wled00/xml.cpp:95-200`.
- `GET /json/pins` shows the live owner of every pin (`wled00/json.cpp:1110-1237`). This is handy for debugging.

### 5.4 Digital LED outputs (WS2812 and similar)

- **Up to 16 outputs:** 8 using the RMT peripheral plus 8 using I2S (`wled00/const.h:103-117`).
- **RMT or I2S per output:** choose it in LED Preferences after ticking "Advanced". When RMT is full, WLED falls back to I2S (`wled00/bus_wrapper.h:1357-1409`).
- **I2S outputs:**
  - One I2S output uses I2S1 on its own.
  - Two or more switch to 8-way parallel I2S, and **all I2S outputs must use the same LED chip type** as the first one.
  - I2S0 stays free for a microphone.
- **Flicker:** on IDF 5, `WLED_USE_SHARED_RMT` has no effect and WLED's high-priority RMT driver is not used (`wled00/bus_wrapper.h:258-259`). If you see flicker while WiFi is busy, try switching that output to I2S.
- **Limits** (`wled00/const.h:566-602`):
  - 2048 LEDs per output and 16,384 in total, within about 85 KB of LED memory.
  - RMT uses about 14 bytes per LED (≈6,000 LEDs). A single I2S output uses about 20 bytes per LED (≈4,300 LEDs).
  - Above the budget, an output becomes a disabled placeholder and the UI shows a memory error.
- **Two-wire strips** (APA102, WS2801, ...): the first one uses hardware SPI and the others are bit-banged. The UI allows two.
- **In your own code, don't use** the new IDF 5 RMT functions (`rgbLedWrite`, `rmtInit`, `rmt_new_tx_channel`) or the legacy ADC driver (`driver/adc.h`). They are likely to clash with WLED's drivers at boot (suspected).
- **Frame path:**
  - `BusDigital::setPixelColor` applies white balance/CCT, auto-white, brightness, the current-limiter sum and the colour order, then hands the data to NeoPixelBus (`wled00/bus_manager.cpp:270-309`).
  - `BusManager::show()` applies the current limit, then sends the data (`:1451-1456`).

### 5.5 Current limiter (ABL)

- **Two modes:**
  - One global limit for the power supply (`hw.led.maxpwr`). 120 mA is subtracted for the ESP32 itself.
  - A limit per output (`ins[].maxpwr`).
- **Current per LED** is set with `ins[].ledma`. The default is 55 mA; 255 selects the WS2815 model.
- **How it works:** every frame it estimates the current from the colour values and dims all pixels if needed (`wled00/bus_manager.cpp:196-247`, `:1487-1564`).
  - It assumes 1 mA idle current per LED.
  - It only covers digital outputs.
- **The default global limit is 850 mA** (`wled00/const.h:622`). Set your real power supply value in LED Preferences.
- **Bug H3:** the estimate overflows above 65.5 A per output, i.e. more than about 1170 LEDs at full white on one pin.

### 5.6 PWM (analog) LED strips

- 16 PWM channels (LEDC). Two channels share one timer (`wled00/bus_manager.cpp:463`).
- PWM frequency choices are 9765, 13020, **19531 (default)**, 39062 and 65103 Hz (`wled00/set.cpp:255-263`). Resolution is 12 bits at the default.
- "Dithering" means 8-bit hardware PWM plus 4-bit dithering. There is also a perceptual brightness curve and a phase shift for 2-wire CCT strips (`wled00/bus_manager.cpp:550-614`).
- Outputs with different PWM clock settings can disturb each other (reviewed bug).

### 5.7 Buttons (`wled00/button.cpp`)

| Type code | Button type |
|---|---|
| 0 | None |
| 2 | Push button (to GND, internal pull-up) |
| 3 | Push button, inverted (pull-down) |
| 4 | Switch |
| 5 | PIR motion sensor |
| 6 | Touch |
| 7 / 8 | Analog / analog inverted (potentiometer) |
| 9 | Touch switch |

- **Timings** are fixed `#define`s (`wled00/button.cpp:7-13`): debounce 50 ms, long press 600 ms, double-press window 350 ms, repeat 400 ms.
- **Default actions:**

  | Button | Short press | Long press | Double press |
  |---|---|---|---|
  | 0 | Lights on/off | Random colour | — |
  | 1 | Next effect | Brightness ramp | Next palette |

  Any button can run presets for short, long or double press instead. These are set in Settings → Time & Macros.
- **Holding button 0** for 5-10 s opens the WiFi access point. Holding it **more than 10 s formats the filesystem**, i.e. a factory reset (`wled00/button.cpp:331-337`).
- **Switch or PIR input without presets** (`wled00/button.cpp:141-153`):
  - The lights turn **on** when the input changes to "not pressed".
  - They turn **off** when it changes to "pressed".
  - What counts as "pressed" depends on the type and the wiring. Test it, or assign presets.
- **Analog buttons:** the "double press" preset field chooses what the potentiometer controls (`wled00/button.cpp:213-252`):

  | Value | Controls |
  |---|---|
  | 250 or more | Brightness |
  | 249 | Speed |
  | 248 | Intensity |
  | 247 | Palette |
  | 200 | Hue |
  | Other | That segment's opacity |
- **Touch buttons** count as pressed when `touchRead()` is at or below the threshold. The default threshold is 32 (`wled00/const.h:654`), and each button can have its own (`hw.btn.tt`). The Pin Info page shows raw touch readings for calibration (`wled00/json.cpp:1204-1214`).

### 5.8 Relay

- **When the lights turn on:** the relay switches on, then WLED **waits** `relayDelay` ms before sending LED data (`wled00/button.cpp:377-401`). The UI allows up to 65 s, and the wait blocks the main loop.
- **When the lights turn off:** the relay switches off 600 ms after the strip goes dark.
- **Options:** invert (active-low), open-drain.
- **Known issue:** the relay pin briefly drives LOW at boot, so active-low relay modules may click on (reviewed bug).

### 5.9 IR remote (`wled00/ir.cpp`)

- **Types 1-7:** built-in codes for common NEC remotes: 24-key, 24-key CT, 40-key, 44-key, 21-key, 6-key and 9-key (`:663-699`; codes in `wled00/ir_codes.h`).
- **Type 8:** your own codes in `/ir.json` (`:556-633`).
  - A value can be an HTTP-API string, a JSON command, or `!incBri` / `!decBri` / `!presetFallback`.
  - `~` or `"rpt":true` makes the command repeat while the key is held.
- The receiver is read every 120 ms (`:718-733`). The compiled-in decoders are NEC, Sony, Samsung, LG and hash.

### 5.10 DMX, Ethernet, I2C, SPI

- **DMX output:** needs `-D WLED_ENABLE_DMX`, which `esp32dev` doesn't set. It uses UART2, with TX fixed to **GPIO2**.
- **DMX input:** enabled in IDF 5 builds. It uses UART2, its pins are set on the Sync page, and it runs as a task on core 0.
- **Ethernet:** only in the `esp32_eth` target. It uses GPIO 19, 21, 22, 25, 26, 27 and more.
- **I2C and SPI pins** for usermods are set on Settings → Usermods (`hw.if.i2c-pin`, `hw.if.spi-pin`).

---

## 6. Effects engine

### 6.1 Key ideas

- **Effect:** a C++ function `void mode_x()`.
  - There are 220 slots (`MODE_COUNT`, `wled00/FX.h:377`). Effects are registered with `addEffect(id, function, metadata)` (`wled00/FX.cpp:10953-11226`).
  - Inside an effect, `SEGMENT`, `SEGENV`, `SEGLEN`, `SEG_W`, `SEG_H`, `SEGCOLOR` and `SEGPALETTE` give access to the current segment (`wled00/FX.h:108-115`).
- **Segment:** a range of LEDs with its own effect, colours, palette and settings (`wled00/FX.h:421-809`). Its fields:
  - Geometry: `start`/`stop` (stop is exclusive), `startY`/`stopY` for 2D, `grouping`/`spacing`, and `offset` (a rotation, 1D only).
  - Orientation: `reverse` and `mirror`; in 2D also `reverse_y`, `mirror_y` and `transpose`.
  - Showing 1D effects on 2D: `map1D2D` is 0 Pixels, 1 Bar, 2 Arc, 3 Corner or 4 Pinwheel.
  - Look: `opacity`, `cct`, `blendMode` (17 blend modes).
  - Effect settings: `mode`, `palette`, `speed`, `intensity`, `custom1-3`, `check1-3`.
  - Effect memory: `step`, `call`, `aux0`, `aux1`, `data`.
- **Limits on your board:** at most **32 segments** (64 with PSRAM), and **64 KB** of effect memory in total (`wled00/FX.h:93-98`).

### 6.2 One frame (`WS2812FX::service`, `wled00/FX_fcn.cpp:1339`)

1. It runs when a frame is due: every 1000/FPS ms. The default of 42 FPS is about 23 ms per frame, and the minimum is 2 ms.
2. For each segment: handle the transition, reset if needed, prepare, then run the effect. During a transition, the old effect runs too.
3. `show()` (`:1759`):
   1. Clear the frame buffer.
   2. `blendSegment()` puts each segment in place, applying grouping, mirror, reverse, offset, opacity and the blend mode.
   3. Draw overlays (the usermods' `handleOverlayDraw`).
   4. For each pixel: gamma correction, ledmap, LED output, current limiter.
   5. Send the data.

### 6.3 Transitions

- Changing an effect, colour or palette copies the whole segment, including its pixels and effect data (`wled00/FX_fcn.cpp:293`).
- Style 0 is a fade. Styles 1-23 are wipes and shapes that reveal the new look (`wled00/FX.h:380-406`).
- The style is global (JSON `bs`). The duration is set with `transition` / `tt`.

### 6.4 LED mapping and 2D

- `/ledmap.json` (and `ledmap1`...`ledmapN`) reorders the LEDs (`wled00/FX_fcn.cpp:2143`).
- 2D panels support serpentine wiring, vertical panels, any start corner and an optional `/2d-gaps.json`, up to 255×255 (`wled00/FX_2Dfcn.cpp:21-145`). Configure them in Settings → 2D Configuration.

### 6.5 Palettes and colour

- **72 built-in palettes** (`wled00/const.h:9-12`):

  | IDs | Palettes |
  |---|---|
  | 0 | Effect default |
  | 1 | Random |
  | 2-5 | From the segment colours |
  | 6-12 | FastLED palettes |
  | 13-71 | Gradients |
- **Custom palettes** are `/paletteN.json` files, with IDs counting down from 200. Usermod palettes count down from 255 (`wled00/colors.cpp:266`).
- **Colour handling:** gamma 2.2 is applied to colours by default (`wled00/FX_fcn.cpp:1805`). There are auto-white modes 0-4 (`wled00/const.h:290-296`), and CCT/white balance is set per output.
- **To add a built-in gradient palette:**
  1. Update `GRADIENT_PALETTE_COUNT` (`wled00/const.h:10`).
  2. Update the names list `JSON_palette_names` (`wled00/FX_fcn.cpp:2294`).
  3. Bump `VERSION` (`wled00/wled.h:10`) so browsers refresh their cached palette previews.

### 6.6 Effect memory and the particle system

- `SEGENV.allocateData(bytes)` zero-fills the memory and counts it against the 64 KB total (`wled00/FX_fcn.cpp:147-188`). On failure it returns `false` and sets a memory error; the effect should then fall back to Solid.
- Particle-system effects need about 25 KB each (2D: 2048 particles; 1D: 2600) (`wled00/FXparticleSystem.h:51-54`, `:266-268`).
  - They halve their particle count until they fit.
  - Transitions double the memory use for a moment.
- Disable them with `WLED_DISABLE_PARTICLESYSTEM1D` / `WLED_DISABLE_PARTICLESYSTEM2D`. `WLED_DISABLE_2D` also disables the 2D particles.

### 6.7 Speed

- **Sending WS2812 data** takes about 30 µs per LED per pin. Split long strips across several pins.

  | LEDs on one pin | Send time | Best frame rate |
  |---|---|---|
  | 300 | ≈ 9 ms | — |
  | 600 | ≈ 18 ms | — |
  | 1000 | ≈ 30 ms | about 33 FPS |

- **CPU cost** comes from:
  - 3-4 passes over all pixels per frame.
  - The current limiter repainting all pixels whenever it limits.
  - Transitions running two effects at once.
  - 2D particle effects with collisions, and 2D blur.
- Build with `WLED_DEBUG` to see "slow effect/strip" messages (`wled00/FX_fcn.cpp:1393`, `:1402`).

### 6.8 Adding your own effect (recommended: `usermods/user_fx`)

1. Add `user_fx` to `custom_usermods`.
2. Write `static void mode_myfx()` plus a metadata string in `PROGMEM`. Register it in `setup()` with `strip.addEffect(255, &mode_myfx, _data_FX_MODE_MYFX);` (`usermods/user_fx/user_fx.cpp:1474`). 255 means "next free slot".
3. The metadata string has this format, at most 256 characters:

   `"Name@sx,ix,c1,c2,c3,o1,o2,o3;col1,col2,col3;pal;flags;defaults"`

   - The first part holds labels for the speed and intensity sliders, the 3 custom sliders and the 3 checkboxes. `!` means the default label; an empty entry hides the control.
   - `col1..3` label the colour slots, and `pal` controls the palette selector.
   - Flags: `0` (0D), `1` (1D), `2` (2D), `v` (volume-reactive), `f` (frequency-reactive).
   - Defaults, for example `sx=128,ix=64,pal=11`. The keys `c1..c3`, `o1..o3`, `m12`, `si`, `rev`, `mi`, `rY` and `mY` also work (`wled00/util.cpp:481-499`).
   - **Always give a metadata string.** An effect without `@` causes a JavaScript error in the UI (`wled00/data/index.js:1645`).
4. Rules:
   - Check `allocateData()` and fall back to Solid when it fails. Initialise when `SEGENV.call == 0`.
   - Keep state in `aux0`, `aux1`, `step` and `data`. **Never store pointers in `data`**, because transitions copy it byte by byte.
   - Guard against `SEGLEN <= 1`, 2D versus 1D, and division by slider values (sliders can be 0).
   - Time things with `strip.now - last >= interval`.
   - Don't use `delay()`, file access, `malloc` per frame or variable-length arrays.
   - Use `sin8_t`, `cos8_t`, `sin16_t`, `perlin8`, `perlin16` and `sin_approx`, not `sin8`, `inoise8` or `sinf`.
   - Mark AI-generated code with `// AI: below section was generated by an AI` ... `// AI: end` (AGENTS.md).
5. **Effect IDs depend on build flags.** The first free slot is 142 in the default build, then 169-171, then 220 and up. Presets store IDs, so a preset can point at a different effect after you change flags.

---

## 7. Network, APIs and security

### 7.1 WiFi and access point

- **Saved networks:** up to 3 (`WLED_MAX_WIFI_COUNT`, `wled00/const.h:54`). WLED scans and picks the strongest one (`findWiFi`, `wled00/network.cpp:349`).
- **Connection state machine:** `handleConnection` (`wled00/wled.cpp:962`), `initConnection` (`:755`), `initAP` (`:705`).
- **Access point:** SSID **WLED-AP**, password **wled1234** (`wled00/const.h:47-48`), at address 4.3.2.1 with a captive portal.
- **AP behaviour** (`ap.behav`, `wled00/const.h:265-269`). The AP opens about 12 s after a failed connection.

  | Value | Access point |
  |---|---|
  | 0 (default) | Opens if there's no connection after boot |
  | 1 | Opens whenever WiFi is disconnected |
  | 2 | Always on |
  | 3 | Never; only via the button |
  | 4 | Temporary; closes after 5 min without clients |
- **mDNS name:** `wled-<last 6 hex digits of the MAC>` by default (`wled00/wled.cpp:595`).
- **ESP32 specifics:**
  - WiFi sleep is off by default (`wled00/wled.h:351`).
  - TX power is 19.5 dBm (`:364`), or lower with `LOLIN_WIFI_FIX`.
  - The WiFi radio is reset before each reconnect (`wled00/wled.cpp:784`).
- **Known issue** (reviewed bug): when a saved network is out of range, the AP is only up about 6 s out of every 18 s. Phones connected to it are dropped every 5 minutes.

### 7.2 Web routes (`initServer`, `wled00/wled_server.cpp:349`)

| Route | Purpose | Protection |
|---|---|---|
| `GET /` | Main UI (or captive portal / welcome page) | none |
| `GET /liveview`, `/liveview2D` | Live LED preview | none |
| `GET /settings/...` | Settings pages | PIN for most pages |
| `POST /settings/...` | Save settings (`handleSettingsSet`, `wled00/set.cpp`) | same subnet + PIN |
| `GET /json`, `/json/state`, `/json/info`, `/json/si`, `/json/eff`, `/json/pal`, `/json/fxdata`, `/json/nodes`, `/json/cfg`, `/json/pins`, ... | Read state, info and config (no passwords) | none |
| `POST /json`, `/json/state`, `/json/si` | Change state (`deserializeState`, `wled00/json.cpp`) | none |
| `POST /json/cfg` | Change settings | PIN |
| `GET /version`, `/uptime`, `/freeheap` | Info | none |
| `POST /upload` | Upload a file | PIN |
| `/edit` | File editor (list/read/download/delete; `wsec.json` is blocked) | PIN |
| `GET/POST /update` | Firmware update (OTA) | OTA lock + PIN + same subnet |
| `POST /updatebootloader` | Bootloader update (ESP32) | same as OTA |
| `/pixart.htm`, `/pxmagic.htm`, `/pixelforge.htm`, `/cpal.htm` | Tools (pixel art, palette editor) | none |
| WebSocket | Live state push and commands | none |
| Anything else | Captive portal, the `/win` HTTP API (`handleSet`, `wled00/set.cpp:913`), the Alexa API, or 404 | none |

- **Cross-origin requests:** all responses allow them (`Access-Control-Allow-Origin: *`, `wled00/wled_server.cpp:352-354`).
- **Settings PIN:** 4 digits (`checkSettingsPIN`, `wled00/util.cpp:502`). After a wrong PIN you must wait 3 s. The settings lock again after 15 minutes.

### 7.3 APIs

- **JSON API:** the main API, used by the UI and apps, for example `{"on":true,"bri":128,"seg":[{"fx":9}]}`. It uses the shared 32 KB JSON buffer; if the buffer is busy, the reply is delayed. A POST body can be up to 16 KB.
- **HTTP `/win` API:** the old style, for example `/win&A=128&FX=9` (`handleSet`). MQTT, UDP, ESP-NOW and IR JSON commands also use it.
- **WebSocket:** text messages are JSON commands, and binary messages are E1.31/Art-Net/DDP data. It also pushes live LED colours for the preview.

### 7.4 Sync and live-data protocols (`wled00/udp.cpp`, `wled00/e131.cpp`)

| Protocol | Port | Notes |
|---|---|---|
| WLED sync (notifier) | UDP 21324 | Broadcast between WLED devices |
| WLED sync 2 / node discovery | UDP 65506 | Shows other WLED devices on the Info page |
| Hyperion / realtime RGB | UDP 19446 | |
| E1.31 (sACN) | UDP 5568 | Up to 12 universes (`wled00/const.h:617`) |
| Art-Net, DDP, WARLS, DRGB, DNRGB, TPM2 | | Realtime modes; 2.5 s timeout by default |
| Audio sync (audio usermod) | multicast 239.0.0.1:11988 | |

By design, none of these protocols are authenticated.

### 7.5 Other services

- **MQTT** (`wled00/mqtt.cpp`): incoming topics `<topic>/col` (colour) and `<topic>/api` (JSON or `/win` commands). No TLS.
- **Alexa** (`wled00/alexa.cpp`): emulates a Hue bridge (SSDP on UDP 1900).
- **Hue sync** (`wled00/hue.cpp`): polls a real Hue bridge.
- **NTP time** (`wled00/ntp.cpp`), with time zones.
- **Improv** (`wled00/improv.cpp`): set the WiFi over the USB serial port.
- **ESP-NOW remote** (`wled00/remote.cpp`, `lib/wled_espnow`): WiZmote remotes. Only paired remotes are accepted.

### 7.6 Firmware updates (OTA, `wled00/ota_update.cpp`)

- The web update checks the firmware's chip type and release name while uploading. The ESP32 then checks the image integrity (SHA).
- `?skipValidation=1` ("Ignore firmware validation") only skips WLED's release-name check, not the integrity check.
- `/update?revert` rolls back to the previous firmware (ESP32). Every successful boot marks the running firmware as good.
- A bootloader update is buffered into 64 KB and checked before it is written.
- ArduinoOTA (updating from the IDE) only works with `-D WLED_ENABLE_AOTA`. Defining `WLED_OTA_PASS` also turns the OTA lock on by default.
- The OTA code looked solid in the review.

### 7.7 Security model

WLED assumes a **trusted home network** behind a router or firewall (`docs/hardening.instructions.md`):
- no HTTPS,
- no login for controlling the lights,
- no authentication for the sync protocols.

Settings, OTA and the file editor can be protected with a PIN and a same-subnet check. The findings (E1.31 underflow, unescaped names in the UI, `/upload` overwriting `wsec.json`, ...) are in section 12.

---

## 8. Web UI

### 8.1 Main page (`wled00/data/index.htm`, `index.js`, `index.css`)

- **Start-up** (`index.js:229-330`) loads, **one request at a time** to avoid overloading the ESP32:
  1. Palettes.
  2. Effect metadata and effect names.
  3. State and info.
  4. Palette previews (cached in browser storage).
  5. Presets (cached).
  6. `skin.css`.
  7. The WebSocket connection.
- **Controls** send small JSON commands (`index.js:2451`, `:2517`). For example, selecting an effect sends `{"seg":{"fx":id,"fxdef":true}}` and a preset sends `{"pd":id,...}`.
- **`requestJson()`** (`:1756-1819`) sends over the WebSocket if it is open, otherwise it uses an HTTP POST to `/json/si`.
- **Replies** update the page through `readState()` (`:1466`), then the segments list, then `setEffectParameters()` (`:1632-1752`). That last step reads the effect metadata to relabel or hide sliders, checkboxes, colour slots and the palette list.
- An opt-in usage report prompt only sends data after you agree (`:684`).

### 8.2 Settings pages (`wled00/data/settings_*.htm`)

- **Loading:** each page loads `common.js` and `style.css`, then `/settings/s.js?p=N`. The firmware answers with JavaScript that fills in the current values (`getSettingsJS`, `wled00/xml.cpp:203`).
- **Saving:** a normal form POST to `/settings/<page>`. The firmware checks the subnet and PIN, runs `handleSettingsSet()` (`wled00/set.cpp`), and shows a confirmation page.
- **Exceptions:**
  - The Usermods page builds its form from the `um` section of `/json/cfg`.
  - The User Interface page stores its settings only in your browser.

### 8.3 Customising the UI

- **Editing:** change the files in `wled00/data/` (use tabs for indentation), then run `npm run build`, or just build with PlatformIO. Never edit `html_*.h` / `js_*.h`.
- **Helpers:** `common.js` has helpers for the settings pages: `gId`, `cE`, `getURL`, `esc`, `showToast`, `uploadFile`, pin dropdown helpers, and more. `index.js` does **not** load `common.js`; it has its own copies.
- **Without reflashing:**
  - Upload a `/skin.css`; it is loaded automatically.
  - Files on the filesystem also override the built-in main page, `common.js`, `iro.js`, `style.css`, the palette editor, PixelForge and the file editor (`wled00/wled_server.cpp:141`, `wled00/file.cpp:478-497`).
  - Settings pages can't be overridden this way.

---

## 9. Usermods (plugins) and audio

### 9.1 How usermods are built in

- The target's `custom_usermods` setting lists them. For `esp32dev` that is `audioreactive`.
- `pio-scripts/load_usermods.py` finds each folder in `usermods/` and adds it as a library. Its `library.json` must contain `"build": {"libArchive": false}`.
- In the code:
  - `REGISTER_USERMOD(x)` (`wled00/fcn_declare.h:430`) puts the usermod into a special linker section (`wled00/dynarray.h`).
  - `pio-scripts/dynarray.py` keeps that section in the firmware.
  - `pio-scripts/validate_modules.py` checks that each module was linked.
- The order in which several usermods are called is not defined.

### 9.2 Usermod callbacks (`wled00/fcn_declare.h:361-400`, called from `wled00/um_manager.cpp`)

| When | Callback | Runs in |
|---|---|---|
| Boot | `readFromConfig`, then (LEDs start), then `setup` | main loop |
| Every loop | `loop` | main loop |
| Before each LED update | `handleOverlayDraw` | main loop |
| Button press | `handleButton` (return true and WLED ignores the press) | main loop |
| WiFi (re)connected | `connected` | main loop |
| UDP packet | `onUdpPacket` | main loop |
| JSON API | `readFromJsonState`, `addToJsonState`, `addToJsonInfo` | **web task** |
| Settings saved | `readFromConfig` | **web task** |
| Settings pages | `addToConfig`, `appendConfigData` | **web task** |
| OTA starts | `onUpdateBegin` | **web task** |
| MQTT | `onMqttConnect`, `onMqttMessage` | **web task** |
| State change | `onStateChange` | either |
| ESP-NOW | `onEspNowMessage` | receive callback |

Callbacks in the **web task** run at the same time as `loop()`. Only store values and set a flag there, and do the real work (pin changes etc.) in `loop()`.

### 9.3 When a usermod needs an ID

A usermod needs an ID only when:
- another usermod or effect must find it (`UsermodManager::lookup` / `getUMData`),
- it owns pins through its own dedicated `PinOwner`, or
- it must be identifiable in `/json/info`.

In that case:
- Add a `USERMOD_ID_...` to `wled00/const.h`, keeping IDs below 128.
- Add a matching `PinOwner` to `wled00/pin_manager.h`.

Otherwise, use `PinOwner::UM_Unspecified`.

### 9.4 Audio usermod (`usermods/audioreactive`) on your ESP32

- **Microphones that work with `esp32dev` (IDF 5):**

  | Type | Microphone |
  |---|---|
  | 1 | Digital I2S mics such as INMP441 / ICS-43434 |
  | 2 | ES7243 codec (needs I2C and MCLK on GPIO 0, 1 or 3) |
  | 3 | SPH0645 |
  | 4 | I2S with master clock |
  | 5 | PDM mics (set SCK to -1) |
  | 6 | ES8388 codec (needs I2C and MCLK on GPIO 0, 1 or 3) |
  | 254 | Network receive only |
- **Analog microphones** (MAX4466, MAX9814) **only work with `esp32dev_V4`**, on an ADC1 pin (32-39). On IDF 5, a saved analog setting silently turns into "Generic I2S".
- **Defaults** (`usermods/audioreactive/audio_reactive.cpp:802-832`): type 1, SD = 32, WS = 15, SCK = 14, no MCLK. The usermod is disabled unless you build with `-D UM_AUDIOREACTIVE_ENABLE` or enable it in Settings → Usermods.
- **Even when disabled, it claims GPIO 14, 15 and 32 and installs the I2S driver at boot** (`setup()` at `audio_reactive.cpp:1386`, `audio_source.h:199-208`). LED outputs start first, so if you put LEDs on those pins the audio usermod quietly fails instead.
  - This applies to the digital (I2S) microphone types.
  - With an analog mic (`SR_DMTYPE=0`, V4 builds only), it claims only `AUDIOPIN` (`audio_reactive.cpp:1481-1488`, `audio_source.h:612`). Your Home Gadgets build uses GPIO36, so 14, 15 and 32 are free there.
- **Sound analysis:** a 512-sample FFT at 22,050 Hz produces 16 frequency bands, in a task on core 0.
- **Outdated warning:** the "crashes on classic esp32" comment at `platformio.ini:108` is probably out of date. The code now contains a workaround for the old ADC driver conflict (`audio_reactive.cpp:10-48`). This was not tested on hardware.
- **Recommendation:**
  - INMP441 on `esp32dev`: keep the usermod.
  - Analog mic: use `esp32dev_V4`.
  - No mic: set `custom_usermods =` (empty) to free the pins, RAM and flash. The audio effects still run on simulated sound.
- **Useful flags:** `UM_AUDIOREACTIVE_ENABLE`, `SR_DMTYPE`, `I2S_SDPIN`, `I2S_WSPIN`, `I2S_CKPIN`, `MCLK_PIN`, `AUDIOPIN`, `SR_SQUELCH`, `SR_GAIN`, `SR_AGC`, `I2S_USE_RIGHT_CHANNEL`, `I2S_USE_16BIT_SAMPLES`, `ES7243_ADDR`, `ES8388_ADDR`, `FFTTASK_PRIORITY`, `SR_DEBUG`.

### 9.5 Usermod survey (72 folders)

"(M)" means the usermod needs MQTT, which is enabled in `esp32dev`. Only a few usermods were read in depth; the rest were checked with searches.

| Usermods | What they do | Notes for your ESP32 |
|---|---|---|
| `audioreactive`, `user_fx`, `EXAMPLE` | Audio input; custom effects; template | Usable (see above) |
| `Temperature`, `sht`, `PIR_sensor_switch`, `multi_relay`, `Animated_Staircase`, `usermod_v2_auto_save`, `usermod_v2_four_line_display_ALT`, `usermod_v2_rotary_encoder_ui_ALT`, `rgb-rotary-encoder`, `Battery`, `mpu6050_imu`, `boblight`, `udp_name_sync`, `usermod_v2_brightness_follow_sun`, `usermod_v2_RF433`, `Internal_Temperature_v2` | DS18B20 temperature; SHT sensor; PIR; relays; stair lighting; auto-save; OLED display; rotary encoder UI; encoder board; battery; motion sensor; Boblight; name sync; sun-based brightness; 433 MHz remote; chip temperature | Look fine and use PinManager |
| `ADS1115_v2`, `AHT10_v2`, `BH1750_v2` (M), `BME280_v2` (M), `INA226_v2`, `MAX17048_v2`, `RTC`, `VL53L0X_gestures`, `Si7021_MQTT_HA` (M), `sensors_to_mqtt` (M), `quinled-an-penta` | I2C sensors and boards | Look fine; use the global I2C pins |
| `BME68X_v2` | BME68x air sensor | CI skips it as incompatible |
| `Analog_Clock`, `Cronixie`, `seven_segment_display` (M), `seven_segment_display_reloaded` (M), `usermod_v2_word_clock`, `word-clock-matrix`, `usermod_v2_ping_pong_clock`, `TetrisAI_v2`, `PS_Comet`, `stairway_wipe_basic` | Clocks, displays, effects | Look fine |
| `usermod_v2_animartrix` | Large 2D effect library | Big; watch the 1.5 MB firmware limit |
| `PWM_fan`, `pwm_outputs`, `usermod_v2_HttpPullLightControl` | Fan control; extra PWM outputs; HTTP polling | OK. `PWM_fan` needs `Temperature` or `sht` |
| `LDR_Dusk_Dawn_v2`, `pov_display`, `deep_sleep` | ESP32 features | `deep_sleep` waits 10 s at first boot; `pov_display` may allocate 64 KB |
| `sd_card` | SD card | Its default SPI pins 14/15 clash with the audio usermod |
| `DHT` (M) | DHT11/22 | Pin fixed to GPIO21 (also I2C SDA); no PinManager |
| `buzzer` | Beeper | Pin fixed to GPIO32 (the audio usermod's pin); no PinManager |
| `SN_Photoresistor`, `usermod_rotary_brightness_color`, `LD2410_v2` (M) | Light sensor; encoder; radar | Pins not registered with PinManager |
| `smartnest` (M) | Smartnest cloud | Needs `-D USERMOD_SMARTNEST`; blocks the web task for 0.5 s on connect |
| `wireguard` | VPN | Not verified with IDF 5 |
| `usermod_v2_klipper_percentage` | 3D printer progress | **Buffer overflow bug**; makes a blocking 10 s HTTP call |
| `Fix_unreachable_netservices_v2`, `MY9291` | ESP8266 only | Not for your board |
| `Artemis_reciever`, `Enclosure_with_OLED_temp_ESP07`, `RelayBlinds`, `TTGO-T-Display`, `Wemos_D1_mini+Wemos32_mini_shield`, `battery_keypad_controller`, `photoresistor_sensor_mqtt_v1`, `project_cars_shiftlight`, `rotary_encoder_change_effect` | Old-style usermods | No `library.json`, so they can't be enabled with `custom_usermods` |
| `EleksTube_IPS`, `ST7789_display` | TFT displays | Disabled (`library.json.disabled`) |
| `pixels_dice_tray` | ESP32-S3 + Bluetooth dice | Not for your board |
| `JSON_IR_remote` | IR code files | Data only; use it with IR type 8 |

No usermod uses the removed functions `sin8`, `cos8`, `inoise8` or `inoise16`. CI compiles most usermods only against IDF 4.4, not your IDF 5 target.

### 9.6 Writing your own usermod

1. Copy `usermods/EXAMPLE` to `usermods/my_mod/` (never edit EXAMPLE itself). Its `library.json` should be `{"name":"my_mod","build":{"libArchive":false}}`.
2. Follow the class pattern under "Usermod Pattern" in AGENTS.md. End the file with `static MyMod my_mod; REGISTER_USERMOD(my_mod);`.
3. For pins:
   - Check `PinManager::isPinOk()`.
   - Then call `PinManager::allocatePin(pin, output, PinOwner::UM_Unspecified)`.
   - Release pins with `deallocatePin()` when they change.
4. Name config keys that hold pins `pin` or `...pin`, so the settings page shows conflicts (`wled00/xml.cpp:61-90`).
5. Give every setting a default in the class itself. `readFromConfig` isn't called on a fresh device, because there is no `um` section yet.
6. In `readFromConfig` (which runs in the web task at runtime), only store the values and set a flag. Re-allocate pins in `loop()`.
7. For I2C devices, use `if (i2c_scl < 0 || i2c_sda < 0) { enabled = false; return; }`. Don't call `Wire.begin()` yourself.
8. Use `DEBUG_PRINTF()` / `DEBUG_PRINTLN()` instead of `Serial.print`.
9. Add `my_mod` to `custom_usermods`. Some readmes mention old-style flags (for example `USERMOD_SMARTNEST`); add those to `build_flags` by hand.

---

## 10. Where to change what

### 10.1 Compile-time flags (`build_flags` in `platformio_override.ini`)

| Flag | What it does | Default | Where |
|---|---|---|---|
| `DATA_PINS`, `PIXEL_COUNTS`, `LED_TYPES`, `DEFAULT_LED_COLOR_ORDER` | First-boot LED outputs | 16, 30, WS2812 RGB, GRB | `wled00/cfg.cpp:9-23` |
| `BTNPIN`, `BTNTYPE` | Button pins and types | 0, push | `wled00/wled.h:296-301` |
| `RLYPIN`, `RLYMDE`, `RLYODRAIN`, `RELAY_DELAY` | Relay pin, polarity (1 = active-high), open-drain, delay | off, 50 ms | `wled00/wled.h:302-319`, `wled00/const.h:155` |
| `IRPIN`, `IRTYPE` | IR receiver | off | `wled00/wled.h:320-325` |
| `I2CSDAPIN`, `I2CSCLPIN`, `SPIMOSIPIN`, `SPISCLKPIN`, `SPIMISOPIN` | Global I2C and SPI pins | not set | `wled00/wled.h:817-847` |
| `ABL_MILLIAMPS_DEFAULT`, `LED_MILLIAMPS_DEFAULT` | Current limit (0 = off, otherwise at least 250); mA per LED | 850, 55 | `wled00/const.h:622`, `:632` |
| `MAX_LEDS`, `MAX_LED_MEMORY`, `MAX_LEDS_PER_BUS` | LED limits | 16384, 85 KB, 2048 | `wled00/const.h:566-602` |
| `WLED_MAX_WIFI_COUNT`, `WLED_MAX_BUTTONS`, `WLED_MAX_LEDMAPS`, `WLED_MAX_SEGNAME_LEN` | Other limits | 3, ... | `wled00/const.h` |
| `CLIENT_SSID`, `CLIENT_PASS` | Built-in WiFi network (**survives a factory reset**) | none | `wled00/wled.h:210-216` (`my_config.h` works too) |
| `WLED_AP_SSID`, `WLED_AP_PASS`, `WLED_AP_SSID_UNIQUE` | Access point | WLED-AP / wled1234 | `wled00/const.h:46-48` |
| `MDNS_NAME`, `SERVERNAME` | Network name, name shown in the UI | wled-xxxxxx | `wled00/wled.h` |
| `WLED_PIN`, `WLED_OTA_PASS` | Settings PIN; OTA password (also enables the OTA lock) | none, wledota | `wled00/wled.h:559` |
| `WLED_RELEASE_NAME` | Firmware name used by the OTA check | `ESP32` | `platformio.ini:771` |
| `WLED_DISABLE_ALEXA`, `_HUESYNC`, `_INFRARED`, `_OTA`, `_2D`, `_PARTICLESYSTEM1D`, `_PARTICLESYSTEM2D`, `_PIXELFORGE` | Remove features | enabled | various |
| `WLED_DISABLE_MQTT`, `_ADALIGHT`, `_LOXONE`, `_WEBSOCKETS` | Remove features (**build_flags only**, not `my_config.h`) | enabled | `wled00/wled.h:35-51` |
| `WLED_DISABLE_ESPNOW` | Remove ESP-NOW (also needs `wled-espnow` in `lib_ignore`) | enabled | |
| `WLED_ENABLE_DMX`, `WLED_ENABLE_AOTA`, `WLED_ENABLE_USERMOD_PAGE`, `WLED_ENABLE_JSONLIVE` | Add features | off | |
| `WLED_DEBUG` | Debug output on serial | off | |
| `WLED_BOOTUPDELAY` | Wait at boot so the power can settle | off | `wled00/wled.cpp` |
| `STATUSLED` | Status LED pin | off | |
| `WLED_DISABLE_BROWNOUT_DET` | Turn off the brownout reset (bug: never turned back on) | off | `wled00/wled.cpp:390`, `:656` |
| `WLED_WATCHDOG_TIMEOUT` | Task watchdog (probably doesn't compile on IDF 5) | 0 (off) | `wled00/wled.cpp:364` |
| `WLED_USE_ETHERNET`, `WLED_ETH_DEFAULT` | Ethernet | off | |

**These can't be changed with `-D`** because they have no `#ifndef` guard. Edit the file instead:

| Setting | Value | File |
|---|---|---|
| `WLED_FPS`, `MIN_FRAME_DELAY` | 42 FPS, 2 ms | `wled00/FX.h:61-68` |
| `MAX_NUM_SEGMENTS`, `MAX_SEGMENT_DATA` | 32, 64 KB | `wled00/FX.h:93-98` |
| Button timings | 50 / 600 / 350 / 400 ms | `wled00/button.cpp:7-13` |
| `TOUCH_THRESHOLD` | 32 | `wled00/const.h:654` |
| `JSON_BUFFER_SIZE`, `MIN_HEAP_SIZE` | 32 KB, 15 KB | `wled00/const.h` |

The FPS can also be changed at runtime in LED Preferences (`hw.led.fps`; 0 = unlimited, maximum 250).

### 10.2 Runtime settings (web UI → `cfg.json`)

| Settings page | Main keys in `cfg.json` |
|---|---|
| WiFi Setup | `nw.ins` (networks), `ap.behav`, `wifi.sleep`, `wifi.txpwr` |
| LED Preferences | **Outputs:** `hw.led.ins[]` (`pin`, `type`, `len`, `start`, `order`, `skip`, `rev`, `ref`, `freq`, `drv`, `ledma`, `maxpwr`)<br>**LED options:** `hw.led.maxpwr`, `hw.led.fps`, `hw.led.rgbwm`, `hw.led.cct`<br>**Buttons:** `hw.btn.ins[]` (`macros`, `pull`, `tt`)<br>**IR:** `hw.ir` (`pin`, `type`, `sel`)<br>**Relay:** `hw.relay` (`pin`, `rev`, `odrain`, `del`)<br>**Defaults and light:** `def.on`, `def.bri`, `def.ps`, `light.gc`, `light.tr`, `light.nl`, `light.aseg` |
| 2D Configuration | Matrix panels |
| Sync Interfaces | UDP sync, E1.31/Art-Net/DDP, DMX input, MQTT, Alexa, Hue |
| Time & Macros | NTP, time zone, timers, button presets |
| Usermods | `um` (all usermod settings), `hw.if.i2c-pin`, `hw.if.spi-pin` |
| Security & Updates | PIN, OTA lock, WiFi settings lock, same-subnet OTA, factory reset, backup/restore (secrets are in `wsec.json`) |
| User Interface | Stored in your browser only |

Useful state keys for the JSON API:
- **General:** `on`, `bri`, `ps` (preset), `psave`, `pdel`, `playlist`, `np` (next preset), `rb` (reboot), `bs` (transition style), `tt` (transition time), `tb` (timebase), `ledmap`.
- **Per segment:** `fx`, `pal`, `sx`, `ix`, `c1`-`c3`, `o1`-`o3`, `grp`, `spc`, `of`, `m12`, `bm`, `tp`, `rY`, `mY`.

### 10.3 Functions to edit

| Behaviour | Function | File |
|---|---|---|
| Allowed GPIOs | `PinManager::isPinOk` | `wled00/pin_manager.cpp:206-310` |
| RMT/I2S choice per output | `PolyBus::getI`, `PolyBus::create` | `wled00/bus_wrapper.h:1357-1409` |
| Creating LED outputs | `WS2812FX::finalizeInit` | `wled00/FX_fcn.cpp:1216-1328` |
| Current limiter | `initializeABL`, `applyABL`, `applyBriLimit`, `estimateCurrent` | `wled00/bus_manager.cpp:196-247`, `:1487-1564` |
| PWM outputs | `BusPwm` constructor and `show()` | `wled00/bus_manager.cpp` |
| Buttons | `handleButton`, `handleSwitch`, `handleAnalog`, the short/long/double press actions | `wled00/button.cpp` |
| Relay | `handleOnOff` | `wled00/button.cpp:377-401` |
| IR | `decodeIR*`, `decodeIRJson` | `wled00/ir.cpp` |
| Boot behaviour | `beginStrip` | `wled00/wled.cpp:661-703` |
| WiFi / access point | `handleConnection`, `initConnection`, `initAP` | `wled00/wled.cpp:705-1090` |
| Low-memory handling | Heap check in `loop` | `wled00/wled.cpp:195-235` |
| Nightlight / transitions | `handleNightlight`, `handleTransitions`, `stateUpdated` | `wled00/led.cpp` |
| Presets / playlists | `handlePresets`, `handlePlaylist` | `wled00/presets.cpp`, `wled00/playlist.cpp` |
| Settings save / load | `handleSettingsSet`; `deserializeConfig`, `serializeConfig` | `wled00/set.cpp`; `wled00/cfg.cpp:47`, `:851` |
| Settings page values | `getSettingsJS` | `wled00/xml.cpp:203` |
| Web routes | `initServer` | `wled00/wled_server.cpp:349` |
| JSON API | `deserializeState`, `serializeState`, `serializeInfo` | `wled00/json.cpp` |

Useful helpers in `wled00/util.cpp`:
- `getVal` / `parseNumber` handle API values, including `~`, `r` and `w~`.
- Random and waves: `hw_random8` / `hw_random16`, the `beatsin*_t` functions, `perlin8` / `perlin16`.
- Memory: `d_malloc`, `p_malloc`, `allocate_buffer`, `getContiguousFreeHeap`.
- Other: `JSONBufferGuard`, `getWLEDhostname`.

There is also a `PRNG` class in `wled00/prng.h`.

---

## 11. Gotchas

1. **Upload with the "Default" environment** flashes many targets in a row (section 2.1).
2. **Compile-time pin defaults only apply on first boot** or after a factory reset. Afterwards `cfg.json` wins (`wled00/cfg.cpp:264-272`).
3. **`WLED_DISABLE_MQTT`, `_ADALIGHT`, `_LOXONE`, `_WEBSOCKETS` don't work in `my_config.h`.** They are checked at `wled00/wled.h:35-51`, before `my_config.h` is loaded at `:124`. Put them in `build_flags`.
4. **`-D WLED_DISABLE_ESPNOW` needs `lib_ignore = wled-espnow`.** The ESP32-P4 section of `platformio.ini` explains why.
5. **Start from the parent's value** when you set `build_flags`, `build_unflags` or `lib_ignore` in your target (for example `${env:esp32dev.build_flags}`).
6. **Don't copy the ESP32 targets from `platformio_override.sample.ini`:**
   - `esp32dev_dio80` and `esp32dev_qio80` mix IDF 4 flags into the IDF 5 build.
   - `-D DMTYPE` in that file should be `SR_DMTYPE`.
   - `WLED_MAX_BUSSES` and `WLED_MAX_ANALOG_CHANNELS` are ignored (`wled00/const.h:78-81`, `:124-128`).
   - `platformio.ini:9` and AGENTS.md call the file `platformio_override.ini.sample`, but its real name is `platformio_override.sample.ini`.
7. **The audio usermod claims GPIO 14, 15 and 32** even when it is off. This applies to the I2S microphone types; with an analog mic it claims only its `AUDIOPIN`.
8. **Holding the BOOT button more than 10 s** is a factory reset: the filesystem is formatted.
9. **If the filesystem can't be mounted at boot,** it is formatted automatically.
10. **The default current limit of 850 mA** makes big strips look dim.
11. **The relay delay blocks the main loop,** for up to 65 s if you set it that high.
12. **Effect IDs can change with build flags,** and presets store IDs.
13. **Custom effects need a metadata string** (`@...`).
14. **Two or more I2S outputs** must all use the same LED chip type.
15. **Analog inputs only work on GPIO 32-39** while WiFi is on.
16. **`CLIENT_SSID` / `CLIENT_PASS` survive a factory reset.**
17. **Changing the partition table probably erases the filesystem.** Back up first.
18. **The UI build only compares file dates.** Use `npm run build -- -f` if a change doesn't show up.
19. **`pio-scripts/build_ui.py` runs `npm ci` on every build.** That is slow and needs internet access. If `npm ci` fails, you get a misleading "npm run build fails" message.
20. **Callbacks in the web task run in parallel with `loop()`.** That includes the JSON API, settings saves and MQTT.

---

## 12. Bug list

**Core fixes: applied to the code on 29 September (about 18:50), after your AGENTS.md "yes" in this session. Not yet built or tested.** Keep flashing RC4b until RC5 (with these fixes) is built and passes review.
- **Applied (7 files: `FX_fcn.cpp`, `bus_manager.h`, `bus_manager.cpp`, `FX.cpp`, `file.cpp`, `wled.cpp`, `wled_metadata.cpp`):**
  - H1-H4, M1, M2, M4;
  - Candle Multi, Flow, PS Volcano;
  - the three small effect bugs Gradient border, Rain 2D reset and Scanner Dual checkbox (section 12.3).
- **Refinement included (N3):** an offset larger than the segment is wrapped before WLED checks whether anything changed, so sending the same value again doesn't restart the effect.
- **Not applied:**
  - **X25** (colour-add carry leak in `colors.cpp`): you answered plain "yes", without X25.
  - **N1** (keep a failed output's configured pin): found unsafe while applying. The `rgb-rotary-encoder` usermod creates its own LED output outside WLED's list and deletes it on its own schedule (`rgb-rotary-encoder.cpp:65, 123, 295`). A failed output could then release a pin that another running output still uses. A safe version needs `BusDigital::cleanup()` to free only pins the output really owns, a design change that is **your decision**.
  - **M3, M5, M6:** deferred, each with a proposal in the README.
- **Where:**
  - patches, README with evidence and test steps: `Downloads\WLED-main\hg_team\drafts\core_fixes\`;
  - the exact change: `hg_team\releases\RC5_pre\core_fixes.diff`;
  - the files before the change, to undo: `hg_team\releases\RC5_pre\wled00\`.
- **Checks done:** the patch applied cleanly. The ESP32 syntax check passed (0 errors, the same warnings as before the change).
- **Still to do:** the full build (ESP32 and ESP8266) by the builder session, the RC5 review, and a device test.
- **Testing:** use a bench board (no mains relays), or download `cfg.json` and `presets.json` first.
- **Behaviour changes after the fixes:**
  - An LED output whose pin could not be claimed (for example, the pin is already used by a relay) shows an empty pin field. The next time WLED saves its settings, that output's pin is stored as 255 (unassigned). Fix the conflict and re-enter the pin. Before, the value was whatever happened to be in memory. Correctly configured outputs are not affected.
  - Segment 0 can be deleted if it lies completely beyond a reduced LED count.
  - Offsets larger than the segment wrap around.
  - Gradient: at the same "Spread" setting the band is about half as wide as before (the originally intended width).
  - Scanner Dual no longer leaves the "Dual" checkbox switched on for the next effect.

### 12.1 High severity

**H1: Reducing the LED count can corrupt memory** (Re-checked)
- **Where:**
  - `wled00/FX_fcn.cpp:2081`: the `fixInvalidSegments` loop runs while `i > 0`, so segment 0 is never clamped.
  - `makeAutoSegments` only resizes when exactly one segment is active (`:2063`).
  - The out-of-bounds writes happen at `:1526-1528`.
- **When:** you have 2 or more segments you made yourself (for example, segment 0 covers LEDs 0-599) and you reduce the LED count to 300. The pixel buffer shrinks to 300 entries, but segment 0 still ends at 600. Rendering writes past the buffer, causing a crash or random behaviour.
- **Also with a single segment** that doesn't line up with the LED outputs. In that case only `fixInvalidSegments` runs (`wled00/wled.cpp:242-245`), and it skips segment 0.
- **Fix idea:** include index 0 in the loop (use a signed index, and keep at least one segment).

**H2: A large segment offset can corrupt memory** (Re-checked)
- **Where:**
  - `wled00/json.cpp:174-182` checks the offset against the *requested* length.
  - `Segment::setGeometry` then trims the length but stores the offset unchecked (`wled00/FX_fcn.cpp:528`).
  - The render wraps the offset only once (`:1526-1527`).
  - Reviewed, not re-checked: UDP segment sync doesn't clamp at all (`wled00/udp.cpp:296`, `:342`), and `fixInvalidSegments` shrinks `stop` without touching `offset` (`:2096`).
- **When:** a single JSON call such as `{"seg":[{"id":0,"stop":600,"of":500}]}` on a 300-LED strip, or loading an old preset made for a longer strip.
- **Fix idea:** clamp the offset inside `setGeometry` (and in `fixInvalidSegments`) against the final length.

**H3: The current limiter overflows above 65.5 A per output** (Re-checked)
- **Where:** `wled00/bus_manager.h:290` (`static uint16_t _milliAmpsTotal`), computed at `wled00/bus_manager.cpp:205`.
- **When:** more than about 1170 LEDs on one pin at full white and full brightness (55 mA per LED).
  - Example: 1200 LEDs draw about 67,200 mA, which is stored as 1,664 mA.
  - The limiter then barely dims, which risks overloading the power supply.
- **Fix idea:** make it 32-bit (`uint32_t`), including the functions that return it.

**H4: An LED output with a bad pin deletes an uninitialised pointer** (Re-checked)
- **Where:**
  - The constructor at `wled00/bus_manager.cpp:139-142` sets `_iType`, then returns early if pin allocation fails. That happens before `_busPtr` and `_pins` are set, and neither has a default value (`wled00/bus_manager.h:280-288`).
  - `cleanup()` (`wled00/bus_manager.cpp:385-393`, also called by the destructor) then deletes that garbage pointer. `PolyBus::cleanup` only checks for `nullptr`.
- **When:** an LED output uses a pin that another feature (button, IR, relay, I2C, ...) already owns, or an invalid pin.
- **Worse for 2-wire LED types** (clock + data, e.g. APA102): if the second pin fails, `cleanup()` runs inside the constructor (`wled00/bus_manager.cpp:147-148`), so the garbage pointer is deleted immediately.
  - This can happen after editing `cfg.json`, importing a config, or setting I2C pins that overlap an LED pin.
  - The result is heap corruption or a crash.
- **Also (reviewed):** `getPins()` ignores the invalid state, so garbage pin numbers can be saved to `cfg.json` (`wled00/bus_manager.cpp:335-339`, `wled00/cfg.cpp:1005-1007`).
- **Fix idea:** initialise `_busPtr = nullptr` and `_pins` to 255, and set `_iType` only after the pins are allocated.

### 12.2 Medium severity

**M1: A `{` or `}` in a name corrupts `presets.json`** (Re-checked)
- **Where:** `wled00/file.cpp:160-161` counts braces without skipping text inside quotes.
- **When:** you re-save or delete a preset whose name, or one of whose segment names, contains an unbalanced brace. The file becomes broken JSON; with `{`, every later preset is blanked. The UI doesn't prevent such names.
- **Fix idea:** skip characters inside JSON strings, including escaped quotes.

**M2: "Save & reboot" can lose settings** (Re-checked)
- **Where:** `wled00/wled.cpp:277`: `if (doReboot && (!doInitBusses || !configNeedsWrite))` reboots even when a save is pending.
  - `wled00/set.cpp:905` sets the flags in a careful order to prevent exactly this race, but the `||` defeats it.
- **When:** it depends on timing.
- **Fix idea:** `if (doReboot && !doInitBusses && !configNeedsWrite)`.
- **Related (reviewed):** `serializeConfigSec()` silently skips writing `wsec.json` if the JSON lock times out (`wled00/cfg.cpp:1342`), so new passwords may be lost at the next reboot.

**M3: The crash-loop "reset config" step doesn't work** (Re-checked)
- **Where:**
  - `wled00/util.cpp:1103` calls `resetConfig()`, which only renames `cfg.json` (`wled00/cfg.cpp:803-811`).
  - At the next boot, `setup()` finds no `cfg.json` and restores the same backup (`wled00/wled.cpp:523-527`).
- **Effect:** a config that causes crashes is restored twice, then the firmware is rolled back.
- **Also (reviewed):** the counter only resets on power-on, and an OTA update pre-arms the rollback step (`wled00/ota_update.cpp:206`).
- **Fix idea:** remove or rename the backup too when resetting.

**M4: The OTA check can randomly report "release name mismatch"** (Re-checked)
- **Where:** `wled00/wled_metadata.cpp:140` writes the end marker at `sbuf[len]` instead of `sbuf[real_len]`. The bytes after the real name are uninitialised.
- **Fix idea:** `sbuf[real_len] = '\0';`.
- **Workaround:** tick "Ignore firmware validation".

**M5: `POST /json/cfg` turns I2C off permanently** (Re-checked)
- **Where:** `wled00/cfg.cpp:491-505`. Every config load calls `Wire.setPins()`, which fails once I2C is running (comment at `:497`). The pins become -1 and that is saved.
- **When:** scripts, apps or your own code POST to `/json/cfg`. The stock UI only reads it.
- **Fix idea:** only re-apply the I2C pins when they change.

**M6: The low-memory emergency recovery leaves the LEDs dead** (Re-checked)
- **Where:** `wled00/wled.cpp:226-227` destroys and recreates the strip object without calling `finalizeInit()`. There are then no segments and no pixel buffer.
- **Effect:** the LEDs stay dark. The next state change calls `getSegment()` on an empty list (`wled00/FX_fcn.cpp:1982-1984`), which crashes (the crash is inferred).
- **Fix idea:** re-initialise the strip, or simply reboot.

**M7: The web UI doesn't escape names** (Re-checked)
- **Where** (re-checked):
  - Segment names (`wled00/data/index.js:839`, `:849`).
  - Node names received over UDP (`:1122`, `bname()`).
- **Also affected** (reviewed):
  - Preset names (`:597`, `:624`, `:2126`) and the device name (`:648`).
  - Usermod text settings (`settings_um.htm:37`, `:125`).
  - SSIDs (`settings_wifi.htm:128-135`).
- **Effects:**
  - A name containing `"` gets cut off at the next save.
  - HTML in a name runs as a script in the browser. Any device on your network can broadcast such a node name.
- **Fix idea:** escape names before inserting them. `esc()` exists in `common.js:157`, but `index.js` needs its own copy.

**M8: Three effects can crash** (Re-checked)
- **Flow** (`wled00/FX.cpp:4431-4432`) divides by `zoneLen`, which is 0 for a 1-LED segment (or 2 LEDs mirrored). Result: division-by-zero crash. Fix: guard `SEGLEN < 2`.
- **Candle Multi** (`wled00/FX.cpp:3503`) calls `candle(false)` when memory runs out, but doesn't `return`.
  - Usually the rate-limit check at `:3512` then returns at once, because the inner call just updated the timestamp. So it is *not* a buffer overflow (corrected after a team review).
  - It crashes only if even the 4-byte fallback allocation fails, by reading through a null pointer.
  - Fix: `{ candle(false); return; }`.
- **PS Volcano** (`wled00/FX.cpp:8313-8332`) uses particle data before `updateSystem()` refreshes the pointers; every other particle effect calls it first. The review traced a use-after-free when switching away from Volcano with transitions on (2D setups). Fix: call `updateSystem()` first.

**Reviewed (not re-checked), medium severity:**
- One bad LED output disables all later outputs. The loop at `wled00/FX_fcn.cpp:1302` stops at the first failed output.
- PWM outputs share LEDC timers, so outputs with different clock settings corrupt each other (`wled00/pin_manager.cpp:327-352`, `wled00/bus_manager.cpp:455-464`).
- Importing a config template inverts the relay polarity. The "Invert" checkbox label is also backwards (`wled00/data/settings_leds.htm:812`, `wled00/cfg.cpp:1062`).
- Saving LED settings deletes and recreates the IR receiver and button list while `loop()` may be using them (`wled00/set.cpp:180-392`, `wled00/ir.cpp:709-716`). A crash is suspected.
- When a particle system fails to initialise, its small old buffer stays and is later used as a particle system (`wled00/FXparticleSystem.cpp:1122-1125`, `:1864-1867`).
- Segment `m12` values 5-7 are accepted and overflow the 1D particle buffer (`wled00/FX_fcn.cpp:494`, `:626`).
- Several effects freeze when the time jumps (sync from another WLED, JSON `tb`), for as long as the jump. Affected: Sparkle Dark/+, Strobe Mega, Android, Chase Flash, Scanner, PacMan, Tetrix, Crazy Bees, Scrolling Text (`wled00/FX.cpp:789`, `809`, `842`, `859`, `1088`, `1125`, `1217`, `3217`, `4018`, `6163`, `6512`).
- The access point flaps when a saved network is out of range (`wled00/wled.cpp:784-785`, `:1028`, `:1034`).
- Audio:
  - A saved analog-mic setting silently becomes "Generic I2S" on IDF 5 (`audio_reactive.cpp:2133-2135`).
  - Usermod callbacks in the web task race with `loop()`, for example turning audio off while sound sync is sending.
- Build: the default target list makes "Upload" flash many targets (section 2.1). `-D WLED_DISABLE_ESPNOW` breaks the build without `lib_ignore`, and the sample override file is outdated (section 11).

### 12.3 Low severity

**Re-checked:**
- The brownout "re-enable" writes 1 (bit 0), but the enable bit is bit 30. This only matters with `WLED_DISABLE_BROWNOUT_DET` (`wled00/wled.cpp:656`).
- In the E1.31/Art-Net DMX **effect** modes, `dmxChannels - dmxEffectChannels + 1` is unsigned and wraps on short packets, so the bounds check doesn't stop the read (`wled00/e131.cpp:274`).
- `pio-scripts/build_ui.py:13` runs `npm ci` on every build and ignores its failure.
- `nSliders` is undefined in `wled00/data/index.js:1645`. This affects custom effects without metadata.
- The audio usermod claims pins and the I2S driver while disabled (`usermods/audioreactive/audio_source.h:199-208`). This applies to the I2S microphone types; in analog mode it claims only `AUDIOPIN`.
- Suspected: `WLED_WATCHDOG_TIMEOUT > 0` uses the IDF 4 watchdog function signature and likely won't compile on IDF 5 (`wled00/wled.cpp:364`).

**Reviewed (not re-checked):**
- **Core:**
  - A playlist with `"transition":[]` reads index -1, and more than 255 entries wrap around (`wled00/playlist.cpp:112`, `:68-70`).
  - A nightlight duration of 0 divides by zero (`wled00/led.cpp:226-229`).
  - `readObjectFromFile()` returns true even when parsing fails (`wled00/file.cpp:368-373`).
  - `wsec.json` has no backup, and write results aren't checked (`wled00/cfg.cpp:843-845`).
  - Races: a playlist is unloaded from the web task while the loop reads it; the button list is rebuilt while it's being read; a file handle is shared (`wled00/presets.cpp:129`, `wled00/cfg.cpp:369-370`, `wled00/file.cpp:43`).
  - `d_realloc_malloc` frees memory twice when RAM is low. It's unused today (`wled00/util.cpp:879-885`).
  - The WiFi network list isn't limited when it is loaded from JSON (`wled00/cfg.cpp:89`, `:1301`).
- **Hardware:**
  - The relay pin drives LOW briefly at boot. A relay pin changed at runtime isn't set to output until the next "off" (`wled00/cfg.cpp:478`, `wled00/set.cpp:324-332`).
  - The IR receiver is created on an invalid pin and leaked at every save (`wled00/ir.cpp:701-706`).
  - DMX input (`wled00/dmx_input.cpp:131-198`, `wled00/cfg.cpp:622-623`):
    - its task function can return, which aborts;
    - TX/EN are accepted on input-only pins;
    - the `inputRxPin` / `inputTxPin` keys hold swapped values.
  - Hardware-SPI LED strips and SPI usermods share the same SPI bus (`wled00/bus_wrapper.h:323-344`).
  - `ESP32_DATA_IDLE_HIGH` only toggles channel 0 (`wled00/bus_manager.cpp:1382-1396`).
  - With "skip first N" set, the current limiter doesn't dim the last N LEDs (`wled00/bus_manager.cpp:232-243`).
  - The firmware accepts ADC2 pins for analog buttons, and Pin Info doesn't flag strapping pins 5 and 15.
- **Effects:**
  - Fire 2012 divides by zero at 2560-2569 LEDs (`wled00/FX.cpp:2168`, `:2187`).
  - **Re-checked:** Gradient's border ignores the intended `intensity/4`. `1 + loading ? intensity/2 : intensity/4` parses as `(1 + loading) ? …`, which is always true (`:1400`). Fix: `1 + (loading ? SEGMENT.intensity/2 : SEGMENT.intensity/4)`. This changes how Gradient looks slightly.
  - Wipe transitions end early with grouping or mirror (`wled00/FX_fcn.cpp:1539-1540`).
  - The CCT buffer is allocated and freed every frame (`:1773-1775`).
  - Pinwheel uses a variable-length array and a shared static variable (`:851`, `:854`).
  - **Re-checked:** Scanner Dual sets `check1` permanently (`FX.cpp:1257`), so a later effect or Scanner shows its first checkbox ticked. Fix: save and restore it, as "Dynamic Smooth" does (`FX.cpp:420-425`).
  - Oscillate wraps at 768 LEDs or more (`:1877`).
  - **Re-checked:** Rain's 2D path resets `aux0` where it should reset `aux1` (`:1355`, a copy-paste typo of the line above).
  - Copy Segment is missing a `return` (`:146-148`).
  - Drift may overflow after hours of uptime (suspected, `wled00/wled_math.cpp:93`).
- **Network:**
  - All responses allow cross-origin requests, and controlling the lights needs no login, so any web page you visit could control them. The threat model accepts this (`wled00/wled_server.cpp:352-354`).
  - `/upload` can overwrite `wsec.json` (PIN-protected) (`:206`).
  - `/win` segment changes aren't paused while rendering (`wled00/set.cpp:985-987`, `:1155-1171`, suspected).
  - The Hue client reads its receive buffer as a C string (`wled00/hue.cpp:87-91`, suspected).
- **Web and build:**
  - An unnamed preset breaks the Presets tab, and the quick-load buttons aren't sorted (`wled00/data/index.js:1419-1422`, `:594`).
  - `tools/cdata.js` has an unused `stylesheets` option (`:143`), a greedy regex for `usermod.htm`, and 16-bit page sizes.
  - `uploadFile` ignores reverse-proxy paths, and WebSocket URLs drop the port (`wled00/data/common.js:186`, `:203`).
  - CI: `esp32s3_4M_qspi` is listed twice (`platformio.ini:34`, `:41`), and the build cache key ignores the version.
- **Usermods:**
  - `usermod_v2_klipper_percentage` overflows its error buffer after about 6 failed polls. This is **high severity if you use it** (`usermod_v2_klipper_percentage.cpp:9`, `:44-45`, `:84-85`).
  - The audio FFT task returns when memory runs out, which aborts (`audio_reactive.cpp:326-367`).
  - Audio pins aren't released when I2S setup fails half-way.
  - Starting an OTA update while audio is disabled creates the FFT task (about 9 KB).
  - The EXAMPLE usermod doesn't read `enabled` back, and its pins default to GPIO0 on first boot.
  - Sound-sync values aren't checked for NaN.
  - `validate_modules.py` doesn't check the number of usermods.

---

## 13. Glossary

| Term | Meaning |
|---|---|
| ESP32 "classic" | The original dual-core ESP32 chip (not S2/S3/C3/C6/P4) |
| WROOM-32 / DevKitC | The module with the chip and 4 MB flash / the 38-pin development board |
| PSRAM | Extra external RAM. Your board has none |
| GPIO | A general-purpose input/output pin |
| Strapping pin | A pin read at power-on to decide the boot mode (0, 2, 5, 12, 15). Parts connected to it can stop the board from booting |
| ADC1 / ADC2 | Analog inputs. ADC2 can't be used while WiFi is on |
| RMT | ESP32 peripheral used to send WS2812 data (8 channels) |
| I2S | Audio peripheral, also used to send LED data and to read microphones |
| LEDC | ESP32 PWM peripheral for analog LED strips |
| NeoPixelBus | The library that sends the LED data |
| Bus / output | One LED output (one data pin, or one set of PWM pins) |
| Segment | A part of the strip with its own effect and colours |
| Effect (FX) | An animation function |
| Palette | A colour gradient used by effects |
| Transition | The fade or wipe between two looks |
| Preset / playlist | A saved look / a sequence of presets |
| ABL | Automatic Brightness Limiter (the current limiter) |
| Usermod | A plugin compiled into WLED |
| OTA | Over-the-air (WiFi) firmware update |
| LittleFS | The filesystem on the flash chip |
| ESP-IDF V4 / V5 | Espressif's framework versions. `esp32dev` uses 5.5, `esp32dev_V4` uses 4.4 |
| PlatformIO environment ("env", "target") | One build configuration in `platformio.ini` |
| E1.31 / Art-Net / DDP | Lighting protocols for streaming live pixel data |
| Realtime mode | WLED shows streamed data instead of its own effects |
| mDNS | Addresses like `name.local` |
| AP | Access point: WLED's own WiFi network |
| Race condition | Two tasks changing the same data at the same time |
| Heap | RAM used for dynamic memory |

---

## 14. Next steps

1. **Agree before any code changes.** The project's AGENTS.md says an AI assistant may only edit, commit, push or open a PR after you answer yes to this question, in the same conversation:

   > WLED welcomes AI-assisted contributions, but not unreviewed ones. I'll only edit, commit, push, or open a PR once you confirm you'll review, understand, and take responsibility for the result. Do you agree?
2. **Suggested order.** Status for the Home Gadgets project is in brackets.
   1. Create `platformio_override.ini`, then build, flash and check that the device works. [Created and built (section 15.2). Flashing and testing on the board: not recorded yet]
   2. Plan your wiring with section 5.2. [Done: section 15.3; hardware checks are still open, see 15.7]
   3. Keep or remove the audio usermod (section 9.4). [Kept: analog mic on GPIO36]
   4. Choose your tweaks (sections 10 and 11).
   5. Fix the bugs that matter for your setup, starting with H1-H4. [The team board proposes the review session for these fixes, once you give that session the AGENTS.md "yes"]
3. **Next time you work with Claude:** say "Read `Downloads\WLED-main\WLED_ESP32_Review.md` and `Downloads\WLED-main\TEAM_BOARD.md` first", then describe what you want to change.
4. **If you send changes upstream** (GitHub `wled/WLED`), AGENTS.md requires:
   - Target the `main` branch.
   - Mark AI-generated code with `// AI: below section was generated by an AI` ... `// AI: end`, and declare the AI help in the PR description.
   - Get maintainer approval for changes to `platformio.ini`.
   - Never commit `html_*.h` / `js_*.h` or `platformio_override.ini`.
   - Don't force-push to an open PR.
   - Build at least `esp32dev` before submitting.

---

## 15. Home Gadgets build (your current project)

Updated 29 September 2026 for **release candidate 2 (RC2)**: firmware built 17:49, usermod, page and readme 17:48.

**RC3** (about 17:56) builds on RC2 and was also reviewed: PASS. Its changes:
- **Moods:** your own moods now also keep the effect's option checkboxes (o1-o3). The phone page gets a mood "✎ Edit → Save / Save as new" flow.
- **File renames:** condition C1 is fixed (a failed file rename can no longer lose your settings).
- **Small fixes:**
  - The config loader skips a damaged file.
  - The key is never stripped from its only copy.
  - The phone page and WLED's settings pages now share one PIN retry wait.

**The image to flash is now RC5** (review PASS, 29 September, about 19:08). It replaces RC4b and all earlier images.
- **Where:** `Downloads\WLED-main\hg_team\releases\RC5\`: `home_gadgets_RC5_firmware.bin` (md5 `f11f0acb…`, 84.7% of the firmware space, RAM 25.7%), the same three boot/partition files as RC4b, `flash.ps1` (`.\flash.ps1 COMx` with your ESP32's port, see "How to flash" below), `MANIFEST.txt`, the sources in `src\`, the changed core files in `core\` and the change itself as `core_fixes.diff`.
- **What RC5 adds to RC4b:** only the core WLED fixes from section 12 and the release name "RC5". The Home Gadgets usermod, the phone page and the readme are the same as in RC4b. The accessibility captions you approved are **not** in RC5; they come with the next release.
- **How RC5 was checked (this session):**
  - every checksum in its MANIFEST matches;
  - the core files are exactly "RC4b state + `core_fixes.diff`";
  - the only source change is the release name;
  - the image is valid (`esptool image_info`: checksum and hash valid) and contains the phone page (regenerated from `src\home.htm` and found in the image);
  - the image really contains the fixes: its compiled code was inspected. Seen: H1 (the segment clean-up calls the new safety steps), H2 and N3 (the offset wrap), H3 (the current counter is 32-bit on ESP32 and ESP8266), Flow's 1-LED guard, the string-aware preset scanner (M1) and the Scanner Dual fix.
  - The ESP8266 check build compiled; H3 costs it 2 bytes of RAM.
- **Not checked:** no test on a real board yet. The ESP8266 warnings were checked by the builder; I compared ESP32 warnings before and after (no new ones), but didn't see the ESP8266 log itself.
- **Before the first RC5 flash:** back up WLED (Config → Security & Updates → Backup presets / Backup configuration) and the Home Gadgets settings (Settings → Backup). Flashing with `flash.ps1` (without `-Erase`) keeps everything, but some fixes change how LED outputs and segments are checked.

**RC4b** (review PASS about 18:25) is the previous image. Keep its folder, so you can go back to it.
- **Where:** `Downloads\WLED-main\hg_team\releases\RC4b\` (built 18:21:36).
  - `home_gadgets_RC4b_firmware.bin` (md5 `f4afbc33…`, 84.7% of the firmware space, RAM 25.7%, no warnings).
  - The unchanged `bootloader.bin`, `partitions.bin` and `boot_app0.bin`.
  - `flash.ps1`.
  - The exact sources in `src\`: usermod `31eb074a`, page `54348e10`, readme `746000ab`.
  - `MANIFEST.txt` with all checksums and the build environment.
- **What RC4b adds to RC3b:**
  - the real-time effect preview (about 20 fps, key-protected, with a fallback);
  - a "Set a PIN first" card instead of the Siri links while no PIN is set;
  - "Saved ✓" only after the device confirms;
  - a slot check before "Replace with look";
  - clearer captions and scene summaries;
  - secure WebSocket behind HTTPS;
  - a key-safety flag in NVS (a board that already stored its key in NVS never takes a key from a file again);
  - updated security advice in the readme.
- **How it was checked:**
  - the RC4 sources were diffed against the reviewed feature patch;
  - RC4b was diffed against RC4 (only the key-flag fix, the release name and a comment);
  - the checksums match the project;
  - the phone page inside the firmware was confirmed to be exactly the snapshot's page (unpacked and compared);
  - the flash files match all earlier builds;
  - `flash.ps1` was read in full.
- **How to flash** (the builder session guides you):
  - **Find your ESP32's port first:** plug the board in with a USB data cable. Device Manager → Ports (COM & LPT) then shows a new entry such as "Silicon Labs CP210x USB to UART Bridge (COMx)" or "USB-SERIAL CH340 (COMx)". Use that number. It is **not** COM5 or COM6: on this PC those are Bluetooth ports. No new entry? Install the CP210x or CH340 driver, or try another cable (many are charge-only). Details: `hg_team\device_check\BRINGUP.md` §1.1.
  - Normal: `.\flash.ps1 COMx` in that folder (COMx = your ESP32's port). It checks every file's checksum first and keeps your WLED settings, presets, Home Gadgets settings and key.
  - If Windows blocks scripts: `powershell -ExecutionPolicy Bypass -File .\flash.ps1 COMx`.
  - `-Erase` wipes the whole board, and only after you type YES.
- **Who built it:** another Claude session (`wled-main-ad`). Coordination (file owners, build lock, open findings) is in `Downloads\WLED-main\TEAM_BOARD.md`.
- **Review:** everything below was checked by reading the code. The review in this session gave **PASS for the first flash**, with one condition (section 15.7).
- **Testing:** nothing has been tested on the real board yet. The builder session tested the page against a simulated device (50 of 50 checks passed).
- **User guide:** `usermods/home_gadgets/readme.md` (build, wiring, first setup, daily use, schedules, away mode, clap control, Siri, security key, API).
- Line numbers below refer to `usermods/home_gadgets/home_gadgets.cpp` as of 17:48.

### 15.1 What it does

The `home_gadgets` usermod turns WLED into a home controller:
- **Relays:** 8 relays for appliances, with a power-on state, an auto-off timer and a "stays on" option.
- **Wall switches:** 8 inputs. They take dry contacts, or existing mains switches read through AC opto-isolator modules.
- **Motion sensors:** 2 PIR sensors. Each runs up to 8 actions, optionally only at night, and switches them back off after a hold time.
- **Moods:** 23 built-in LED looks, plus up to 12 of your own, for the 2 LED strips.
- **Scenes:** 6 scenes. One tap runs up to 8 actions.
- **Schedules** (new in RC2): up to 8. Each runs at a clock time or at sunrise/sunset ± up to 3 hours, on the weekdays you pick.
- **Away mode** (new): switches chosen relays at random inside a time window, so the house looks lived-in.
- **Clap control** (new, experimental, off by default): 2 or 3 claps run actions.
- **"Who switched it"** (new): for each relay, the page shows what switched it last and how long ago.
- **Statistics** (new): today's on-times per relay and motion per half hour.
- **Live preview** (new): the page shows a live colour preview of both strips.
- **Phone page:** at `http://<device>/home`, with Siri links, a security key, and a warning banner while no settings PIN is set.

### 15.2 Build

| Item | Value |
|---|---|
| Config file | `platformio_override.ini` in the project root (not in git), with `default_envs = home_gadgets` |
| Target | `home_gadgets`, which extends `env:esp32dev_V4`: ESP-IDF 4.4 (Tasmota platform 2024.06.00, Arduino core 2.0.18). V4 is needed because the analog MAX4466 mic only works there |
| Usermods | `audioreactive home_gadgets` |
| Extra flags | `-D SR_DMTYPE=0` (analog mic), `-D AUDIOPIN=36` |
| Release name | `ESP32_V4`. The OTA check ignores the `_V4` suffix, so updates to or from official `ESP32` builds pass the name check (`wled00/wled_metadata.cpp:130-133`) |
| RC2 build | 29 Sep, 17:49: `build_output/release/WLED_17.0.0-devV5_ESP32_V4.bin`, 1,333,472 bytes. That is 84.8% of the 1,572,864-byte firmware slot, about 239 KB left. PlatformIO's own summary says 84.4% because it counts only the program sections. RAM use is 25.6%, and the build has no warnings |
| Phone page build | The source is `usermods/home_gadgets/home.htm` (about 69 KB). At build time, `gen_page.py` (run through `"extraScript"` in `library.json`) gzips it (about 24 KB) into `.pio/build/home_gadgets/home_gadgets_gen/home_page_gz.h`. No generated file ends up in the source tree |
| Core files changed | `wled00/const.h:257` (`USERMOD_ID_HOME_GADGETS 59`) and `wled00/pin_manager.h:80` (`PinOwner::UM_HomeGadgets`) |

Differences from `esp32dev` (section 4.1), because this build uses V4:
- Analog microphones work. DMX input is not available.
- LED data uses WLED's high-priority RMT driver (`wled00/bus_wrapper.h:260-262`), which is less sensitive to WiFi-induced flicker.
- A different NeoPixelBus version is used (commit `1d7ff38`).

Building:
- Build and flash with `pio run -e home_gadgets -t upload`. The Upload button also works, because `home_gadgets` is the only default target.
- All sessions share `.pio/`, so only one of them builds at a time (the build lock in `TEAM_BOARD.md`).

### 15.3 Wiring

The defaults come from `home_gadgets.cpp:111-113`. Pins can be changed from the phone page.

| Function | GPIO | Notes |
|---|---|---|
| Relays 1-8 | 4, 13, 18, 19, 23, 25, 26, 27 | Active-LOW by default (most 5 V relay boards), and off at power-on. The off level is written before the pin becomes an output, so the relays don't click at boot |
| Wall switches 1-8 | 14, 32, 33, 21, 22, 5, 15, 35 | Switch N controls relay N. AC opto type, "toggle" mode |
| PIR sensors 1-2 | 34, 39 | Input-only pins; the PIR drives its own output |
| Microphone (MAX4466 OUT) | 36 (VP) | ADC1. In analog mode, audioreactive claims only this pin |
| LED strips 1-2 | 16, 17 | Set up in LED Preferences (WLED's default is one output on 16). "LED 1" and "LED 2" are WLED segments 0 and 1 |
| WLED button 0 | 0 (BOOT) | Held 5-10 s: WiFi access point. More than 10 s: factory reset |
| Not used | 2, 12 (avoid), 1/3 (USB serial) | |

Things to know about this wiring:
- **No I2C.** GPIO 21 and 22 are used by wall switches, so I2C displays or sensors would need re-wiring.
- **No internal pull resistors on 34, 35 and 39.** The opto module on GPIO35 must bring its own pull-up; the code's `INPUT_PULLUP` does nothing on that pin.
- **GPIO 5 and 15 are strapping pins.** A wall switch that is ON at power-up should not stop the board from booting, but test it once `[not tested]`.
- **GPIO 36 and 39 interfere.** While the ADC samples the mic on 36, the ESP32 can show short false pulses on 39. The 50 ms PIR debounce filters them `[code]`.
- **Opto module supply.** Power the modules so their outputs never put more than 3.3 V on an ESP32 pin `[not tested]`.
- **GPIO 14 and 15 send signals during boot.** If a module actively drives these lines, a series resistor of about 1 kΩ protects both sides `[general ESP32 advice, not tested]`.

### 15.4 How it behaves `[code]`

**Relays**
- `activeLow` is on by default.
- **Power-on state:** off, on or "last". The last state is saved 3 s after a change. After boot, relays that should be on start one at a time, 400 ms apart.
- **Auto-off timer:** optional, up to 1440 minutes. It also switches "stays on" relays off.
- **"Stays on"** (`keep`): scenes, motion sensors, schedules, away mode, clap control and "all off" never switch this relay off. Use it for a fridge or aquarium. Direct commands, wall switches and the auto-off timer still can.

**Wall switches**
- Dry contacts use a 50 ms debounce.
- AC opto inputs: an interrupt records each mains pulse. The switch counts as "on" if a pulse arrived within the last 60 ms, with a 100 ms debounce.
- Toggle mode (the default): every flip toggles the relay, so the wall switch and the app never disagree.
- Follow mode: the relay copies the switch position.
- For 1 s after boot or a configuration change, inputs are read but trigger nothing.

**PIR sensors**
- On motion, a sensor runs up to 8 actions.
- Optionally only at night, i.e. between sunset and sunrise. Without a location set in the Time settings, it always counts as night.
- After `hold` seconds without motion (5-3600, default 60), the actions are undone (`undo`).
- Defaults: PIR 1 applies mood "Calm" on LED 1; PIR 2 applies "Midnight" on LED 2.

**Moods** (`home_gadgets.cpp:273-296`)

| ID | Mood | Effect | Palette | Needs mic |
|---|---|---|---|---|
| 0 | Pub Vibes | Gravcenter | Party | yes |
| 1 | Calm | Colorwaves | Pastel | |
| 2 | Midnight | Twinklefox | April Night | |
| 3 | Disco | Freqwave | Rainbow | yes |
| 4 | Bass Drop | Gravimeter | Lava | yes |
| 5 | Chill Lounge | Plasmoid | Ocean | yes |
| 6 | Cozy Fire | Fire 2012 | Fire | |
| 7 | Candlelight | Candle | effect default | |
| 8 | Ocean | Pacifica | effect default | |
| 9 | Northern Lights | Aurora | Aurora | |
| 10 | Reading | Solid | effect default | |
| 11 | Wake Up | Sunrise | effect default | |
| 12 | Away | TV Simulator | effect default | |
| 13 | Romantic | Breathe | Magred | |
| 14 | Rainy Day | Rain | Ocean | |
| 15 | Festival Sparkle | Twinkleup | Party | |
| 16 | Gaming | Rocktaves | Orange & Teal | yes |
| 17 | Spring Bloom | Flow | Sakura | |
| 18 | Beat Ripple | Ripple Peak | Candy | yes |
| 19 | Popcorn Party | Popcorn | Rainbow | |
| 20 | Lighthouse | Lighthouse | Icefire | |
| 21 | Night Path | Solid (dim warm) | effect default | |
| 22 | Focus | Solid (cool white) | effect default | |

- Effects and palettes are looked up by name when a mood is applied. The names of moods 0-17 were checked against this WLED version `[code]`. The patch author reports checking 18-22 as well.
- **Custom moods:** up to 12 (IDs 100-111), created by saving the current look of a strip. A custom mood can replace a built-in one (`rep`).
- Saving a look from a strip whose segment doesn't exist now shows "rejected" on the page.

**Scenes**
- There are 6, each with up to 8 actions.
- Defaults: 1 "Party" (Pub Vibes on both strips), 2 "Movie" (LED 1 off, Midnight on LED 2), 3 "All off".

**Schedules** (`checkSchedules`, `home_gadgets.cpp:1594`)
- **Limits:** up to 8 schedules, each with up to 8 actions. Days are a bitmask (bit 0 = Monday … bit 6 = Sunday).
- **When:** at a clock time, or at sunrise or sunset plus or minus up to 180 minutes. Sunrise/sunset needs a location in the Time settings.
- **Checking:** schedules are checked once per local minute, and only while the clock is synced. If the loop was stalled, up to 5 missed minutes are caught up. After a clock jump (first sync, summer/winter time), only the current minute runs.
- **Once a day:** each schedule runs at most once per day. If the device restarts within the same minute a schedule just ran, it can run once more.
- **Offset past midnight:** an offset that crosses midnight is clamped to 00:00 or 23:59 of the same day.
- **List behaviour:** the list works like a normal list, since RC2. Add appears while there are fewer than 8, and deleting one moves the others up without duplicates. A new schedule starts disabled, at 20:00, with no actions.

**Away mode** (`handleAway`, `home_gadgets.cpp:1623`)
- **Window:** it runs only while the clock is synced and the time is inside the window (`from`-`to`, local time). The window may cross midnight. `from` = `to` means it never runs, and the page warns about that.
- **Random switching:** the chosen relays are toggled at random intervals (between `min` and `max` minutes). "Stays on" relays are left out; the page disables them in the picker.
- **Mood:** an optional mood is applied when the window opens.
- **Window end:** when the window ends (or the clock is lost), the simulated relays and the away-mood strips switch off.
- **Switching it off by hand:** switching away mode off *inside* the window leaves everything as it is, so whoever came home isn't left in the dark.

**Clap control** (`handleClap`, `home_gadgets.cpp:1784`, experimental, off by default)
- **How:** 2 or 3 claps, 150-800 ms apart, are evaluated 1 s after the last clap. Each count runs its own action list.
- **When it's ignored:** while the mic is off, while a strip shows a sound-reactive effect, if it was loud just before the first clap, or when the loop was too slow to be sure no clap was missed.
- **Caution:** it reacts to any sharp sound near the mic, including a TV or a phone playing clap sounds. Don't give it actions that switch heaters or similar loads.

**"Who switched it" and statistics**
- For each relay, `/home/live` reports what switched it last (`src`) and the seconds since (`ago`). The codes are in section 15.5.
- `/home/stats` gives today's on-time per relay (seconds) and motion counts per half hour for both PIRs.
- The statistics are kept in RAM only and reset at local midnight. Before the first time sync, they count 24-hour periods of uptime.

**Microphone**
- On/off and input level are passed to audioreactive 3 s after boot and whenever they change. They are saved only when they actually change.

**Threads**
- Web requests never touch the hardware. They queue commands (up to 16), which `loop()` executes (up to 8 per pass).
- Uploaded configurations are applied in `loop()` too. This avoids the web-task race conditions described in section 3.4.

**Timing bugs fixed in RC2** (found by the patch author, checked in this review)
- Switches and PIR sensors stopped reacting after about 24.8 days of uptime.
- A wall switch unused for over 24.8 days could flip its relay by itself.
- The power-on restore could stall.
- The auto-off timer could switch a relay off right after it was switched on.

### 15.5 Web page and APIs

| Route / API | Purpose | Protection |
|---|---|---|
| `GET /home` | Phone page: plain HTML/CSS/JS, stored gzipped in the firmware. It needs no internet. Names you type are always inserted as text, never as HTML (checked). Unknown `/home/...` paths return 404 | none |
| `GET /home/live` | Status JSON for the page, polled every second: relays `r`, switches `sw`, PIR `pir`/`act`, strips `s`, `on`, `bri`, `mic`, `lvl`, sound level `vol` (-1 = no audio), config revision `rev`, plus `src[8]`, `ago[8]`, `away`, `clap`, `ts` (clock synced) and `px` (16 colours per strip) | none, but **no cross-site header** (`HgPrivateJsonResponse`, `home_gadgets.cpp:1851`), so other websites can't read it |
| `GET /home/stats` | `{"ts":0/1, "on":[8 seconds], "pir":[[48 counts],[48 counts]]}` (`serveStats`, `:1987`) | same as `/home/live` |
| `GET /home/api` | Links for Siri Shortcuts and similar. Relay and scene numbers are **1-based**; mood numbers are the mood IDs. Examples: `?relay=1&on=1&k=KEY`, `?mood=0&strip=3&k=KEY` (strip 1 = LED 1, 2 = LED 2, 3 = both), `?scene=1&k=KEY`, `?strip=1&on=0&k=KEY`, `?alloff=1&k=KEY`. `on` accepts 1/true/on, 0/false/off and t/toggle; anything else returns HTTP 400 | **security key** `k` on every request (HTTP 403 without it) |
| `GET /home/cfg` | Current configuration, **including the key** and `pinSet`. No cross-site header | none; programs on your network can read it |
| `POST /home/cfg?k=KEY[&pin=PIN]` | Upload a configuration (max 12 KB). Checks run in the order key (403), size (413), PIN (401), busy (503); success is 202. The key is checked before any memory is allocated. The PIN is checked locally and does **not** unlock WLED's own pages. `"newkey":true` creates a new key | security key + settings PIN, if one is set |
| `POST /json/state` | **With key:** `{"HomeGadgets":{"relay":0,"on":true,"k":"KEY"}}` (**0-based**; `"on":"t"` toggles), `{"scene":0,"k":…}`, `{"alloff":true,"k":…}`, `{"away":true,"k":…}` (switches away mode on or off, and is saved). **No key needed:** `{"mood":0,"strip":3}`, `{"strip":1,"on":false}`, `{"mic":true}`, `{"lvl":128}` | security key for relay, scene, all-off and away |
| `GET /json/state`, WebSocket | Include `"HomeGadgets":{"r":[...],"sw":[...],"pir":[...]}` | none |
| Info page / Settings → Usermods | "N relays on · open", with a link to `/home`. Only the "enabled" checkbox appears in the usermod settings | |

"Who switched it" codes (`src`, `home_gadgets.cpp:145`):

| Code | Source | Code | Source | Code | Source |
|---|---|---|---|---|---|
| 0 | start-up | 4 | scene | 8 | away mode |
| 1 | app / JSON | 5 | Siri / link (`/home/api`) | 9 | clap |
| 2 | wall switch | 6 | schedule | 10 | power-on restore |
| 3 | motion | 7 | auto-off timer | 11 | "all off" command |

An "all off" action *inside* a scene, schedule or clap list reports that source (4, 6 or 9), not 11.

**Security key (since RC2 stored in the chip's NVS memory)** `[code]`
- **Why:** WLED's control API has no login, and every WLED response allows other websites (`Access-Control-Allow-Origin: *`, section 7.7). Without a key, any web page opened on your network could switch the mains relays.
- **Creation:**
  - 10 random characters (about 49 bits), made with the hardware random generator once WiFi (or the access point) is running (`generateKey`, `home_gadgets.cpp:1133`).
  - Compared in constant time (`keyOk`, `:1179`).
- **Storage:**
  - Kept in NVS (namespace `homegadgets`, `:107`; `loadKey`/`saveKey`, `:1145`/`:1170`), not in a file. So WLED's file upload and file editor can neither read nor replace it.
  - **It survives a factory reset.** If you reset because you think the key leaked, use "Make a new key" afterwards.
- **Migration:**
  - Keys from older builds (in `/home.json` or `/hgwsec.json`) are moved to NVS at boot.
  - The old copies are deleted only after the NVS write succeeded.
- **Where it's required:**
  - everything that can switch a relay: every `/home/api` request, and the relay/scene/all-off/away JSON commands;
  - saving the configuration.
  LED-only commands (moods, strips, mic) stay open, like the rest of WLED.
- **Where it's never sent:** `/home/live`, `/home/stats`, the WebSocket state or WLED's `/json` answers.
- **Getting it:** the phone page shows it (Settings → Voice control). "Make a new key" replaces it, and old Siri links then stop working.

*Rules for you:*
- **Set a settings PIN** (Settings → Security & Updates). The page shows a warning banner until you do. It is still essential with RC2:
  - Without a PIN, WLED's general file upload (`POST /upload`) accepts any file name from any website (`wled00/wled.h:572`, `wled00/wled_server.cpp:206-209`), and `GET /reset` reboots the device without a check (`:408-411`).
  - The protected file names (section 15.6) stop other websites from *reading* the files, not from *overwriting* them.
  - So a page could replace the configuration, for example relays on at power-up or a schedule, and force a reboot. Only a PIN closes this (team board X15).
  - **Without a PIN, the security key itself offers no real protection** against a malicious web page, because WLED's open file upload lets such a page get around it (team board X22). Moving the key into NVS doesn't change that. The readme's wording that the key can't be obtained is being corrected for RC4.
- **Good practice:** put the controller on a separate (guest/IoT) WiFi network, and don't browse unfamiliar websites on devices in that network, especially within 15 minutes of entering the PIN in WLED's settings pages.
- **Entering the PIN** on the phone page only unlocks that one save (since RC2). Entering it in WLED's own settings pages still unlocks WLED's settings, file upload and file editor for everyone for 15 minutes (team board X16; `wled00/util.cpp:502-508`, `wled00/wled.cpp:190`).
- **The PIN has 4 digits.** WLED waits only 3 s after a wrong try, so it stops casual attempts, not a patient attacker.
- **Never put the key into WLED presets, playlists or `ir.json`.** WLED serves those files to any website. Use the usermod's own schedules for timed relays. WLED presets and timers can still start moods and switch strips.
- **The key protects against web pages,** not against other programs on your network, which can read `GET /home/cfg`. This fits WLED's trusted-network model (section 7.7).
- **The clock can be shifted** by any web page on your network, through WLED's JSON `"time"` value (WLED core, team board X21). That moves schedules and the away window until the next internet time sync.

### 15.6 Files on the device

| File / storage | Content |
|---|---|
| `/hgcfg_wsec.json` (safe-written via `/hgcfg_wsec.json.tmp`) | The usermod's configuration (`home_gadgets.cpp:96`) |
| `/hgstate_wsec.json` | Last relay states (for "power-on: last") |
| NVS `homegadgets` / `key` | The security key |

- **Why separate from `cfg.json`:** WLED's generic usermod settings page can't edit nested lists and would corrupt them (`home_gadgets.cpp:26`).
- **Why the names contain "wsec.json"** (since RC2, team board X20): WLED's file server and file editor then refuse to serve them to other websites. The configuration now shows whether away mode is on (the house is empty) and your schedules. The file upload can still overwrite them without a PIN (section 15.5).
- **Migration:** files from older builds (`/home.json`, `/home.tmp`, `/hgstate.json`) are renamed to the new names at boot (`migrateFiles`, `home_gadgets.cpp:633`). See condition C1 in section 15.7.
- **Backup and restore:** use the phone page's Backup/Restore buttons, which work through `GET /home/cfg` and `POST /home/cfg`. The file editor can't download the protected files any more. A restore includes schedules, away mode and clap control. Back up `cfg.json` and `presets.json` too (Settings → Security & Updates).
- **Partial uploads:** sections missing from an upload keep their current values. `sch` (schedules) and `moods` are complete lists: the uploaded list replaces the old one.

| Key | Content |
|---|---|
| `seg` | `[s1, s2]`: the WLED segment IDs used for LED 1 and LED 2 (default `[0, 1]`) |
| `mic`, `lvl` | Microphone on/off; input level 0-255 |
| `relays[8]` | `n` name, `p` pin, `i` icon (0-15), `al` active-LOW, `keep` stays on, `po` power-on (0 off, 1 on, 2 last), `ao` auto-off minutes |
| `sw[8]` | `p` pin, `t` type (0 dry contact, 1 AC opto), `m` mode (0 toggle, 1 follow), `r` relay index (0-7, or -1 for none), `inv` input is active-HIGH |
| `pir[2]` | `n` name, `p` pin, `en` enabled, `night` night only, `undo`, `hold` seconds, `a` actions |
| `moods` | Custom moods: `id` (100-111), `rep` (the built-in mood it replaces, -1 = own mood), `n` name, `fx` and `pal` (by name), `fxid` and `palid` (fallback IDs), `sx`, `ix`, `c1`-`c3`, `bri`, `col` (3 colours) |
| `sc[6]` | Scenes: `n` name, `a` actions |
| `sch` (up to 8) | Schedules: `n` name, `en` enabled, `d` days (bit 0 = Monday), `t` type (0 clock time, 1 sunrise, 2 sunset), `m` minute of the day (0-1439) or offset (-180..180), `a` actions |
| `away` | `en` on, `rel` relay bitmask (bit i = relay i+1), `from`/`to` minutes of the day, `min`/`max` minutes between toggles (1-720), `mood` (-1 = none), `ms` strip mask 1-3 |
| `clap` | `en` on, `a2` actions for 2 claps, `a3` actions for 3 claps |
| `cap` | Upload only: "save the current look of a strip as a mood" (`strip` 0 = LED 1, 1 = LED 2) |
| `newkey` | Upload only: `true` creates a new security key |

Actions (`a`, `a2`, `a3`) are lists of `[type, target, strips]` (`parseActions`, `home_gadgets.cpp:715`):

| Type | Action | Target |
|---|---|---|
| 1 / 2 / 3 | Relay on / off / toggle | Relay index 0-7 |
| 4 | Apply a mood | Mood ID |
| 5 / 6 | LED strips on / off | none |
| 7 | All relays off | none |

`strips` is a mask: 1 = LED 1, 2 = LED 2, 3 = both (the default).

### 15.7 Review results and open items (29 September 2026)

**Result: PASS for the first flash of RC2.** All reviews were done in this session by reading the code; nothing was run on the board.
- **Security key:** its design, the two leak fixes (X11b, X12) and the move to NVS.
- **The feature patch:**
  - page ↔ firmware field names (every field the page uses matches);
  - security (no new link can switch anything, and presence data is private);
  - correctness (the timing fixes and the schedule weekday mapping);
  - loop cost and memory (under 1 KB of fixed RAM, no heap in the loop).
- **The security layer:** NVS key, local PIN check, key checked before memory allocation, 404 for unknown `/home/...` paths, protected file names, `pinSet`.
- **Two blockers found and fixed before RC2:**
  - the schedule list (Add never showed, and a delete duplicated a schedule);
  - the page's restore dropped schedules, away mode and clap settings.

**Condition C1: fixed in RC3.** In RC2, a failed rename of an old `/home.json` could lose your configuration (only on boards that ran an earlier Home Gadgets build). Since RC3:
- the loader also reads the old names, and skips damaged files;
- old copies are deleted only after a successful save;
- a broken new file is replaced by a valid old one.

**RC4b status: final review PASS; this is now the image to flash** (details at the top of section 15). The RC3b notes below are kept for history; the two small page notes are fixed in RC4b.

**RC3b status (final review: PASS; superseded by RC4b).**
- **Why RC3b exists:** the usermod source changed at 17:56, after the first RC3 image was built (17:54).
- **Rebuilt and verified:** the team rebuilt it as RC3b (17:59:30) and saved the exact sources next to the image (`hg_team\releases\RC3b\src\`).
- **How it was checked:** in this session, by diffing the RC3b source against the reviewed RC2 source. All 11 changes were reviewed items (mood checkboxes, the C1 migration fix, the damaged-file loader, the shared PIN wait, the key-file preference and the only-copy guard) plus two comment lines.
- **Suggestion for the release record:** also record the checksums of the two changed core WLED files and the platform version.
- **Small page notes** (not blocking):
  - "Replace with look of LED 1/2" on a built-in mood doesn't warn when all 12 mood slots are used; the device rejects it and the page then says so.
  - The page says "saved on the device ✓" slightly before the device has actually processed the save.

**Real-time effect preview (in RC4b)**
- **What it does:** the phone page shows the running effect live (about 20 frames per second) over a key-protected WebSocket (`/home/ws?k=KEY`), with up to 2 phones at once. The selected effect's button shows a small live bar. If the stream isn't available, the page falls back to the once-a-second preview.
- **Review in this session: PASS, no blockers.** The key is checked when a phone connects; frames carry only colours; nothing the phone sends is acted on; and it sends only while someone is watching and enough memory is free. The brightness formula matches how the LEDs look.
- **Fixed in RC4b:** a refused 3rd phone could occasionally kick an already-connected viewer. RC4b also adds a small lock around the connection list, closing a very rare crash window (core WLED's own live view still has it).
- **Cosmetic, still open:** the fallback preview looks darker than the live stream at low brightness, and 2D matrices preview their first row only.

**Security reminder (team board X22):**
- Without a settings PIN, WLED's open file upload lets a malicious web page get around the security key.
- With a PIN, WLED's own 15-minute unlock after you enter it is a short window of the same exposure. That's core WLED design.
- So: set a PIN, and consider a separate WiFi network for the controller.
- Proposed for RC4: corrected readme wording, and stronger handling while no PIN is set (for example, not revealing the key or enabling relay automations until one is set).

**Small notes (not blocking):**
- Fixed in RC3:
  - the old key file now wins over an old configuration key;
  - the phone page and WLED's settings pages share one PIN retry wait;
  - the correct PIN works right after boot.
- After going back to an older Home Gadgets build and upgrading again, settings changed under the older build are discarded.
- On 2D LED setups, the live preview only samples the first matrix row.
- Names with accents or emoji are cut at 23 *bytes*. Since RC2 that no longer produces a broken character.
- The stats page dims "future" half-hours by the phone's clock, not the device's.

**Still open outside the usermod**
- The core WLED bugs H1-H4 (section 12) also affect this build. Draft fixes are reviewed and waiting for your AGENTS.md "yes".
- Hardware checks to do:
  - Boot with the wall switches on GPIO 5 and 15 in the ON position.
  - Check the opto modules' supply and pull-ups.
  - Watch for false PIR triggers on GPIO 39 while the mic is active.

**Before you connect mains appliances**
1. Set a settings PIN (Settings → Security & Updates).
2. Back up `cfg.json` and `presets.json` (Settings → Security & Updates), and the Home Gadgets configuration (phone page → Backup).
3. Test on a bench (no mains) first. This matters especially for the core-fix tests (H1, H3, H4).

**Decisions for you** (the full list is in section 8 of `TEAM_BOARD.md`)
- Should the core bug fixes (H1-H4, Candle Multi, Flow) be made? The session that makes them needs your AGENTS.md "yes".
- Which further UX ideas from the prototype session should be added?
