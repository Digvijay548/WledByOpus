// Headless check of the real-time preview against mock.js. Uses the Playwright copy already installed on this PC
// (global npm tree), installs nothing. Usage: node drive.js
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.APPDATA, 'npm/node_modules/omniroute/node_modules/playwright');
const { chromium } = require(PW);
const PORT = 8093, BASE = 'http://127.0.0.1:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async p => (await fetch(BASE + p)).json();
const results = [];
const check = (name, ok, info) => { results.push([ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info === undefined ? '' : '  ' + JSON.stringify(info))); };
async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return Date.now() - t; await sleep(100); } return -1; }

(async () => {
  const mock = spawn(process.execPath, [path.join(__dirname, 'mock.js'), '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => mock.stdout.once('data', r));
  const browser = await chromium.launch({ headless: true });
  let phase = 'normal';
  const errs = { normal: [], fallback: [] }, pageErrs = [];
  const newPage = async dark => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light' });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') (errs[phase] || errs.normal).push(m.text()); });
    page.on('pageerror', e => pageErrs.push(String(e.message || e)));
    return page;
  };
  try {
    const page = await newPage(false);
    await page.goto(BASE + '/home', { waitUntil: 'load' });
    let t = await waitFor(async () => (await get('/mock/stat')).conns === 1 && await page.evaluate(() => !!ws && ws.readyState === 1), 4000);
    check('ws opens on the home tab', t >= 0, { ms: t });
    check('ws URL carries the URL-encoded key', (await get('/mock/stat')).accepted === 1);

    // sample a canvas pixel (middle, CSS pixel coordinates -> canvas coordinates) over time
    const sampleCanvas = async (sel, ms, step = 100) => {
      const out = [];
      for (let i = 0; i < ms / step; i++) {
        out.push(await page.evaluate(s => { const c = document.querySelector(s); if (!c || !c.width) return null; const p = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [p[0], p[1], p[2]]; }, sel));
        await sleep(step);
      }
      return out;
    };
    const spread = arr => { const r = arr.filter(Boolean).map(p => p[0]); return { n: r.length, min: Math.min(...r), max: Math.max(...r), distinct: new Set(arr.filter(Boolean).map(String)).size }; };

    let s = spread(await sampleCanvas('#t-home .lv', 2500));
    check('home LED 1 bar breathes (2.5 s, 25 samples)', s.distinct >= 10 && s.max - s.min > 80, s);

    // count paints: one draw per new frame (~20 fps), not one per animation frame (60 fps)
    await page.evaluate(() => { window.__n = 0; const o = paintPv; window.paintPv = (...a) => { window.__n++; return o(...a); }; });
    await sleep(2000);
    const paints = await page.evaluate(() => window.__n);
    check('paints per second follow the stream, not rAF', paints >= 20 && paints <= 50, { perSec: paints / 2 });

    // open the Adjust panel for LED 1
    await page.evaluate(() => [...document.querySelectorAll('#t-home button')].find(b => b.textContent.trim() === 'Adjust').click());
    await page.waitForSelector('.modal .fxl button.sel');
    await sleep(400);
    let info = await page.evaluate(() => { const b = document.querySelector('.fxl button.sel'); const c = b && b.querySelector('canvas.fxb');
      return { sel: b && b.textContent, bar: !!c, aria: c && c.getAttribute('aria-hidden'), bars: document.querySelectorAll('canvas.fxb').length,
        allAria: [...document.querySelectorAll('canvas')].every(x => x.getAttribute('aria-hidden') === 'true'), h: c && c.getBoundingClientRect().height, bh: b.getBoundingClientRect().height }; });
    check('selected effect button holds the live bar', info.bar && info.sel === 'Breathe' && info.bars === 1, info);
    check('all preview canvases are aria-hidden', info.allAria && info.aria === 'true', info);

    s = spread(await sampleCanvas('.fxl button.sel canvas.fxb', 2500));
    // bri 128 -> factor (128/255)^(1/2.2) = 0.731, peak colour 255,120,20 -> R about 186
    check('effect bar breathes with gamma brightness (peak R ~186)', s.distinct >= 10 && s.max >= 176 && s.max <= 192 && s.min < 40, s);
    s = spread(await sampleCanvas('.modal .lv', 1500));
    check('panel preview bar breathes too', s.distinct >= 8, s);

    const geo = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, boxOver: (() => { const b = document.querySelector('.modal .box'); return b.scrollWidth - b.clientWidth; })() }));
    check('no horizontal scroll at 390 px', geo.docW <= 390 && geo.boxOver <= 0, geo);
    await page.screenshot({ path: path.join(__dirname, 'shot.png') });

    // bad frames are ignored
    const pe0 = pageErrs.length;
    await get('/mock/ctl?bad=1'); await sleep(500);
    s = spread(await sampleCanvas('.fxl button.sel canvas.fxb', 1000));
    check('malformed frames ignored, drawing continues', pageErrs.length === pe0 && s.distinct >= 4, { pageErrs: pageErrs.slice(pe0), s });

    // tap another effect: the bar moves, old canvas leaves the registry, apply still goes through
    const pv0 = await page.evaluate(() => livePv.length);
    await page.evaluate(() => [...document.querySelectorAll('.fxl button')].find(b => b.textContent === 'Rainbow').click());
    await sleep(900);
    info = await page.evaluate(() => { const b = document.querySelector('.fxl button.sel'); return { sel: b.textContent, bar: !!b.querySelector('canvas.fxb'), bars: document.querySelectorAll('canvas.fxb').length, reg: livePv.length }; });
    const st = await get('/json/state');
    check('tap Rainbow: bar moves, one bar, registry bounded, effect applied', info.sel === 'Rainbow' && info.bar && info.bars === 1 && info.reg === pv0 && st.seg[0].fx === 9, { info, pv0, fx: st.seg[0].fx });
    await page.evaluate(() => [...document.querySelectorAll('.fxl button')].find(b => b.textContent === 'Breathe').click());
    await sleep(900);

    // search re-renders the list many times: registry stays bounded
    await page.fill('.modal input[placeholder="Search effects"]', 'b'); await page.fill('.modal input[placeholder="Search effects"]', 'br'); await page.fill('.modal input[placeholder="Search effects"]', '');
    await sleep(300);
    check('registry bounded after search re-renders', await page.evaluate(() => livePv.length) === pv0);

    // reconnect after the socket is killed
    let st0 = await get('/mock/stat');
    await get('/mock/ctl?kill=1');
    t = await waitFor(async () => (await get('/mock/stat')).accepted > st0.accepted && await page.evaluate(() => !!ws && ws.readyState === 1 && Date.now() - wsT < 500), 4000);
    check('reconnects after the socket is killed', t >= 0, { ms: t });

    // background re-render while the panel is open (as after "Save as…"): previews keep running
    await page.evaluate(() => render()); await sleep(300);
    s = spread(await sampleCanvas('.fxl button.sel canvas.fxb', 1500));
    check('panel previews survive a background render()', s.distinct >= 8, s);

    // fallback: the ws route is refused (404 on upgrade) -> px from the 1 s poll keeps drawing
    phase = 'fallback';
    st0 = await get('/mock/stat');
    await get('/mock/ctl?ws=0&kill=1');
    await sleep(1500);
    info = await page.evaluate(() => ({ ws: ws && ws.readyState, wsT }));
    const pxSamples = [];
    for (let i = 0; i < 8; i++) {
      pxSamples.push(await page.evaluate(() => { const c = document.querySelector('.modal .lv'), p = c.getContext('2d').getImageData(c.width >> 1, 7, 1, 1).data, v = live.px[0][8];
        return { can: [p[0], p[1], p[2]], px: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] }; }));
      await sleep(500);
    }
    const match = pxSamples.every(x => x.can.every((v, j) => Math.abs(v - x.px[j]) <= 2));
    const varied = new Set(pxSamples.map(x => String(x.can))).size;
    check('fallback: canvas shows live.px (unscaled) and still animates at 1 s', info.wsT === 0 && match && varied >= 3, { info, varied, first: pxSamples[0] });
    await sleep(6000);
    const st1 = await get('/mock/stat'), rej = st1.rejAt.slice(st0.rejAt.length);
    const gaps = rej.slice(1).map((v, i) => v - rej[i]);
    check('backoff while refused grows (about 2 s, 5 s, ...)', rej.length >= 2 && gaps.every((g, i) => i === 0 || g >= gaps[i - 1] - 200), { rejectedAt: rej, gaps });
    await get('/mock/ctl?ws=1');
    t = await waitFor(async () => await page.evaluate(() => !!ws && ws.readyState === 1 && Date.now() - wsT < 500), 12000);
    check('stream resumes when the route is back (<= 10 s backoff)', t >= 0, { ms: t });
    phase = 'normal';

    // close the panel, go to a tab without previews: ws closes
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Done').click());
    await page.evaluate(() => { location.hash = 'moods'; });
    t = await waitFor(async () => (await get('/mock/stat')).conns === 0 && await page.evaluate(() => ws === null), 3000);
    check('ws closes when no preview is on screen (Moods tab)', t >= 0, { ms: t });
    await page.evaluate(() => { location.hash = 'home'; });
    t = await waitFor(async () => (await get('/mock/stat')).conns === 1, 3000);
    check('ws reopens on the Home tab', t >= 0, { ms: t });
    // page hidden -> close, visible -> open
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    t = await waitFor(async () => (await get('/mock/stat')).conns === 0, 2000);
    check('ws closes when the page is hidden', t >= 0, { ms: t });
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    t = await waitFor(async () => (await get('/mock/stat')).conns === 1, 2000);
    check('ws reopens when the page is visible again', t >= 0, { ms: t });

    // dark theme screenshot with the panel open
    await page.context().close();
    const dp = await newPage(true);
    await dp.goto(BASE + '/home', { waitUntil: 'load' });
    await sleep(800);
    await dp.evaluate(() => [...document.querySelectorAll('#t-home button')].find(b => b.textContent.trim() === 'Adjust').click());
    await dp.waitForSelector('.modal .fxl button.sel canvas.fxb');
    await sleep(1200);
    await dp.screenshot({ path: path.join(__dirname, 'shot_dark.png') });
    await dp.context().close();
    const home = await newPage(false);
    await home.goto(BASE + '/home', { waitUntil: 'load' }); await sleep(1500);
    await home.screenshot({ path: path.join(__dirname, 'shot_home.png') });

    check('0 page errors', pageErrs.length === 0, pageErrs);
    check('0 console errors outside the refused-ws phase', errs.normal.length === 0, errs.normal);
    console.log('console errors while refused (expected ws handshake failures): ' + errs.fallback.length + (errs.fallback[0] ? '  e.g. ' + errs.fallback[0] : ''));
  } catch (e) { check('driver ran without exceptions', false, String(e.stack || e)); }
  await browser.close(); mock.kill();
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})();
