// PAGE agent's Playwright check of the effect / mood previews in www/home.htm. Installs nothing: uses the Playwright copy
// already on this PC. Usage: node drive.js [--base http://127.0.0.1:8093]  (without --base it starts harness.js itself)
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.APPDATA, 'npm/node_modules/omniroute/node_modules/playwright');
const { chromium } = require(PW);
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info === undefined ? '' : '  ' + JSON.stringify(info))); };
const OUT = __dirname;

async function startHarness(port, extra) {
  const p = spawn(process.execPath, [path.join(__dirname, 'harness.js'), '--port', String(port), ...extra], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => p.stdout.once('data', r));
  return p;
}
// hash of each canvas' pixels, keyed by index in the given selector list; only canvases whose row is inside the scroll box
const snap = (page, sel, onlyVisibleIn) => page.evaluate(([sel, box]) => {
  const b = box && document.querySelector(box), br = b && b.getBoundingClientRect();
  return [...document.querySelectorAll(sel)].map((c, i) => {
    const r = c.getBoundingClientRect();
    if (!r.width || (br && (r.bottom <= br.top || r.top >= br.bottom)) || r.bottom <= 0 || r.top >= innerHeight) return null;
    if (!c.width || c.width < 2) return [i, 'empty'];
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let hsh = 0, lit = 0;
    for (let j = 0; j < d.length; j += 4) { hsh = (hsh * 31 + d[j] * 7 + d[j + 1] * 3 + d[j + 2]) | 0; if (d[j] + d[j + 1] + d[j + 2] > 60) lit++; }
    return [i, hsh, lit];
  }).filter(Boolean);
}, [sel, onlyVisibleIn]);
async function animated(page, sel, box) {
  const a = await snap(page, sel, box); await sleep(1000); const b = await snap(page, sel, box);
  const m = new Map(b.map(x => [x[0], x]));
  return { visible: a.length, changed: a.filter(x => m.get(x[0]) && m.get(x[0])[1] !== x[1]).length, lit: a.filter(x => x[2] > 0).length };
}

async function run(base, tag, mode) {
  const browser = await chromium.launch({ headless: true });
  const errs = [], pageErrs = [];
  const newPage = async dark => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
    // test instrumentation: window.__pv = canvases whose FXS.preview runs (started and not stopped)
    await ctx.addInitScript(() => { let F; Object.defineProperty(window, 'FXS', { configurable: true, get: () => F, set: v => { F = v; if (!v || !v.preview || v.__w) return;
      const p = v.preview; window.__pv = new Set(); window.__pvStarted = 0; v.__w = 1;
      v.preview = function (c, o) { const r = p(c, o); __pv.add(c); __pvStarted++; const s = r.stop; r.stop = function () { __pv.delete(c); return s.apply(this, arguments); }; return r; }; } }); });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => pageErrs.push(String(e.message || e)));
    return page;
  };
  const page = await newPage(false);
  await page.goto(base + '/home', { waitUntil: 'load' });
  await page.waitForSelector('#t-home .card');
  const hasFx = mode === 'full' || mode === 'nobm' || mode === 'real';
  const inst = true; // window.__pv from the init script
  const pvCount = () => page.evaluate(() => window.__pv ? { run: __pv.size, detached: [...__pv].filter(c => !c.isConnected).length, started: __pvStarted } : null);

  // ---- Adjust panel of LED 1
  await page.click('#t-home .grid2 .card button.pri');
  await page.waitForSelector('.fxl button');
  if (hasFx) {
    const t = Date.now();
    await page.waitForFunction(() => document.querySelectorAll('.fxl button:not(.sel) canvas').length > 20, null, { timeout: 15000 });
    console.log('  engine + palettes ready after ' + (Date.now() - t) + ' ms');
    await sleep(600);
    const rows = await page.evaluate(() => ({ rows: document.querySelectorAll('.fxl button').length, sim: document.querySelectorAll('.fxl button:not(.sel) canvas.fxb').length,
      sel: document.querySelector('.fxl button.sel') && document.querySelector('.fxl button.sel').textContent, selBar: !!document.querySelector('.fxl button.sel canvas.fxb'),
      selBarIsSim: window.__pv ? [...__pv].includes(document.querySelector('.fxl button.sel canvas.fxb')) : null,
      approx: [...document.querySelectorAll('.fxl button')].filter(b => /≈/.test(b.textContent)).map(b => b.textContent),
      has2D: [...document.querySelectorAll('.fxl button')].some(b => /^(Black Hole|DNA|Game Of Life|Julia|Matrix)\b/.test(b.textContent)) }));
    check(tag + ': every non-selected row has a preview canvas', rows.sim === rows.rows - 1, rows);
    check(tag + ': selected row keeps its live /home/ws bar (not a simulation)', rows.selBar && rows.selBarIsSim !== true, { sel: rows.sel });
    check(tag + ': 2D-only effects stay hidden', !rows.has2D);
    if (inst) console.log('  "≈" rows: ' + JSON.stringify(rows.approx));
    const an = await animated(page, '.fxl button:not(.sel) canvas.fxb', '.fxl');
    check(tag + ': >= 6 visible rows animate within 1 s', an.changed >= 6, an);
    const live = await animated(page, '.fxl button.sel canvas.fxb', '.fxl');
    check(tag + ': selected row live bar moves', live.visible === 0 || live.changed === 1, live);
    if (inst) {
      const c0 = await pvCount();
      check(tag + ': running previews = rows with a canvas', c0.run === rows.sim && c0.detached === 0, c0);
      await page.fill('.modal input[type=text]', 'fire');
      await sleep(300);
      const f = await page.evaluate(() => document.querySelectorAll('.fxl button:not(.sel) canvas.fxb').length);
      const c1 = await pvCount();
      check(tag + ': filter "fire" stops the old previews (no leak)', c1.run === f && c1.detached === 0, { rowsShown: f, ...c1 });
      await page.fill('.modal input[type=text]', '');
      await sleep(300);
      const c2 = await pvCount();
      check(tag + ': clearing the filter restores all, still no leak', c2.run === rows.sim && c2.detached === 0, c2);
      // colour follow: set colour 1 to pure green, the Solid row (static, first) must turn green
      const solidBefore = await page.evaluate(() => { const b = [...document.querySelectorAll('.fxl button')].find(b => b.textContent.startsWith('Solid')); const c = b && b.querySelector('canvas'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0; for (let j = 0; j < d.length; j += 4) { r += d[j]; g += d[j + 1]; } return { r, g }; });
      await page.evaluate(() => { const i = document.querySelector('.modal input[type=color]'); i.value = '#00ff00'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await sleep(400);
      const solidAfter = await page.evaluate(() => { const b = [...document.querySelectorAll('.fxl button')].find(b => b.textContent.startsWith('Solid')); const c = b && b.querySelector('canvas'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0; for (let j = 0; j < d.length; j += 4) { r += d[j]; g += d[j + 1]; } return { r, g }; });
      check(tag + ': colour change reaches the row previews (Solid row turns green)', solidBefore && solidAfter && solidAfter.g > solidAfter.r * 3 && solidBefore.r > solidBefore.g, { solidBefore, solidAfter });
      const pal = await page.evaluate(() => { const s = [...document.querySelectorAll('.modal select')].find(s => [...s.options].some(o => o.text === 'Lava')); if (!s) return null; s.value = String([...s.options].find(o => o.text === 'Lava').value); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; });
      await sleep(300);
      console.log('  palette set to Lava via the select: ' + pal);
    }
    const hs = await page.evaluate(() => document.documentElement.scrollWidth);
    check(tag + ': no horizontal scroll with the Adjust panel (390 px)', hs <= 390, hs);
    await page.screenshot({ path: path.join(OUT, 'shot_' + tag + '_adjust.png') });
    await page.click('.modal button.pri:has-text("Done")');
    await sleep(200);
    if (inst) { const c3 = await pvCount(); check(tag + ': closing the panel stops all its previews', c3.run === 0, c3); }
    // second open: engine cached, previews must start at once (the modal is built before it is attached)
    await page.click('#t-home .grid2 .card button.pri');
    await page.waitForSelector('.fxl button');
    await sleep(700);
    const an2 = await animated(page, '.fxl button:not(.sel) canvas.fxb', '.fxl');
    check(tag + ': second open animates at once', an2.changed >= 6, an2);
    // hidden page: nothing moves
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    const hid = await animated(page, '.fxl button:not(.sel) canvas.fxb', '.fxl');
    check(tag + ': document.hidden pauses the previews', hid.changed === 0, hid);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.click('.modal button.pri:has-text("Done")');
  } else {
    await sleep(1500);
    const n = await page.evaluate(() => ({ sim: document.querySelectorAll('.fxl button:not(.sel) canvas').length, sel: !!document.querySelector('.fxl button.sel canvas.fxb'), rows: document.querySelectorAll('.fxl button').length }));
    check(tag + ': no engine -> no row previews, list works, live bar stays', n.sim === 0 && n.rows > 100 && n.sel, n);
    await page.screenshot({ path: path.join(OUT, 'shot_' + tag + '_adjust.png') });
    await page.click('.modal button.pri:has-text("Done")');
  }

  // ---- Moods tab
  await page.click('nav button:nth-child(2)');
  await page.waitForSelector('#t-moods .mood');
  if (hasFx) await page.waitForFunction(() => document.querySelectorAll('#t-moods .mood canvas').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const mt = await page.evaluate(() => ({ tiles: document.querySelectorAll('#t-moods .mood').length, cv: document.querySelectorAll('#t-moods .mood canvas.pv').length, grad: document.querySelectorAll('#t-moods .mood div.pv').length }));
  if (mode === 'full' || mode === 'real') check(tag + ': every mood tile is animated (canvas)', mt.cv === mt.tiles && mt.tiles > 0, mt);
  else if (mode === 'nobm') check(tag + ': no /home/bm -> built-ins keep gradients, custom moods animate', mt.grad > 0 && mt.cv >= 1 && mt.cv + mt.grad === mt.tiles, mt);
  else check(tag + ': no engine -> gradients as before', mt.cv === 0 && mt.grad === mt.tiles, mt);
  if (mt.cv) {
    const an = await animated(page, '#t-moods .mood canvas.pv');
    check(tag + ': visible mood tiles animate within 1 s', an.changed >= Math.min(4, an.visible - 1) && an.visible > 0, an);
    if (inst) { const c = await pvCount(); check(tag + ': running previews = mood canvases', c.run === mt.cv && c.detached === 0, c); }
  }
  const hs2 = await page.evaluate(() => document.documentElement.scrollWidth);
  check(tag + ': no horizontal scroll on Moods (390 px)', hs2 <= 390, hs2);
  await page.screenshot({ path: path.join(OUT, 'shot_' + tag + '_moods.png') });
  if (mode === 'full') {
    await page.evaluate(() => scrollTo(0, 1400)); await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'shot_' + tag + '_moods2.png') });
    // re-render of the Moods tab (e.g. after a config reload) must not leak previews
    const before = await pvCount();
    await page.evaluate(() => render()); await sleep(200);
    const after = await pvCount();
    check(tag + ': Moods re-render keeps the preview count (no leak)', after.run === before.run && after.detached === 0, { before, after });
    const dark = await newPage(true);
    await dark.goto(base + '/home#moods', { waitUntil: 'load' });
    await dark.waitForFunction(() => document.querySelectorAll('#t-moods .mood canvas').length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    await dark.screenshot({ path: path.join(OUT, 'shot_' + tag + '_moods_dark.png') });
  }
  const bad = errs.filter(e => !(mode !== 'full' && mode !== 'real' && /404|Failed to load resource/.test(e)));
  check(tag + ': no console errors' + (mode === 'full' || mode === 'real' ? '' : ' (besides the expected 404)'), bad.length === 0 && pageErrs.length === 0, { errs, pageErrs });
  await browser.close();
}

(async () => {
  const base = arg('--base');
  try {
    if (base) { await run(base, 'real', 'real'); }
    else {
      const modes = (arg('--modes') || 'full,nobm,nofx,nopin').split(',');
      for (const [i, mode] of modes.entries()) {
        const port = 8097 + i, hp = await startHarness(port, mode === 'full' ? [] : ['--' + mode]);
        try {
          await run('http://127.0.0.1:' + port, mode, mode);
          if (mode === 'nopin') { const st = await (await fetch('http://127.0.0.1:' + port + '/mock/stat')).json(); check(mode + ': without a PIN /home/fx.js is never requested', st.fxjs === 0, { fxjs: st.fxjs }); }
          if (mode === 'full') {
            const st = await (await fetch('http://127.0.0.1:' + port + '/mock/stat')).json();
            const mine = st.reqs.filter(r => /palx|\/home\/bm/.test(r[2]));
            const ov = st.overlaps.filter(p => /palx|\/home\/bm/.test(p));
            check(mode + ': palx + /home/bm fetched one at a time (' + mine.length + ' requests)', ov.length === 0 && mine.length >= 11, { overlaps: st.overlaps, maxInflight: st.maxInflight });
          }
        } finally { hp.kill(); }
      }
    }
  } catch (e) { console.error(e); results.push(false); }
  const f = results.filter(x => !x).length;
  console.log((f ? 'FAILED ' + f : 'ALL PASS') + ' (' + results.length + ' checks)');
  process.exit(f ? 1 : 0);
})();
