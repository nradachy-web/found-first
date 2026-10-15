// Synthetic browser safety checks. No mail client, clipboard or provider is opened.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--deps') || !process.argv.includes('--output')) throw Error('--deps and a new --output directory are required.');
const require = createRequire(path.join(path.resolve(option('--deps')), 'package.json'));
const {chromium, webkit} = require('playwright');
const output = path.resolve(option('--output'));
if (fs.existsSync(output)) throw Error('Refusing to overwrite evidence.');
fs.mkdirSync(output, {recursive: true});
const files = JSON.parse(fs.readFileSync(path.join(root, 'config/public-files.json')));
const allowed = new Set(files);
const manifest = {at: new Date().toISOString(), checks: [], screenshots: [], blocked: [], errors: [], histories: [], files: {}};
for (const file of [...files, 'tools/check-public-browser.mjs']) manifest.files[file] = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const server = http.createServer((request, response) => {
  const parsed = new URL(request.url, 'http://localhost');
  const file = parsed.pathname === '/' ? 'index.html' : decodeURIComponent(parsed.pathname.slice(1));
  if (!allowed.has(file)) { response.writeHead(404).end(); return; }
  const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}[path.extname(file)] || 'application/octet-stream';
  response.writeHead(200, {'Content-Type': type}); response.end(fs.readFileSync(path.join(root, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const check = (name, pass, detail = null) => { manifest.checks.push({name, pass, detail}); if (!pass) process.exitCode = 1; };
const contains = (url, values) => { let decoded = url; for (let n = 0; n < 3; n++) { try { decoded = decodeURIComponent(decoded.replaceAll('+', ' ')); } catch {} } return values.some(value => decoded.includes(value)); };
try {
  for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const mode of ['normal', 'no-js', 'blocked-module', 'initialization-failure', 'clipboard-rejected', 'clipboard-unavailable']) {
        const enhanced = !['no-js', 'blocked-module', 'initialization-failure'].includes(mode);
        const context = await browser.newContext({javaScriptEnabled: mode !== 'no-js', reducedMotion: 'reduce', serviceWorkers: 'block', viewport: {width: 390, height: 844}});
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) { manifest.blocked.push({host: url.hostname}); return route.abort(); }
          if (url.pathname === '/app.js' && mode === 'blocked-module') return route.abort();
          if (url.pathname === '/app.js' && mode === 'initialization-failure') return route.fulfill({contentType: 'text/javascript', body: 'throw new Error("Synthetic initialization failure")'});
          return route.continue();
        });
        await context.addInitScript(mode => {
          const value = mode === 'clipboard-unavailable' ? undefined : {writeText: async text => { if (mode === 'clipboard-rejected') throw Error('Synthetic denied clipboard'); window.__copied = text; }};
          Object.defineProperty(navigator, 'clipboard', {value});
        }, mode);
        const page = await context.newPage();
        const requests = [], navigations = [];
        page.on('request', request => requests.push(request.url()));
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
        page.on('pageerror', error => { if (!(mode === 'initialization-failure' && error.message.includes('Synthetic initialization'))) manifest.errors.push(error.message); });
        await page.goto(origin + '/?fixture_history=before', {waitUntil: 'networkidle'});
        await page.goto(origin + '/', {waitUntil: 'networkidle'});
        const before = await page.evaluate(() => history.length);
        const values = [`site-${engineName}-${mode}.example`, `sell-${engineName}-${mode}-synthetic`, `notes-${engineName}-${mode}-synthetic`, 'ChatGPT ads'];
        await page.locator('#brief-site').fill(values[0]);
        await page.locator('#brief-sell').fill(values[1]);
        await page.locator('#brief-notes').fill(values[2]);
        await page.locator('input[name="Interested in"][value="ChatGPT ads"]').check();
        for (const selector of ['#brief-site', '#brief-sell', '#brief-notes', 'input[name="Interested in"][value="ChatGPT ads"]']) {
          await page.locator(selector).press('Enter');
          check(`${engineName}/${mode}/Enter ${selector} retains safe URL`, !contains(page.url(), values));
        }
        const after = await page.evaluate(() => history.length);
        check(`${engineName}/${mode}/no extra history entries`, before === after, {before, after});
        const status = await page.locator('#brief-status').innerText();
        check(`${engineName}/${mode}/honest fallback status`, enhanced ? status.includes('Copy your message') && status.includes('does not send') : status.includes('Open your email app using the link') && status.includes('does not include these form fields') && !status.includes('Copy your message'));
        check(`${engineName}/${mode}/plain email link`, await page.locator('#brief-form a[href="mailto:nick@modernapexstrategies.com"]').count() === 1);
        check(`${engineName}/${mode}/no native submit`, await page.locator('#brief-form button[type=submit]').count() === 0);
        if (mode === 'no-js') check(`${engineName}/${mode}/accurate noscript`, (await page.locator('noscript').innerText()).includes('email link still works'));
        if (enhanced) {
          await page.locator('#copy-brief').click();
          if (mode === 'normal') check(`${engineName}/explicit copy includes every field`, await page.evaluate(values => values.every(value => window.__copied?.includes(value)), values));
          else check(`${engineName}/${mode}/manual recovery`, (await page.locator('#brief-status').innerText()).includes('Copy is not available here. Email'));
        } else check(`${engineName}/${mode}/copy disabled`, await page.locator('#copy-brief').isDisabled());
        if (engineName === 'chromium') {
          const cdp = await context.newCDPSession(page);
          const history = await cdp.send('Page.getNavigationHistory');
          manifest.histories.push({engineName, mode, entries: history.entries.map(entry => entry.url)});
          check(`${engineName}/${mode}/all recorded history entries private`, history.entries.every(entry => !contains(entry.url, values)));
        }
        await page.goBack({waitUntil: 'networkidle'});
        check(`${engineName}/${mode}/Back reaches known safe entry`, page.url() === origin + '/?fixture_history=before');
        await page.goForward({waitUntil: 'networkidle'});
        check(`${engineName}/${mode}/Forward reaches known safe entry`, page.url() === origin + '/');
        manifest.histories.push({engineName, mode, navigations});
        check(`${engineName}/${mode}/all request and navigation URLs private`, [...requests, ...navigations].every(url => !contains(url, values)));
        await page.locator('#brief-status').scrollIntoViewIfNeeded();
        const fallbackFile = `${engineName}-fallback-${mode}-390.png`;
        await page.screenshot({path: path.join(output, fallbackFile)});
        manifest.screenshots.push(fallbackFile);
        if (mode === 'normal') for (const width of [1440, 390, 320]) {
          await page.setViewportSize({width, height: 900}); await page.locator('#contact').scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
          const file = `${engineName}-contact-${width}.png`; await page.screenshot({path: path.join(output, file)}); manifest.screenshots.push(file);
          check(`${engineName}/${width}/no overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
  check('unexpected external requests', manifest.blocked.length === 0);
  check('unexpected application errors', manifest.errors.length === 0);
} catch (error) { manifest.errors.push(error.message); process.exitCode = 1; }
finally { await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); }
console.log(JSON.stringify({output, checks: manifest.checks.length, failures: manifest.checks.filter(item => !item.pass), errors: manifest.errors}));
