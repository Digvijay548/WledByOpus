# 2a v2.2: real-time effect preview (user request in wled-main-2a's tab)

From wled-main-2a, 2026-09-29 18:06. For: wled-main-ad (merges it into RC4) and wled-main-84 (review).
**Base = RC3b** (home_gadgets.cpp f8f0ae43, home.htm 837a38cf). The repo files still have these md5s at 18:05, so both new files are drop-ins.

## User request

"In the effect we want the preview of how it works in real time with the correct colours, like breathing low and high brightness, and apply it directly, bound to the effect itself."

## What it does

| Part | Change |
|---|---|
| Firmware | A usermod websocket `/home/ws?k=KEY`. About every 50 ms the loop sends one binary frame of up to 48 colour samples per strip. The frame format is in `SPEC.md` |
| Page | The live bars (the Home cards and the Adjust panel) draw from the stream at up to 20 fps as smooth gradients. The **selected effect's button carries a 6 px live bar**, so the real animation sits on the effect you picked. Tapping an effect still applies it right away (`send`/`sendNow` unchanged) |
| Colours | The page shows `c × (bri/255)^(1/2.2)`. WLED gamma-corrects the LED output, so plain linear scaling would look much too dark at low brightness. Breathe visibly goes dim and bright |
| Fallback | If `/home/ws` is refused, fails, or is missing (older firmware), the existing `live.px` path from the 1 s poll keeps drawing. It's tested with a refused upgrade |

## Files

| File | What |
|---|---|
| `home_gadgets.cpp` / `home_gadgets.diff` | Full file, plus a 152-line diff against RC3b |
| `home.htm` / `home.htm.diff` | Full page, plus a diff against 837a38cf |
| `SPEC.md` | Frame format and brightness formula (also sent to 6c for the testbench) |
| `page_test/` | Mock device with a hand-rolled ws (`mock.js`), Playwright driver (`drive.js`), screenshots, and the agent's notes |

## Firmware details (`home_gadgets.cpp`)

- `static AsyncWebSocket hgWs("/home/ws")` is registered at the **top of `addRoutes()`**, before the `/home` catch-all that returns 404 for unknown `/home/*` paths.
- Everything is inside `#ifndef WLED_DISABLE_WEBSOCKETS`.
- **Access:** the key is checked at `WS_EVT_CONNECT`. The upgrade request is passed as `arg` (`AsyncWebSocket.cpp:398`), and `keyOk()` rejects an empty key while keygen is pending. Only 2 clients are accepted, and anything else is closed at once. The IDs live in `hgWsIds[2]` (library IDs start at 1; `_cNextId(1)`).
- **Pushing** happens in `pushLive(now)` at the end of `loop()`, in the same task as the effects, so the pixel buffer is consistent:
  - at most every 50 ms (core's live view uses 40 ms, `ws.cpp:21`)
  - only to clients whose queue is empty (`queueLength() > 0` means skip, as in `sendLiveLedsWs`, `ws.cpp:189`)
  - skipped while `ESP.getMaxAllocHeap() < 16 KB`
  - an unchanged frame (FNV hash) is only resent as a 1 s keepalive
  - `cleanupClients(2)` runs once a second
  - the frame is built in a member buffer (293 B); no String is used
- **Heap:** `client->binary(buf, len)` copies each frame into a library buffer, one small allocation per frame per client (at most 2), the same pattern as core's live view. This is a deliberate exception to "no heap in loop()", and it only happens while a page is watching.
- **Cost** `[build]` (isolated copy, RC3b vs RC3b+v2.2): **+924 B flash, +432 B RAM**, 0 warnings in the whole log.

## Page details (`home.htm`)

- Size: +2335 B raw, **+998 B gzip**.
- The ws opens only while the page is visible, `cfg.key` exists, and a preview canvas is on screen (`getClientRects`). It closes on hide or when the canvases go away, and reconnects with a 1/2/5/10 s backoff. Frames are validated (magic, version, n ≤ 48, exact length).
- One `paintPv()` draws both sources. `drawLeds()` (px) doesn't draw while the stream delivered a frame in the last 3 s. The header tint is updated at most 4 times a second.
- `render()` no longer clears `livePv`. Detached canvases are filtered by `isConnected`, so an open Adjust panel keeps its bars during a background re-render.
- Canvases are `aria-hidden`.

## Test status

- Firmware: `[build]` compiles, 0 warnings. **No device test.**
- Page: `[test: mock]`, Playwright 1.62 (already on the PC) against `page_test/mock.js`: 23/23 checks.
  - ws open and closed by visibility
  - a breathing canvas measured changing over 2 s
  - reconnect after a kill
  - px fallback with a refused upgrade
  - 0 console errors, no horizontal scroll at 390 px, dark theme
- **Not tested:** a real ESP32, iOS Safari.

## Open points

1. **With a 3rd phone,** the device refuses it (2-client limit), so that phone uses the 1 s px fallback and retries every 10 s. Raise `HG_WS_CLIENTS` if needed (about 300 B per frame per client).
2. **Key in the ws URL:** the same exposure as the Siri links (`/home/api?k=`). It's same-origin only because the key never reaches other sites.
3. **6c (wled-main-6c)** is building the simulated previews for the effects not yet applied (the browsing rows). That's separate from this patch, and the user decides its size tier.

AI involvement: the firmware was written by wled-main-2a and the page by a Claude subagent. Both are inside the existing `// AI:` blocks and page markers.
