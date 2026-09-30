// Interaction test for the captioned Settings tab of home.htm (Home Gadgets).
// Starts ./mock.js in-process, drives headless Chrome over CDP (Node 22+ WebSocket, no npm packages),
// records every request the page sends (CDP Network events) and checks captions, accessible names and saving.
// Usage: node itest_settings.js <page.htm> [--port 0] [--browser <exe>]
// Exit code: 0 = all pass, 2 = some test failed, 1 = harness failure.
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { start } = require('./mock');

const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PAGE = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(i && ['--port', '--browser'].includes(argv[i - 1]))) || '../labels2/settings.htm');
const EXE = val('--browser') || BROWSERS.find(p => p && fs.existsSync(p));

// --- browser launch + minimal CDP client (copied from shoot.js) ---
async function launch(prof) {
	fs.rmSync(prof, { recursive: true, force: true });
	const proc = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check',
		'--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-sync', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });
	let port = 0;
	for (let i = 0; i < 100 && !port; i++) {
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

// page-side helpers: appliance row n (1-based) and the plain caption text of every label.field in an element
const HELPERS = `window.__t={
	row:n=>[...document.querySelectorAll('#t-settings .wire')][n-1],
	caps:el=>[...el.querySelectorAll('label.field')].map(l=>[...l.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join('').trim()),
	toast:()=>document.querySelector('#toast').textContent
};true`;
const NAMED_ROLES = ['combobox', 'textbox', 'slider', 'checkbox', 'switch', 'button', 'spinbutton', 'link', 'searchbox', 'listbox'];

(async () => {
	if (!EXE) throw new Error('no Chrome or Edge found; pass --browser <exe>');
	const mock = await start({ page: PAGE, port: +val('--port', 0) });
	const orig = await (await fetch(mock.url + '/home/cfg')).json();
	console.log(`mock ${mock.url}/home  page ${PAGE}\nbrowser ${EXE}`);
	const prof = path.join(__dirname, '.profile-itest-settings-' + process.pid);
	const results = [], errors = [], reqs = [];
	const T = (n, name, pass, evidence) => { results.push({ n, name, pass: !!pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${n}. ${name}\n     ${JSON.stringify(evidence)}`); };
	let br, cdp;
	try {
		br = await launch(prof);
		cdp = await connect(br.wsUrl);
		let loaded = null;
		cdp.on('Runtime.consoleAPICalled', p => { if (['error', 'warning', 'assert'].includes(p.type)) errors.push('console.' + p.type + ': ' + p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')); });
		cdp.on('Runtime.exceptionThrown', p => { const d = p.exceptionDetails; errors.push('exception: ' + (d.exception && d.exception.description || d.text)); });
		cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error' && p.entry.source !== 'network') errors.push('log: ' + p.entry.text); });
		cdp.on('Network.responseReceived', p => { if (p.response.status >= 400) errors.push('http ' + p.response.status + ' ' + p.response.url); });
		cdp.on('Network.loadingFailed', p => { if (!p.canceled) errors.push('request failed: ' + p.errorText); });
		cdp.on('Page.javascriptDialogOpening', p => { errors.push('dialog: ' + p.message); cdp.send('Page.handleJavaScriptDialog', { accept: false }); });
		cdp.on('Network.requestWillBeSent', p => {
			const r = { method: p.request.method, url: p.request.url.replace(mock.url, ''), body: p.request.postData, t: Date.now() };
			reqs.push(r);
			if (r.method === 'POST' && r.body === undefined && p.request.hasPostData) cdp.send('Network.getRequestPostData', { requestId: p.requestId }).then(x => { r.body = x.postData; }).catch(() => {});
		});
		cdp.on('Page.loadEventFired', () => loaded && loaded());
		await Promise.all(['Runtime.enable', 'Page.enable', 'Log.enable', 'Network.enable', 'Accessibility.enable'].map(m => cdp.send(m)));
		const ev = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 200)); return r.result.value; };
		const waitFor = async (expr, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await ev(expr)) return true; await sleep(100); } return false; };
		const cfgPosts = () => reqs.filter(r => r.method === 'POST' && r.url.startsWith('/home/cfg')).map(r => { try { return JSON.parse(r.body); } catch (e) { return r.body; } });

		// ---------- 1. load /home#settings at 390x844 ----------
		await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		const load = new Promise(r => { loaded = r; });
		await cdp.send('Page.navigate', { url: mock.url + '/home#settings' });
		await Promise.race([load, sleep(10000)]);
		const ready = await waitFor(`(()=>{const t=document.querySelector('#t-settings'),c=document.querySelector('#conn');return !!t&&!t.hidden&&t.children.length>0&&c.classList.contains('ok')})()`, 10000);
		await ev(HELPERS);
		await sleep(1500);
		const loadErr = errors.slice();
		const ov = await ev(`(()=>{const e=document.documentElement;return {sw:e.scrollWidth,w:e.clientWidth}})()`);
		T(1, 'load /home#settings 390x844: no console errors, no horizontal scroll', ready && !loadErr.length && ov.sw <= ov.w, { rendered: ready, errors: loadErr, overflow: ov });

		// ---------- 2. captions of appliance row 1 ----------
		const s2 = await ev(`(()=>{const r=__t.row(1),s=r.querySelectorAll('select'),i=r.querySelector('input[type=text]');return {caps:__t.caps(r),iconAria:s[0].getAttribute('aria-label'),placeholder:i.placeholder,stays:r.querySelector('label.row').textContent.trim(),po:[...s[1].options].map(o=>o.text)}})()`);
		T(2, 'appliance row 1 captions: Icon / Appliance 1 – name / After a power cut / Auto-off after, placeholder, stays on', JSON.stringify(s2.caps) === JSON.stringify(['Icon', 'Appliance 1 – name', 'After a power cut', 'Auto-off after']) && s2.iconAria === 'Appliance 1 icon' && s2.placeholder === 'e.g. Lamp' && s2.stays === 'Stays on', s2);

		// ---------- 3. accessibility tree: every control in the page has a name, and no name contains the key ----------
		const ax = (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(n => !n.ignored && n.role && NAMED_ROLES.includes(n.role.value));
		const unnamed = ax.filter(n => !(n.name && String(n.name.value).trim())).map(n => n.role.value);
		const withKey = ax.filter(n => n.name && String(n.name.value).includes(orig.key)).map(n => n.role.value + ': ' + n.name.value);
		const roles = {}; ax.forEach(n => { roles[n.role.value] = (roles[n.role.value] || 0) + 1; });
		const sample = ax.filter(n => n.role.value !== 'button' && n.role.value !== 'link').slice(0, 16).map(n => n.role.value + ': ' + n.name.value);
		T(3, 'every control has an accessible name; none contains the security key', ax.length > 50 && unnamed.length === 0 && withKey.length === 0, { controls: ax.length, roles, unnamed, withKey, sample });

		// ---------- 4. rename appliance 1 via the input event -> POST /home/cfg ----------
		const newName = 'Desk Lamp';
		const n4 = cfgPosts().length;
		await ev(`(()=>{const i=__t.row(1).querySelector('input[type=text]');i.value=${JSON.stringify(newName)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
		await sleep(1600); // markDirty debounce is 700 ms
		const p4 = cfgPosts().slice(n4);
		const b4 = p4[p4.length - 1];
		const others4 = b4 && b4.relays && b4.relays.every((r, i) => i === 0 || JSON.stringify(r) === JSON.stringify(orig.relays[i]));
		await waitFor(`__t.toast()==='Saved ✓'`, 3000);
		const dev4 = await (await fetch(mock.url + '/home/cfg')).json();
		const link4 = await ev(`[...document.querySelectorAll('#t-settings .link')].slice(0,2).map(l=>l.previousSibling.textContent+' | '+l.querySelector('button').getAttribute('aria-label'))`);
		T(4, 'rename appliance 1 -> POST /home/cfg relays[0].n, other relays unchanged, device has it, link captions follow', b4 && b4.relays && b4.relays[0].n === newName && others4 && dev4.relays[0].n === newName && link4[0].includes(newName),
			{ posts: p4.length, keys: b4 && Object.keys(b4), relay0: b4 && b4.relays[0], othersUnchanged: others4, deviceName: dev4.relays[0].n, links: link4 });

		// ---------- 5. power-cut select + stays-on toggle of appliance 2 -> POST ----------
		await sleep(1500);
		const n5 = cfgPosts().length;
		await ev(`(()=>{const r=__t.row(2),s=r.querySelectorAll('select')[1];s.value='2';s.dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('input.sw').click();})()`);
		await sleep(1600);
		const p5 = cfgPosts().slice(n5), b5 = p5[p5.length - 1];
		T(5, 'appliance 2: "After a power cut" = As before and "Stays on" -> POST relays[1].po=2, keep=true', b5 && b5.relays && b5.relays[1].po === 2 && b5.relays[1].keep === true, { posts: p5.length, relay1: b5 && b5.relays && b5.relays[1] });
		await waitFor(`__t.toast()==='Saved ✓'`, 3000);

		// ---------- 6. Copy button, with the clipboard API and execCommand stubbed (headless Chrome has no usable clipboard) ----------
		// the copied text is compared inside the page and never printed: the link holds the security key
		await sleep(2500);
		const e6 = errors.length;
		const copyCase = async (apiOk, execOk) => ev(`(async()=>{
			const cb=navigator.clipboard, oW=cb.writeText, oE=document.execCommand; let got=null, exec=0;
			cb.writeText=t=>{ got=t; return ${apiOk}?Promise.resolve():Promise.reject(new DOMException('Document is not focused.','NotAllowedError')); };
			document.execCommand=c=>{ exec++; return ${execOk}; };
			document.querySelector('#toast').textContent='';
			document.querySelector('#t-settings .link button').click();
			await new Promise(r=>setTimeout(r,300));
			cb.writeText=oW; document.execCommand=oE;
			return {toast:document.querySelector('#toast').textContent,apiGotLink:got===document.querySelector('#t-settings .link input').value,execCalls:exec};
		})()`);
		const c6 = { allowed: await copyCase(true, false), refusedFallbackOk: await copyCase(false, true), refusedFallbackFails: await copyCase(false, false) };
		const ok6 = c6.allowed.toast === 'Link copied' && c6.allowed.apiGotLink && c6.allowed.execCalls === 0
			&& c6.refusedFallbackOk.toast === 'Link copied' && c6.refusedFallbackOk.execCalls === 1
			&& c6.refusedFallbackFails.toast === 'Select and copy the link manually' && errors.length === e6;
		T(6, '"📋 Copy": clipboard API gets the link; refused -> execCommand fallback; both fail -> "Select and copy the link manually"; no exceptions', ok6,
			{ ...c6, errors: errors.slice(e6), button: await ev(`(()=>{const b=document.querySelector('#t-settings .link button');return b.textContent+' | '+b.getAttribute('aria-label')})()`) });
		T('extra', 'no console errors / exceptions during the whole run', errors.length === 0, { errors });
	} finally {
		try { if (cdp) cdp.close(); } catch (e) {}
		if (br) {
			try { const v = await (await fetch(`http://127.0.0.1:${br.port}/json/version`)).json(); const b = await connect(v.webSocketDebuggerUrl); await Promise.race([b.send('Browser.close'), sleep(2000)]); } catch (e) {}
			for (let i = 0; i < 30 && br.proc.exitCode === null; i++) await sleep(100);
			if (br.proc.exitCode === null) br.proc.kill();
		}
		await mock.close();
		try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) {}
	}
	const failed = results.filter(r => !r.pass);
	console.log(`\n${results.length - failed.length}/${results.length} passed` + (failed.length ? ' – failed: ' + failed.map(r => r.n).join(', ') : ''));
	console.log('requests: ' + JSON.stringify(reqs.filter(r => r.method === 'POST').map(r => r.method + ' ' + r.url.split('?')[0])));
	process.exit(failed.length ? 2 : 0);
})().catch(e => { console.error('harness failed: ' + (e && e.stack || e)); process.exit(1); });
