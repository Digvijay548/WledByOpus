# Home Gadgets

Turns a WLED ESP32 into a small home controller, next to the normal LED features:

- **8 relays** for home appliances (active LOW/HIGH, state after power cut, auto-off timer, "stays on" protection)
- **8 wall switches**: existing mains switches through AC opto-isolator modules, or low-voltage contacts
- **2 PIR motion sensors**, each with its own list of up to 8 actions and a "turn back off" timer
- **Moods**: 23 ready-made LED looks (Pub Vibes, Calm, Midnight, ...) for LED 1, LED 2 or both, plus up to 12 of your own
- **Scenes**: one tap runs up to 8 actions (relays + moods)
- **Schedules**: up to 8, at a clock time or at sunrise / sunset, on the days you pick
- **Away mode**: lamps switch on and off at random in the evening, so the house looks lived-in
- **Clap control** (experimental, off by default): 2 or 3 claps run a list of actions
- **Who switched it** for every appliance, and **today's statistics** (on-time, motion per half hour)
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

The web page source is `home.htm`. At build time `gen_page.py` (PlatformIO library script, see `library.json`) compresses it with gzip into `home_page_gz.h` in the build directory, so the page needs about 24 KB of flash instead of 68 KB. Edit `home.htm` and rebuild; there is no generated file to maintain.

## Wiring (38-pin ESP32 DevKit)

| Function | GPIO | Direction | Notes |
|---|---|---|---|
| LED strip 1 / 2 data | 16 / 17 | OUT | set in LED Preferences; 330 Ω resistor in each data line |
| Relays 1–8 | 4, 13, 18, 19, 23, 25, 26, 27 | OUT | |
| Wall switches 1–8 | 14, 32, 33, 21, 22, 5, 15, 35 | IN | 1 kΩ series resistor on each |
| PIR 1 / 2 | 34 / 39 | IN | |
| MAX4466 OUT | 36 (VP) | IN (analog) | power from 3.3 V |

All pins can be changed on the page (Wiring tab). This map uses 21 GPIOs; the only free ones left are GPIO 0, 2 and 12, which are boot pins and best left unconnected.

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

Settings are saved automatically on the device (in `/hgcfg_wsec.json`; relay "last states" in `/hgstate_wsec.json`) and survive reboots and power cuts. The names contain `wsec.json` on purpose: like WLED's own secrets file, WLED's web server and file editor refuse to hand them out, because they show when nobody is at home (away mode, schedules). Use **Settings → Backup** on the page to download your settings (relay "last states" are not part of the backup). Files of earlier versions (`/home.json`, `/hgstate.json`) are renamed automatically. If you go back to an earlier firmware and then forward again, the settings made with the earlier firmware are replaced by the newer file.

### Schedules

Schedules switch things at set times, even when your phone is off. You can have up to 8. Each one has:

- **When**: a clock time (e.g. 23:00), or **sunrise / sunset** plus or minus up to 3 hours (e.g. "sunset, 15 min before").
- **Days**: any days of the week.
- **What**: up to 8 actions, the same list as scenes (relay on / off / toggle, a mood, strips on / off, all relays off).

Good to know:

- Schedules need the right time. The device gets it from the internet, so set your **time zone** in WLED's *Time & Macros* page. Sunrise / sunset also need your **location** there.
- While the device doesn't know the time (no internet, just switched on), schedules wait. Missed times are **not** run later; only a short hiccup (up to 5 minutes) is caught up.
- Each schedule runs at most **once a day**, also when the clock changes for summer / winter time. On the night summer time starts, times between 02:00 and 02:59 don't exist and are skipped. Only if the device restarts within the same minute a schedule just ran, it can run once more.
- Sunrise / sunset plus an offset stays on the same day: if it would fall before midnight or after it, the schedule runs at 00:00 or 23:59 instead (this only happens with large offsets far north or south).
- Anyone in your network can change WLED's clock through its JSON API (a WLED feature, not a Home Gadgets one); that moves schedules and away mode until the next internet time sync.
- Schedules never switch off appliances marked **"Stays on"**.
- Schedules are part of the Home Gadgets settings and protected by the security key. Use them, **not** WLED's own timers or presets, to switch relays (see [Security key](#security-key)).

Example, porch light: schedule 1 "every day, sunset, 0 min: Relay 3 on", schedule 2 "every day, 23:00: Relay 3 off".

### Away mode

Away mode makes the house look lived-in while you are out:

- Pick the appliances (lamps work best) and a time window, e.g. **18:30 to 23:30**. The window may pass midnight (e.g. 22:00 to 01:00).
- Inside the window each chosen lamp switches on or off at random, every **10 to 45 minutes** (you choose the range). The first switch comes after such a pause, not right at the start.
- Optional: a **mood** for the LED strips when the window opens, e.g. "Away" (TV simulator) on LED 1.
- When the window ends, the chosen lamps switch **off**, and so do the LED strips that got the mood.
- Switching away mode **off** inside the window leaves everything as it is, so whoever came home isn't left in the dark.
- It needs the right time (see Schedules). After a power cut away mode stays on and starts again once the time is known.
- "Stays on" appliances are left alone.

### Clap control (experimental)

Clap 2 or 3 times to run a list of actions, e.g. "2 claps = ceiling light on / off, 3 claps = all off". It is **off by default** and needs the microphone (audioreactive) switched on.

- Clap clearly, about half a second apart (0.15 to 0.8 s). The action runs 1 second after the last clap, then there is a 2-second pause.
- It doesn't listen while LED 1 or LED 2 shows a 🎵 sound mood, when it was loud (music, talking) just before your first clap, or when the device is very busy (then claps are ignored rather than counted wrong).
- The microphone hears "loud bangs", not real claps: knocking, a door slam or claps in a video can trigger it now and then. **Don't put heaters, irons or anything else that must not switch on by accident on clap actions.** A soft third clap can be missed, so make the 2-clap actions safe as well.
- The page shows whether clap control is listening right now.

### Who switched it?

Each appliance shows who switched it last and how long ago: app / JSON API, wall switch, motion sensor, scene, Siri / link, schedule, auto-off, away mode, clap, power-on after a power cut, or "all off" (nothing is shown while it has not been switched since the device started). "All off" means the direct all-off command (Siri link or API); an "all relays off" action inside a scene, schedule or clap list shows that scene, schedule or clap. The time counts from the last restart.

### Today's statistics

For today: how long each appliance was on (including right now), and how often each motion sensor saw movement per half hour (up to 255 per block). The numbers start again at midnight and are kept only in memory, so a restart also resets them. Until the device knows the time they count "since start".

## Siri

1. iPhone: Shortcuts app → **+** → Add Action → **Get Contents of URL**.
2. Paste a link from the page (Settings → Voice control), e.g. `http://192.168.1.50/home/api?relay=1&on=1&k=abcd2345xy`. The `k=` part is the device's security key (see below).
3. Name the shortcut the way you want to say it, e.g. "Turn on light", then say "Hey Siri, turn on light". The phone must be on the home Wi-Fi.

Google Assistant cannot open local links by itself; use Home Assistant or the WLED app on Android. WLED has no native Apple Home (HomeKit) support.

## Security key

WLED lets web pages from any site talk to it, and its API has no password. So any web page opened on a phone in your network could send it commands. For LEDs that is harmless; for mains appliances it is not. So the Home Gadgets API asks for the device's **security key** for everything that can switch a relay, and for saving its settings:

- The key is created randomly on the device the first time it starts (once Wi-Fi is up) and is stored in the ESP32's NVS memory, not in a file, so WLED's file upload and file editor cannot read or replace it directly. Without a settings PIN, though, a web page could upload its own page to the device and read the key through `/home/cfg` from there, so set a PIN (below). The key survives a factory reset.
- The page adds it automatically; the Siri links on the Settings page contain it (`&k=...`).
- Other web sites cannot read it: it is only sent in a response without WLED's `Access-Control-Allow-Origin` header.
- **Settings → Voice control → Make a new key** replaces it. Existing Siri shortcuts then need the new links. Do this whenever you think the key may have leaked (e.g. a shared screenshot of the Siri links); a factory reset of WLED keeps the old key, because it is stored in NVS.
- LED-only commands (moods, strips on/off, microphone) don't need the key, like the rest of WLED.
- Saving settings needs the key, plus WLED's settings PIN if you set one. Entering the PIN on this page does not unlock WLED's own settings pages.

**Set a WLED settings PIN** (WLED → Config → Security & Updates). The key protects the Home Gadgets API, but without a PIN WLED itself lets any web page upload files and change settings, which could also change relay schedules or power-on states, or read the key through an uploaded page. Only the PIN closes that. The page shows a warning while no PIN is set and hides the Siri links and the key until one is set.

- After you enter the PIN in **WLED's own settings pages**, WLED stays unlocked for 15 minutes for every device in the network. During that time don't open unknown web sites on phones or computers in the same network.
- Best: put the controller on a separate Wi-Fi for smart-home devices (IoT or guest network) that only your own phones can reach.

## API

`GET /home/api` needs `k=<key>` in every request. Relay and scene numbers start at 1, `mood` takes the mood id:

| URL | Action |
|---|---|
| `/home/api?relay=1&on=1&k=KEY` | relay 1 on (`on=1` / `true` / `on`; `on=0` / `false` / `off` off; `on=t` / `toggle` toggle; anything else returns 400) |
| `/home/api?mood=0&strip=3&k=KEY` | mood 0 (Pub Vibes) on both strips (`strip=1` LED 1, `2` LED 2) |
| `/home/api?scene=1&k=KEY` | run scene 1 |
| `/home/api?strip=2&on=0&k=KEY` | LED 2 off |
| `/home/api?alloff=1&k=KEY` | all relays off (except "stays on") |

A wrong or missing key returns HTTP 403.

JSON API (`POST /json/state`, numbers start at 0). Relay, scene, all-off and away commands need `"k"`: `{"HomeGadgets":{"relay":0,"on":true,"k":"KEY"}}` (`"on":"t"` toggles), `{"scene":0,"k":"KEY"}`, `{"alloff":true,"k":"KEY"}`, `{"away":true,"k":"KEY"}`. No key needed: `{"mood":id,"strip":3}`, `{"strip":1,"on":false}`, `{"mic":true}`, `{"lvl":128}`. The state object reports `HomeGadgets.r` (relays), `sw` (wall switches) and `pir` (motion).

**Never put the key into WLED presets, playlists or IR/remote files** (`presets.json`, `ir.json`): WLED serves those files to any web site, which would publish the key. For timed relays use the schedules of this usermod instead; WLED presets and timers can still start moods and switch strips, which need no key.

Built-in mood ids: 0 Pub Vibes, 1 Calm, 2 Midnight, 3 Disco, 4 Bass Drop, 5 Chill Lounge, 6 Cozy Fire, 7 Candlelight, 8 Ocean, 9 Northern Lights, 10 Reading, 11 Wake Up, 12 Away, 13 Romantic, 14 Rainy Day, 15 Festival Sparkle, 16 Gaming, 17 Spring Bloom, 18 Beat Ripple, 19 Popcorn Party, 20 Lighthouse, 21 Night Path, 22 Focus. Custom moods use ids 100–111.

Other endpoints used by the page: `GET /home/cfg` (configuration including the key), `POST /home/cfg?k=KEY&pin=PIN` (save; answers 403 for a wrong key, 413 for a missing or too large body, 401 for a missing or wrong settings PIN when one is set, 503 while busy, 202 when accepted), `GET /home/live` (live status, including who switched each relay and 16 color samples per strip), `GET /home/stats` (today's statistics). `/home/live` and `/home/stats` show when someone is at home, so like `/home/cfg` they can only be read by the device's own page, not by other web sites.

`GET /home/cfg` does not ask for the settings PIN, so programs in your network (not web pages) can read the key. Keep untrusted devices out of this network, e.g. on a guest Wi-Fi.
