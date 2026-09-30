#!/usr/bin/env node
// Minimal home_gadgets mock for the real-time preview (/home/ws, contract v2.2 in ../SPEC.md). No npm packages.
// Usage: node mock.js [--port 8090] [--no-ws] [--bri 128]
// Test hooks: GET /mock/stat -> {conns,accepted,rejected,rejAt,frames}; GET /mock/ctl?ws=0|1&kill=1&on=0|1&bad=1
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const PORT = +(arg('--port') || 8090);
const PAGE = arg('--page') || path.join(__dirname, 'home.htm');
const KEY = 'abcdefghjk';
let wsOn = !process.argv.includes('--no-ws');
const T0 = Date.now(), stat = { conns: 0, accepted: 0, rejected: 0, rejAt: [], frames: 0 };
const clients = new Set();

// ---- fake device state ----
const EFF = ['Solid', 'Blink', 'Breathe', 'Wipe', 'Wipe Random', 'Random Colors', 'Sweep', 'Dynamic', 'Colorloop', 'Rainbow', 'Scan', 'Fade', 'Theater', 'Chase'];
const PAL = ['Default', '* Random Cycle', '* Color 1', '* Colors 1&2', '* Color Gradient', '* Colors Only', 'Party', 'Cloud', 'Lava', 'Ocean', 'Forest', 'Rainbow'];
const LEN = [30, 60]; // LED counts: LED 1 sends 30 samples, LED 2 sends 48
const state = {
  on: true, bri: +(arg('--bri') || 128),
  seg: [0, 1].map(id => ({ id, on: true, bri: 255, fx: id ? 9 : 2, sx: 128, ix: 128, pal: 0, c1: 0, c2: 0, c3: 0, o1: false, o2: false, o3: false,
    col: [[255, 120, 20], [0, 0, 255], [0, 0, 0]] }))
};
const cfg = {
  name: 'Mock', key: KEY, pinSet: true, pinReq: false, rev: 1, ce: 0, seg: [0, 1], mic: false, lvl: 128,
  relays: [0, 1, 2, 3].map(i => ({ n: ['Lamp', 'Fan', 'TV', 'Heater'][i], i, p: -1, al: true, po: 0, ao: 0, keep: false, e: 0 })),
  sw: [{ p: -1, t: 1, m: 0, r: 0, inv: false, e: 0 }],
  pir: [{ n: 'Hall', p: -1, en: true, hold: 60, undo: true, night: false, a: [], e: 0 }],
  sc: [{ n: 'Evening', a: [[4, 1, 3]] }],
  bm: [{ n: 'Calm', fx: 2, g: [0xff7814, 0x2040ff] }, { n: 'Party', fx: 9, snd: false, g: [0xff0000, 0x00ff00, 0x0000ff] }],
  moods: [], lim: { moods: 8, act: 4, sch: 8 }, sch: null, away: null, clap: null
};

// colour of sample j (of n) of strip k at time t (ms), before brightness
function hsv(h) { const f = x => { const k = (x + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); }; return [f(5), f(3), f(1)]; }
function sample(k, j, n, t) {
  const s = state.seg[k];
  if (!state.on || !s.on) return [0, 0, 0];
  if (k === 1) return hsv((j / n * 360 + t * 0.12) % 360); // LED 2: moving rainbow
  const c = s.col[0];
  if (s.fx === 2) { const v = (Math.sin(t / 2500 * 2 * Math.PI) + 1) / 2; return c.map(x => Math.round(x * (0.03 + 0.97 * v))); } // breathing
  if (s.fx === 0) return c.slice(); // solid
  return (Math.floor(t / 50) % n) === j ? c.slice() : [0, 0, 0]; // anything else: a running dot
}
function frame(t) {
  const n = LEN.map(l => Math.min(48, l));
  const b = Buffer.alloc(5 + 3 * (n[0] + n[1]));
  b[0] = 0x48; b[1] = 1; b[2] = state.on ? state.bri : 0; b[3] = n[0]; b[4] = n[1];
  let o = 5;
  for (let k = 0; k < 2; k++) for (let j = 0; j < n[k]; j++) { const c = sample(k, j, n[k], t); b[o++] = c[0]; b[o++] = c[1]; b[o++] = c[2]; }
  return b;
}
// /home/live px: 16 samples, brightness applied linearly (like serveLive())
function px(t) {
  return [0, 1].map(k => Array.from({ length: 16 }, (_, j) => sample(k, j, 16, t).map(v => Math.round(v * state.bri / 255))
    .map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()));
}

// ---- websocket (server side: unmasked frames) ----
function wsSend(sock, buf, op = 2) {
  const len = buf.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : Buffer.from([0x80 | op, 126, len >> 8, len & 255]);
  sock.write(Buffer.concat([head, buf]));
}
function upgrade(req, sock) {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/home/ws' || !wsOn) { stat.rejected++; stat.rejAt.push(Date.now() - T0); sock.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'); return; }
  const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  if (u.searchParams.get('k') !== KEY) { stat.rejected++; wsSend(sock, Buffer.from([0x03, 0xf0]), 8); sock.end(); return; } // wrong key: close at once
  stat.accepted++; clients.add(sock);
  while (clients.size > 2) { const old = clients.values().next().value; clients.delete(old); old.destroy(); } // cleanupClients(2)
  stat.conns = clients.size;
  const drop = () => { clients.delete(sock); stat.conns = clients.size; };
  sock.on('data', d => { if ((d[0] & 15) === 8) { wsSend(sock, Buffer.alloc(0), 8); sock.end(); drop(); } }); // client close; anything else is ignored
  sock.on('close', drop); sock.on('error', drop);
}
let last = null, lastSent = 0;
setInterval(() => {
  if (!clients.size) return;
  const now = Date.now(), f = frame(now);
  if (last && f.equals(last) && now - lastSent < 1000) return; // identical frames are skipped, keepalive every 1 s
  last = f; lastSent = now;
  for (const s of clients) { wsSend(s, f); stat.frames++; }
}, 50);

// ---- HTTP ----
const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => r(s)); });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/mock/stat') return json(res, stat);
  if (p === '/mock/ctl') {
    if (u.searchParams.has('ws')) wsOn = u.searchParams.get('ws') === '1';
    if (u.searchParams.has('on')) state.on = u.searchParams.get('on') === '1';
    if (u.searchParams.get('kill') === '1') for (const s of [...clients]) s.destroy();
    if (u.searchParams.get('bad') === '1') for (const s of clients) { // malformed frames the page must ignore
      const g = frame(Date.now());
      const bad = [Buffer.from([0x47, 1, 128, 0, 0]), Buffer.from([0x48, 2, 128, 0, 0]), g.subarray(0, g.length - 1), Buffer.concat([g, Buffer.from([0])]),
        Buffer.from([0x48, 1, 128, 49, 0].concat(Array(147).fill(255))), Buffer.from([0x48, 1]), Buffer.alloc(0)];
      for (const b of bad) wsSend(s, b);
      wsSend(s, Buffer.from('hello'), 1); // text frame
    }
    return json(res, { wsOn, stat });
  }
  if (p === '/home/cfg') { if (req.method === 'POST') { await body(req); return json(res, { ok: true }, 202); } return json(res, cfg); }
  if (p === '/home/live') {
    const t = Date.now();
    return json(res, { r: [1, 0, 0, 0], sw: [0], pir: [0], act: [0], s: state.seg.map(s => ({ on: +s.on, bri: s.bri, fx: EFF[s.fx] || '?' })),
      on: +state.on, bri: state.bri, mic: 0, lvl: 128, vol: -1, rev: cfg.rev, src: [1, 0, 0, 0], ago: [120, 0, 0, 0], away: 0, clap: 0, ts: 1, px: px(t) });
  }
  if (p === '/home/stats') return json(res, { ts: 1, on: [3600, 0, 600, 0], pir: [Array.from({ length: 48 }, (_, i) => i % 7)] });
  if (p === '/json/eff') return json(res, EFF);
  if (p === '/json/pal') return json(res, PAL);
  if (p === '/json/fxdata') return json(res, EFF.map(() => ''));
  if (p === '/json/state' || p === '/json/si' || p === '/json') {
    if (req.method === 'POST') {
      let o = {}; try { o = JSON.parse(await body(req)); } catch (e) { return json(res, { error: 9 }, 400); }
      if (o.on !== undefined) state.on = o.on === 't' ? !state.on : !!o.on;
      if (o.bri !== undefined) state.bri = +o.bri;
      for (const s of [].concat(o.seg || [])) { const t = state.seg.find(x => x.id === s.id); if (t) Object.assign(t, s); }
      return json(res, { success: true });
    }
    return json(res, state);
  }
  if (p === '/home' || p.startsWith('/home/')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(PAGE)); }
  res.writeHead(404); res.end('not found');
});
server.on('upgrade', upgrade);
server.listen(PORT, '127.0.0.1', () => console.log('mock on http://127.0.0.1:' + PORT + '/home' + (wsOn ? '' : ' (ws refused)')));
