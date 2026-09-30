// Screenshot harness for usermods/home_gadgets/home.htm – Wiring tab variant of shoot.js.
// Starts ./mock.js (serves the given page at /home), drives headless Chrome (or Edge) over the DevTools
// protocol with Node's built-in WebSocket (Node 22+, no npm packages), saves full-page PNGs and prints
// console errors, exceptions, failed requests and horizontal-overflow warnings.
//
// Usage: node shoot_wiring.js <path-to-home.htm> <outdir> [--no-pin] [--dpr 2] [--clock 20:15|real] [--browser <exe>] [--guide N]
//   --guide    start the guided check at step N (0-based), e.g. to see its Back button
//   --no-pin   device reports pinSet:false, so the "no settings PIN" banner shows
//   --dpr      device pixel ratio of the screenshots (default 1)
//   --clock    local time the page sees (default 20:15, keeps the "Today" heat map reproducible); "real" = now
//   --browser  Chrome/Edge executable (default: Chrome, then Edge; or env CHROME_PATH)
// Exit code: 0 = ok, 2 = the page logged errors, 1 = harness failure.
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { start } = require('./mock');

// what to capture: tab = location.hash of home.htm, scheme = prefers-color-scheme
const SHOTS = [
	{ name: 'wiring_390_light', tab: 'wiring', w: 390, h: 844, scheme: 'light' },
	{ name: 'wiring_390_dark', tab: 'wiring', w: 390, h: 844, scheme: 'dark' },
	{ name: 'wiring_1280_light', tab: 'wiring', w: 1280, h: 900, scheme: 'light' }
];
const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const argv = process.argv.slice(2), flag = f => argv.includes(f), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i && ['--dpr', '--clock', '--browser', '--guide'].includes(argv[i - 1])));
if (pos.length < 2) { console.error('usage: node shoot.js <path-to-home.htm> <outdir> [--no-pin] [--dpr N] [--clock HH:MM|real] [--browser exe]'); process.exit(1); }
const GUIDE = val('--guide');
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
	const mock = await start({ page: PAGE, port: 0, noPin: flag('--no-pin') });
	console.log(`mock   ${mock.url}/home  (page ${PAGE}; effects ${mock.counts.effects}, palettes ${mock.counts.palettes}, built-in moods ${mock.counts.moods})`);
	if (mock.notes.length) console.log('note   ' + mock.notes.join('; '));
	console.log('browser ' + EXE);

	const prof = path.join(__dirname, '.profile-' + process.pid);
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
		if (GUIDE) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{sessionStorage.setItem('hgGuide','${GUIDE | 0}')}catch(e){}` });
		const evalJs = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? undefined : r.result.value; };

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
			let ready = false;
			for (let i = 0; i < 100 && !ready; i++) {
				ready = await evalJs(`(()=>{const t=document.querySelector('#t-${s.tab}'),c=document.querySelector('#conn');return !!t&&!t.hidden&&t.children.length>0&&!!t.querySelector('.wire')&&!!c&&c.classList.contains('ok')})()`);
				if (!ready) await sleep(100);
			}
			if (!ready) err('harness', `tab "${s.tab}" did not render within 10 s`);
			await sleep(1200); // /home/stats, a second /home/live poll, canvas preview, CSS transitions
			const ov = await evalJs(`(()=>{const e=document.documentElement,w=e.clientWidth,bad=[];for(const el of document.querySelectorAll('main *')){const r=el.getBoundingClientRect();if(r.width&&r.right>w+1)bad.push(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):'')+' right='+Math.round(r.right))}return {sw:e.scrollWidth,w,bad:bad.slice(0,5)}})()`);
			if (ov && ov.sw > ov.w) err('overflow', `page is ${ov.sw}px wide in a ${ov.w}px viewport: ${ov.bad.join(', ')}`);
			// full page: grow the viewport to the content height, so fixed elements (bottom nav, desktop sidebar)
			// end up where a user scrolled to the end would see them instead of floating over the middle
			const m = await cdp.send('Page.getLayoutMetrics');
			const width = m.cssLayoutViewport.clientWidth, height = Math.min(16000, Math.max(s.h, Math.ceil(m.cssContentSize.height)));
			await cdp.send('Emulation.setDeviceMetricsOverride', { width: s.w, height, deviceScaleFactor: DPR, mobile });
			await sleep(300);
			const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
			const file = path.join(OUT, s.name + '.png');
			fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
			report.shots.push({ name: s.name, file, tab: s.tab, viewport: s.w + 'x' + s.h, scheme: s.scheme, size: Math.round(width * DPR) + 'x' + Math.round(height * DPR), errors: cur.errors.length });
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
	for (const s of report.shots) console.log(`  ${s.file}  (${s.tab}, ${s.viewport} ${s.scheme}, image ${s.size})`);
	console.log('  ' + path.join(OUT, 'report.json'));
	if (mock.log.length) console.log('\nmock log:\n  ' + [...new Set(mock.log)].join('\n  '));
	const uniq = [...new Set(report.errors)];
	console.log(uniq.length ? `\npage errors (${uniq.length}):\n  ` + uniq.join('\n  ') : '\npage errors: none');
	process.exit(uniq.length ? 2 : 0);
})().catch(e => { console.error('harness failed: ' + (e && e.stack || e)); process.exit(1); });
