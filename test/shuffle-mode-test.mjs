// ============================================
// B-SIDE Radio - Playwright headless smoke test
// ============================================
//
// Verifies the radio's shuffle-as-default behaviour end-to-end in Chromium:
//   1. boot          — a random episode+section is pre-selected (paused, ready)
//   2. play          — the first play starts playback
//   3. next arrow    — jumps to a NEW random episode+section
//   4. previous arrow— goes back through history to the previous pick
//   5. error cap     — after MAX_CONSECUTIVE_ERRORS unavailable episodes the
//                      radio pauses with a warning toast
//
// Test rig notes (learned the hard way, do not re-discover):
//  - A synthetic WAV is served with HTTP Range -> 206 support; the media
//    element issues range requests and needs a valid partial response.
//  - The Service Worker is disabled via addInitScript: Playwright's route()
//    does NOT intercept SW fetches, so with the SW active the audio's
//    network-only branch would 503 and playback would never start.
//  - Chromium is launched with --autoplay-policy=no-user-gesture-required so
//    play() resolves without a trusted gesture.

import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHOTS = join(__dirname, 'screenshots');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// ---- synthetic WAV (mono, 8 kHz, 16-bit PCM, long low tone) ----
// Long on purpose: section boundaries fall at 1/4 of the duration, so a long
// clip keeps auto-advance from firing during the quick manual-navigation steps.
function makeWav(seconds = 120, sampleRate = 8000, freq = 220) {
  const n = seconds * sampleRate;
  const dataLen = n * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.25 * 32767;
    buf.writeInt16LE(s | 0, 44 + i * 2);
  }
  return buf;
}
const WAV = makeWav();

// ---- tiny static file server for the app shell ----
function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(req.url.split('?')[0]);
      if (path === '/') path = '/index.html';
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---- assertions ----
let passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { throw new Error(`ASSERTION FAILED: ${msg}`); }
}

// Parse "Puntata del DD/MM/YYYY · Parte N" -> identity string
function toastId(text) {
  const m = /del (\d{2}\/\d{2}\/\d{4}).+Parte (\d)/.exec(text || '');
  return m ? `${m[1]}#${m[2]}` : null;
}

let failAudio = false;

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  // Disable the Service Worker (see header note).
  await context.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => new Promise(() => {});
    }
  });

  // Serve the synthetic audio for every episode URL, with Range -> 206.
  await context.route('https://media.capital.it/**', async (route) => {
    if (failAudio) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    const range = route.request().headers()['range'];
    const total = WAV.length;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      const chunk = WAV.subarray(start, end + 1);
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': String(chunk.length)
        },
        body: chunk
      });
    } else {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': String(total) },
        body: WAV
      });
    }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const dateVal = () => page.$eval('#datePicker', (el) => el.value);
  const toastTxt = () => page.$eval('#toast', (el) => el.textContent);
  const audioState = () => page.$eval('#audio', (a) => ({ paused: a.paused, rs: a.readyState, ct: a.currentTime, dur: a.duration }));

  console.log('\n▶ Loading B-SIDE Radio...');
  await page.goto(base, { waitUntil: 'load' });

  // 1) BOOT -----------------------------------------------------------------
  console.log('\n[1] Boot: shuffle pre-selects an episode + section');
  await page.waitForFunction(() => {
    const t = document.getElementById('toast');
    return t && /Parte \d/.test(t.textContent);
  }, { timeout: 5000 });

  const bootDate = await dateVal();
  const bootId = toastId(await toastTxt());
  assert(!!bootId, `boot announced a pick (${bootId})`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(bootDate), `engine date is set (${bootDate})`);
  {
    const d = new Date(bootDate + 'T00:00:00Z').getUTCDay();
    assert(d >= 1 && d <= 5, `picked a weekday (dow=${d})`);
    assert(bootDate >= '2025-09-01' && bootDate <= '2026-06-26', 'pick is inside the configured range');
  }
  const st0 = await audioState();
  assert(st0.paused === true, 'radio is paused on boot (waits for first play)');

  // 2) PLAY -----------------------------------------------------------------
  console.log('\n[2] First play starts playback');
  await page.click('#playBtn');
  await page.waitForFunction(() => !document.getElementById('audio').paused, { timeout: 5000 });
  const stPlay = await audioState();
  assert(stPlay.paused === false, 'audio is playing after pressing play');
  assert(stPlay.dur > 0, `metadata loaded, duration=${stPlay.dur.toFixed(2)}s`);

  // 3) NEXT -----------------------------------------------------------------
  console.log('\n[3] Next arrow jumps to a new random pick');
  const idBeforeNext = toastId(await toastTxt());
  await page.click('#nextDay');
  await page.waitForFunction(
    (prev) => {
      const t = document.getElementById('toast');
      const m = /del (\d{2}\/\d{2}\/\d{4}).+Parte (\d)/.exec(t.textContent || '');
      return m && `${m[1]}#${m[2]}` !== prev;
    },
    idBeforeNext,
    { timeout: 5000 }
  );
  const idAfterNext = toastId(await toastTxt());
  assert(idAfterNext !== idBeforeNext, `next produced a different pick (${idBeforeNext} -> ${idAfterNext})`);

  // 4) PREVIOUS -------------------------------------------------------------
  console.log('\n[4] Previous arrow returns to the prior pick (history)');
  await page.click('#prevDay');
  await page.waitForFunction(
    (target) => {
      const t = document.getElementById('toast');
      const m = /del (\d{2}\/\d{2}\/\d{4}).+Parte (\d)/.exec(t.textContent || '');
      return m && `${m[1]}#${m[2]}` === target;
    },
    idBeforeNext,
    { timeout: 5000 }
  );
  const idAfterPrev = toastId(await toastTxt());
  assert(idAfterPrev === idBeforeNext, `previous restored the earlier pick (${idAfterPrev})`);

  // 5) ERROR CAP ------------------------------------------------------------
  console.log('\n[5] Error cap: unavailable episodes pause the radio');
  failAudio = true;
  await page.click('#nextDay'); // triggers a 404 -> cascade of forward retries
  await page.waitForFunction(() => {
    const t = document.getElementById('toast');
    return t && /troppe puntate non disponibili/i.test(t.textContent);
  }, { timeout: 8000 });
  assert(true, 'radio paused after consecutive unavailable episodes');
  const stErr = await audioState();
  assert(stErr.paused === true, 'playback is paused after the error cap');

  assert(errors.length === 0, `no uncaught page errors (${errors.length})`);

  // ---- screenshots (clean boot, light/dark x mobile/desktop) --------------
  console.log('\n▶ Capturing screenshots...');
  failAudio = false;
  const shots = [
    { name: 'mobile-light', vp: { width: 390, height: 844 }, theme: 'light' },
    { name: 'mobile-dark', vp: { width: 390, height: 844 }, theme: 'dark' },
    { name: 'desktop-light', vp: { width: 1280, height: 800 }, theme: 'light' },
    { name: 'desktop-dark', vp: { width: 1280, height: 800 }, theme: 'dark' }
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.vp });
    await ctx.addInitScript(() => {
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {});
    });
    await ctx.addInitScript((theme) => {
      try { localStorage.setItem('bside-theme', theme); } catch {}
    }, s.theme);
    await ctx.route('https://media.capital.it/**', (route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes' }, body: WAV })
    );
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil: 'load' });
    await p.waitForFunction(() => /Parte \d/.test(document.getElementById('toast')?.textContent || ''), { timeout: 5000 });
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(SHOTS, `${s.name}.png`) });
    console.log(`  ✓ ${s.name}.png`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n✅ All checks passed (${passed} assertions).`);
}

main().catch((e) => {
  console.error('\n❌ ' + e.message);
  process.exit(1);
});
