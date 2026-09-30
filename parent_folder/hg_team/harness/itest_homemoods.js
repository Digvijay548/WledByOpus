// Interaction + accessible-name test for the Home, Moods and Adjust views of home.htm (Home Gadgets).
// Starts ./mock.js in-process and drives headless Chrome over CDP (Node 22+ WebSocket, no npm packages).
// Checks: every range slider, .sw switch and select on #home, #moods and in the Adjust panel has an accessible
// name (aria-label or a <label> ancestor), every visible control's computed name (Chrome's accessibility tree)
// contains a letter, Escape closes dialogs (top-most only), and the name/PIN prompts show their placeholders.
// Usage: node itest_homemoods.js <page.htm> [--browser <exe>]
// Exit code: 0 = all pass, 2 = some test failed, 1 = harness failure.
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const { start } = require('./mock');

const BROWSERS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2), val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PAGE = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(i && ['--browser'].includes(argv[i - 1]))) || '../labels2/homemoods.htm');
const EXE = val('--browser') || BROWSERS.find(p => p && fs.existsSync(p));

// --- browser launch + minimal CDP client (copied from shoot.js / itest.js) ---
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

// page side: marks the visible controls of a scope with data-ax=<n> and reports how each one is named in the DOM
const MARK = scope => `(()=>{
	document.querySelectorAll('[data-ax]').forEach(e=>e.removeAttribute('data-ax'));
	const root=document.querySelector(${JSON.stringify(scope)}); if(!root) return null;
	const els=[...root.querySelectorAll('input,select,button,textarea,a[href]')].filter(e=>e.getClientRects().length);
	return els.map((e,i)=>{ e.setAttribute('data-ax',i);
		const kind=e.tagName==='SELECT'?'select':e.type==='range'?'range':e.classList.contains('sw')?'switch':e.tagName.toLowerCase()+(e.type&&e.tagName==='INPUT'?':'+e.type:'');
		const aria=(e.getAttribute('aria-label')||'').trim(), lab=e.closest('label'), labTxt=lab?lab.textContent.trim():'';
		return {i,kind,text:(e.textContent||'').trim().slice(0,30),by:aria?'aria-label':lab&&labTxt?'label':e.getAttribute('aria-labelledby')?'labelledby':null};
	});
})()`;

(async () => {
	if (!EXE) throw new Error('no Chrome or Edge found; pass --browser <exe>');
	const mock = await start({ page: PAGE, port: 0 });
	console.log(`mock ${mock.url}/home  page ${PAGE}\nbrowser ${EXE}`);
	const prof = path.join(__dirname, '.profile-itest-hm-' + process.pid);
	const results = [], errors = [];
	const T = (n, name, pass, evidence) => { results.push({ n, name, pass: !!pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${n}. ${name}\n     ${JSON.stringify(evidence)}`); };
	let br, cdp;
	try {
		br = await launch(prof);
		cdp = await connect(br.wsUrl);
		let loaded = null;
		cdp.on('Runtime.consoleAPICalled', p => { if (['error', 'warning', 'assert'].includes(p.type)) errors.push('console.' + p.type + ': ' + p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')); });
		cdp.on('Runtime.exceptionThrown', p => { const d = p.exceptionDetails; errors.push('exception: ' + (d.exception && d.exception.description || d.text)); });
		cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error' && p.entry.source !== 'network') errors.push('log: ' + p.entry.text); });
		cdp.on('Network.responseReceived', p => { if (p.response.status >= 400 && !p.response.url.includes('/home/ws')) errors.push('http ' + p.response.status + ' ' + p.response.url); });
		cdp.on('Page.javascriptDialogOpening', p => { errors.push('dialog: ' + p.message); cdp.send('Page.handleJavaScriptDialog', { accept: false }); });
		cdp.on('Page.loadEventFired', () => loaded && loaded());
		await Promise.all(['Runtime.enable', 'Page.enable', 'Log.enable', 'Network.enable', 'DOM.enable', 'Accessibility.enable'].map(m => cdp.send(m)));
		const ev = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 200)); return r.result.value; };
		const waitFor = async (expr, ms = 5000) => { for (let t = 0; t < ms; t += 100) { if (await ev(expr)) return true; await sleep(100); } return false; };
		const key = async (k, code, vk) => { for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk }); await sleep(150); };
		const nModals = () => ev(`document.querySelectorAll('.modal').length`);
		const clickText = (scope, txt) => ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(x=>x.textContent.trim()===${JSON.stringify(txt)});if(b)b.click();return !!b})()`);

		// audit a scope: DOM naming (aria-label / <label> ancestor) + Chrome's computed accessible name per control
		const audit = async scope => {
			const marks = await ev(MARK(scope));
			if (!marks) return { error: 'scope not found: ' + scope };
			const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
			const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-ax]' });
			for (const nodeId of nodeIds) {
				const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
				const i = +attributes[attributes.indexOf('data-ax') + 1];
				const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
				marks[i].ax = nodes[0] && nodes[0].name ? nodes[0].name.value : '';
			}
			const req = marks.filter(m => ['range', 'switch', 'select'].includes(m.kind));
			const count = k => req.filter(m => m.kind === k).length;
			const noDom = req.filter(m => !m.by), noLetter = marks.filter(m => !/[A-Za-z]/.test(m.ax || ''));
			return {
				scope, controls: marks.length, ranges: count('range'), switches: count('switch'), selects: count('select'),
				byAria: req.filter(m => m.by === 'aria-label').length, byLabel: req.filter(m => m.by === 'label').length,
				unnamed: noDom.map(m => m.kind + '#' + m.i), controlsWithoutWordName: noLetter.map(m => `${m.kind} "${m.text}" ax="${m.ax}"`),
				names: req.map(m => m.kind + ': ' + m.ax)
			};
		};
		const auditOk = a => a && !a.error && a.unnamed.length === 0 && a.controlsWithoutWordName.length === 0;

		// ---------- 1. load /home#home at 390x844 ----------
		await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
		await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		const load = new Promise(r => { loaded = r; });
		await cdp.send('Page.navigate', { url: mock.url + '/home#home' });
		await Promise.race([load, sleep(10000)]);
		const ready = await waitFor(`(()=>{const t=document.querySelector('#t-home'),c=document.querySelector('#conn');return !!t&&!t.hidden&&t.children.length>0&&c.classList.contains('ok')})()`, 10000);
		await sleep(1500);
		T(1, 'load /home#home 390x844 without console errors', ready && !errors.length, { ready, errors: errors.slice() });

		// ---------- 2. #home: every slider / switch / select named ----------
		const aHome = await audit('#t-home');
		const capHome = await ev(`[...document.querySelectorAll('#t-home .grid2 .card label.field')].map(l=>l.firstChild.textContent)`);
		T(2, '#home: all range/.sw/select named; every control name has words; strips show a "Brightness" caption', auditOk(aHome) && capHome.length === 2 && capHome.every(c => c === 'Brightness'), { ...aHome, stripCaptions: capHome });

		// ---------- 3. #moods: names + ⋯/✎ aria-labels + visible mood names ----------
		await ev(`location.hash='#moods'`);
		await waitFor(`!document.querySelector('#t-moods').hidden && !!document.querySelector('#t-moods .card.mood')`);
		await sleep(400);
		const aMoods = await audit('#t-moods');
		const icons = await ev(`(()=>{const c=[...document.querySelectorAll('#t-moods .card.mood')];return {cards:c.length,
			menuOk:c.filter(x=>{const n=x.querySelector('.nm').textContent,b=x.querySelector('.body button:last-of-type');return b.getAttribute('aria-label')==='More options for '+n}).length,
			editOk:c.filter(x=>{const n=x.querySelector('.nm').textContent,b=x.querySelector('.body button');return b.getAttribute('aria-label')==='Edit '+n}).length,
			namesCut:c.filter(x=>{const s=x.querySelector('.nm');return s.scrollWidth>s.clientWidth+1||s.clientWidth<40}).map(x=>x.querySelector('.nm').textContent)}})()`);
		T(3, '#moods: all named; ⋯ = "More options for <mood>", ✎ = "Edit <mood>"; no mood name hidden or cut', auditOk(aMoods) && icons.cards > 0 && icons.menuOk === icons.cards && icons.editOk === icons.cards && !icons.namesCut.length,
			{ ...aMoods, names: aMoods.names && aMoods.names.slice(0, 4), icons });

		// ---------- 4. Escape closes the mood ⋯ menu ----------
		await ev(`document.querySelector('#t-moods .card.mood .body button:last-of-type').click()`);
		const open4 = await waitFor(`!!document.querySelector('.modal .box')`, 2000);
		const title4 = await ev(`(document.querySelector('.modal .box h3')||{}).textContent`);
		await key('Escape', 'Escape', 27);
		const after4 = await nModals();
		T(4, 'Escape closes the mood ⋯ menu', open4 && after4 === 0, { opened: open4, menuTitle: title4, modalsAfterEscape: after4 });

		// ---------- 5. name prompt placeholder (＋ Save current look) + Escape ----------
		await ev(`[...document.querySelectorAll('#t-moods button')].find(x=>x.textContent.includes('Save current look')).click()`);
		await waitFor(`!!document.querySelector('.modal .box')`, 2000);
		await clickText('.modal .box', 'LED 1');
		await waitFor(`!!document.querySelector('.modal .box input')`, 2000);
		const s5 = await ev(`(()=>{const i=document.querySelector('.modal .box input');return {title:document.querySelector('.modal .box h3').textContent,placeholder:i.placeholder,ariaLabel:i.getAttribute('aria-label'),focused:document.activeElement===i}})()`);
		await key('Escape', 'Escape', 27);
		const after5 = await nModals();
		T(5, 'name prompt shows "e.g. Cosy evening"; Escape closes it', s5.placeholder === 'e.g. Cosy evening' && after5 === 0, { ...s5, modalsAfterEscape: after5 });

		// ---------- 6. Rename prompt of the custom mood (⋯ → Rename) ----------
		const custom = await ev(`(()=>{const c=[...document.querySelectorAll('#t-moods .card.mood')].find(x=>[...x.querySelectorAll('.badge')].some(b=>b.textContent==='mine'));if(!c)return null;c.querySelector('.body button:last-of-type').click();return c.querySelector('.nm').textContent})()`);
		await waitFor(`!!document.querySelector('.modal .box')`, 2000);
		await clickText('.modal .box', 'Rename');
		await waitFor(`!!document.querySelector('.modal .box input')`, 2000);
		const s6 = await ev(`(()=>{const i=document.querySelector('.modal .box input');return i&&{value:i.value,placeholder:i.placeholder}})()`);
		await key('Escape', 'Escape', 27);
		const after6 = await nModals();
		T(6, 'Rename prompt keeps the name and has a placeholder; Escape closes it', custom && s6 && s6.value === custom && s6.placeholder === 'e.g. Cosy evening' && after6 === 0, { custom, prompt: s6, modalsAfterEscape: after6 });

		// ---------- 7. Adjust panel (Home → first LED strip → Adjust), default effect ----------
		await ev(`location.hash='#home'`);
		await waitFor(`!document.querySelector('#t-home').hidden`);
		await sleep(300);
		await ev(`[...document.querySelectorAll('#t-home .grid2 .card button')].find(x=>x.textContent.trim()==='Adjust').click()`);
		const open7 = await waitFor(`!!document.querySelector('.modal .box.tall .fxl button')`, 8000);
		await sleep(400);
		const a7 = await audit('.modal .box');
		const s7 = await ev(`(()=>{const b=document.querySelector('.modal .box');return {captions:[...b.querySelectorAll('label.field')].map(l=>l.firstChild.textContent),
			listGroup:b.querySelector('.fxl').getAttribute('aria-label'),current:[...b.querySelectorAll('.fxl [aria-current=true]')].map(x=>x.textContent)}})()`);
		T(7, 'Adjust panel: all named; "Brightness" and "Effect" captions; effect list is a named group with the playing effect marked current',
			open7 && auditOk(a7) && s7.captions.includes('Effect') && s7.captions.includes('Brightness') && s7.listGroup === 'Effect' && s7.current.length === 1, { ...a7, ...s7 });

		// ---------- 8. Adjust panel with a sound effect: mic switch, mic sensitivity, harmony caption ----------
		await ev(`[...document.querySelectorAll('.modal .fxl button')].find(x=>x.textContent.replace(' 🎵','')==='Gravcenter').click()`);
		await sleep(1500);
		const a8 = await audit('.modal .box');
		const s8 = await ev(`(()=>{const b=document.querySelector('.modal .box');const g=[...b.querySelectorAll('[role=group]')].map(x=>x.getAttribute('aria-label'));
			return {groups:g,mic:(b.querySelector('.card .sw')||{}).ariaLabel||null,captions:[...b.querySelectorAll('label.field')].map(l=>l.firstChild.textContent)}})()`);
		T(8, 'sound effect: mic switch + "Microphone sensitivity" named; harmony buttons have a caption group', auditOk(a8) && s8.mic === 'Microphone on/off' && s8.captions.includes('Microphone sensitivity') && s8.groups.some(x => /^Match colour/.test(x || '')),
			{ ...a8, ...s8 });

		// ---------- 9. stacked dialogs: Escape closes only "Save as…" prompt, then the Adjust panel ----------
		await clickText('.modal .box', '💾 Save as…');
		await waitFor(`document.querySelectorAll('.modal').length===2`, 2000);
		const s9 = await ev(`(()=>{const m=[...document.querySelectorAll('.modal')].pop(),i=m.querySelector('input');return {modals:document.querySelectorAll('.modal').length,title:m.querySelector('h3').textContent,placeholder:i&&i.placeholder}})()`);
		await key('Escape', 'Escape', 27);
		const mid9 = await nModals();
		await key('Escape', 'Escape', 27);
		const end9 = await nModals();
		T(9, 'Escape closes the top "Save as new mood" prompt first, then the Adjust panel', s9.modals === 2 && s9.placeholder === 'e.g. Cosy evening' && mid9 === 1 && end9 === 0, { ...s9, afterFirstEscape: mid9, afterSecondEscape: end9 });

		// ---------- 10. Settings PIN prompt (device answers 401) ----------
		await ev(`(()=>{const f=window.fetch;window.fetch=(u,o)=>String(u).startsWith('/home/cfg?')&&o&&o.method==='POST'?Promise.resolve(new Response('',{status:401})):f(u,o);window.__pc=postCfg({});return true})()`);
		await waitFor(`!!document.querySelector('.modal .box input')`, 2000);
		const s10 = await ev(`(()=>{const i=document.querySelector('.modal .box input');return {title:document.querySelector('.modal .box h3').textContent,type:i.type,placeholder:i.placeholder}})()`);
		await key('Escape', 'Escape', 27);
		const r10 = await ev(`window.__pc`);
		const toast10 = await ev(`document.querySelector('#toast').textContent`);
		T(10, 'PIN prompt: password field with "4-digit PIN"; Escape = not saved', s10.type === 'password' && s10.placeholder === '4-digit PIN' && r10 === false && (await nModals()) === 0, { ...s10, postCfgResult: r10, toast: toast10 });
		await ev(`location.reload()`); // drop the fetch override
		await waitFor(`!!document.querySelector('#conn.ok')`, 8000);

		// ---------- 11. away mode + clap control switches on #auto ----------
		await ev(`location.hash='#auto'`);
		await waitFor(`!document.querySelector('#t-auto').hidden && document.querySelector('#t-auto').children.length>0`, 5000);
		await sleep(400);
		const s11 = await ev(`[...document.querySelectorAll('#t-auto .card .row>.sw')].filter(x=>!x.closest('label')).map(x=>x.getAttribute('aria-label'))`);
		const g11 = await ev(`[...document.querySelectorAll('#t-auto [role=group]')].map(x=>x.getAttribute('aria-label'))`);
		T(11, 'away mode and clap control switches have names', s11.includes('Away mode on/off') && s11.includes('Clap control on/off'), { rowSwitches: s11, groups: g11 });

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
	process.exit(failed.length ? 2 : 0);
})().catch(e => { console.error('harness failed: ' + (e && e.stack || e)); process.exit(1); });
