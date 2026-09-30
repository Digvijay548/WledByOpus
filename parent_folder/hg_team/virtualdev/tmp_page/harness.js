#!/usr/bin/env node
// PAGE agent's scratch harness: serves www/home.htm at /home with the endpoints the effect previews need.
// Data comes from the read-only repo (FX.cpp/FX.h effect list and metadata), 6c's fxsim folder (engine, palettes)
// and hg_team/2a_v22/home_gadgets.cpp (HG_BUILTIN_MOODS). The strips really run FXS in Node and /home/ws streams them (v2.2).
// Usage: node harness.js [--port 8097] [--page file] [--nofx] [--nobm] [--fxsim dir]
// Test hooks: GET /mock/stat -> {inflight, maxInflight, overlaps, reqs, conns, frames}
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const PORT = +(arg('--port') || 8097);
const PAGE = arg('--page') || path.join(__dirname, '..', 'www', 'home.htm');
const FXSIM = arg('--fxsim') || path.join(__dirname, '..', '..', 'fxsim'); // hg_team/fxsim: stable release (dist/, data/)
const REPO = path.join(__dirname, '..', '..', '..', 'WLED-main', 'wled00');
const FW = path.join(__dirname, '..', '..', '2a_v22', 'home_gadgets.cpp');
const NOFX = process.argv.includes('--nofx'), NOBM = NOFX || process.argv.includes('--nobm'), NOPIN = process.argv.includes('--nopin');
const KEY = 'abcdefghjk';

// ---- effect list + metadata from FX.cpp / FX.h (as /json/eff and /json/fxdata on the device)
const fxh = fs.readFileSync(path.join(REPO, 'FX.h'), 'utf8'), fxc = fs.readFileSync(path.join(REPO, 'FX.cpp'), 'utf8');
const ids = {}; for (const m of fxh.matchAll(/#define FX_MODE_(\w+)\s+(\d+)/g)) ids[m[1]] = +m[2];
const MODE_COUNT = +fxh.match(/#define MODE_COUNT\s+(\d+)/)[1];
const data = {}; for (const m of fxc.matchAll(/_data_FX_MODE_(\w+)\[\] PROGMEM = "((?:[^"\\]|\\.)*)"/g)) data[m[1]] = m[2];
const EFF = Array(MODE_COUNT).fill('RSVD'), FXD = Array(MODE_COUNT).fill('');
const put = (id, d) => { const a = d.indexOf('@'); EFF[id] = a < 0 ? d : d.slice(0, a); FXD[id] = a < 0 ? '' : d.slice(a + 1); };
put(0, data.STATIC);
for (const m of fxc.matchAll(/addEffect\(FX_MODE_(\w+),\s*&\w+,\s*_data_FX_MODE_(\w+)\)/g)) if (ids[m[1]] !== undefined && data[m[2]]) put(ids[m[1]], data[m[2]]);

// ---- palettes (6c's palettes_demo.json = the real 72, as /json/palx on ESP32: 8 per page, m = count / 8)
const PD = JSON.parse(fs.readFileSync(path.join(FXSIM, 'data', 'palettes_demo.json'), 'utf8'));
const PAL = PD.names, PALIDS = Object.keys(PD.p).map(Number).sort((a, b) => a - b);
const palx = page => { const m = Math.floor(PALIDS.length / 8); page = Math.min(page, m); const p = {}; for (const id of PALIDS.slice(page * 8, page * 8 + 8)) p[id] = PD.p[id]; return { m, p }; };

// ---- built-in moods from the firmware table: cfg.bm {n,fx,snd,g} and /home/bm [{pal,sx,ix,bri,col}]
const fw = fs.readFileSync(FW, 'utf8'), tbl = fw.slice(fw.indexOf('HG_BUILTIN_MOODS[] = {'), fw.indexOf('};', fw.indexOf('HG_BUILTIN_MOODS[] = {')));
const BM = [], BMLOOK = [];
for (const m of tbl.matchAll(/\{"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*(\d+),\s*(\d+),\s*(\d+),\s*\{([^}]*)\},\s*\{([^}]*)\},\s*(true|false)\}/g)) {
  const nums = s => s.split(',').map(x => parseInt(x.trim()) || 0).concat([0, 0, 0]).slice(0, 3);
  BM.push({ n: m[1], fx: m[2], snd: m[9] === 'true', g: nums(m[8]) });
  BMLOOK.push({ pal: m[3], sx: +m[4], ix: +m[5], bri: +m[6], col: nums(m[7]) });
}

// ---- engine in Node: both strips really run their effect (like device.js)
const FXS = require(path.join(FXSIM, 'dist', 'fxsim.js'));
FXS.setPalettes(PD.p);
const fxjs = () => fs.readFileSync(path.join(FXSIM, 'dist', 'fxsim.min.js'), 'utf8');

const LEN = 60;
const defs = id => { const o = {}; for (const s of ((FXD[id] || '').split(';')[4] || '').split(',')) { const [k, v] = s.split('='); if (v) o[k] = +v; } return o; };
const state = {
  on: true, bri: 160, transition: 7, ps: -1, pl: -1, mainseg: 0,
  seg: [0, 1].map(id => ({ id, start: id * LEN, stop: id * LEN + LEN, len: LEN, on: true, bri: id ? 255 : 200, fx: id ? EFF.indexOf('Colorwaves') : EFF.indexOf('Breathe'),
    sx: 128, ix: 128, pal: id ? 11 : 0, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false, sel: !id, col: id ? [[255, 0, 80], [0, 255, 128], [0, 0, 0]] : [[255, 120, 20], [0, 0, 255], [0, 0, 0]] }))
};
const cfg = {
  name: 'Harness', key: KEY, pinSet: !NOPIN, pinReq: false, rev: 1, ce: 0, seg: [0, 1], mic: false, lvl: 128,
  relays: [0, 1, 2, 3].map(i => ({ n: ['Lamp', 'Fan', 'TV', 'Heater'][i], i, p: -1, al: true, po: 0, ao: 0, keep: false, e: 0 })),
  sw: [{ p: -1, t: 1, m: 0, r: 0, inv: false, e: 0 }],
  pir: [{ n: 'Hall', p: -1, en: true, hold: 60, undo: true, night: false, a: [], e: 0 }],
  sc: [{ n: 'Evening', a: [[4, 1, 3]] }],
  bm: BM,
  moods: [
    { id: 100, rep: -1, n: 'My Sunset', fx: 'Colorwaves', pal: 'Sunset', fxid: 67, palid: 13, sx: 80, ix: 128, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false, bri: 200, col: [0xFF4000, 0x8000FF, 0] },
    { id: 101, rep: 3, n: 'Disco (mine)', fx: 'Rainbow', pal: 'Party', fxid: 9, palid: 6, sx: 200, ix: 60, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false, bri: 255, col: [0xFF0000, 0x00FF00, 0x0000FF] }],
  lim: { moods: 8, act: 4, sch: 8, mbase: 100 }, sch: null, away: null, clap: null
};
const segs = [0, 1].map(() => null);
function mk(k) { const s = state.seg[k]; segs[k] = FXS.makeSeg({ fx: EFF[s.fx], sx: s.sx, ix: s.ix, c1: s.c1, c2: s.c2, c3: s.c3, o1: s.o1, o2: s.o2, o3: s.o3, pal: s.pal, col: s.col, len: LEN, dpal: defs(s.fx).pal > 0 ? defs(s.fx).pal : undefined }); }
mk(0); mk(1);
function applySeg(t, s) {
  if (s.fx !== undefined && +s.fx !== t.fx) {
    t.fx = +s.fx;
    if (s.fxdef) { const d = defs(t.fx); t.sx = d.sx ?? 128; t.ix = d.ix ?? 128; t.c1 = d.c1 ?? 128; t.c2 = d.c2 ?? 128; t.c3 = d.c3 ?? 16; t.o1 = !!d.o1; t.o2 = !!d.o2; t.o3 = !!d.o3; if (d.pal !== undefined) t.pal = d.pal; }
  }
  for (const k of ['sx', 'ix', 'c1', 'c2', 'c3', 'o1', 'o2', 'o3', 'pal', 'bri', 'on']) if (s[k] !== undefined) t[k] = s[k];
  if (s.col) t.col = s.col.map(c => Array.isArray(c) ? c : [c >> 16 & 255, c >> 8 & 255, c & 255]);
}
function applyMood(id, mask) {
  const cm = cfg.moods.find(m => m.id === id) || cfg.moods.find(m => m.rep === id);
  const b = BM[id], L = cm ? cm : b && Object.assign({ fx: b.fx }, BMLOOK[id]);
  if (!L) return;
  let fx = EFF.indexOf(L.fx); if (fx < 0) fx = L.fxid | 0;
  let pal = PAL.indexOf(L.pal); if (pal < 0) pal = cm ? cm.palid : Math.max(0, defs(fx).pal ?? 0);
  for (let k = 0; k < 2; k++) if (mask & (1 << k)) {
    const t = state.seg[k]; applySeg(t, { fx, fxdef: true, on: true });
    Object.assign(t, { sx: L.sx, ix: L.ix, pal, bri: L.bri }); if (cm) Object.assign(t, { c1: cm.c1, c2: cm.c2, c3: cm.c3, o1: cm.o1, o2: cm.o2, o3: cm.o3 });
    t.col = L.col.map(c => [c >> 16 & 255, c >> 8 & 255, c & 255]); mk(k);
  }
}
setInterval(() => { for (let k = 0; k < 2; k++) FXS.step(segs[k]); }, 24);

// ---- /home/ws (v2.2): 'H', 1, bri, n0, n1, samples (segment opacity applied, like the device's getPixelColor)
const stat = { fxjs: 0, inflight: 0, maxInflight: 0, overlaps: [], reqs: [], conns: 0, frames: 0 };
const clients = new Set();
function frame() {
  const n = [LEN, LEN].map(l => Math.min(48, l)), b = Buffer.alloc(5 + 3 * (n[0] + n[1]));
  b[0] = 0x48; b[1] = 1; b[2] = state.on ? state.bri : 0; b[3] = n[0]; b[4] = n[1];
  let o = 5;
  for (let k = 0; k < 2; k++) { const s = state.seg[k], px = segs[k].S.px;
    for (let j = 0; j < n[k]; j++) { const c = state.on && s.on ? px[Math.floor(j * (LEN - 1) / (n[k] - 1))] : 0, w = c >>> 24, f = s.bri / 255;
      b[o++] = Math.min(255, ((c >>> 16 & 255) * f | 0) + w); b[o++] = Math.min(255, ((c >>> 8 & 255) * f | 0) + w); b[o++] = Math.min(255, ((c & 255) * f | 0) + w); } }
  return b;
}
function wsSend(sock, buf, op = 2) { const len = buf.length; sock.write(Buffer.concat([len < 126 ? Buffer.from([0x80 | op, len]) : Buffer.from([0x80 | op, 126, len >> 8, len & 255]), buf])); }
function upgrade(req, sock) {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/home/ws') { sock.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'); return; }
  const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  if (u.searchParams.get('k') !== KEY) { wsSend(sock, Buffer.from([0x03, 0xf0]), 8); sock.end(); return; }
  clients.add(sock); while (clients.size > 2) { const old = clients.values().next().value; clients.delete(old); old.destroy(); }
  stat.conns = clients.size;
  const drop = () => { clients.delete(sock); stat.conns = clients.size; };
  sock.on('data', d => { if ((d[0] & 15) === 8) { wsSend(sock, Buffer.alloc(0), 8); sock.end(); drop(); } });
  sock.on('close', drop); sock.on('error', drop);
}
setInterval(() => { if (!clients.size) return; const f = frame(); for (const s of clients) { wsSend(s, f); stat.frames++; } }, 50);

// ---- HTTP; /json/* and /home/bm answer after 25 ms so overlapping requests from the page are visible in /mock/stat
const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => r(s)); });
const T0 = Date.now();
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/mock/stat') return json(res, stat);
  const buf = p.startsWith('/json') || p === '/home/bm';
  if (buf) {
    stat.reqs.push([Date.now() - T0, req.method, p + u.search]);
    if (stat.inflight) stat.overlaps.push(p + u.search);
    stat.inflight++; stat.maxInflight = Math.max(stat.maxInflight, stat.inflight);
    await new Promise(r => setTimeout(r, 25));
    res.on('finish', () => stat.inflight--);
  }
  if (p === '/home/fx.js') { stat.fxjs++; if (NOFX) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(fxjs()); }
  if (p === '/home/bm') return NOBM ? (res.writeHead(404), res.end('not found')) : json(res, BMLOOK);
  if (p === '/home/cfg') { if (req.method === 'POST') { await body(req); return json(res, { ok: true }, 202); } return json(res, cfg); }
  if (p === '/home/live') {
    return json(res, { r: [1, 0, 0, 0], sw: [0], pir: [0], act: [0], s: state.seg.map(s => ({ on: +s.on, bri: s.bri, fx: EFF[s.fx] })),
      on: +state.on, bri: state.bri, mic: 0, lvl: 128, vol: -1, rev: cfg.rev, src: [1, 0, 0, 0], ago: [120, 0, 0, 0], away: 0, clap: 0, ts: 1, px: [[], []] });
  }
  if (p === '/home/stats') return json(res, { ts: 1, on: [3600, 0, 600, 0], pir: [Array.from({ length: 48 }, (_, i) => i % 7)] });
  if (p === '/json/eff') return json(res, EFF);
  if (p === '/json/pal') return json(res, PAL);
  if (p === '/json/fxdata') return json(res, FXD);
  if (p === '/json/palx') return json(res, palx(+(u.searchParams.get('page') || 0)));
  if (p === '/json/state' || p === '/json/si' || p === '/json') {
    if (req.method === 'POST') {
      let o = {}; try { o = JSON.parse(await body(req)); } catch (e) { return json(res, { error: 9 }, 400); }
      if (o.on !== undefined) state.on = o.on === 't' ? !state.on : !!o.on;
      if (o.bri !== undefined) state.bri = +o.bri;
      for (const s of [].concat(o.seg || [])) { const k = state.seg.findIndex(x => x.id === s.id); if (k >= 0) { applySeg(state.seg[k], s); mk(k); } }
      if (o.HomeGadgets && o.HomeGadgets.mood !== undefined) applyMood(+o.HomeGadgets.mood, +(o.HomeGadgets.strip || 3));
      return json(res, { success: true });
    }
    return json(res, state);
  }
  if (p === '/home' || p === '/home/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(PAGE)); }
  res.writeHead(404); res.end('not found');
});
server.on('upgrade', upgrade);
server.listen(PORT, '127.0.0.1', () => console.log('harness on http://127.0.0.1:' + PORT + '/home  (' + EFF.filter(n => n !== 'RSVD').length + ' effects, ' + PAL.length + ' palettes, ' + BM.length + ' built-in moods' + (NOFX ? ', no fx.js' : NOBM ? ', no /home/bm' : '') + (NOPIN ? ', no PIN' : '') + ')'));
