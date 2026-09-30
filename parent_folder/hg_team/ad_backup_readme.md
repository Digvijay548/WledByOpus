# Home Gadgets

Turns a WLED ESP32 into a small home controller, next to the normal LED features:

- **8 relays** for home appliances (active LOW/HIGH, state after power cut, auto-off timer, "stays on" protection)
- **8 wall switches**: existing mains switches through AC opto-isolator modules, or low-voltage contacts
- **2 PIR motion sensors**, each with its own list of up to 8 actions and a "turn back off" timer
- **Moods**: 18 ready-made LED looks (Pub Vibes, Calm, Midnight, ...) for LED 1, LED 2 or both, plus up to 12 of your own
- **Scenes**: one tap runs up to 8 actions (relays + moods)
- A **mobile-friendly page** at `http://<device>/home` and simple links for **Siri Shortcuts**

The WLED LED page (effects, colors, presets) is unchanged. Use it to fine-tune looks, then save them as moods.

> This usermod was written with AI assistance (see the `// AI:` markers in the source).

## Build

ESP32 only. The MAX4466 analog microphone requires the ESP-IDF V4 build (`esp32dev_V4`); analog microphones are not supported in V5 builds.

`platformio_override.ini`:

```ini
[platformio]
default_envs = home_gadgets

[env:home_gadgets]
extends = env:esp32dev_V4
custom_usermods = audioreactive home_gadgets
build_flags = ${env:esp32dev_V4.build_flags}
  -D SR_DMTYPE=0      ; analog microphone
  -D AUDIOPIN=36      ; MAX4466 OUT
```

Then `npm ci && npm run build && pio run -e home_gadgets`.

The web page source is `home.htm`. At build time `gen_page.py` (PlatformIO library script, see `library.json`) compresses it with gzip into `home_page_gz.h` in the build directory, so the page needs about 13 KB of flash instead of 36 KB. Edit `home.htm` and rebuild; there is no generated file to maintain.

## Wiring (38-pin ESP32 DevKit)

| Function | GPIO | Direction | Notes |
|---|---|---|---|
| LED strip 1 / 2 data | 16 / 17 | OUT | set in LED Preferences; 330 Ω resistor in each data line |
| Relays 1–8 | 4, 13, 18, 19, 23, 25, 26, 27 | OUT | |
| Wall switches 1–8 | 14, 32, 33, 21, 22, 5, 15, 35 | IN | 1 kΩ series resistor on each |
| PIR 1 / 2 | 34 / 39 | IN | |
| MAX4466 OUT | 36 (VP) | IN (analog) | power from 3.3 V |

All pins can be changed on the page (Wiring tab). All 21 usable pins are taken; none are spare.

- **Relay board (5 V)**: remove the JD-VCC jumper. VCC → ESP32 3.3 V, JD-VCC + its GND → separate 5 V supply (≥ 1 A for 8 relays). Don't power the relays from the ESP32's USB 5 V pin.
- **Mains wall switches: never connect mains to the ESP32.** Use one AC opto-isolator input module per switch. Power the module's logic side from **3.3 V** (a module pulled up to 5 V would damage the ESP32). Module OUT → switch pin through 1 kΩ, plus 100 nF to GND for long cables. Many modules output pulses at mains frequency; the "Mains switch (AC module)" input type handles that.
- **GPIO 35** has no internal pull-up: the AC module's own pull-up (at 3.3 V) or a 10 kΩ resistor to 3.3 V is required.
- **GPIO 5 / 15** are strapping pins. According to the datasheet a switch that is ON at power-up only affects boot log output and SDIO timing, not boot mode; this has not been tested on hardware yet. The 1 kΩ resistors also protect against the short signals these pins output during boot.
- **GPIO 21 / 22** are used as inputs, so I²C is not available.
- **GPIO 36 / 39**: the ESP32 errata describes short false LOW pulses on these pins while the ADC runs (the microphone keeps it running). That's why the microphone is on 36 and a slowly polled PIR on 39. Don't use 39 for a wall switch.
- **PIR (HC-SR501)**: VCC 5 V, output is 3.3 V.
- **LED strips**: own 5 V supply sized for the LEDs, common GND with the ESP32. Set WLED's current limiter to match the supply.
- Mains wiring must be done by a qualified electrician, fused and in a closed enclosure. Inductive loads (pumps, motors, AC) may need a contactor or SSR.

## First setup

1. Flash the firmware. On first boot connect to Wi-Fi **WLED-AP** (password `wled1234`) and choose your home Wi-Fi.
2. **LED Preferences**: add two outputs (GPIO 16 and 17) and tick **"Make a segment for each output"**. LED 1 = segment 0, LED 2 = segment 1 (can be changed on the page).
3. **Usermods**: make sure AudioReactive is enabled with the analog microphone on GPIO 36.
4. Open `http://<device-ip>/home`, add it to the phone's home screen, and check each connection on the **Wiring** tab: flip every wall switch, wave at each sensor, press **Test** for each relay. Relays default to active LOW (most 5 V boards); change it per relay if needed.
5. Give the device a fixed IP address in your router (DHCP reservation) so links and shortcuts keep working.

## Using it

- **Home**: tap appliances, switch/dim the LED strips, play moods and scenes.
- **Moods**: pick LED 1 / LED 2 / Both, then tap a mood. 🎵 moods react to sound (music playing near the device). "Save current look" stores what a strip shows right now as your own mood; built-in moods can be replaced with your own look and reset later.
- **Automations**: for each motion sensor choose what happens when motion starts (up to 8 actions), how long things stay on after the last motion, and whether it only works at night (needs your location in *Time & Macros*). Scenes use the same action list.
- **Wall switches**: "Toggle on every flip" (default) means every flip changes the relay, so the wall switch and the app never conflict. "Follow switch position" makes the relay follow up/down.
- **Settings**: microphone on/off and sensitivity, appliance names and icons, state after a power cut (Off / On / Last state), auto-off timers, "Stays on", Siri links and security key, backup and restore.
- **Stays on** (e.g. fridge, aquarium): scenes, motion sensors and "all off" never switch this relay off. You still can by hand (the page asks for confirmation), with its wall switch or with its own Siri link. An auto-off timer you set for it still applies.
- **After a power cut** relays that should be on (setting "On" or "Last state") are switched on one after another, 0.4 s apart, so the appliances don't all start at the same moment.

Settings are saved automatically on the device in `/home.json` and survive reboots and power cuts.

## Siri

1. iPhone: Shortcuts app → **+** → Add Action → **Get Contents of URL**.
2. Paste a link from the page (Settings → Voice control), e.g. `http://192.168.1.50/home/api?relay=1&on=1&k=abcd2345xy`. The `k=` part is the device's security key (see below).
3. Name the shortcut the way you want to say it, e.g. "Turn on light", then say "Hey Siri, turn on light". The phone must be on the home Wi-Fi.

Google Assistant cannot open local links by itself; use Home Assistant or the WLED app on Android. WLED has no native Apple Home (HomeKit) support.

## Security key

WLED lets web pages from any site talk to it, and its API has no password. So any web page opened on a phone in your network could send it commands. For LEDs that is harmless; for mains appliances it is not. Everything that can switch a relay therefore needs the device's **security key**:

- The key is created randomly on the device the first time it starts (once Wi-Fi is up) and is stored in its own file `/hgwsec.json`. Like WLED's `wsec.json`, the web server and the file editor refuse to serve that file.
- The page adds it automatically; the Siri links on the Settings page contain it (`&k=...`).
- Other web sites cannot read it: it is only sent in a response without WLED's `Access-Control-Allow-Origin` header.
- **Settings → Voice control → Make a new key** replaces it. Existing Siri shortcuts then need the new links.
- LED-only commands (moods, strips on/off, microphone) don't need the key, like the rest of WLED.
- Saving settings needs the key, plus WLED's settings PIN if you set one (recommended).

## API

`GET /home/api` needs `k=<key>` in every request. Relay and scene numbers start at 1, `mood` takes the mood id:

| URL | Action |
|---|---|
| `/home/api?relay=1&on=1&k=KEY` | relay 1 on (`on=0` off, `on=t` toggle) |
| `/home/api?mood=0&strip=3&k=KEY` | mood 0 (Pub Vibes) on both strips (`strip=1` LED 1, `2` LED 2) |
| `/home/api?scene=1&k=KEY` | run scene 1 |
| `/home/api?strip=2&on=0&k=KEY` | LED 2 off |
| `/home/api?alloff=1&k=KEY` | all relays off (except "stays on") |

A wrong or missing key returns HTTP 403.

JSON API (`POST /json/state`, numbers start at 0). Relay, scene and all-off commands need `"k"`: `{"HomeGadgets":{"relay":0,"on":true,"k":"KEY"}}` (`"on":"t"` toggles), `{"scene":0,"k":"KEY"}`, `{"alloff":true,"k":"KEY"}`. No key needed: `{"mood":id,"strip":3}`, `{"strip":1,"on":false}`, `{"mic":true}`, `{"lvl":128}`. The state object reports `HomeGadgets.r` (relays), `sw` (wall switches) and `pir` (motion).

**Never put the key into WLED presets, playlists or IR/remote files** (`presets.json`, `ir.json`): WLED serves those files to any web site, which would publish the key. For timed relays use the schedules of this usermod instead; WLED presets and timers can still start moods and switch strips, which need no key.

Built-in mood ids: 0 Pub Vibes, 1 Calm, 2 Midnight, 3 Disco, 4 Bass Drop, 5 Chill Lounge, 6 Cozy Fire, 7 Candlelight, 8 Ocean, 9 Northern Lights, 10 Reading, 11 Wake Up, 12 Away, 13 Romantic, 14 Rainy Day, 15 Festival Sparkle, 16 Gaming, 17 Spring Bloom. Custom moods use ids 100–111.

Other endpoints used by the page: `GET /home/cfg` (configuration including the key), `POST /home/cfg?k=KEY` (save; also needs the settings PIN if one is set), `GET /home/live` (live status).
