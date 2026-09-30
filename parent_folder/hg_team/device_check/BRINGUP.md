# Home Gadgets: first flash and hardware bring-up

A step-by-step guide for the first flash and first power-up of the Home Gadgets controller:
an ESP32 38-pin DevKitC (WROOM-32, 4 MB, no PSRAM) running WLED with the `home_gadgets` usermod.
It drives 8 mains relays and reads 8 mains wall switches (through AC opto modules), 2 PIR sensors,
2 LED strips and a MAX4466 microphone.

> **Status (29 Sep 2026):** nothing in this project has been tested on real hardware yet
> [board §5, review 15]. This guide was written from the source files and documents, not on a device.
> Use it as a checklist and write down what you actually see.

**How facts are marked**

| Mark | Meaning |
|---|---|
| [readme] | `WLED-main/usermods/home_gadgets/readme.md` |
| [board §N] | `Downloads/WLED-main/TEAM_BOARD.md`, section N |
| [review N.N] | `Downloads/WLED-main/WLED_ESP32_Review.md`, section N.N |
| [code: file:line] | read in the source. Line numbers are from the 29 Sep 17:00 version and drift as the code changes |
| [page] | the `/home` web page source `home.htm` (it is being changed while this guide is written) |
| **(unverified)** | my own inference or general practice, not stated in the files above |

---

## Contents

1. [What you need](#1-what-you-need)
2. [Before flashing](#2-before-flashing)
3. [Mains safety](#3-mains-safety)
4. [Stage 1: USB only](#4-stage-1-usb-only)
5. [Stage 2: low voltage, no mains](#5-stage-2-low-voltage-no-mains)
6. [Stage 3: mains](#6-stage-3-mains)
7. [Per-channel test tables](#7-per-channel-test-tables)
8. [Security key and Siri](#8-security-key-and-siri)
9. [Running hg_check.js](#9-running-hg_checkjs)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What you need

| Part | Detail | Source |
|---|---|---|
| ESP32 DevKitC, 38 pins | WROOM-32, 4 MB flash, no PSRAM | [board §1] |
| Relay board, 8 channels, 5 V | Remove the JD-VCC jumper. VCC to ESP32 3.3 V; JD-VCC and its GND to a **separate 5 V supply of at least 1 A** | [readme] |
| 8 AC opto-isolator input modules | One per wall switch. Logic side powered from **3.3 V** | [readme] |
| Resistors and capacitors | 1 kΩ in series with each wall switch input; 100 nF to GND for long cables; 10 kΩ to 3.3 V on GPIO 35 if its module has no pull-up; 330 Ω in each LED data line | [readme] |
| 2 PIR modules (HC-SR501) | VCC 5 V, output 3.3 V | [readme] |
| MAX4466 microphone | Powered from 3.3 V, OUT to GPIO 36 | [readme] |
| LED strips and supply | Own 5 V supply sized for the LEDs, common GND with the ESP32 | [readme] |
| PC with Node.js 18 or newer | For `hg_check.js` (no packages needed) | this folder |
| Multimeter | To check module output voltages before connecting them **(unverified: my recommendation)** | |

### 1.1 Check your exact board before flashing

The firmware is built for a **classic ESP32 38-pin DevKitC-style board with an ESP32-WROOM-32 / 32D / 32E / 32UE module** (4 MB flash, no PSRAM), env `home_gadgets` → `esp32dev_V4` (`board = esp32dev`) [platformio.ini:750-763]. Every GPIO in the pin map (board §4) is on the 38-pin header.

1. **Read the metal shield on the module.**
   - `ESP32-WROOM-32…` → correct.
   - `ESP32-WROVER…` → **stop and tell the builder tab.** WROVER modules have PSRAM, and WLED then refuses GPIO 16 and 17 [code: wled00/pin_manager.cpp:292-298], which are the two LED data pins. The pin map and build env would need changing.
2. **Find the board's COM port.** Plug the board in with a USB **data** cable. Device Manager → Ports (COM & LPT) shows a NEW entry such as `Silicon Labs CP210x USB to UART Bridge (COMx)` or `USB-SERIAL CH340 (COMx)`. Use that number.
   - **Not** `Standard Serial over Bluetooth link`: on this PC, COM5 and COM6 are Bluetooth ports, not the ESP32 (checked 18:50). The `COM5` in the examples below is only a placeholder.
   - No new port appears? Install the CP210x or CH340 driver, or try another cable (many are charge-only).
3. **Optional read-only check of chip and flash size** (writes nothing):
   ```powershell
   & "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m esptool --port COMx flash_id
   ```
   Expect `Chip is ESP32-D0WD…` (the classic ESP32) and `Detected flash size: 4MB`. With 8 or 16 MB the firmware still works; less than 4 MB won't fit.

---

## 2. Before flashing

### 2.1 Back up

1. Open the WLED page of the device, **Settings → Security & Updates**.
2. Download **Backup presets** and **Backup configuration** [review 2.4].
3. If an earlier `home_gadgets` build already ran on this board: also save the usermod settings. The backup buttons don't include them.
   - Use **Settings → Backup** on the `/home` page (it downloads the settings via `GET /home/cfg`), or download `/home.json` from the file editor (`http://<device>/edit`), which exists only on builds before RC2.
   - RC3b moves old files to new names on first boot, safely (C1 fix) [board X20, C1].
4. **Write down the WiFi name and password.**
   - WLED keeps passwords in `wsec.json`, and the backup buttons only cover `cfg.json` and `presets.json` [review 10.2, 15.6].
   - You need the password on the first boot (section 4) and after a factory reset.

### 2.2 Who builds and flashes

- **The builder tab (`wled-main-ad`) builds and flashes.** It owns the usermod, `platformio_override.ini` and the build lock [board §2, §3].
- **Flash the reviewed release image, not a fresh build.** Use the folder `hg_team\releases\RC5\` (the current reviewed release; `RC4b\` is the fallback) [board §7]:
  ```powershell
  cd C:\Users\DigvijayPatilLM\Downloads\WLED-main\hg_team\releases\RC5
  .\flash.ps1 COMx        # your ESP32's COM port from section 1.1 (NOT the Bluetooth COM5/COM6)
  ```
  - The script checks every image against `MANIFEST.txt` before writing.
  - It writes bootloader, partitions, boot_app0 and firmware **without erasing**, so WiFi, LED settings, presets and the key are kept.
  - `.\flash.ps1 COM5 -Erase` wipes the whole chip first. It lists what will be lost and asks you to type YES. Use it only for a truly clean start, after the backups in 2.1.
  - If "Connecting..." hangs, hold the board's BOOT button.
  - If Windows refuses to run the script (execution policy): `powershell -ExecutionPolicy Bypass -File .\flash.ps1 COM5`.
  - If writing fails at the default 460800 baud (some CH340/CP210x adapters), ask the builder tab for a lower baud rate (e.g. 115200).
- **Do not use `pio run -e home_gadgets -t upload` for this.** It rebuilds from the current sources, which may already contain unreleased, unreviewed changes for the next release.
  - The environment `home_gadgets` is defined in `WLED-main/platformio_override.ini`. It extends `esp32dev_V4`, adds the usermods `audioreactive home_gadgets`, and sets `-D SR_DMTYPE=0 -D AUDIOPIN=36` (a copy is in `RC5\src\`).
- Write down who flashed and when: ______________________

### 2.3 Flash the right firmware

- **Flash RC5.** It is the reviewed release (wled-main-84: PASS at about 19:10; core fixes confirmed in the disassembly) and replaces RC4b, RC3b and older [board §7, `RC5\MANIFEST.txt`]. RC5 = RC4b plus the reviewed core WLED fixes (segments, offsets, current limiter, failed-output cleanup, effect crash fixes, the presets-file fix, Gradient/Rain/Scanner Dual). Visible changes: the Gradient band is about half as wide at the same setting; a failed LED output shows an empty pin field. `hg_check.js` shows `fw.rel` = "RC5".
- Builds from 16:43 and 17:01 are outdated: the key leaked through `/home.json` (X11). Don't flash them.
- In RC5 (as in RC4b and RC3b):
  - The **key lives in the chip's NVS storage** (X15), not in a file.
  - The usermod's config files have `*_wsec.json` names, which WLED refuses to serve to web pages or in `/edit` (X20).
- **Set a WLED settings PIN right after the first boot** (Settings → Security & Updates). Without one, any web page on your network could still upload files to the device (X15); the `/home` page shows a warning bar until you set one.
- After flashing, `hg_check.js` checks the leak paths (the `sec.leak ...` rows in section 9).

---

## 3. Mains safety

> **MAINS VOLTAGE CAN KILL. Read this box before stage 3.**
>
> - **Never connect mains to the ESP32.** Every wall switch goes through its own AC opto-isolator module [readme].
> - Power the modules' logic side from **3.3 V**. A module pulled up to 5 V would damage the ESP32 [readme].
> - **Mains wiring must be done by a qualified electrician**, fused, and in a closed enclosure [readme].
> - Inductive loads (pumps, motors, air conditioning) may need a contactor or SSR [readme].
> - Check that each relay's contact rating (printed on the relay) covers the appliance it switches **(unverified: general practice, not in the project files)**.
> - Relays get their own 5 V supply. Don't power them from the ESP32's USB 5 V pin [readme].
> - Only touch the low-voltage side while mains is disconnected **(unverified: general practice)**.

---

## 4. Stage 1: USB only

**Setup:** the ESP32 on USB only. No relay supply, no mains, no modules on the pins.

1. **Flash.** The builder tab flashes the board (section 2.2).
2. **Connect to WiFi.**
   - On the first boot, join the WiFi **WLED-AP** (password `wled1234`).
   - Open **http://4.3.2.1** and enter your home WiFi [review 2.3, readme].
   - The device's address then comes from your router's device list. `http://wled-xxxxxx.local` also works, where `xxxxxx` is the end of the MAC address [review 2.3].
3. **Fix the IP address.** Reserve it in the router (DHCP reservation), so the links and Siri shortcuts keep working [readme].
4. **Set up the LED outputs.** In **LED Preferences**:
   - Add two outputs, **GPIO 16** and **GPIO 17**, and tick **"Make a segment for each output"**. LED 1 = segment 0, LED 2 = segment 1 [readme].
   - Set the current limiter to your LED supply [readme]. The default is 850 mA [review 5.5].
5. **Enable the microphone.** In **Settings → Usermods**, enable **AudioReactive** with the analog mic on GPIO 36 [readme]. It is off by default [review 9.4].
6. **Set a settings PIN** (4 digits) in **Settings → Security & Updates** [readme: "recommended"; review 7.2].
   - Without a PIN, WLED's file editor and file upload accept requests from any web page on your network.
   - `hg_check.js` reports this as `sec.edit-open` (section 9).
7. **Find the key.** Wait at least 5 s after boot, then open `http://<device-ip>/home` → **Settings** tab → **Voice control (Siri)** → **Security key** [page; key timing: code: home_gadgets.cpp:67, 1058].
8. **Run the checker** (read-only by default, section 9):

   ```
   node hg_check.js --host <device-ip> --key <key>
   ```

   - Expected: **no FAIL**.
   - At this stage `pins.leds`, `live.led2`, `pins.mic` or `live.mic` may still show WARN if steps 4-5 are not done.
   - A default run sends two "toggle relay 1" requests that a correct firmware refuses with 403. Running it first in stage 1 means even a faulty firmware can't switch a mains load.
9. **Test the BOOT button** (it is safe now; see table 7.6):
   - A short press switches the LEDs on or off.
   - Holding it 5-10 s opens the access point **WLED-AP**.
   - **Never hold it longer than 10 s**: that is a factory reset.

---

## 5. Stage 2: low voltage, no mains

**Setup:**
- ESP32 on USB.
- Relay board on its own 5 V supply, with **no load wired to the contacts**.
- LED strips on their supply.
- PIRs on 5 V.
- Opto modules powered on the logic side only. Their AC side stays **disconnected**.

### 5.1 Check the opto module outputs before you connect them

1. Power a module's logic side from 3.3 V and measure OUT to GND. It must not be above 3.3 V [readme, board §4] **(the measurement method is unverified)**.
2. Connect each module OUT to its GPIO through 1 kΩ (table 7.1). Add 100 nF to GND for long cables [readme].
3. **GPIO 35** has no internal pull-up. The module's own pull-up (at 3.3 V) or a 10 kΩ resistor to 3.3 V is required [readme].
4. Open `/home` → **Wiring** tab. Each switch has a live dot [page].
   - With no mains on the modules, all 8 switch dots should be off.
   - `hg_check` shows `wall switches 00000000` in `live.shape`.
   - A dot that is on or flickers without mains points to a missing pull-up or a wiring fault **(unverified: derived from the code, where "on" = input LOW or a pulse within 60 ms, home_gadgets.cpp:1007-1009)**.

### 5.2 Relays click, one at a time

- The relays should **not** click when the ESP32 powers up. The code writes the "off" level before a pin becomes an output [review 15.3; code: home_gadgets.cpp:888-900].
- Test each relay with the **Test** button on the Wiring tab (it toggles the relay) [page], or with the checker, which also puts the relay back:

  ```
  node hg_check.js --host <ip> --key <key> --allow-switching --relay 1
  ```

- Fill in table 7.2.

### 5.3 Boot test with the strapping pins pulled to "ON" (low-voltage version)

GPIO 5 and GPIO 15 are ESP32 strapping pins:
- According to the datasheet, they only affect the boot log (15) and SDIO timing (5), not the boot mode.
- So a switch that is ON at power-up should not stop the board booting.
- This has not been tested on hardware [board §4, readme].

The switch inputs are "active LOW" by default ("Signal LOW = on" on the Wiring tab [page]; code: home_gadgets.cpp:915, 1007). This imitates a switched-on module without mains **(unverified simulation)**:

1. Unplug USB and the relay supply.
2. Connect the **module side** of the 1 kΩ resistors of **switch 6 (GPIO 5)** and **switch 7 (GPIO 15)** to GND with a jumper wire.
3. Power up. The board must boot: `/home` opens, and `hg_check` shows a small uptime in `info.uptime`.
   - GPIO 15 sets the boot-log output [board §4], so the serial boot log may stay silent while it is LOW. That is not a failure **(unverified: which level silences the log is not in the project files)**.
4. Remove the jumper wires.
5. Repeat the real test in stage 3 (section 6.2).

If it doesn't boot, see section 10.4.

### 5.4 PIR sensors, microphone and LED strips

- Work through tables 7.3, 7.4 and 7.5.
- Run the full check again: `node hg_check.js --host <ip> --key <key>`.

---

## 6. Stage 3: mains

### 6.1 Wiring by the electrician

- The electrician connects the appliances to the relay contacts and the wall switches to the AC side of the opto modules. Everything is fused and in a closed enclosure [readme].
- Before the first power-up with mains, **stage 2 must have ended without FAIL**. That includes all `sec.*` rows.

### 6.2 Boot test with the real wall switches ON

1. Switch everything off: USB, relay supply and mains.
2. Set wall switches **6 (GPIO 5)** and **7 (GPIO 15)** to **ON**.
3. Switch the power on. The board must boot, and `/home` must open [board §8 decision 3, review 15.7].
4. What should happen:
   - For 1 s after boot, the inputs are read but switch nothing [code: home_gadgets.cpp:62, 1019; review 15.4].
   - So a switch that is already ON at boot should not toggle its relay **(unverified on hardware)**.
   - Relays whose power-on state is "Off" (the default) stay off [review 15.4].
5. Record the result: boots yes / no: ______

If it doesn't boot, see section 10.4.

### 6.3 Channel tests with loads

1. Flip each wall switch and check its relay and appliance (table 7.1, stage-3 column).
   - In the default "Toggle on every flip" mode, **every flip** changes the relay [readme].
2. Run the relay test once per channel, with someone watching the appliance:

   ```
   node hg_check.js --host <ip> --key <key> --allow-switching --relay N
   ```

   - The checker prints what it will do and waits 3 s, so you can press Ctrl+C.
   - It switches the relay for about 2 s, puts it back, and verifies that.

---

## 7. Per-channel test tables

These are the default pins [board §4, code: home_gadgets.cpp:84-86]. Pins can be changed on the Wiring tab. If you change them, `hg_check` reports the difference (`cfg.pin-map`, `pins.*`).

### 7.1 Wall switches → relays

Default for every switch [code: home_gadgets.cpp:399-410]:
- type "Mains switch (AC module)"
- mode "Toggle on every flip"
- switch N controls relay N

| Switch | GPIO | Relay (GPIO) | Pin notes | Stage 2 (no mains): dot off | Stage 3: flip toggles the relay |
|---|---|---|---|---|---|
| 1 | 14 | 1 (4) | Outputs a signal during boot; the 1 kΩ protects both sides [review 15.3] | ☐ | ☐ |
| 2 | 32 | 2 (13) | | ☐ | ☐ |
| 3 | 33 | 3 (18) | | ☐ | ☐ |
| 4 | 21 | 4 (19) | I2C pin, so no I2C devices [readme] | ☐ | ☐ |
| 5 | 22 | 5 (23) | I2C pin, so no I2C devices [readme] | ☐ | ☐ |
| 6 | 5 | 6 (25) | **Strapping pin**: boot test 5.3 / 6.2 [board §4] | ☐ | ☐ |
| 7 | 15 | 7 (26) | **Strapping pin**, outputs a signal during boot: boot test 5.3 / 6.2 [board §4, review 15.3] | ☐ | ☐ |
| 8 | 35 | 8 (27) | Input only, **no internal pull-up**: module pull-up or 10 kΩ to 3.3 V [readme] | ☐ | ☐ |

Where to look:
- the live dot on the Wiring tab [page]
- `sw` in `/home/live`
- the `live.shape` row of `hg_check`

### 7.2 Relays

Relay defaults:
- active LOW (most 5 V boards), power-on state "Off", no auto-off [review 15.3, 15.4]
- relay N is the Nth entry in `/home/live` → `r`

| Relay | GPIO | Clicks with Test / `--relay N` | Stays quiet at power-up | Load switches (stage 3) |
|---|---|---|---|---|
| 1 | 4 | ☐ | ☐ | ☐ |
| 2 | 13 | ☐ | ☐ | ☐ |
| 3 | 18 | ☐ | ☐ | ☐ |
| 4 | 19 | ☐ | ☐ | ☐ |
| 5 | 23 | ☐ | ☐ | ☐ |
| 6 | 25 | ☐ | ☐ | ☐ |
| 7 | 26 | ☐ | ☐ | ☐ |
| 8 | 27 | ☐ | ☐ | ☐ |

None of the relay pins is a strapping pin [board §4]. If a relay is on when it should be off, check its "Active LOW / Active HIGH" setting on the Wiring tab [page].

### 7.3 PIR sensors

| PIR | GPIO | Default action on motion | Pin notes | Motion dot | Action runs | Turns back off after hold |
|---|---|---|---|---|---|---|
| 1 | 34 | Mood "Calm" on LED 1 | Input only, no internal pull resistor [review 5.2] | ☐ | ☐ | ☐ |
| 2 | 39 | Mood "Midnight" on LED 2 | **Next to the mic on 36**, see below | ☐ | ☐ | ☐ |

The defaults are: enabled, hold 60 s, "turn things back off" on [code: home_gadgets.cpp:411-427].

**GPIO 36/39 note:**
- While the ADC samples the mic on 36, the ESP32 errata cause short false LOW pulses on 39.
- The PIR idles LOW and is polled with a 50 ms debounce, so these glitches should be harmless [board §4, readme].
- Still to be checked on hardware [review 15.7]:
  - Leave the room empty for about 10 minutes, with the mic on and a sound mood playing.
  - PIR 2 must not trigger. Watch the Automations tab: it shows "Motion detected" or "Timer running" [page].

**"Only at night" note:**
- With this option, a sensor reacts only between sunset and sunrise. Motion still shows in the status, but the actions don't run [code: home_gadgets.cpp:1037].
- Sunrise and sunset need your location in **Time & Macros** [readme].
- Without a location, it always counts as night [review 15.4; code: home_gadgets.cpp:266-269].
- Test night-only sensors **at night**, or switch the option off for the daytime test.

The HC-SR501 may need a warm-up time after power-on and may trigger once while it settles **(unverified: general module behaviour)**.

### 7.4 Microphone (MAX4466)

| Step | Expected | Result |
|---|---|---|
| AudioReactive enabled, analog mic on GPIO 36 (Settings → Usermods) [readme] | `hg_check`: `pins.mic` PASS (owner AudioReactive) | ☐ |
| Quiet room | `live.mic` shows a low sound level | ☐ |
| Speak or clap near the mic | the level (`vol` in `/home/live`, 0-255) goes up [code: home_gadgets.cpp:1334-1340] | ☐ |
| Play a sound mood (Pub Vibes 0, Disco 3, Bass Drop 4, Chill Lounge 5, Gaming 16) [review 15.4] | the LEDs react to music | ☐ |

- `vol = -1` means AudioReactive is not active [code: home_gadgets.cpp:1335-1339].
- Mic on/off and sensitivity are in the `/home` Settings tab [readme].

### 7.5 LED strips

| Strip | GPIO | WLED segment | Check | Result |
|---|---|---|---|---|
| LED 1 | 16 | 0 | On/off and one mood for "LED 1" only on the Home or Moods tab; only this strip changes | ☐ |
| LED 2 | 17 | 1 | Same for "LED 2" | ☐ |
| Both | | | A mood for "Both" changes both strips | ☐ |

- Wiring: 330 Ω in each data line, own 5 V supply, common GND [readme].
- `hg_check`: `pins.leds` (both pins owned by "LED Digital") and `live.led1` / `live.led2` (segment exists).

### 7.6 BOOT button (GPIO 0)

| Action | Result | Source |
|---|---|---|
| Short press | LEDs on/off | [review 5.7] |
| Long press | Random colour | [review 5.7] |
| Hold **5-10 s** | Opens the WiFi access point WLED-AP | [board §4, review 5.7] |
| Hold **more than 10 s** | **Factory reset: the file system is formatted** | [board §4, review 5.7, 11] |

After a factory reset (RC3b and later):
- The usermod's config files are gone, together with WLED presets and settings. Restore the backups from section 2.1.
- The **security key survives**: it lives in NVS, which a factory reset does not erase. Siri shortcuts keep working [readme, board X15].
- If you reset because the key may have leaked, use **Make a new key** on the `/home` page afterwards, then update every Siri shortcut [readme N-d].

---

## 8. Security key and Siri

### 8.1 Why there is a key

- WLED lets web pages from any site talk to it, and its API has no password [readme].
- Everything that can switch a relay therefore needs the device's security key [readme, code: home_gadgets.cpp:1351-1356]:
  - every `/home/api` link
  - saving the configuration
  - relay, scene and all-off commands in the JSON API
- LED-only JSON commands (moods, strips, microphone) stay open, like the rest of WLED [readme].
- **What the key protects against:** other web sites using the relay API.
- **What it doesn't cover:**
  - Programs on your own network can still read the key from `GET /home/cfg`, which has no password [review 15.5].
  - **Without a WLED settings PIN, any web page can upload files to the device** (for example, relay settings) and reboot it. **The settings PIN is the real protection**; set it right after the first boot [board X15, readme].

### 8.2 Where to find it

- `http://<device-ip>/home` → **Settings** tab → **Voice control (Siri)** → **Security key** card [page].
- The same card lists ready-made links for each relay (on and off), each mood, each scene that has actions, and "Everything off" [page].
- The key is created about 5 s after the first boot. If the page says it is "being created", reload [page, code: home_gadgets.cpp:67].
- **Make a new key** replaces it. All existing shortcuts then stop working until you update their links [readme].

### 8.3 Link format

`http://<device-ip>/home/api?<command>&k=<KEY>` [readme, code: home_gadgets.cpp:1344-1383]

| Command | Meaning |
|---|---|
| `relay=N&on=1` / `on=0` / `on=t` | relay N on / off / toggle. **N = 1-8** (1-based) |
| `scene=N` | run scene N. **N = 1-6** (1-based) |
| `mood=ID&strip=1\|2\|3` | mood by **ID**: 0-17 built-in, 100-111 your own. strip 1 = LED 1, 2 = LED 2, 3 = both |
| `strip=1\|2\|3&on=0\|1` | LED strip off / on |
| `alloff=1` | all relays off, except the ones marked "stays on" |

- A missing or wrong key returns HTTP 403 [readme].
- Built-in mood IDs: 0 Pub Vibes, 1 Calm, 2 Midnight, 3 Disco, 4 Bass Drop, 5 Chill Lounge, 6 Cozy Fire, 7 Candlelight, 8 Ocean, 9 Northern Lights, 10 Reading, 11 Wake Up, 12 Away, 13 Romantic, 14 Rainy Day, 15 Festival Sparkle, 16 Gaming, 17 Spring Bloom [readme].

### 8.4 Siri Shortcuts: one shortcut per phrase

The steps come from [readme]:
1. iPhone: **Shortcuts** app → **+** → **Add Action** → **Get Contents of URL**.
2. Paste the link from the Voice control card.
3. Name the shortcut **exactly as you will say it**. The phone must be on the home WiFi.

The spoken phrase never contains the key. The key only goes into the shortcut's URL [board §8].

Example (assuming relay 1 is the light, relay 2 the lamp, relay 3 "lamp1"):

| You say "Hey Siri, …" | Shortcut name | URL |
|---|---|---|
| turn on light | Turn on light | `http://192.168.1.50/home/api?relay=1&on=1&k=KEY` |
| turn off light | Turn off light | `http://192.168.1.50/home/api?relay=1&on=0&k=KEY` |
| turn on lamp | Turn on lamp | `http://192.168.1.50/home/api?relay=2&on=1&k=KEY` |
| turn on lamp1 | Turn on lamp1 | `http://192.168.1.50/home/api?relay=3&on=1&k=KEY` |
| party time | Party time | `http://192.168.1.50/home/api?scene=1&k=KEY` (scene 1 is "Party" by default [review 15.4]) |

- Siri may hear "lamp1" as "lamp one". If the shortcut doesn't start, rename it to what Siri writes, or add a second shortcut **(unverified)**.
- Google Assistant can't open local links by itself; use Home Assistant or the WLED app on Android [readme].

> **Never put the key into WLED presets, playlists or `ir.json`** [readme].
> WLED serves those files to any web site, which would publish the key [board §6 X12].
> `hg_check.js` searches `/presets.json` and `/ir.json` for the key.
>
> **Timed relays:** the readme says to use "the schedules of this usermod", but the usermod has no schedule feature yet (the 17:00 code has none; the decision is still open, [board §8 item 5]).
> Until then, don't try to build timed relays with WLED timers or presets.

---

## 9. Running hg_check.js

### 9.1 Requirements and commands

- Node.js 18 or newer, nothing else (no `npm install`). Copy `hg_check.js` to any PC on the same network.
- `hg_check.js` 1.1.0 expects **RC3b** (`hg_team/releases/RC3b/`). Its expectations come from `RC3b/src/home_gadgets.cpp`. On an older build, the RC3b rows below FAIL or WARN.
- Commands:

```
node hg_check.js --host 192.168.1.50                         # read-only, key taken from /home/cfg
node hg_check.js --host 192.168.1.50 --key abcd2345xy        # also checks that your key matches
node hg_check.js --host 192.168.1.50 --key abcd2345xy --pin 1234   # plus: a PIN without the key is refused
node hg_check.js --host 192.168.1.50 --key abcd2345xy --allow-switching --relay 3   # SWITCHES relay 3
node hg_check.js --host 192.168.1.50 --passive               # strictly read-only
node hg_check.js --host 192.168.1.50 --json > result.json    # machine-readable
```

- **Exit code:** 0 = no FAIL, 1 = at least one FAIL (or device unreachable), 2 = wrong command line.
- Every request has a 5 s timeout (`--timeout MS` changes it). An unreachable device gives one clear FAIL line.
- The key is never printed in full (`ab********`).

### 9.2 What a default run does

- It sends read-only requests.
- It also sends these requests, which a correct firmware refuses with HTTP 403 before doing anything:
  - `GET /home/api?relay=1&on=t` without a key, and with a wrong key. Relay 1 is read from `/home/live` before and after, and a change is a loud FAIL.
  - `POST /home/cfg` with the body `{}`, without a key and with a wrong key (and with only `--pin`). The config revision must not change.
- `--passive` skips these requests too.
- The RC3b checks add only GET requests: `/home/xyz-unknown`, `/home/stats`, and file-editor reads (`func=edit` / `func=download`) of the protected file names. A default run never deletes, uploads or switches anything.

### 9.3 The switching test (`--allow-switching --relay N`)

Only with this option does the checker switch a relay. It:
1. prints the plan and waits 3 s (Ctrl+C aborts)
2. switches relay N with `/home/api` and the key, and holds it about 2 s
3. sends the opposite command through `/json/state` **without** the key, which the device must ignore
4. switches it back through `/json/state` **with** the key (falling back to `/home/api` if needed)
5. verifies the original state in `/home/live`

A `switch.restore` FAIL means the relay is **not** in its original state: switch it by hand on `/home` right away.

### 9.4 What it checks

| Group | Rows | Checks |
|---|---|---|
| Device | `reach`, `info.*`, `usermod` | WLED version, V4 build, free heap (WARN < 30 KB), uptime, WiFi signal, usermod present and enabled |
| Firmware build | `fw.build`, `fw.page`, `fw.rc3b` | `/json/info` version fields (INFO only: `vid` is WLED's fixed build number and says nothing about the RC); the `/home` page ETag (`"hg-9c054055c6e7"` = RC3/RC3b page, `"hg-736a2c90fd05"` = RC2); a summary of all RC3b rows. **RC3 and RC3b can't be told apart over the network** |
| Page and config | `home.page`, `home.unknown`, `cfg.*`, `live.*`, `stats.shape`, `state` | `/home` = 200 (gzip); `/home/xyz-unknown` = 404 (X17); `/home/cfg` has 8 relays, 8 switches, 2 PIRs, 6 scenes, **23 built-in moods**; pin errors (e=1/2); pins against the board map (unchanged in RC3b); `/home/live` shape plus `src[8]` (0-11), `ago[8]`, `away`, `clap`, `ts`, `px` (2 × null or 16 hex colours); `/home/stats` = `{ts, on[8], pir[2][48]}`; LED segments; mic level |
| Settings PIN | `sec.pin-set`, `cfg.pin` | `pinSet` in `/home/cfg` is a JSON boolean. `false` gives a WARN row and a `!!!` line under the summary |
| Presence data | `sec.live-cors`, `sec.stats-cors` | `/home/live` and `/home/stats` have no `Access-Control-Allow-Origin` header (X13) |
| Effects | `fx.lists`, `fx.moods` | `/json/eff` and `/json/fxdata` have the same length; every mood's effect exists |
| Pins | `pins.*` | owners in `/json/pins` against [board §4]: relays, switches and PIRs = home_gadgets (59), mic 36 = AudioReactive (32), LEDs 16/17 = LED Digital, button 0 = Button |
| Key | `sec.key`, `sec.key-match`, `sec.cfg-cors` | key format; `--key` = device key; `/home/cfg` without `Access-Control-Allow-Origin` |
| Key leaks and file names | `sec.leak ...`, `sec.edit-list`, `sec.edit-open` | the key is in no body: `/home.json`, `/home.tmp`, `/hgwsec.json(.tmp)`, `/hgcfg_wsec.json(.tmp)`, `/hgstate_wsec.json`, `/edit` reads of them, `/presets.json`, `/ir.json`, `/hgstate.json`, `/cfg.json`, `/json`, `/json/cfg`, `/home/live`.<br>The RC3b files (`/hgcfg_wsec.json`, `.tmp`, `/hgstate_wsec.json`) are never served: direct GET 404/403, file editor 403, 404 or 401.<br>Old files (`/home.json`, `/home.tmp`, `/hgstate.json`) should be gone (404). The key now lives in NVS, so `/hgwsec.json` should be gone too (file editor 404).<br>The file list hides `*wsec*`, and the file editor is PIN-locked |
| Refusals | `sec.api-*`, `sec.cfg-*`, `sec.json-nokey` | 403 without or with a wrong key; relay 1 and the config unchanged; your key is accepted (a key-only request gives 400, which switches nothing) |
| Information | `open.read`, `open.write`, `fs.files` | what answers without a key (by design) |

### 9.5 Reading the results

- **FAIL:** must be fixed. **Don't connect mains while any FAIL is shown.**
- **WARN:** check it; often a setting that is still missing.
- **SKIP:** not tested, and the line says why.
- **INFO:** facts for your notes.

| FAIL row | Meaning | What to do |
|---|---|---|
| `reach` | device not reachable, or it stopped answering | Power, WiFi, IP address (router list). In AP mode use WLED-AP / 4.3.2.1 |
| `usermod` | firmware without home_gadgets, or the usermod is disabled | Settings → Usermods → HomeGadgets enabled; otherwise ask the builder which firmware was flashed |
| `sec.cfg-cors` | `/home/cfg` can be read by any web page | Firmware problem: tell the builder, no mains |
| `sec.key`, `sec.key-match` | no key, a wrong format, or your `--key` is outdated | Wait 5 s after boot. After "Make a new key" or a factory reset, copy the new links |
| `sec.leak ...`, `sec.edit-list` | **the key can be read by other web sites** | No mains. Tell the builder (X11/X11b/X12). After the fix, press **Make a new key**, because the old one was exposed **(unverified: my recommendation)** |
| `sec.api-nokey`, `sec.api-wrongkey`, `sec.json-nokey`, `sec.cfg-*` | a request without the right key was accepted | Firmware problem: no mains. If relay 1 changed, switch it back on `/home` |
| `cfg.pin-errors`, `pins.*` | a pin is invalid, used twice, or owned by something else | Section 10.1 |
| `cfg.shape`, `live.shape`, `state` | the device answers in an unexpected format | The page and firmware don't match: tell the builder |
| `home.unknown`, `sec.pin-set`, `live.fields`, `stats.shape` | an RC3b feature is missing (X17 404, `pinSet`, contract v2.1 live fields, `/home/stats`) | The device isn't running RC3b: check which image was flashed (`fw.page`) |
| `sec.live-cors`, `sec.stats-cors` | any web page can read when someone is home (X13) | Firmware problem: tell the builder |
| `sec.leak /hg*_wsec.json`, `sec.leak edit hg*_wsec` | the configuration or relay-state file is served (X20) | Firmware problem: tell the builder |
| `fx.lists` | `/json/eff` and `/json/fxdata` differ in length | Firmware problem, tell the builder |
| `switch.api`, `switch.json-key` | the relay didn't follow a command | Relay supply, wiring, active LOW/HIGH (table 7.2) |
| `switch.restore` | **the relay is not back in its original state** | Switch it by hand on `/home` now |

| Common WARN | Meaning |
|---|---|
| `pins.leds`, `live.led2` | the second LED output or segment is not set up (step 4 in stage 1) |
| `pins.mic`, `live.mic` | AudioReactive is not enabled (step 5 in stage 1) |
| `sec.pin-set` | **No WLED settings PIN**: any web page on your network can upload files to this device. Set one in Settings → Security & Updates (X15). Also printed as a `!!!` line under the summary |
| `sec.edit-open` | no settings PIN (or it is unlocked for 15 min after anyone entered it [review 7.2]): the file editor and upload are open to any web page |
| `sec.leak /home.json`, `/home.tmp`, `/hgstate.json` (and their `edit` rows) | a file of an earlier version still exists: the RC3b migration didn't complete, and any web page can read the file (X20). Reboot once; if it stays, tell the builder |
| `sec.leak edit hgwsec`, `dl hgwsec`, `edit hgwsec.tmp` | the old key file still exists. RC3b deletes it at boot once the key is in NVS, so either the move to NVS failed or the file was uploaded since the last boot. Reboot and check again |
| `fw.page`, `fw.rc3b` | the `/home` page isn't RC3b's, or at least one RC3b row didn't pass: check which image was flashed |
| `cfg.pin-map` | a pin was changed on the Wiring tab; it differs from the board map |
| `info.heap` | free heap below 30 KB |
| `info.build` | the firmware doesn't look like the V4 build that the analog mic needs [review 15.2] |
| `fx.moods` | a mood's effect is missing; that mood falls back to "Solid" [code: home_gadgets.cpp:1153] |

---

## 10. Troubleshooting

### 10.1 Pin allocation errors (`e=1` / `e=2`, `pins.*` FAIL)

- **What you see:**
  - The Wiring tab shows "⚠ GPIO x is already used by …" (`e=2`) or "⚠ GPIO x cannot be used for this" (`e=1`) [page; code: home_gadgets.cpp:128, 895-896].
  - `/json/pins` shows the real owner of every pin [review 5.3].
- **Common causes:**
  - An LED output in LED Preferences is on a relay, switch or PIR pin.
  - AudioReactive was switched to a **digital (I2S) microphone type**. That claims GPIO 14, 15 and 32 (switches 1, 7 and 2) [review 9.4]. With the analog mic it claims only GPIO 36 [board §4].
  - A WLED button, IR receiver or relay is configured on one of these pins (LED Preferences) **(unverified: derived from the owner list in pin_manager.h)**.
  - I2C or SPI pins are set in Settings → Usermods. The UI suggests SDA 21 / SCL 22 and SPI 18/23/19 [review 5.1], which collide with switches 4-5 and relays 3-5.
- **Fix:** clear the conflicting setting, reboot, and run `hg_check` again.

### 10.2 A relay chatters or toggles by itself (AC wall switch inputs)

**How it works:**
- An AC module outputs pulses at mains frequency.
- The input counts as "on" while a pulse arrived within the last 60 ms, with a 100 ms debounce [code: home_gadgets.cpp:59-60, 1009; board §5].
- In toggle mode, **every change of the input toggles the relay** [code: home_gadgets.cpp:1021]. So a flickering input becomes a chattering relay.

**What to check:**
1. The input type on the Wiring tab must be **"Mains switch (AC module)"**, not "Low-voltage contact" [page].
   - The low-voltage type reads the raw level with a 50 ms debounce and ignores the pulse timing [code: home_gadgets.cpp:1008, 1015].
   - Mains pulses then look like fast flips **(unverified: depends on the module's pulse shape)**.
2. **GPIO 35 (switch 8):** without a pull-up, the pin floats. Add 10 kΩ to 3.3 V [readme].
3. **Long cables:** 100 nF from the pin to GND [readme].
4. Watch the switch's live dot on the Wiring tab, with the switch fixed ON and then fixed OFF. It must stay steady.
5. Illuminated wall switches, or dimmers in the same circuit, may pass a small current and make the module pulse irregularly **(unverified)**.
6. **While you debug**, set that switch to "No relay" on the Wiring tab [page]. The input then stops switching anything.

### 10.3 False PIR triggers

1. **PIR 2 (GPIO 39) with the mic running:**
   - The ESP32 errata cause false pulses on 39 while the ADC samples the mic on 36. The 50 ms debounce should filter them [board §4].
   - Test: switch the mic off on `/home` for a while. If the false triggers stop, report it to the builder **(unverified diagnostic)**.
2. **Unconnected or loose PIR:** GPIO 34/39 have no internal pull-up or pull-down [review 5.2]. The code's pull-down setting has no effect there, so an open input floats **(unverified effect)**. Check the wiring, or switch the sensor off on the Automations tab [page].
3. **PIR supply:** HC-SR501 needs 5 V on VCC [readme].
4. **Module settings:** the sensitivity and time potentiometers and the retrigger jumper of the HC-SR501 **(unverified: general module knowledge, not in the project files)**.
5. **Right after boot:** motion during the first second triggers nothing [code: home_gadgets.cpp:1026, 1037]. The module itself may still need a warm-up time **(unverified)**.

### 10.4 The board doesn't boot, or boots in a loop

1. **Look at the serial log.** The builder tab watches it with `pio device monitor -b 115200`, which also decodes crash traces [review 2.3].
   - The log can contain the security key: a crash-loop file dump prints `/hgwsec.json` [review 15.7, board §6 X11b].
   - Don't post the log publicly. If you did, press **Make a new key** **(unverified: my recommendation)**.
2. **Strapping pins:**
   - Disconnect the module outputs from **GPIO 5 and 15**, then power up again.
   - If it now boots, the strapping pins are the cause. Report it to the builder: the pin map belongs to `wled-main-ad` [board §2, §4].
   - GPIO 12 must not be HIGH at power-on (it is not used in this design) [review 5.2].
3. **`CONFLICT! driver_ng` in the log:** the review names the audio usermod as the cause and recommends the `esp32dev_V4` target [review 2.3]. `home_gadgets` already extends `esp32dev_V4` [review 15.2].
4. **Power:**
   - The relays must not be powered from the ESP32's USB 5 V [readme].
   - A voltage dip when several relays switch could reset the board **(unverified)**.
   - After a power cut, relays that should be on are switched on 0.4 s apart to limit inrush current [readme].
5. **Last resort:**
   - Hold BOOT for more than 10 s (factory reset). This formats the file system [review 5.7, 11].
   - Then set up WiFi again, restore the backups from 2.1, and make new Siri links (new key).

### 10.5 A Siri shortcut does nothing, or answers 403

| Symptom | Check |
|---|---|
| 403 | The key changed (Make a new key, factory reset). `hg_check --key <old>` then FAILs `sec.key-match`; copy new links |
| No answer | The phone must be on the home WiFi [readme]. The device IP must be fixed by a DHCP reservation [readme] |
| 400 | Wrong numbers in the link: relay 1-8, scene 1-6, mood ID 0-17 or 100-111 [code: home_gadgets.cpp:1367-1382] |
| Works, but the wrong appliance | Relay numbers are 1-based in links. The JSON API is 0-based [readme] |
