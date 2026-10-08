// SP_E2E=1 CHROME_PATH=<system Chrome> node --test test/ui/timer-scale.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TestClient } from '../helpers/wsClient.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('create-alliance duration slider', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  for (const [width, height] of [[1920, 1080], [1280, 720], [844, 390]]) {
    test(`${width}×${height}: default, presets, keyboard fractions and real match configuration`, async () => {
      const ctx = await browser.createBrowserContext();
      let guest;
      try {
        const page = await ctx.newPage();
        await page.setViewport({ width, height, hasTouch: width < 1000, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.evaluateOnNewDocument(() => {
          localStorage.setItem('sp.name', '时长倍率');
          localStorage.setItem('sp.pref.lobby.mode', '"coop"');
          sessionStorage.setItem('sp.entered', '1');
        });
        await page.goto(`http://127.0.0.1:${srv.port}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && document.querySelector('#room-timer-scale'));
        assert.deepEqual(await page.$eval('#room-timer-scale', (el) => [el.value, el.min, el.max, el.step]), ['1', '1', '5', '0.1']);
        const modes = await page.$$('.mode-card');
        await modes[0].click();
        await page.waitForFunction(() => !document.querySelector('#room-timer-scale'));
        await modes[1].click();
        await page.waitForSelector('#room-timer-scale');
        await page.click('.timer-scale__preset:nth-child(4)');
        await page.waitForFunction(() => document.querySelector('#room-timer-scale').value === '2.5');
        await page.focus('#room-timer-scale');
        await page.keyboard.press('End');
        assert.equal(await page.$eval('#room-timer-scale', (el) => el.value), '5');
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.timer-scale output').textContent === '1.1×');
        await page.click('.timer-scale__preset:nth-child(4)');
        await page.focus('#room-timer-scale');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.timer-scale output').textContent === '2.6×');
        const overflow = await page.$eval('.timer-scale', (el) => el.scrollWidth > el.clientWidth + 1);
        assert.equal(overflow, false, 'the slider and presets fit their panel');
        const createFits = await page.$eval('.create-box .btn--primary', (el) => el.getBoundingClientRect().bottom <= innerHeight);
        assert.equal(createFits, true, 'the create button remains visible without scrolling');
        await page.screenshot({ path: path.join(OUT, `timer-scale-${width}x${height}.png`) });
        await page.click('.create-box .btn--primary');
        await page.waitForFunction(() => globalThis.__SP__.store.get().room?.timerScale === 2.6 && document.querySelector('.room-screen'));
        assert.match(await page.$eval('.room-bar__status', (el) => el.textContent), /阶段时长 2\.6×/);
        const code = await page.evaluate(() => globalThis.__SP__.store.get().room.code);
        guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
        await guest.hello('倍率队友');
        assert.equal((await guest.request({ t: 'room.join', code })).t, 'ok');
        assert.equal((await guest.request({ t: 'room.ready', ready: true })).t, 'ok');
        await page.waitForFunction(() => globalThis.__SP__.store.get().room.seats.filter((s) => s && !s.isBot).length === 2);
        await page.click('.room-bar__right .btn--primary');
        await page.waitForFunction(() => globalThis.__SP__.store.get().match.public?.phase === 'INFO_CHECK');
        const pub = await page.evaluate(() => globalThis.__SP__.store.get().match.public);
        assert.equal(pub.timerScale, 2.6);
        assert.ok(Math.abs(pub.deadline - pub.serverNow - 65_000) < 100);
        assert.deepEqual(errors, []);
      } finally { await guest?.terminate(); await ctx.close(); }
    });
  }
});
