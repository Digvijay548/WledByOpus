# Syntax/type check of patched WLED files with the ESP32 (home_gadgets) compiler flags.
# Read-only use of the repo: copies wled00 into a shadow dir, overlays patched files, runs g++ -fsyntax-only.
# Usage: python syntax_check.py <overlay_dir_with_wled00> <label>
import json, os, shutil, subprocess, sys

REPO = r"C:\Users\DigvijayPatilLM\Downloads\WLED-main\WLED-main"
WORK = os.path.dirname(os.path.abspath(__file__))
overlay = sys.argv[1]
label = sys.argv[2]
files = sys.argv[3].split(",") if len(sys.argv) > 3 else ["FX_fcn.cpp", "FX.cpp", "bus_manager.cpp", "file.cpp", "wled.cpp", "wled_metadata.cpp"]

d = json.load(open(os.path.join(REPO, ".pio", "build", "home_gadgets", "idedata.json")))
shadow_root = os.path.join(WORK, "shadow_" + label)
shadow = os.path.join(shadow_root, "wled00")
if os.path.exists(shadow_root):
    shutil.rmtree(shadow_root)
shutil.copytree(os.path.join(REPO, "wled00"), shadow)
for name in os.listdir(os.path.join(overlay, "wled00")):
    shutil.copy2(os.path.join(overlay, "wled00", name), os.path.join(shadow, name))

repo_wled00 = os.path.normcase(os.path.join(REPO, "wled00"))
# run the compiler from a deep common directory and pass relative include paths: the Windows command line
# that g++ hands to cc1plus is limited to 32 KB and the absolute include list is ~38 KB
CWD = os.path.join(os.path.dirname(os.path.dirname(d["cxx_path"])), "..", "framework-arduinoespressif32", "tools", "sdk", "esp32", "include")
CWD = os.path.normpath(CWD)
incs = []
for group in ("build", "compatlib", "toolchain"):
    for p in d["includes"][group]:
        if os.path.normcase(p).startswith(repo_wled00):
            p = shadow + p[len(repo_wled00):]  # redirect wled00 (and its subdirs) to the shadow copy
        # relative only for framework paths (short), absolute for the rest (relative ones would exceed MAX_PATH)
        fw = os.path.normcase(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(CWD)))))
        incs.append("-I" + (os.path.relpath(p, CWD) if os.path.normcase(p).startswith(fw) else p))
defs = ["-D" + x for x in d["defines"]]
flags = [f for f in d["cxx_flags"] if f != "-MMD"] + d.get("cc_flags", [])[:0]

def rsp_quote(a):
    # gcc response file: backslash escapes, so use forward slashes in paths and escape quotes
    a = a.replace("\\", "/") if (a.startswith("-I") or os.path.exists(a)) else a.replace("\\", "\\\\")
    return '"' + a.replace('"', '\\"') + '"'

ok = True
for f in files:
    src = os.path.join(shadow, f)
    args = ["-fsyntax-only", "-Wall", "-Wextra", "-Wno-unused-parameter"] + flags + defs + incs + [src]
    rsp = os.path.join(shadow_root, f + ".rsp")
    with open(rsp, "w") as fh:
        fh.write("\n".join(rsp_quote(a) for a in args))
    r = subprocess.run([d["cxx_path"], "@" + rsp.replace("\\", "/")], capture_output=True, text=True, cwd=CWD)
    # keep only diagnostics that point into the checked file itself
    lines = [l for l in r.stderr.splitlines() if (os.path.basename(src) + ":") in l and ("warning" in l or "error" in l)]
    print(f"[{label}] {f}: rc={r.returncode}, {len(lines)} diagnostics in file")
    for l in lines:
        print("   " + l.replace("\\", "/").split("wled00/")[-1][:300])
    if r.returncode != 0:
        ok = False
        print(r.stderr[-3000:])
print("RESULT", label, "OK" if ok else "FAIL")
