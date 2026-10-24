import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMeasurement, SDK_URL} from '../measurement.js';
import shipped from '../measurement-config.js';

const key = 'b2aba580-e1a8-42e5-9438-a57c3c2b063c';
const receipt = {receipt_id: '1f1dde42-5bae-4b16-b268-14776f577c40', status: 'received', notification_status: 'queued'};
const endpoint = 'https://crm.example.com/public/v1/inquiries';
function setup(overrides = {}) {
  const scripts = [], calls = [], requests = [], reads = [];
  const win = {location: {origin: 'https://agency.example.com', protocol: 'https:', pathname: '/', href: 'https://agency.example.com/?email=PRIVATE&oppref=opaque-click#PRIVATE'}, fetch: async (url, options) => { requests.push({url, options}); return {status: 200, text: async () => JSON.stringify({enabled: true, pixel_id: 'pixel_fixture', allowed_origin: 'https://agency.example.com'})}; }};
  const doc = {head: {appendChild: script => scripts.push(script)}, createElement: tag => ({tag}), get cookie() { reads.push('cookie'); return '__obref=opaque-browser; unrelated=PRIVATE'; }};
  const config = {enabled: true, pixel_id: 'pixel_fixture', allowed_origin: win.location.origin, configuration_url: 'https://crm.example.com/public/v1/measurement/config', ...overrides};
  const controller = createMeasurement({config, win, doc});
  return {controller, scripts, calls, requests, reads, win, doc};
}

test('shipped measurement is off, and no SDK, cookies, storage or network before consent', async () => {
  assert.equal(shipped.enabled, false);
  const f = setup();
  f.controller.requestContext(key, endpoint);
  assert.equal(f.controller.confirmedReceipt(receipt, key, {granted: false}), false);
  assert.deepEqual(f.scripts, []); assert.deepEqual(f.reads, []); assert.deepEqual(f.requests, []);
  f.controller.deny(); assert.equal(f.win.oaiq, undefined);
  const off = setup({enabled: false}); await off.controller.allow(); assert.equal(off.win.oaiq, undefined);
});

test('consent precedes init, single-pixel receipt uses same ID and only consented opaque references', async () => {
  const f = setup(); await f.controller.allow();
  assert.deepEqual(f.win.oaiq.q, [['consent', false], ['init', {pixelId: 'pixel_fixture'}], ['consent', true]]);
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, SDK_URL); assert.equal(f.scripts[0].referrerPolicy, 'no-referrer');
  const context = f.controller.requestContext(key, endpoint);
  assert.deepEqual(context.headers, {'X-Measurement-Consent': 'granted', 'X-Measurement-Oppref': 'opaque-click', 'X-Measurement-Obref': 'opaque-browser'});
  assert.equal(JSON.stringify(context).includes('PRIVATE'), false);
  assert.equal(f.controller.confirmedReceipt(receipt, key, context), true);
  assert.deepEqual(f.win.oaiq.q.at(-1), ['measureSingle', 'pixel_fixture', 'lead_created', {type: 'customer_action'}, {event_id: receipt.receipt_id, opt_out: true}]);
  assert.equal(f.controller.confirmedReceipt(receipt, key, context), false);
});

test('withdrawal cancels in-flight key, strips retry headers and never replays blocked receipt', async () => {
  const f = setup(); await f.controller.allow(); const context = f.controller.requestContext(key, endpoint);
  f.controller.deny();
  assert.deepEqual(f.win.oaiq.q.at(-1), ['consent', false]);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].url, endpoint + '/measurement-withdrawal');
  assert.deepEqual(JSON.parse(f.requests[1].options.body), {idempotency_key: key});
  assert.deepEqual(f.controller.requestContext(key, endpoint).headers, {});
  assert.equal(f.controller.confirmedReceipt(receipt, key, context), false);
  await f.controller.allow();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.controller.confirmedReceipt(receipt, key, context), false);
  assert.equal(f.win.oaiq.q.some(call => call[0] === 'measureSingle'), false);
});

test('no retroactive measurement on unconsented or rehydrated attempts; synthetic receipts excluded', async () => {
  const f = setup(); const before = f.controller.requestContext(key, endpoint); await f.controller.allow();
  assert.equal(f.controller.confirmedReceipt(receipt, key, before), false);
  const rehydrated = f.controller.requestContext(receipt.receipt_id, endpoint, false);
  assert.equal(rehydrated.granted, false);
  const current = f.controller.requestContext('4815f7aa-0bc5-4f72-8c1a-f63797d28318', endpoint);
  assert.equal(f.controller.confirmedReceipt({...receipt, notification_status: 'simulated'}, key, current), false);
});

test('exact origin, HTTPS and sensitive-page exclusion fail closed', async () => {
  for (const change of [{allowed_origin: 'https://other.example.com'}, {pixel_id: '</script>'}]) {
    const f = setup(change); await f.controller.allow(); assert.equal(f.scripts.length, 0);
  }
  const f = setup(); f.win.location.pathname = '/admin';
  const admin = createMeasurement({config: {enabled: true, pixel_id: 'pixel_fixture', allowed_origin: f.win.location.origin}, win: f.win, doc: f.doc});
  await admin.allow(); assert.equal(f.scripts.length, 0);
  assert.equal(fs.readFileSync(new URL('../measurement.js', import.meta.url), 'utf8').includes('localStorage'), false);
});

test('existing SDK is reused; navigation ends local consent without withdrawing a committed event', async () => {
  const f = setup(); const calls = [];
  f.win.oaiq = (...args) => calls.push(args);
  await f.controller.allow();
  assert.equal(f.scripts.length, 0);
  const context = f.controller.requestContext(key, endpoint);
  assert.equal(f.controller.confirmedReceipt(receipt, key, context), true);
  const requestsBefore = f.requests.length;
  f.controller.dispose();
  assert.equal(f.requests.length, requestsBefore);
  assert.equal(f.controller.getState().consent, false);
  assert.deepEqual(calls.at(-1), ['consent', false]);
});

test('pending remote gate and blocked cookies cannot prevent inquiry or enable early Pixel sends', async () => {
  const f = setup(); let release;
  f.win.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = f.controller.allow();
  assert.equal(f.controller.requestContext(key, endpoint).granted, false);
  assert.equal(f.controller.confirmedReceipt(receipt, key, {granted: false}), false);
  f.controller.deny();
  release({status: 200, text: async () => JSON.stringify({enabled: true, pixel_id: 'pixel_fixture', allowed_origin: f.win.location.origin})});
  await pending;
  assert.equal(f.scripts.length, 0);
  const other = setup(); Object.defineProperty(other.doc, 'cookie', {get() { throw Error('privacy restricted'); }});
  await other.controller.allow();
  assert.equal(other.controller.requestContext(key, endpoint).granted, true);
});
