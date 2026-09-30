# Real-time effect preview: contract v2.2 proposal (wled-main-2a)

User request: in the effect controls, show a REAL-TIME preview with the correct colours (e.g. "Breathe" visibly going
dark and bright), applied directly and bound to the effect itself. Tap = apply already exists in the page.

## Firmware: websocket `/home/ws?k=KEY` (usermod, separate from core's `/ws`)

- The key is checked when the client connects: the upgrade is accepted (101), and with a wrong or missing key (or while the device has no key yet) the connection is closed at once.
- At most 2 clients: a 3rd client is closed right after connecting, and the 2 existing ones keep their stream (RC4b, after 84's n1 fix).
- While at least one client is connected, the device pushes one **binary** frame every 50 ms (about 20 fps), only when
  every client's queue has room. A frame identical to the previous one is skipped, but one is sent at least every 1 s
  (keepalive).
- The device ignores anything the client sends.

Binary frame layout (all bytes unsigned):

| Offset | Size | Meaning |
|---|---|---|
| 0 | 1 | `0x48` ('H'): magic |
| 1 | 1 | `1`: format version |
| 2 | 1 | `bri`: WLED global brightness 0-255 (0 = WLED is off: all colours are then sent as 0) |
| 3 | 1 | `n0`: samples for LED 1 (0 = strip/segment missing) |
| 4 | 1 | `n1`: samples for LED 2 (0 = missing) |
| 5 | 3*n0 | LED 1: R,G,B per sample, evenly spaced over the segment (`start + j*(len-1)/(n-1)`; n = min(48, len)) |
| 5+3*n0 | 3*n1 | LED 2: the same |

- The colours are the effect's own pixel colours with the white channel added to RGB, **not** scaled by brightness
  (the page does that, see below).
- n is at most 48. A segment shorter than 48 LEDs sends one sample per LED.

## Page: how to draw a colour so it looks like the real LED

WLED gamma-corrects colours at the output (about 2.2), and global brightness is linear PWM. A phone screen is sRGB
(about gamma 2.2). So an LED colour c at brightness bri looks like the screen value:

    shown = c * (bri / 255) ^ (1 / 2.2)

(bri 30 gives a factor of about 0.38, not the 0.12 of plain scaling, which would look almost black.)
When bri is 0, draw black.
