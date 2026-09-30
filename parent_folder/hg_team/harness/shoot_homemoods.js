// Screenshot harness for the Home, Moods and Adjust views of home.htm (Home Gadgets).
// Based on shoot.js: starts ./mock.js in-process, drives headless Chrome (or Edge) over the DevTools protocol
// (Node 22+ WebSocket, no npm packages), saves PNGs and prints console errors, exceptions, failed requests
// and horizontal-overflow warnings.
//
// Tab shots are full-page. Dialog shots (Adjust panel, mood menu, name prompt) are taken at the normal viewport
// size; a tall dialog box is scrolled and captured in parts (<name>_1.png, <name>_2.png, ...).
//
// Usage: node shoot_homemoods.js <page.htm> <outdir> [--dpr 2] [--clock 20:15|real] [--browser <exe>]
// Exit code: 0 = ok, 2 = the page logged errors, 1 = harness failure.
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { start } = require('./mock');

// tab = location.hash; open = what to open after the tab rendered:
//   'adjust'   -> "Adjust" button of the first LED strip card on Home (fx: effect to pick in its list first)
//   'moodmenu' -> ⋯ button of the first mood card on Moods
//   'askname'  -> "＋ Save current look as mood" on Moods, then "LED 1" -> the name prompt
// The mock keeps state between shots, so shots that pick another effect come last.
const SHOTS = [
	{ name: 'home_390_light', tab: 'home', w: 390, h: 844, scheme: 'light' },
	{ name: 'home_390_dark', tab: 'home', w: 390, h: 844, scheme: 'dark' },
	{ name: 'home_1280_light', tab: 'home', w: 1280, h: 900, scheme: 'light' },
	{ name: 'moods_390_light', tab: 'moods', w: 390, h: 844, scheme: 'light' },
	{ name: 'moods_390_dark', tab: 'moods', w: 390, h: 844, scheme: 'dark' },
	{ name: 'moods_1280_light', tab: 'moods', w: 1280, h: 900, scheme: 'light' },
	{ name: 'moodmenu_390_light', tab: 'moods', w: 390, h: 844, scheme: 'light', open: 'moodmenu' },
	{ name: 'askname_390_light', tab: 'moods', w: 390, h: 844, scheme: 'light', open: 'askname' },
	{ name: 'adjust_390_light', tab: 'home', w: 390, h: 844, scheme: 'light', open: 'adjust' },
	{ name: 'adjust_390_dark', tab: 'home', w: 390, h: 844, scheme: 'dark', open: 'adjust' },
	{ name: 'adjust_1280_light', tab: 'home', w: 1280, h: 900, scheme: 'light', open: 'adjust' },
	{ name: 'adjsolid_390_light', tab: 'home', w: 390, h: 844, scheme: 'light', open: 'adjust', fx: 'Solid' },
	{ name: 'adjsnd_390_light', tab: 'home', w: 390, h: 844, scheme: 'light', open: 'adjust', fx: 'Gravcenter' },
	{ name: 'adjsnd_390_dark', tab: 'home', w: 390, h: 844, scheme: 'dark', open: 'adjust', fx: 'Gravcenter' },
	{ name: 'adjsnd_1280_light', tab: 'home', w: 1280, h: 900, scheme: 'light', open: 'adjust', fx: 'Gravcenter' }
];
const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i && ['--dpr', '--clock', '--browser'].includes(argv[i - 1])));
if (pos.length < 2) { console.error('usage: node shoot_homemoods.js <page.htm> <outdir> [--dpr N] [--clock HH:MM|real] [--browser exe]'); process.exit(1); }
const PAGE = path.resolve(pos[0]), OUT = path.resolve(pos[1]), DPR = +val('--dpr', 1), CLOCK = val('--clock', '20:15');
const EXE = val('--browser') || BROWSERS.find(p => p && fs.existsSync(p));

// shifts the page's clock to CLOCK today (time keeps running), injected before any page script
function clockScript() {
	if (CLOCK === 'real') return null;
	const [hh, mm] = CLOCK.split(':').map(Number);
	return `(()=>{const RD=Date,n=new RD(),off=new RD(n.getFullYear(),n.getMonth(),n.getDate(),${hh | 0},${mm | 0},0).getTime()-RD.now();
function D(...a){ if(!new.target) return new D().toString(); return a.length?new RD(...a):new RD(RD.now()+off); }
D.prototype=RD.prototype; D.now=()=>RD.now()+off; D.parse=RD.parse; D.UTC=RD.UTC; window.Date=D;})();`;
}

async function launch(prof) {
	fs.rmSync(prof, { recursive: true, force: true });
	const proc = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check',
		'--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-sync', '--disable-background-networking', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
	let port = 0;
	for (let i = 0; i < 100 && !port; i++) { // the browser writes its random debugging port into the profile
		await sleep(150);
		try { port = +fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) {}
		if (proc.exitCode !== null) throw new Error('browser exited early (code ' + proc.exitCode + ')');
	}
	if (!port) throw new Error('browser did not open a debugging port');
	let target;
	for (let i = 0; i < 50 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch (e) {} if (!target) await sleep(100); }
	if (!target) throw new Error('no page target');
	return { proc, port, wsUrl: target.webSocketDebuggerUrl };
}

// minimal CDP client: send(method, params) -> result, on(event, fn)
async function connect(wsUrl) {
	const ws = new WebSocket(wsUrl), pend = new Map(), handlers = {};
	await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('websocket error')); });
	let id = 0;
	ws.onmessage = ev => {
		const m = JSON.parse(ev.data);
		if (m.id && pend.has(m.id)) { const [ok, fail] = pend.get(m.id); pend.delete(m.id); m.error ? fail(new Error(m.error.message)) : ok(m.result); }
		else if (m.method && handlers[m.method]) handlers[m.method].forEach(f => f(m.params));
	};
	return {
		send: (method, params = {}) => new Promise((ok, fail) => { const i = ++id; pend.set(i, [ok, fail]); ws.send(JSON.stringify({ id: i, method, params })); }),
		on: (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn),
		close: () => ws.close()
	};
}

(async () => {
	if (!fs.existsSync(PAGE)) throw new Error('page not found: ' + PAGE);
	if (!EXE) throw new Error('no Chrome or Edge found; pass --browser <exe>');
	if (typeof WebSocket === 'undefined') throw new Error('Node ' + process.version + ' has no global WebSocket; use Node 22 or newer');
	fs.mkdirSync(OUT, { recursive: true });
	const mock = await start({ page: PAGE, port: 0 });
	console.log(`mock   ${mock.url}/home  (page ${PAGE}; effects ${mock.counts.effects}, palettes ${mock.counts.palettes}, built-in moods ${mock.counts.moods})`);
	if (mock.notes.length) console.log('note   ' + mock.notes.join('; '));
	console.log('browser ' + EXE);

	const prof = path.join(__dirname, '.profile-hm-' + process.pid);
	let br, cdp;
	const report = { page: PAGE, browser: EXE, shots: [], errors: [], mockLog: mock.log };
	try {
		br = await launch(prof);
		cdp = await connect(br.wsUrl);
		let cur = null, loaded = null; // current shot's error list, load-event resolver
		const err = (kind, text) => { const e = `[${cur ? cur.name : '-'}] ${kind}: ${text}`; if (cur) cur.errors.push(e); report.errors.push(e); };
		cdp.on('Runtime.consoleAPICalled', p => { if (['error', 'warning', 'assert'].includes(p.type)) err('console.' + p.type, p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')); });
		cdp.on('Runtime.exceptionThrown', p => { const d = p.exceptionDetails; err('exception', (d.exception && d.exception.description || d.text) + (d.url ? ` (${d.url}:${d.lineNumber + 1})` : '')); });
		cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error' && p.entry.source !== 'network') err('log', p.entry.text + (p.entry.url ? ' ' + p.entry.url : '')); });
		cdp.on('Network.responseReceived', p => { if (p.response.status >= 400) err('http ' + p.response.status, p.response.url); });
		cdp.on('Network.loadingFailed', p => { if (!p.canceled) err('request failed', p.errorText + ' (' + p.type + ')'); });
		cdp.on('Page.javascriptDialogOpening', p => { err('dialog', p.message); cdp.send('Page.handleJavaScriptDialog', { accept: false }); });
		cdp.on('Page.loadEventFired', () => loaded && loaded());
		await Promise.all(['Runtime.enable', 'Page.enable', 'Log.enable', 'Network.enable'].map(m => cdp.send(m)));
		const cs = clockScript(); if (cs) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: cs });
		const evalJs = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? undefined : r.result.value; };
		const waitFor = async (expr, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await evalJs(expr)) return true; await sleep(100); } return false; };
		const save = (name, data) => { const file = path.join(OUT, name + '.png'); fs.writeFileSync(file, Buffer.from(data, 'base64')); return file; };

		for (const s of SHOTS) {
			cur = { ...s, errors: [] };
			const mobile = s.w < 600;
			await cdp.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: DPR, mobile });
			await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
			// reduced motion stops the animated mood gradients, so repeated runs give identical pictures
			await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: s.scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
			const load = new Promise(r => { loaded = r; });
			await cdp.send('Page.navigate', { url: `${mock.url}/home?shot=${s.name}#${s.tab}` }); // query string forces a real reload between shots
			await Promise.race([load, sleep(10000)]);
			const ready = await waitFor(`(()=>{const t=document.querySelector('#t-${s.tab}'),c=document.querySelector('#conn');return !!t&&!t.hidden&&t.children.length>0&&!!c&&c.classList.contains('ok')})()`, 10000);
			if (!ready) err('harness', `tab "${s.tab}" did not render within 10 s`);
			await sleep(1200); // /home/stats, a second /home/live poll, canvas preview, CSS transitions
			const ov = await evalJs(`(()=>{const e=document.documentElement,w=e.clientWidth,bad=[];for(const el of document.querySelectorAll('main *, .modal *')){const r=el.getBoundingClientRect();if(r.width&&r.right>w+1)bad.push(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')+' right='+Math.round(r.right))}return {sw:e.scrollWidth,w,bad:bad.slice(0,5)}})()`);
			if (ov && ov.sw > ov.w) err('overflow', `page is ${ov.sw}px wide in a ${ov.w}px viewport: ${ov.bad.join(', ')}`);

			if (!s.open) {
				// full page: grow the viewport to the content height, so fixed elements (bottom nav, desktop sidebar)
				// end up where a user scrolled to the end would see them instead of floating over the middle
				const m = await cdp.send('Page.getLayoutMetrics');
				const width = m.cssLayoutViewport.clientWidth, height = Math.min(16000, Math.max(s.h, Math.ceil(m.cssContentSize.height)));
				await cdp.send('Emulation.setDeviceMetricsOverride', { width: s.w, height, deviceScaleFactor: DPR, mobile });
				await sleep(300);
				const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
				const file = save(s.name, shot.data);
				report.shots.push({ name: s.name, files: [file], tab: s.tab, viewport: s.w + 'x' + s.h, scheme: s.scheme, errors: cur.errors.length });
				continue;
			}

			// dialogs
			let opened = false;
			if (s.open === 'adjust') {
				await evalJs(`(()=>{const b=[...document.querySelectorAll('#t-home .grid2 .card button')].find(x=>x.textContent.trim()==='Adjust');if(b)b.click();return !!b})()`);
				opened = await waitFor(`!!document.querySelector('.modal .box.tall .fxl button')`, 8000);
				if (opened && s.fx) {
					const ok = await evalJs(`(()=>{const b=[...document.querySelectorAll('.modal .fxl button')].find(x=>x.textContent.replace(' 🎵','')===${JSON.stringify(s.fx)});if(b)b.click();return !!b})()`);
					if (!ok) err('harness', `effect "${s.fx}" not found in the list`);
					await sleep(1500); // sendNow + reload (250 ms) + drawCtl
				}
			} else if (s.open === 'moodmenu') {
				await evalJs(`(()=>{const b=document.querySelector('#t-moods .card.mood .body button:last-of-type');if(b)b.click();return !!b})()`);
				opened = await waitFor(`!!document.querySelector('.modal .box')`, 3000);
			} else if (s.open === 'askname') {
				await evalJs(`(()=>{const b=[...document.querySelectorAll('#t-moods button')].find(x=>x.textContent.includes('Save current look'));if(b)b.click();return !!b})()`);
				await waitFor(`!!document.querySelector('.modal .box')`, 3000);
				await evalJs(`(()=>{const b=[...document.querySelectorAll('.modal .box button')].find(x=>x.textContent==='LED 1');if(b)b.click();return !!b})()`);
				opened = await waitFor(`!!document.querySelector('.modal .box input')`, 3000);
			}
			if (!opened) { err('harness', `could not open "${s.open}"`); continue; }
			await sleep(700);
			const ov2 = await evalJs(`(()=>{const w=document.documentElement.clientWidth,bad=[];for(const el of document.querySelectorAll('.modal .box *')){const r=el.getBoundingClientRect();if(r.width&&r.right>w+1)bad.push(el.tagName.toLowerCase()+' right='+Math.round(r.right))}const b=document.querySelector('.modal .box');return {bad:bad.slice(0,5),boxOverflowX:b.scrollWidth>b.clientWidth}})()`);
			if (ov2 && (ov2.bad.length || ov2.boxOverflowX)) err('overflow', 'dialog: ' + JSON.stringify(ov2));
			// scroll a tall dialog box in steps and capture each step
			const files = [];
			const info = await evalJs(`(()=>{const b=document.querySelector('.modal .box');b.scrollTop=0;return {sh:b.scrollHeight,ch:b.clientHeight}})()`);
			const step = Math.max(200, info.ch - 60);
			for (let part = 1, top = 0; ; part++, top += step) {
				await evalJs(`document.querySelector('.modal .box').scrollTop=${top}`);
				await sleep(250);
				const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
				files.push(save(info.sh > info.ch ? s.name + '_' + part : s.name, shot.data));
				if (top + info.ch >= info.sh || part >= 6) break;
			}
			report.shots.push({ name: s.name, files, tab: s.tab, open: s.open, fx: s.fx, viewport: s.w + 'x' + s.h, scheme: s.scheme, box: info, errors: cur.errors.length });
		}
		cur = null;
	} finally {
		try { if (cdp) cdp.close(); } catch (e) {}
		if (br) { // close the browser gracefully (so it releases the profile), then make sure it is gone
			try { const v = await (await fetch(`http://127.0.0.1:${br.port}/json/version`)).json(); const b = await connect(v.webSocketDebuggerUrl); await Promise.race([b.send('Browser.close'), sleep(2000)]); } catch (e) {}
			for (let i = 0; i < 30 && br.proc.exitCode === null; i++) await sleep(100);
			if (br.proc.exitCode === null) br.proc.kill();
		}
		await mock.close();
		try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { console.log('note   could not remove ' + prof); }
	}

	fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
	console.log('\nscreenshots:');
	for (const s of report.shots) console.log(`  ${s.name}: ${s.files.map(f => path.basename(f)).join(', ')}  (${s.viewport} ${s.scheme}${s.box ? ', box ' + s.box.sh + '/' + s.box.ch : ''})`);
	console.log('  ' + path.join(OUT, 'report.json'));
	if (mock.log.length) console.log('\nmock log:\n  ' + [...new Set(mock.log)].join('\n  '));
	const uniq = [...new Set(report.errors)];
	console.log(uniq.length ? `\npage errors (${uniq.length}):\n  ` + uniq.join('\n  ') : '\npage errors: none');
	process.exit(uniq.length ? 2 : 0);
})().catch(e => { console.error('harness failed: ' + (e && e.stack || e)); process.exit(1); });
