# Host-side logic tests for the draft patches (Python ports of the patched C++ logic; not a firmware test).
import json, random

FS_BUFSIZE = 256

# ---- M1: bufferedFindObjectEnd() port. Returns file position after the matching '}' (or None) ----
def find_obj_end(data: bytes, pos: int, fixed: bool):
    obj_depth = 0
    in_string = escaped = False
    p = pos
    while p < len(data) - 1:                     # while (f.position() < f.size() -1)
        buf = data[p:p + FS_BUFSIZE]; p += len(buf)
        for count, c in enumerate(buf):
            ch = chr(c)
            if fixed:
                if in_string:
                    if escaped: escaped = False
                    elif ch == '\\': escaped = True
                    elif ch == '"': in_string = False
                else:
                    if ch == '"': in_string = True
                    elif ch == '{': obj_depth += 1
                    elif ch == '}': obj_depth -= 1
            else:
                if ch == '{': obj_depth += 1
                if ch == '}': obj_depth -= 1
            if obj_depth == 0:
                return (p - len(buf)) + count + 1
    return None

def presets_file(names):
    # same shape as presets.json written by WLED: {"0":{},"1":{...},"2":{...}}
    doc = {"0": {}}
    for i, n in enumerate(names, 1):
        doc[str(i)] = {"n": n, "on": True, "bri": 128, "seg": [{"id": 0, "n": n, "col": [[255, 160, 0]], "fx": 0}]}
    return json.dumps(doc, separators=(",", ":")).encode()

def check_m1(fixed):
    rnd = random.Random(1)
    alphabet = ['{', '}', '"', '\\', 'a', 'b', ' ', ':', ',', '[', ']']
    fails = 0; total = 0
    for trial in range(400):
        names = ["".join(rnd.choice(alphabet) for _ in range(rnd.randint(0, 40))) for _ in range(rnd.randint(1, 12))]
        data = presets_file(names)
        dec = json.JSONDecoder()
        for i in range(1, len(names) + 1):
            key = ('"%d":' % i).encode()
            start = data.index(key) + len(key)       # bufferedFind(key) leaves the position after the key
            _, true_end = dec.raw_decode(data.decode(), start)
            total += 1
            if find_obj_end(data, start, fixed) != true_end:
                fails += 1
    return fails, total

print("M1 original: %d of %d object ends wrong" % check_m1(False))
print("M1 patched : %d of %d object ends wrong" % check_m1(True))

# ---- H2: 1D fast-path index math in blendSegment(): idx = start + p + off; if (idx >= stop) idx -= length ----
def max_index(start, stop, off):
    length = stop - start
    return max((start + p + off) - (length if start + p + off >= stop else 0) for p in range(length))

strip_len = 300
start, stop, off = 0, 300, 500                 # {"seg":[{"id":0,"stop":600,"of":500}]} after setGeometry trims stop to 300
print("H2 original: max idx written = %d (buffer has %d entries)" % (max_index(start, stop, off), strip_len))
length = stop - start
off_fixed = off % length if off >= length else off
print("H2 patched : offset %d -> %d, max idx written = %d" % (off, off_fixed, max_index(start, stop, off_fixed)))
bad = 0
for s in range(0, 50):
    for e in range(s + 1, 60):
        for o in range(0, 200):
            L = e - s
            o2 = o % L if o >= L else o
            if not all(s <= ((s + p + o2) - (L if s + p + o2 >= e else 0)) < e for p in range(L)): bad += 1
print("H2 patched : exhaustive small cases out of range =", bad)

# ---- H3: estimateCurrent() for 1200 RGB LEDs at full white, 55 mA/LED ----
leds, ma_per_led = 1200, 55
color_sum = leds * 3 * 255
total = (color_sum * ma_per_led) // (3 * 255) + leds
print("H3: true estimate %d mA, stored in uint16 = %d mA, in uint32 = %d mA" % (total, total & 0xFFFF, total & 0xFFFFFFFF))
limit = 60000
print("H3: per-bus limit %d mA -> uint16 dims to bri %s, uint32 dims to bri %d" % (
    limit, "255 (no dimming)" if (total & 0xFFFF) <= limit else str(limit * 255 // (total & 0xFFFF) + 1), limit * 255 // total + 1))
worst = (65535 * 3 * 255 * 3 * 254) // (3 * 255) + 65535
print("H3: worst case (65535 LEDs, WS2815 x3, 254 mA) = %d, fits uint32: %s" % (worst, worst < 2**32))
