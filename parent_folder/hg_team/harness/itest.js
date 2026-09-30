// Interaction test for the labelled action editor / scene cards of home.htm (Home Gadgets).
// Starts ./mock.js in-process, drives headless Chrome over CDP (Node 22+ WebSocket, no npm packages),
// records every request the page sends (CDP Network events, so mock.js stays untouched) and checks 7 scenarios.
// Usage: node itest.js <page.htm> [--port 0] [--browser <exe>]
// Exit code: 0 = all pass, 2 = some test failed, 1 = harness failure.
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { start } = require('./mock');

const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PAGE = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(i && ['--port', '--browser'].includes(argv[i - 1]))) || '../labels/rebased.htm');
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

// page-side helpers injected once: scene card lookup by its "Scene N – name" caption
const HELPERS = `window.__t={
	card:n=>[...document.querySelectorAll('#t-auto .card')].find(c=>{const l=c.querySelector('label.field');return l&&l.textContent.trim()==='Scene '+n+' – name';}),
	caps:el=>[...el.querySelectorAll('label.field')].map(l=>[...l.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join('').trim()),
	toast:()=>document.querySelector('#toast').textContent
};true`;

(async () => {
	if (!EXE) throw new Error('no Chrome or Edge found; pass --browser <exe>');
	const mock = await start({ page: PAGE, port: +val('--port', 0) });
	const orig = await (await fetch(mock.url + '/home/cfg')).json(); // mock config before any change
	console.log(`mock ${mock.url}/home  page ${PAGE}\nbrowser ${EXE}`);
	const prof = path.join(__dirname, '.profile-itest-' + process.pid);
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
		await Promise.all(['Runtime.enable', 'Page.enable', 'Log.enable', 'Network.enable'].map(m => cdp.send(m)));
		const ev = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 200)); return r.result.value; };
		const waitFor = async (expr, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await ev(expr)) return true; await sleep(100); } return false; };
		const posts = p => reqs.filter(r => r.method === 'POST' && r.url.startsWith(p));

		// ---------- 1. load /home#auto at 390x844 ----------
		await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		const load = new Promise(r => { loaded = r; });
		await cdp.send('Page.navigate', { url: mock.url + '/home#auto' });
		await Promise.race([load, sleep(10000)]);
		const ready = await waitFor(`(()=>{const t=document.querySelector('#t-auto'),c=document.querySelector('#conn');return !!t&&!t.hidden&&t.children.length>0&&c.classList.contains('ok')})()`, 10000);
		await ev(HELPERS);
		await sleep(1500);
		const loadErr = errors.slice();
		const nCards = await ev(`[1,2,3,4,5,6].filter(n=>__t.card(n)).length`);
		T(1, 'load /home#auto 390x844, no console errors/exceptions', ready && !loadErr.length && nCards === 6, { rendered: ready, sceneCards: nCards, errors: loadErr });

		// ---------- 2. add action in scene 4, then switch it to "Turn relay on" ----------
		const moodName = (orig.moods.find(m => m.rep === 1) || orig.bm[1]).n, relayName = orig.relays[0].n;
		const before2 = await ev(`(()=>{const c=__t.card(4);return {rows:c.querySelectorAll('.act').length,empty:(c.querySelector('.acts>.muted')||{}).textContent,sumHidden:c.querySelector('.sum').hidden}})()`);
		await ev(`[...__t.card(4).querySelectorAll('button')].find(b=>b.textContent==='＋ Add action').click()`);
		const s2a = await ev(`(()=>{const c=__t.card(4),r=c.querySelector('.act');return {rows:c.querySelectorAll('.act').length,first:r&&r.querySelector('select').value,caps:r&&__t.caps(r),vals:r&&[...r.querySelectorAll('select')].map(s=>s.value),sum:c.querySelector('.sum').textContent,sumHidden:c.querySelector('.sum').hidden,empty:!!c.querySelector('.acts>.muted')}})()`);
		const exp2a = `What it does: ${moodName} on both strips`;
		const ok2a = s2a.rows === 1 && s2a.first === '4' && JSON.stringify(s2a.caps) === JSON.stringify(['Action 1 – what to do', 'Which mood', 'Which LED strip']) && s2a.sum === exp2a && !s2a.sumHidden && JSON.stringify(s2a.vals) === '["4","1","3"]';
		await ev(`(()=>{const s=__t.card(4).querySelector('.act select');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
		const s2b = await ev(`(()=>{const c=__t.card(4),r=c.querySelector('.act');return {first:r.querySelector('select').value,caps:__t.caps(r),vals:[...r.querySelectorAll('select')].map(s=>s.value),sum:c.querySelector('.sum').textContent,model:cfg.sc[3].a}})()`);
		const exp2b = `What it does: ${relayName} on`;
		const ok2b = s2b.first === '1' && JSON.stringify(s2b.caps) === JSON.stringify(['Action 1 – what to do', 'Which relay']) && s2b.sum === exp2b && JSON.stringify(s2b.vals) === '["1","0"]';
		T(2, 'add action (Mood) then switch to Turn relay on; captions + live summary', ok2a && ok2b, { before: before2, afterAdd: s2a, expectedAdd: exp2a, afterChange: s2b, expectedChange: exp2b });

		// ---------- 3. auto-save POST /home/cfg ----------
		const t3 = Date.now();
		await sleep(1600); // markDirty debounce is 700 ms
		const cfgPosts = posts('/home/cfg');
		const last = cfgPosts[cfgPosts.length - 1];
		let body3 = null; try { body3 = JSON.parse(last.body); } catch (e) {}
		const others = body3 && body3.sc && body3.sc.every((s, i) => i === 3 || JSON.stringify(s) === JSON.stringify(orig.sc[i]));
		const ok3 = body3 && JSON.stringify(body3.sc[3].a) === '[[1,0,3]]' && others && body3.sc[3].n === orig.sc[3].n && body3.sc.length === orig.sc.length;
		T(3, 'auto-save POST /home/cfg: sc[3].a == [[1,0,3]], other scenes unchanged', ok3, { posts: cfgPosts.length, url: last && last.url, keys: body3 && Object.keys(body3), sc3: body3 && body3.sc[3], otherScenesUnchanged: others, waitedMs: Date.now() - t3 });
		await waitFor(`__t.toast()==='Saved ✓'`, 3000); // poll sees the new rev -> reloadCfg -> re-render

		// ---------- 4. blank (spaces) name -> Home button "Scene 4" ----------
		await ev(`(()=>{const i=__t.card(4).querySelector('input[type=text]');i.value='   ';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
		const nPostsBefore4 = posts('/home/cfg').length;
		await sleep(1200);
		await ev(`location.hash='#home'`);
		await waitFor(`!document.querySelector('#t-home').hidden`);
		await sleep(300);
		const s4 = await ev(`(()=>{const b=[...document.querySelectorAll('#t-home .grid button.pri')];return {buttons:b.map(x=>x.textContent),scene4:b.map(x=>x.textContent).filter(t=>t==='Scene 4'),titles:b.map(x=>x.title),blank:b.filter(x=>!x.textContent.trim()).length,model:JSON.stringify(cfg.sc[3].n)}})()`);
		const saved4 = posts('/home/cfg').slice(nPostsBefore4).map(r => { try { return JSON.parse(r.body).sc[3]; } catch (e) { return r.body; } });
		T(4, 'space-only scene name shows as "Scene 4" on Home', s4.scene4.length === 1 && s4.blank === 0, { ...s4, savedSc3: saved4 });

		// ---------- 5. Run on empty scene 5 (no request) and on scene 1 ----------
		await ev(`location.hash='#auto'`);
		await waitFor(`!document.querySelector('#t-auto').hidden && !!__t.card(5)`);
		await sleep(2500); // let "Saving…"/"Saved ✓" toasts pass
		const n5 = posts('/json/state').length;
		await ev(`[...__t.card(5).querySelectorAll('button')].find(b=>b.textContent==='▶ Run').click()`);
		const toast5 = await ev(`__t.toast()`);
		await sleep(1000);
		const extra5 = posts('/json/state').slice(n5);
		await ev(`[...__t.card(1).querySelectorAll('button')].find(b=>b.textContent==='▶ Run').click()`);
		const toast1 = await ev(`__t.toast()`);
		await sleep(800);
		const run1 = posts('/json/state').slice(n5 + extra5.length).map(r => { try { return JSON.parse(r.body); } catch (e) { return r.body; } });
		const ok5 = toast5 === 'Add an action first' && extra5.length === 0 && run1.length === 1 && run1[0].HomeGadgets && run1[0].HomeGadgets.scene === 0 && run1[0].HomeGadgets.k === orig.key;
		T(5, 'Run empty scene 5 -> toast only; Run scene 1 -> POST /json/state scene 0', ok5, { toastScene5: toast5, stateReqsAfterScene5: extra5.length, toastScene1: toast1, scene1Requests: run1, mockLog: mock.log });

		// ---------- 6. remove the action of scene 4 via its ✕ ----------
		const b6 = await ev(`(()=>{const c=__t.card(4);return {rows:c.querySelectorAll('.act').length,sum:c.querySelector('.sum').textContent}})()`);
		const clicked6 = await ev(`(()=>{const b=__t.card(4).querySelector('button[aria-label="Remove action 1"]');if(!b)return false;b.click();return true})()`);
		const s6 = await ev(`(()=>{const c=__t.card(4),m=c.querySelector('.acts>.muted');return {rows:c.querySelectorAll('.act').length,sumHidden:c.querySelector('.sum').hidden,sumText:c.querySelector('.sum').textContent,emptyMsg:m&&m.textContent,model:cfg.sc[3].a}})()`);
		await sleep(1200);
		const lastCfg = posts('/home/cfg').slice(-1)[0];
		let sc3after = null; try { sc3after = JSON.parse(lastCfg.body).sc[3].a; } catch (e) {}
		T(6, 'remove action via ✕ "Remove action 1" in scene 4', clicked6 && b6.rows === 1 && s6.rows === 0 && s6.sumHidden && s6.emptyMsg === 'No actions yet – add one below.', { before: b6, clicked: clicked6, after: s6, savedSc3a: sc3after });

		// ---------- 7. every select inside .acts has a <label> ancestor ----------
		const s7 = await ev(`(()=>{const all=[...document.querySelectorAll('#t-auto select')],inActs=all.filter(s=>s.closest('.acts'));
			const bad=inActs.filter(s=>!s.closest('label'));const outBad=all.filter(s=>!s.closest('.acts')&&!s.closest('label')&&!s.getAttribute('aria-label'));
			const notes=[...document.querySelectorAll('#t-auto .acts .note')].map(n=>n.textContent);
			const btns=[...document.querySelectorAll('#t-auto .acts button.icon-btn')].filter(b=>!b.getAttribute('aria-label')).length;
			return {selects:all.length,inActs:inActs.length,inActsWithoutLabel:bad.length,outsideActsWithoutName:outBad.length,type7Notes:notes,removeBtnsWithoutAria:btns}})()`);
		T(7, 'all selects inside .acts are inside a <label>', s7.inActs > 0 && s7.inActsWithoutLabel === 0, s7);
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
