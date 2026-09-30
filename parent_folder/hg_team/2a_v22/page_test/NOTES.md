# Real-time effect preview: page draft (against base home.htm md5 837a38cf)

## What changed and where (page.diff, 4 hunks)

| Where | Change |
|---|---|
| CSS, after `.fxl button.sel` | New line: `.fxl button{position:relative;overflow:hidden}` and `.fxb` (6 px bar pinned to the bottom edge of the button). |
| `livePreview` / `drawLeds` block | `livePreview(k,cls)` now takes an optional class. `"fxb"` gives a 6 px canvas; the default stays `lv` at 14 px. Every canvas is `aria-hidden`. A new canvas is drawn from the last frame at once, so it doesn't sit empty until the next frame. |
| same block, new `paintPv(S,tint)` | One drawing function for both sources. It draws a smooth bar through a canvas linear gradient with one colour stop per sample, and it tints the header (`--g1/--g2`). Canvases with 0 width (hidden tab) are skipped. |
| `drawLeds()` | Calls `wsCheck()` and then draws from `live.px` as before (px values are already brightness-scaled, so no formula), but only when no stream frame has arrived in the last 3 s. |
| new `wsCheck()`, `wsDraw()`, `visibilitychange` listener | The websocket client (see below). |
| `render()` | Removed `livePv=[]`. The registry already drops canvases that are no longer in the DOM. Before, a background re-render (for example after "Save as…" in an open Adjust panel) silently froze the panel's previews. |
| `drawList()` in `adjustPanel` | The selected effect's button gets `livePreview(k,"fxb")` as a child. When you tap another effect, the list re-renders and the bar moves to the new button; the old canvas is dropped because it is disconnected. `send()`/`sendNow()` are unchanged: still at most one state POST in flight. |

How the websocket client works:
- It opens `ws://host/home/ws?k=<encodeURIComponent(cfg.key)>` with `binaryType` set to `"arraybuffer"`, and only while all of these hold: the page is visible, `cfg.key` is set, and at least one registered canvas is connected and has client rects (not in a hidden tab).
- It closes the socket otherwise, without reconnecting. It checks from the 1 s poll, from `visibilitychange`, and right after a canvas is created.
- Reconnect backoff is 1, 2, 5, then 10 s (capped). The backoff only resets after a connection that lived longer than 20 s. That way a wrong key, a refused route, or being dropped as the 3rd client doesn't retry every second.
- Frames are checked strictly. The magic must be 0x48 and the version 1, n0 and n1 must be at most 48, and the length must be exactly `5+3*(n0+n1)`. Anything else, including text frames, is ignored.
- Colour is `c*(bri/255)^(1/2.2)`, rounded; bri 0 gives black.
- `requestAnimationFrame` draws at most once per animation frame, and only after a new frame arrives. The header tint follows at most 4 times a second.

## Size

- Raw page text: 72753 → 75088 bytes, **+2335 bytes**.
- Gzip -9: +998 bytes.
- Lines: 58 added, 22 removed.

## Test results: tested in mock

- The test setup is `mock.js` (no npm: hand-rolled HTTP upgrade, SHA-1 accept and unmasked binary frames) plus `drive.js`.
- `drive.js` uses the Playwright 1.62 copy already installed in the global npm tree, with headless Chromium at 390×844 and DPR 2.
- Result: 23/23 passed. Run it with `node drive.js`.

| Check | Result |
|---|---|
| ws opens on the Home tab (with the key) | PASS, 173 ms |
| LED 1 bar on Home breathes (23 distinct colours in 2.5 s) | PASS |
| Paints follow the stream, not rAF | PASS, 16.5 draws/s |
| Selected effect ("Breathe") holds the only `.fxb` bar; all canvases `aria-hidden` | PASS |
| Effect bar breathes; peak R = 186 at bri 128 (expected 255×0.731 = 186) | PASS |
| No horizontal scroll at 390 px (page and panel) | PASS |
| Malformed frames (bad magic, bad version, short, long, n>48, 2 bytes, empty, text) ignored; drawing continues; 0 page errors | PASS |
| Tap "Rainbow": bar moves to that button, 1 bar in the DOM, registry size unchanged, POST applied `fx:9` | PASS |
| Registry stays bounded after search re-renders | PASS |
| Socket killed by the server: reconnects | PASS, 1.08 s |
| Previews keep running after a background `render()` while the panel is open | PASS |
| **Fallback:** route refused with 404 on upgrade: canvas pixel equals `live.px` (not re-scaled) and still animates from the 1 s poll | PASS |
| Backoff while refused grows | PASS (attempts 5 s apart after the 2 s retry) |
| Stream resumes when the route comes back | PASS, 5.5 s |
| ws closes on the Moods tab (no canvas) and reopens on Home | PASS |
| ws closes when the page is hidden and reopens when visible (`document.hidden` + `visibilitychange` simulated) | PASS |
| 0 page errors; 0 console errors outside the refused phase | PASS |

- While the route is refused, Chrome logs one console error per attempt ("Error during WebSocket handshake: Unexpected response code: 404"). This is the browser's own network message and the page can't suppress it.
- Screenshots:
  - `shot.png`: light theme, Adjust panel. The breathing bar is under "Breathe".
  - `shot_dark.png`: dark theme.
  - `shot_home.png`: Home tab with the smooth rainbow on LED 2.
- Not tested: a real device or real phone browsers (iOS Safari), and firmware frame timing under load.

## Open issues

1. **More than 2 phones:** the device keeps 2 clients (`cleanupClients(2)`), so a third phone pushes out the oldest one. The pushed-out phone retries with a growing backoff (up to every 10 s) and shows the 1 s px preview in between. The phones keep taking the slot from each other at that slower rate. A firmware-side fix would be to refuse new clients instead of dropping old ones, or to raise the limit.
2. The URL uses `ws://` on purpose because the device has no TLS. Behind an https proxy the socket fails and the px fallback takes over.
3. If the page is hidden while the socket is still connecting, Chrome logs "closed before the connection is established". This is harmless and rare.
4. The live bars don't follow `prefers-reduced-motion`, because they mirror the real LEDs. Tell me if the owner wants them to.
5. The px path now draws a smooth gradient instead of 16 blocks, because both sources share one drawing function. The data and the colours are unchanged.
6. For a strip with `n=0` (segment missing), its canvases keep their last image. The px path already behaved this way.
