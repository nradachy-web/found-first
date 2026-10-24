import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createInquiryController, mountInquiryForm, PENDING_STORAGE_KEY} from '../inquiry.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/public-inquiry-v1.json', import.meta.url)));
const fields = {...fixtures.accepted_semantic_vectors[0].input};
const config = {endpoint: 'https://inquiries.example.com/public/v1/inquiries', form_id: 'phase3_design', mode: 'api', schema_version: 1};
const receipt = {receipt_id: '00000000-0000-4000-8000-000000000001', status: 'received', notification_status: 'queued'};
const response = (body = receipt, status = 201) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function memory() {
  const values = new Map();
  return {values, failSet: false, failGet: false, failRemove: false,
    getItem(key) { if (this.failGet) throw Error('storage_unavailable'); return values.get(key) ?? null; },
    setItem(key, value) { if (this.failSet) throw Error('storage_unavailable'); values.set(key, value); },
    removeItem(key) { if (this.failRemove) throw Error('storage_unavailable'); values.delete(key); }
  };
}
async function setup(options = {}) {
  const storage = options.storage || memory(), clock = {value: Date.parse('2026-10-16T12:00:00Z')}, calls = [], states = [];
  let transport = options.transport || (() => response());
  const controller = await createInquiryController({config, storage, cryptoImpl: webcrypto, now: () => clock.value, notify: state => states.push(state), fetchImpl: (...args) => { calls.push(args); return transport(...args); }, ...options});
  clock.value += 3000;
  return {controller, storage, clock, calls, states, transport: next => { transport = next; }};
}
function onlyPending(storage) {
  assert.deepEqual([...storage.values.keys()], [PENDING_STORAGE_KEY]);
  const value = JSON.parse(storage.getItem(PENDING_STORAGE_KEY));
  assert.deepEqual(Object.keys(value).sort(), ['hash', 'key']);
  assert.match(value.key, /^[0-9a-f-]{36}$/); assert.match(value.hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify([...storage.values]), /Ada|example\.com|Synthetic|started_at|receipt/);
  return value;
}

test('email mode, missing storage and missing crypto keep a usable fallback without dispatch', async () => {
  for (const options of [{config: {endpoint: null, form_id: null, mode: 'email', schema_version: 1}}, {storage: null}, {cryptoImpl: null}]) {
    const s = await setup(options);
    await s.controller.submit(fields);
    assert.equal(s.controller.getState().apiReady, false);
    assert.equal(s.calls.length, 0);
    assert.match(s.controller.getState().message, /email/);
  }
});
test('committed receipt alone succeeds and repeated Send cannot create a new inquiry', async () => {
  const s = await setup();
  await s.controller.submit(fields);
  assert.equal(s.calls.length, 1);
  assert.equal(s.controller.getState().type, 'received');
  assert.deepEqual(s.controller.getState().receipt, receipt);
  assert.equal(s.storage.getItem(PENDING_STORAGE_KEY), null);
  const [url, options] = s.calls[0];
  assert.equal(url, config.endpoint); assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  assert.doesNotMatch(url, /Ada|Synthetic|ada@/);
  await s.controller.submit(fields);
  assert.equal(s.calls.length, 1);
});

test('optional measurement failures cannot block a lead or erase its committed receipt', async () => {
  for (const hook of ['requestContext', 'confirmedReceipt']) {
    const s = await setup({measurement: {requestContext: () => ({}), confirmedReceipt: () => {}, [hook]: () => { throw Error('optional measurement failure'); }}});
    await s.controller.submit(fields);
    assert.equal(s.calls.length, 1);
    assert.equal(s.controller.getState().type, 'received');
    assert.equal(s.controller.getState().busy, false);
    assert.equal(s.controller.getState().receipt.receipt_id, receipt.receipt_id);
  }
});
test('double click while hashing or sending keeps one in-flight request and one identity', async () => {
  const wait = deferred(), entered = deferred();
  const s = await setup({transport: () => { entered.resolve(); return wait.promise; }});
  const first = s.controller.submit(fields);
  await s.controller.submit(fields);
  await entered.promise;
  await s.controller.submit(fields);
  assert.equal(s.calls.length, 1); onlyPending(s.storage);
  wait.resolve(response()); await first;
});
test('timeout abort retains exact body/key; edits cannot silently rotate or rewrite retry', async () => {
  const entered = deferred(), wait = deferred(); let expire;
  const s = await setup({transport: () => { entered.resolve(); return wait.promise; }, setTimer: callback => { expire = callback; return 1; }, clearTimer: () => {}});
  const first = s.controller.submit(fields); await entered.promise; expire(); await first;
  assert.equal(s.controller.getState().type, 'uncertain');
  assert.equal(s.calls[0][1].signal.aborted, true);
  const pending = onlyPending(s.storage), original = s.calls[0][1].body;
  await s.controller.submit({...fields, brief: 'Changed synthetic message'});
  assert.equal(s.controller.getState().type, 'changed'); assert.equal(s.calls.length, 1);
  s.transport(() => response(receipt, 200)); await s.controller.retry();
  assert.equal(s.calls[1][1].body, original);
  assert.equal(s.calls[1][1].headers['Idempotency-Key'], pending.key);
  assert.equal(s.controller.getState().type, 'received');
  wait.resolve(response({...receipt, receipt_id: '00000000-0000-4000-8000-000000000002'}));
  await Promise.resolve();
  assert.equal(s.controller.getState().receipt.receipt_id, receipt.receipt_id);
});
test('reload has only a pointer, never automatic POST; matching re-entry reuses it with fresh abuse metadata', async () => {
  const first = await setup({transport: () => { throw Error('synthetic_network_failure'); }});
  await first.controller.submit(fields);
  const pending = onlyPending(first.storage), firstBody = JSON.parse(first.calls[0][1].body);
  first.controller.suspend();
  assert.equal(first.controller.getState().canRetry, false);
  const second = await setup({storage: first.storage});
  assert.equal(second.calls.length, 0); assert.equal(second.controller.getState().type, 'pending');
  await second.controller.submit({...fields, brief: 'Different content'});
  assert.equal(second.calls.length, 0); assert.equal(second.controller.getState().type, 'changed');
  await second.controller.submit(fields);
  assert.equal(second.calls[0][1].headers['Idempotency-Key'], pending.key);
  assert.equal(JSON.parse(second.calls[0][1].body).website_confirm, '');
  assert.equal(typeof firstBody.started_at, 'string');
  assert.equal(second.controller.getState().type, 'received');
});
test('pagehide invalidates a late receipt and clears frozen-body retry without losing the pointer', async () => {
  const entered = deferred(), wait = deferred();
  const s = await setup({transport: () => { entered.resolve(); return wait.promise; }});
  const task = s.controller.submit(fields); await entered.promise;
  const pending = onlyPending(s.storage);
  s.controller.suspend();
  wait.resolve(response()); await task;
  assert.equal(s.controller.getState().receipt, null);
  assert.equal(s.controller.getState().canRetry, false);
  assert.equal(onlyPending(s.storage).key, pending.key);
  await s.controller.retry(); assert.equal(s.calls.length, 1);
});
test('deliberate new-inquiry action rotates identity; old response cannot clear new pointer or replace its UI', async () => {
  const entered = deferred(), wait = deferred();
  const s = await setup({transport: () => { entered.resolve(); return wait.promise; }});
  const first = s.controller.submit(fields); await entered.promise;
  const old = onlyPending(s.storage);
  s.controller.startNewInquiry(); s.clock.value += 3000;
  s.transport(() => { throw Error('synthetic_network_failure'); });
  await s.controller.submit({...fields, brief: 'Second inquiry'});
  const next = onlyPending(s.storage); assert.notEqual(next.key, old.key);
  wait.resolve(response()); await first;
  assert.equal(s.controller.getState().type, 'uncertain');
  assert.equal(onlyPending(s.storage).key, next.key);
});
test('storage failure before dispatch cannot send a fresh inquiry or rotate its in-memory identity', async () => {
  const s = await setup(); s.storage.failSet = true;
  await s.controller.submit(fields);
  assert.equal(s.calls.length, 0); assert.equal(s.controller.getState().type, 'storage_error');
  s.storage.failSet = false; await s.controller.retry();
  assert.equal(s.calls.length, 1); assert.equal(s.controller.getState().type, 'received');
});
test('later storage failure preserves uncertain body and never clears previous pointer on error', async () => {
  const s = await setup({transport: () => { throw Error('synthetic_network_failure'); }});
  await s.controller.submit(fields); const pending = onlyPending(s.storage);
  s.storage.failGet = true; await s.controller.retry();
  assert.equal(s.calls.length, 1); assert.equal(s.controller.getState().type, 'storage_error');
  s.storage.failGet = false;
  assert.equal(onlyPending(s.storage).key, pending.key);
});
test('503 while paused or commit-uncertain retains the same key and recovers an eventual replay receipt', async () => {
  const s = await setup({transport: () => response({error: {code: 'intake_unavailable', fields: {}}}, 503)});
  await s.controller.submit(fields); const pending = onlyPending(s.storage);
  assert.equal(s.controller.getState().type, 'error'); assert.match(s.controller.getState().message, /may still have been received/);
  s.transport(() => response({...receipt, notification_status: 'attention_required'}, 200));
  await s.controller.retry();
  assert.equal(s.calls[1][1].headers['Idempotency-Key'], pending.key);
  assert.equal(s.controller.getState().type, 'received'); assert.match(s.controller.getState().message, /saved/);
});
test('wrong 2xx, raw errors, redirects and oversized response never create false receipt', async () => {
  for (const transport of [() => response({status: 'received'}), () => response({...receipt, notification_status: 'delivered'}), () => new Response('<h1>PRIVATE-DECOY</h1>', {status: 500}), () => response({error: {code: 'validation_failed', fields: {email: 'PRIVATE-DECOY'}}}, 422), () => new Response('x'.repeat(9000), {status: 200}), () => { throw Error('PRIVATE-DECOY redirect or CORS failure'); }]) {
    const s = await setup({transport}); await s.controller.submit(fields);
    assert.equal(s.controller.getState().type, 'uncertain'); onlyPending(s.storage);
    assert.doesNotMatch(JSON.stringify(s.states), /PRIVATE-DECOY|<h1>/);
  }
});
test('mock receipt is visibly simulated; accepted notification never claims delivered or read', async () => {
  for (const notification_status of ['simulated', 'accepted', 'attention_required']) {
    const s = await setup({transport: () => response({...receipt, notification_status})}); await s.controller.submit(fields);
    assert.equal(s.controller.getState().type, 'received');
    if (notification_status === 'simulated') assert.match(s.controller.getState().message, /simulated.*not a live lead/);
    assert.doesNotMatch(s.controller.getState().message, /email was delivered successfully|email has been read/);
  }
});
test('controller sends original bounded website input, not its longer canonical URL', async () => {
  const vector = fixtures.accepted_semantic_vectors.find(v => v.id === 'website_input_2000_canonical_2008');
  const s = await setup(); await s.controller.submit(vector.input);
  assert.equal(s.calls.length, 1);
  assert.equal(JSON.parse(s.calls[0][1].body).website.length, 2000);
});
test('validation preserves values through caller ownership and sends no invalid fields', async () => {
  const s = await setup();
  const input = {...fields, email: 'bad address'}, before = JSON.stringify(input);
  await s.controller.submit(input);
  assert.equal(s.calls.length, 0); assert.equal(JSON.stringify(input), before);
  assert.equal(s.controller.getState().fields.email, 'invalid');
});

// A small injected view exercises initialization/lifecycle failure seams. It is not
// a browser substitute; native focus/layout/CORS acceptance belongs to integration.
function viewHarness({runtimeConfig = {endpoint: null, form_id: null, mode: 'email', schema_version: 1}, configFailure = false, failListener = false, configPromise = null} = {}) {
  const nodes = new Map(), calls = [], clipboard = [], storage = memory();
  const doc = {activeElement: null, getElementById: id => nodes.get(id) || null, createElement: tag => new ViewNode('', tag)};
  class ViewNode {
    constructor(id, tag = 'div') { this.id = id; this.tag = tag; this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.type = 'text'; this.dataset = {label: id}; this.listeners = new Map(); this.children = []; this.attributes = {}; this.inputs = []; this.classList = {add() {}}; }
    set textContent(text) { this.text = text; this.children = []; }
    get textContent() { return this.text || ''; }
    addEventListener(name, callback) { if (failListener && this.id === 'copy-brief') throw Error('synthetic_initialization_failure'); const list = this.listeners.get(name) || []; list.push(callback); this.listeners.set(name, list); }
    async emit(type, extra = {}) { const event = {type, prevented: false, preventDefault() { this.prevented = true; }, ...extra}; for (const handler of this.listeners.get(type) || []) await handler(event); return event; }
    setAttribute(key, value) { this.attributes[key] = value; }
    matches(tag) { return this.tag === tag; }
    focus() { doc.activeElement = this; }
    append(child) { this.children.push(child); }
    querySelectorAll(selector) { if (selector === 'input, textarea') return this.inputs; const match = /input\[name="([^"]+)"\]/.exec(selector); return this.inputs.filter(input => (!match || input.name === match[1]) && (!selector.endsWith(':checked') || input.checked)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const add = (id, tag = 'div') => { const node = new ViewNode(id, tag); nodes.set(id, node); return node; };
  const form = add('brief-form', 'form');
  for (const id of ['brief-fields', 'brief-website-status', 'brief-interest']) add(id, 'fieldset');
  for (const id of ['copy-brief', 'send-inquiry', 'retry-inquiry', 'new-inquiry', 'confirm-new-inquiry', 'cancel-new-inquiry']) { const node = add(id, 'button'); node.disabled = true; node.type = 'button'; }
  for (const id of ['brief-status', 'brief-errors', 'brief-receipt', 'brief-new-warning', 'brief-api-disclosure', 'brief-site-field']) add(id);
  for (const id of ['brief-name', 'brief-email', 'brief-site', 'brief-sell', 'brief-notes', 'website-confirm']) { const node = add(id, id === 'brief-sell' || id === 'brief-notes' ? 'textarea' : 'input'); form.inputs.push(node); }
  for (const id of ['brief-name', 'brief-email', 'brief-site', 'brief-sell', 'brief-notes', 'brief-website-status', 'brief-interest']) add(id + '-error');
  for (const [name, values, group] of [['website_status', ['provided', 'none', 'unsure'], 'brief-website-status'], ['interest', ['aeo', 'chatgpt_ads', 'both', 'unsure'], 'brief-interest']]) {
    for (const value of values) { const input = add(name === 'interest' && value === 'unsure' ? 'interest-unsure' : name + '-' + value, 'input'); Object.assign(input, {type: 'radio', name, value}); form.inputs.push(input); nodes.get(group).inputs.push(input); }
  }
  nodes.get('brief-fields').disabled = true;
  nodes.get('send-inquiry').hidden = true;
  nodes.get('brief-site-field').hidden = true;
  const win = new ViewNode('window');
  Object.assign(win, {sessionStorage: storage, crypto: webcrypto, location: {protocol: 'http:', hostname: '127.0.0.1'}, setTimeout, clearTimeout, navigator: {clipboard: {writeText: async text => { clipboard.push(text); }}}, fetch: async (url, options) => { calls.push({url: String(url), options}); if (configFailure) throw Error('synthetic_config_failure'); return configPromise ? configPromise : response(runtimeConfig, 200); }});
  return {doc, win, nodes, form, storage, calls, clipboard};
}
test('missing API config retains editable explicit-copy fallback without enabling native submission', async () => {
  const view = viewHarness({configFailure: true});
  await mountInquiryForm(view.doc, view.win);
  assert.equal(view.nodes.get('brief-fields').disabled, false);
  assert.equal(view.nodes.get('copy-brief').disabled, false);
  assert.equal(view.nodes.get('send-inquiry').disabled, true);
  const submission = await view.form.emit('submit'); assert.equal(submission.prevented, true);
  assert.equal(view.calls.length, 1);
  view.nodes.get('brief-name').value = 'SYNTHETIC-NAME';
  await view.nodes.get('copy-brief').emit('click');
  assert.match(view.clipboard[0], /SYNTHETIC-NAME/);
  assert.equal(view.calls.length, 1);
});
test('listener initialization failure leaves private controls disabled and submission prevented', async () => {
  const view = viewHarness({failListener: true});
  await mountInquiryForm(view.doc, view.win);
  assert.equal(view.nodes.get('brief-fields').disabled, true);
  assert.equal(view.nodes.get('copy-brief').disabled, true);
  assert.equal(view.nodes.get('send-inquiry').disabled, true);
  assert.equal((await view.form.emit('submit')).prevented, true);
  assert.equal(view.calls.length, 0);
});
test('pagehide/BFCache clears every application input, preserves only pending metadata and still renders return states', async () => {
  const view = viewHarness({runtimeConfig: config});
  const pending = {key: '00000000-0000-4000-8000-000000000002', hash: fixtures.accepted_semantic_vectors[0].expected.sha256};
  view.storage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
  const controller = await mountInquiryForm(view.doc, view.win);
  assert.equal(view.nodes.get('send-inquiry').type, 'submit');
  for (const input of view.form.inputs) if (input.type !== 'radio') input.value = 'SYNTHETIC-PRIVATE';
  await view.win.emit('pagehide');
  for (const input of view.form.inputs) if (input.type !== 'radio') assert.equal(input.value, '');
  await view.win.emit('pageshow', {persisted: true});
  assert.equal(view.calls.length, 1); // Config only; returning does not POST.
  assert.match(view.nodes.get('brief-status').textContent, /previous submission may have been received/);
  assert.equal(onlyPending(view.storage).key, pending.key);
  controller.startNewInquiry();
  assert.match(view.nodes.get('brief-status').textContent, /New inquiry started/);
});
test('leaving during config load cannot late-enable API collection', async () => {
  const configWait = deferred(), view = viewHarness({runtimeConfig: config, configPromise: configWait.promise});
  const mounting = mountInquiryForm(view.doc, view.win);
  await view.win.emit('pagehide');
  configWait.resolve(response(config, 200)); await mounting;
  assert.equal(view.nodes.get('send-inquiry').disabled, true);
  assert.equal(view.nodes.get('send-inquiry').hidden, true);
});
test('returning with no pending inquiry retains truthful API-ready guidance', async () => {
  const view = viewHarness({runtimeConfig: config});
  await mountInquiryForm(view.doc, view.win);
  await view.win.emit('pagehide'); await view.win.emit('pageshow', {persisted: true});
  assert.equal(view.nodes.get('send-inquiry').hidden, false);
  assert.equal(view.nodes.get('send-inquiry').disabled, false);
  assert.match(view.nodes.get('brief-status').textContent, /Enter your inquiry when you are ready/);
  assert.doesNotMatch(view.nodes.get('brief-status').textContent, /paste it into an email/);
  assert.equal(view.calls.length, 1);
});

for (const failure of ['import', 'mount']) {
  test(`optional measurement ${failure} failure does not prevent a confirmed inquiry`, async context => {
    let now = Date.now();
    context.mock.method(Date, 'now', () => now);
    const view = viewHarness({runtimeConfig: config});
    const original = view.win.fetch;
    view.win.fetch = async (url, options) => options?.method === 'POST' ? response() : original(url, options);
    const controller = await mountInquiryForm(view.doc, view.win, {measurementLoader: async () => {
      if (failure === 'import') throw Error('blocked optional module');
      return {config: {}, mountMeasurement() { throw Error('optional mount failed'); }};
    }});
    assert.equal(controller.getState().apiReady, true);
    assert.equal(view.nodes.get('send-inquiry').disabled, false);
    now += 3000;
    await controller.submit(fields);
    assert.equal(controller.getState().type, 'received');
    assert.match(view.nodes.get('brief-receipt').textContent, /00000000-0000-4000-8000-000000000001/);
    assert.equal(view.nodes.get('brief-form').attributes['aria-busy'], 'false');
  });
}

test('navigation during optional module loading cannot late-mount measurement', async () => {
  const view = viewHarness({runtimeConfig: config}), loading = deferred(), entered = deferred();
  const mounting = mountInquiryForm(view.doc, view.win, {measurementLoader: () => { entered.resolve(); return loading.promise; }});
  await entered.promise;
  await view.win.emit('pagehide');
  loading.resolve({config: {}, mountMeasurement() { assert.fail('late measurement mount'); }});
  assert.equal((await mounting).getState().apiReady, true);
  await Promise.resolve();
  assert.equal(view.calls.length, 1);
});

test('a permanently pending optional module never delays inquiry readiness or receipt', async context => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const view = viewHarness({runtimeConfig: config}), original = view.win.fetch;
  view.win.fetch = async (url, options) => options?.method === 'POST' ? response() : original(url, options);
  const controller = await mountInquiryForm(view.doc, view.win, {measurementLoader: () => new Promise(() => {})});
  assert.equal(controller.getState().apiReady, true);
  assert.equal(view.nodes.get('send-inquiry').disabled, false);
  now += 3000;
  await controller.submit(fields);
  assert.equal(controller.getState().type, 'received');
});
