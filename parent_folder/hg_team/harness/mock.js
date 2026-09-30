// Zero-dependency mock of a Home Gadgets device (contract v2/v2.1) for screenshot tests of home.htm.
// Adapted from session eaa0bf84's hgtest/mock.js: effect names/metadata come from the real FX.h/FX.cpp,
// palettes from FX_fcn.cpp, built-in moods and limits from home_gadgets.cpp (read-only, never written).
// Live data is a fixed snapshot (no randomness) so screenshots are reproducible.
//
// Standalone:  node mock.js --page <home.htm> [--port 8790] [--repo <WLED tree>] [--no-pin]
// From code:   const { start } = require('./mock'); const m = await start({ page, port: 0 }); ... m.close();
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const DEFAULT_REPO = 'C:/Users/DigvijayPatilLM/Downloads/WLED-main/WLED-main';

// the WLED tree: walk up from the page (usermods/home_gadgets/home.htm -> repo root), else the default checkout
function findRepo(page, repo) {
	if (repo) return repo;
	for (let d = path.dirname(path.resolve(page)); d !== path.dirname(d); d = path.dirname(d))
		if (fs.existsSync(path.join(d, 'wled00', 'FX.h'))) return d;
	return fs.existsSync(path.join(DEFAULT_REPO, 'wled00', 'FX.h')) ? DEFAULT_REPO : null;
}
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };

function loadSource(repo, page) {
	const out = { eff: ['Solid', 'Blink', 'Colorwaves', 'Twinklefox', 'Gravcenter'], fxd: ['', '', '', '', ''], pal: ['Default', 'Party', 'April Night', 'Pastel'], bm: [], lim: {}, notes: [] };
	const fxh = repo && read(path.join(repo, 'wled00/FX.h')), fxc = repo && read(path.join(repo, 'wled00/FX.cpp'));
	if (fxh && fxc) {
		const ids = {}; let maxId = 0;
		for (const m of fxh.matchAll(/#define\s+FX_MODE_(\w+)\s+(\d+)/g)) { ids[m[1]] = +m[2]; maxId = Math.max(maxId, +m[2]); }
		const eff = Array(maxId + 1).fill('RSVD'), fxd = Array(maxId + 1).fill('');
		for (const m of fxc.matchAll(/_data_FX_MODE_(\w+)\[\]\s*PROGMEM\s*=\s*"((?:[^"\\]|\\.)*)"/g)) {
			const id = ids[m[1]]; if (id === undefined) continue;
			const s = m[2], at = s.indexOf('@');
			eff[id] = at < 0 ? s : s.slice(0, at); fxd[id] = at < 0 ? '' : s.slice(at + 1);
		}
		out.eff = eff; out.fxd = fxd;
	} else out.notes.push('FX.h/FX.cpp not found: using a tiny effect list');
	const fcn = repo && read(path.join(repo, 'wled00/FX_fcn.cpp'));
	const tag = 'JSON_palette_names[] PROGMEM = R"=====(';
	if (fcn && fcn.includes(tag)) { const i = fcn.indexOf(tag) + tag.length; out.pal = JSON.parse(fcn.slice(i, fcn.indexOf(')=====";', i))); }
	else out.notes.push('palette names not found');
	// home_gadgets.cpp next to the page first (a draft copy may have its own), then the repo's
	const hg = read(path.join(path.dirname(path.resolve(page)), 'home_gadgets.cpp')) || (repo && read(path.join(repo, 'usermods/home_gadgets/home_gadgets.cpp')));
	if (hg) {
		for (const m of hg.matchAll(/\{"([^"]+)",\s*"([^"]+)",\s*"([^"]*)",\s*\d+,\s*\d+,\s*\d+,\s*\{[^}]*\},\s*\{([^}]*)\},\s*(true|false)\}/g))
			out.bm.push({ n: m[1], fx: m[2], snd: m[5] === 'true', g: m[4].split(',').map(x => parseInt(x.trim(), 16) || 0) });
		const c = n => { const m = hg.match(new RegExp('constexpr\\s+\\w+\\s+' + n + '\\s*=\\s*(\\d+)')); return m ? +m[1] : undefined; };
		out.lim = { act: c('HG_ACTIONS'), moods: c('HG_CUSTOM_MOODS'), scenes: c('HG_SCENES'), sch: c('HG_SCHEDULES'), mbase: c('HG_MOOD_CUSTOM_BASE'), icons: c('HG_ICON_COUNT') };
	} else out.notes.push('home_gadgets.cpp not found: built-in moods are placeholders');
	if (!out.bm.length) out.bm = [{ n: 'Party', fx: 'Gravcenter', snd: true, g: [0xFF00A0, 0xFF6A00, 0x2040FF] }, { n: 'Calm', fx: 'Colorwaves', snd: false, g: [0xA8E6CF, 0xDCD3FF, 0xFFD3B6] }];
	const def = { act: 8, moods: 12, scenes: 6, sch: 8, mbase: 100, icons: 16 };
	for (const k in def) if (out.lim[k] === undefined) out.lim[k] = def[k];
	return out;
}

// realistic device: 8 appliances, 2 motion sensors, 3 scenes + 3 empty slots, 2 schedules, away and clap set up
function makeDevice(src, opt) {
	const { eff, pal, bm, lim } = src;
	const KEY = 'k3yt3stabc';
	const mood = n => Math.max(0, bm.findIndex(b => b.n === n)); // built-in mood id by name (0 if the firmware renamed it)
	// [name, icon index into ICONS of home.htm, keep ("stays on"), power-on (0 off, 1 on, 2 last), auto-off minutes]
	const R = [['Hall Light', 0, 0, 2, 0], ['Fan', 1, 0, 0, 0], ['Lamp', 9, 0, 2, 0], ['TV', 2, 0, 0, 0],
		['Speaker', 7, 0, 0, 0], ['Fridge', 3, 1, 1, 0], ['Porch', 12, 0, 0, 0], ['Heater', 10, 0, 0, 45]];
	const cfg = {
		v: 1, key: KEY, seg: [0, 1], mic: true, lvl: 128,
		relays: R.map(([n, i, keep, po, ao], k) => ({ n, p: [4, 13, 18, 19, 23, 25, 26, 27][k], i, al: true, keep: !!keep, po, ao })),
		sw: [14, 32, 33, 21, 22, 5, 15, 35].map((p, i) => ({ p, t: i < 6 ? 1 : 0, m: 0, r: i, inv: false })),
		pir: [{ n: 'Hallway', p: 34, en: true, night: true, undo: true, hold: 120, a: [[1, 0, 0], [4, mood('Night Path'), 1]] },
			{ n: 'Porch', p: 39, en: true, night: true, undo: true, hold: 300, a: [[1, 6, 0]] }],
		clap: { en: true, a2: [[3, 2, 0]], a3: [[7, 0, 0]] },
		sc: [{ n: 'Party', a: [[1, 4, 0], [4, 0, 3]] }, { n: 'Movie', a: [[2, 0, 0], [4, 2, 2]] }, { n: 'Good night', a: [[7, 0, 0]] },
			{ n: '', a: [] }, { n: '', a: [] }, { n: '', a: [] }],
		sch: [{ n: 'Porch at sunset', en: true, d: 127, t: 2, m: 15, a: [[1, 6, 0]] },
			{ n: 'Heater off', en: true, d: 31, t: 0, m: 1380, a: [[2, 7, 0]] }],
		away: { en: false, rel: 0b00001101, from: 1140, to: 1410, min: 20, max: 45, mood: mood('Away'), ms: 3 },
		moods: [{ id: 100, rep: -1, n: 'Sunset photo', fx: 'Colorwaves', pal: '* Color Gradient', fxid: Math.max(0, eff.indexOf('Colorwaves')), palid: Math.max(0, pal.indexOf('* Color Gradient')),
			sx: 128, ix: 128, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false, bri: 180, col: [0xFF7A30, 0xC03A6A, 0x3A2A80] }],
		// read-only page info (forPage)
		name: 'Living Room', ce: false, rev: 1, pinReq: false, pinSet: !opt.noPin, lim, bm
	};
	const seg = [
		{ id: 0, start: 0, stop: 60, on: true, bri: 200, fx: Math.max(0, eff.indexOf('Colorwaves')), sx: 128, ix: 128, c1: 128, c2: 128, c3: 16, o1: false, o2: false, o3: false, pal: Math.max(0, pal.indexOf('Sunset')), col: [[255, 122, 48], [192, 58, 106], [58, 42, 128]] },
		{ id: 1, start: 60, stop: 120, on: true, bri: 150, fx: Math.max(0, eff.indexOf('Twinklefox')), sx: 60, ix: 80, c1: 0, c2: 0, c3: 0, o1: false, o2: false, o3: false, pal: Math.max(0, pal.indexOf('April Night')), col: [[40, 80, 255], [140, 50, 220], [20, 20, 90]] }
	];
	const live = { r: [1, 1, 0, 1, 0, 1, 0, 0], sw: [1, 0, 0, 1, 0, 0, 0, 0], pir: [1, 0], act: [1, 0], on: 1, bri: 128, mic: 1, lvl: 128, vol: 37, rev: 1,
		src: [3, 1, 6, 2, 4, 10, 6, 7], ago: [95, 2280, 5400, 1500, 7200, 86400 * 3, 43200, 3600], away: 0, clap: 1, ts: 1 };
	// Hallway busy in the morning and evening, porch mostly in the evening; relays with a few hours of on-time
	const stats = { ts: 1, on: [9900, 14400, 5100, 7080, 2700, 73800, 0, 2700],
		pir: [Array.from({ length: 48 }, (_, i) => i >= 13 && i <= 17 ? 4 + (i % 3) : i >= 36 && i <= 44 ? 3 + (i % 4) : i % 11 === 0 ? 1 : 0),
			Array.from({ length: 48 }, (_, i) => i >= 37 && i <= 40 ? 2 + (i % 2) : 0)] };
	return { KEY, cfg, seg, live, stats };
}

async function start(opt) {
	const page = path.resolve(opt.page);
	if (!fs.existsSync(page)) throw new Error('page not found: ' + page);
	const repo = findRepo(page, opt.repo), src = loadSource(repo, page);
	const dev = makeDevice(src, opt), { KEY, cfg, seg, live, stats } = dev, { eff, pal, fxd } = src;
	const log = []; // requests that failed on the mock side (404, bad key, ...)

	const send = (res, code, b, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' }); res.end(typeof b === 'string' ? b : JSON.stringify(b)); };
	const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
	const hx = a => a.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
	const liveNow = () => {
		live.s = seg.map(s => ({ on: s.on ? 1 : 0, bri: s.bri, fx: eff[s.fx] || '?' }));
		// 16 samples per strip: a static gradient through the segment's colours (brightness applied)
		live.px = seg.map(s => Array.from({ length: 16 }, (_, i) => {
			if (!s.on) return '000000';
			const t = i / 15 * 2, a = s.col[Math.floor(t)] || s.col[0], b = s.col[Math.min(2, Math.floor(t) + 1)] || a, f = t - Math.floor(t), k = s.bri / 255;
			return hx(a.map((v, j) => (v + (b[j] - v) * f) * k));
		}));
		return live;
	};
	const pins = () => ({ pins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39].map(k => {
		const ours = cfg.relays.some(r => r.p === k) || cfg.sw.some(s => s.p === k) || cfg.pir.some(s => s.p === k);
		const o = { p: k, c: (k >= 34 ? 0x20 : 0) | ([0, 2, 5, 12, 15].includes(k) ? 0x08 : 0), a: false };
		if (ours) Object.assign(o, { a: true, o: 59, n: 'Home Gadgets' });
		if (k === 16 || k === 17) Object.assign(o, { a: true, o: 0x82, n: 'LEDs' });
		if (k === 1 || k === 3) Object.assign(o, { a: true, o: 0, n: 'Serial' });
		return o;
	}) });

	const server = http.createServer(async (req, res) => {
		const u = new URL(req.url, 'http://x'), p = u.pathname;
		try {
			if ((p === '/home' || p === '/home.htm') && req.method === 'GET') return send(res, 200, fs.readFileSync(page, 'utf8'), 'text/html; charset=utf-8'); // re-read on every request
			if (p === '/home/cfg' && req.method === 'GET') return send(res, 200, cfg);
			if (p === '/home/cfg' && req.method === 'POST') {
				if (u.searchParams.get('k') !== KEY) { log.push('403 POST /home/cfg (bad key)'); return send(res, 403, { ok: false, err: 'key' }); }
				const b = JSON.parse(await body(req) || '{}');
				for (const k of Object.keys(b)) if (k in cfg && !['cap', 'newkey', 'key', 'bm', 'lim', 'name', 'rev', 'ce', 'pinReq', 'pinSet'].includes(k)) cfg[k] = b[k];
				if (b.newkey) cfg.key = dev.KEY = 'n3wk3yabcd';
				cfg.rev++; live.rev = cfg.rev; return send(res, 202, { ok: true });
			}
			if (p === '/home/live') return send(res, 200, liveNow());
			if (p === '/home/stats') return send(res, 200, stats);
			if (p === '/home/api') return send(res, u.searchParams.get('k') === cfg.key ? 200 : 403, { ok: u.searchParams.get('k') === cfg.key });
			if (p === '/json/eff') return send(res, 200, eff);
			if (p === '/json/pal') return send(res, 200, pal);
			if (p === '/json/fxdata') return send(res, 200, fxd);
			if (p === '/json/pins') return send(res, 200, pins());
			if (p === '/json/state' && req.method === 'GET') return send(res, 200, { on: true, bri: 128, seg });
			if (p === '/json/state' && req.method === 'POST') {
				const b = JSON.parse(await body(req) || '{}'), g = b.HomeGadgets;
				if (g) {
					if ((g.relay !== undefined || g.scene !== undefined || g.alloff || g.away !== undefined) && g.k !== cfg.key) log.push('state command without valid key: ' + JSON.stringify(g));
					else {
						if (g.relay !== undefined) { const i = g.relay; live.r[i] = g.on === 't' ? 1 - live.r[i] : +!!g.on; live.src[i] = 1; live.ago[i] = 0; }
						if (g.away !== undefined) { cfg.away.en = !!g.away; }
						if (g.alloff) live.r = live.r.map((v, i) => cfg.relays[i].keep ? v : 0);
					}
					if (g.mic !== undefined) { cfg.mic = !!g.mic; live.mic = +!!g.mic; }
					if (g.lvl !== undefined) cfg.lvl = live.lvl = g.lvl;
				}
				if (b.on !== undefined) live.on = +!!b.on;
				for (const o of [].concat(b.seg || [])) { const s = seg.find(x => x.id === (o.id ?? 0)); if (!s) continue; for (const k of Object.keys(o)) if (k !== 'id' && k !== 'fxdef') s[k] = o[k]; }
				return send(res, 200, { success: true });
			}
			if (p === '/' || p.startsWith('/settings')) return send(res, 200, '<!DOCTYPE html><meta charset="utf-8"><title>WLED mock</title><p>WLED main UI is not part of this mock. <a href="/home">/home</a></p>', 'text/html; charset=utf-8');
			log.push('404 ' + req.method + ' ' + p);
			send(res, 404, { error: 'not found', path: p });
		} catch (e) { log.push('500 ' + p + ': ' + e); send(res, 500, { error: String(e) }); }
	});
	await new Promise((ok, fail) => { server.once('error', fail); server.listen(opt.port || 0, '127.0.0.1', ok); });
	const port = server.address().port;
	return { port, url: 'http://127.0.0.1:' + port, repo, notes: src.notes, counts: { effects: eff.filter(x => x && x !== 'RSVD').length, palettes: pal.length, moods: src.bm.length }, log,
		close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) };
}
module.exports = { start };

if (require.main === module) {
	const a = process.argv.slice(2), val = f => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
	const page = val('--page') || (a[0] && !a[0].startsWith('--') ? a[0] : path.join(DEFAULT_REPO, 'usermods/home_gadgets/home.htm'));
	start({ page, port: +(val('--port') || 8790), repo: val('--repo'), noPin: a.includes('--no-pin') })
		.then(m => console.log(`mock on ${m.url}/home  page=${page}  repo=${m.repo}  effects=${m.counts.effects} palettes=${m.counts.palettes} moods=${m.counts.moods}${m.notes.length ? '  notes: ' + m.notes.join('; ') : ''}`))
		.catch(e => { console.error(e.message); process.exit(1); });
}
