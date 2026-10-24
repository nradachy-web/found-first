// Public inquiry v1. No analytics, URL-carried fields, ambient credentials or automatic sends.
export const MAX_BODY_BYTES = 32768;
export const PENDING_STORAGE_KEY = 'ff-inquiry-pending-v1';
export const REQUEST_FIELDS = Object.freeze(['form_id', 'schema_version', 'name', 'email', 'website_status', 'website', 'brief', 'interest', 'notes', 'website_confirm', 'started_at']);
const REQUIRED = ['form_id', 'schema_version', 'name', 'email', 'website_status', 'brief', 'website_confirm', 'started_at'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const EMAIL = 'nick@modernapexstrategies.com';
const encoder = new TextEncoder();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const points = value => Array.from(value).length;

export class InquiryValidationError extends Error {
  constructor(code = 'validation_failed', fields = {}, statusCode = 422) {
    super(code);
    this.name = 'InquiryValidationError';
    this.code = code;
    this.fields = Object.freeze({...fields});
    this.statusCode = statusCode;
  }
}
const invalid = (field, code = 'invalid') => { throw new InquiryValidationError('validation_failed', {[field]: code}); };
const malformed = () => { throw new InquiryValidationError('malformed_request', {}, 400); };

// Parse standard JSON, then reject duplicate decoded keys (including escaped aliases).
// The scanner runs only after JSON.parse has validated the token grammar.
export function parseBoundedJSON(source, limit = MAX_BODY_BYTES) {
  let text;
  try { text = typeof source === 'string' ? source : new TextDecoder('utf-8', {fatal: true}).decode(source); }
  catch { malformed(); }
  if (encoder.encode(text).length > limit) throw new InquiryValidationError('payload_too_large', {}, 413);
  let result;
  try { result = JSON.parse(text); } catch { malformed(); }
  const finite = (item, depth = 0) => { if (depth > 32 || (typeof item === 'number' && !Number.isFinite(item))) malformed(); if (item && typeof item === 'object') for (const value of Object.values(item)) finite(value, depth + 1); };
  finite(result);
  let position = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(text[position] || '\0')) position++; };
  const string = () => {
    const start = position++;
    while (position < text.length) {
      if (text[position] === '\\') { position += 2; continue; }
      if (text[position++] === '"') return JSON.parse(text.slice(start, position));
    }
    malformed();
  };
  const value = depth => {
    if (depth > 32) malformed();
    whitespace();
    if (text[position] === '{') {
      position++; whitespace();
      const keys = new Set();
      if (text[position] === '}') { position++; return; }
      for (;;) {
        whitespace(); const key = string();
        if (keys.has(key)) malformed();
        keys.add(key); whitespace(); position++; value(depth + 1); whitespace();
        if (text[position++] === '}') return;
      }
    }
    if (text[position] === '[') {
      position++; whitespace();
      if (text[position] === ']') { position++; return; }
      for (;;) { value(depth + 1); whitespace(); if (text[position++] === ']') return; }
    }
    if (text[position] === '"') { string(); return; }
    while (position < text.length && !/[\s,}\]]/.test(text[position])) position++;
  };
  value(0);
  return result;
}

function normalizedText(value, field, min, max, collapse = false) {
  if (typeof value !== 'string') invalid(field);
  for (const char of value) { const n = char.codePointAt(0); if (n >= 0xd800 && n <= 0xdfff) invalid(field); }
  let normalized = value.normalize('NFC').replace(/\r\n?/g, '\n');
  if (/[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f\ufeff]/.test(normalized)) invalid(field);
  normalized = normalized.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  if (collapse) normalized = normalized.replace(/[ \t\n]+/g, ' ');
  if (points(normalized) < min) invalid(field, 'required');
  if (points(normalized) > max) invalid(field, 'too_long');
  return normalized;
}

function dnsHostname(host) {
  if (host.length > 253) return false;
  const labels = host.split('.');
  return labels.length >= 2 && labels.every(label => label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) && labels.at(-1).length >= 2 && /[a-z]/i.test(labels.at(-1));
}
function canonicalEmail(value) {
  const email = normalizedText(value, 'email', 3, 320);
  const pieces = email.split('@');
  if (pieces.length !== 2 || pieces[0].length < 1 || pieces[0].length > 64 || !dnsHostname(pieces[1])) invalid('email');
  if (!pieces[0].split('.').every(atom => /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/.test(atom))) invalid('email');
  return email.toLowerCase(); // Grammar is ASCII; never Unicode casefold.
}
function canonicalWebsite(value, status) {
  if (value === null || value === undefined) {
    if (status === 'provided') invalid('website', 'inconsistent');
    return null;
  }
  const website = normalizedText(value, 'website', 0, 2000);
  if (status !== 'provided') {
    if (website !== '') invalid('website', 'inconsistent');
    return null;
  }
  if (!website) invalid('website', 'inconsistent');
  const match = /^(?:(https?):\/\/)?([^/:?#\\]+)(?::([0-9]+))?(\/.*)?$/i.exec(website);
  if (!match) invalid('website');
  const scheme = (match[1] || 'https').toLowerCase(), host = match[2].toLowerCase(), port = match[3], path = match[4] || '/';
  if (!dnsHostname(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) invalid('website');
  if (port !== undefined && port !== (scheme === 'https' ? '443' : '80')) invalid('website');
  if (!/^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[A-Fa-f0-9]{2})*$/.test(path) || /%(?:2f|5c)/i.test(path)) invalid('website');
  if (path.split('/').some(segment => ['.', '..'].includes(segment.replace(/%2e/ig, '.')))) invalid('website');
  return `${scheme}://${host}${path}`;
}
function timestamp(value) {
  if (typeof value !== 'string') invalid('started_at');
  if (points(value) > 40) invalid('started_at', 'too_long');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!m || Number(m[1]) < 1) invalid('started_at');
  const date = new Date(value.slice(0, 19) + 'Z');
  const actual = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  if (actual.some((n, i) => n !== Number(m[i + 1]))) invalid('started_at');
  return date.getTime() + Number(`0.${m[7] || '0'}`) * 1000;
}

export function canonicalizeInquiry(value) {
  if (!object(value) || Object.keys(value).some(key => !REQUEST_FIELDS.includes(key))) malformed();
  for (const key of REQUIRED) if (!Object.hasOwn(value, key)) invalid(key, 'required');
  if (typeof value.form_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.form_id)) invalid('form_id');
  if (typeof value.schema_version !== 'number' || !Number.isInteger(value.schema_version)) invalid('schema_version');
  if (value.schema_version !== 1) throw new InquiryValidationError('unsupported_schema', {schema_version: 'invalid'});
  if (!['provided', 'none', 'unsure'].includes(value.website_status)) invalid('website_status');
  const interest = Object.hasOwn(value, 'interest') ? value.interest : 'unsure';
  if (!['aeo', 'chatgpt_ads', 'both', 'unsure'].includes(interest)) invalid('interest');
  const semantic = {
    brief: normalizedText(value.brief, 'brief', 1, 2000),
    email: canonicalEmail(value.email),
    form_id: value.form_id,
    interest,
    name: normalizedText(value.name, 'name', 1, 100, true),
    notes: normalizedText(Object.hasOwn(value, 'notes') ? value.notes : '', 'notes', 0, 4000),
    schema_version: 1,
    website: canonicalWebsite(value.website, value.website_status),
    website_status: value.website_status
  };
  if (typeof value.website_confirm !== 'string') invalid('website_confirm');
  if (points(value.website_confirm) > 200) invalid('website_confirm', 'too_long');
  const startedAt = timestamp(value.started_at);
  const canonicalJSON = JSON.stringify(semantic); // The literal key order above is lexical ASCII order.
  return Object.freeze({semantic: Object.freeze(semantic), canonicalJSON, canonicalBytes: encoder.encode(canonicalJSON), startedAt, honeypot: value.website_confirm});
}
export function validateNewSubmission(canonical, now = Date.now()) {
  if (canonical.honeypot !== '') throw new InquiryValidationError('submission_rejected', {website_confirm: 'invalid'});
  const elapsed = now - canonical.startedAt;
  if (elapsed < 2000 || elapsed > 86400000) throw new InquiryValidationError('submission_rejected', {started_at: 'invalid'});
}
export async function hashInquiry(canonical, cryptoImpl = globalThis.crypto) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', canonical.canonicalBytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export function validateInquiryConfig(value, {allowLoopback = false} = {}) {
  const fail = () => { throw new Error('invalid_inquiry_configuration'); };
  if (!exactKeys(value, ['endpoint', 'form_id', 'mode', 'schema_version']) || value.schema_version !== 1) fail();
  if (value.mode === 'email') {
    if (value.endpoint !== null || value.form_id !== null) fail();
  } else if (value.mode === 'api') {
    if (typeof value.form_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.form_id) || typeof value.endpoint !== 'string' || value.endpoint.length > 2048 || /[\s\\]/.test(value.endpoint)) fail();
    let url;
    try { url = new URL(value.endpoint); } catch { fail(); }
    const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.href !== value.endpoint || !url.pathname.endsWith('/public/v1/inquiries')) fail();
    if (loopback ? !(allowLoopback && ['http:', 'https:'].includes(url.protocol)) : url.protocol !== 'https:' || !dnsHostname(url.hostname) || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost')) fail();
  } else fail();
  return Object.freeze({...value});
}

const ERROR_STATUS = Object.freeze({malformed_request: 400, origin_denied: 403, idempotency_conflict: 409, unsupported_schema: 422, validation_failed: 422, submission_rejected: 422, rate_limited: 429, payload_too_large: 413, intake_unavailable: 503});
export function validatePublicResponse(status, body) {
  if ([200, 201].includes(status) && exactKeys(body, ['receipt_id', 'status', 'notification_status']) && typeof body.receipt_id === 'string' && UUID.test(body.receipt_id) && body.status === 'received' && ['queued', 'accepted', 'attention_required', 'simulated'].includes(body.notification_status)) return {kind: 'receipt', receipt: {...body}};
  if (exactKeys(body, ['error']) && exactKeys(body.error, ['code', 'fields']) && typeof body.error.code === 'string' && Object.hasOwn(ERROR_STATUS, body.error.code) && ERROR_STATUS[body.error.code] === status && object(body.error.fields)) {
    if (Object.entries(body.error.fields).every(([key, code]) => REQUEST_FIELDS.includes(key) && ['required', 'invalid', 'too_long', 'inconsistent'].includes(code))) return {kind: 'error', code: body.error.code, fields: {...body.error.fields}};
  }
  return {kind: 'unconfirmed'};
}
async function readResponseJSON(response, limit) {
  if (!response.body?.getReader) return parseBoundedJSON(await response.text(), limit);
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); malformed(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return parseBoundedJSON(bytes, limit);
  } finally { reader.releaseLock(); }
}

const FALLBACK = 'Copy your message, then paste it into an email to Nick. Opening your email app does not send it.';
const UNCERTAIN = "We couldn't confirm whether your inquiry was received. Retry the same inquiry to check safely, or contact Nick by email.";
const PENDING = 'A previous submission may have been received. Re-enter the same details to retry it, or deliberately start a new inquiry.';
const ERROR_MESSAGES = Object.freeze({
  malformed_request: 'This inquiry could not be checked. Use the email fallback or retry the same inquiry.',
  origin_denied: 'Online submission is unavailable from this page. Use the email fallback.',
  idempotency_conflict: 'The earlier attempt has different details. Retry its original message or deliberately start a new inquiry.',
  unsupported_schema: 'This form version is not supported by the inquiry service. Use the email fallback.',
  validation_failed: 'Check the highlighted details. To change an already attempted inquiry, choose Start a new inquiry.',
  submission_rejected: 'This attempt could not be accepted. Wait a moment and retry, or use the email fallback.',
  rate_limited: 'Online submission is temporarily limited. Wait before retrying the same inquiry, or use the email fallback.',
  payload_too_large: 'The message is too long to send online. Shorten it with Start a new inquiry, or use email.',
  intake_unavailable: 'Online submission is temporarily unavailable. Retry the same inquiry later, or use the email fallback.'
});

export async function createInquiryController({config, allowLoopback = false, storage, cryptoImpl = globalThis.crypto, fetchImpl = globalThis.fetch, now = () => Date.now(), notify = () => {}, measurement = null, timeoutMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  config = validateInquiryConfig(config, {allowLoopback});
  let pending = null, invalidStored = false, readableStorage = true, apiReady = false, busy = false, generation = 0, cancel = null, startedAt = new Date(now()).toISOString();
  let current = {type: 'fallback', message: FALLBACK, fields: {}, receipt: null};
  const readStored = () => {
    const text = storage.getItem(PENDING_STORAGE_KEY);
    if (text === null) return null;
    if (text.length > 256) throw new Error('invalid_pending_identity');
    let value;
    try { value = parseBoundedJSON(text, 256); } catch { throw new Error('invalid_pending_identity'); }
    if (!exactKeys(value, ['key', 'hash']) || typeof value.key !== 'string' || typeof value.hash !== 'string' || !UUID.test(value.key) || !HASH.test(value.hash)) throw new Error('invalid_pending_identity');
    return value;
  };
  const emit = (type, message, fields = {}, receipt = null) => {
    current = {type, message, fields, receipt, busy, apiReady, hasPending: Boolean(pending || invalidStored), canRetry: Boolean(pending?.body) && apiReady && !busy};
    notify({...current, fields: {...fields}, receipt: receipt && {...receipt}});
    return current;
  };
  try { pending = readStored(); } catch (error) { invalidStored = error.message === 'invalid_pending_identity'; readableStorage = false; }
  if (config.mode === 'api') {
    try {
      if (!cryptoImpl?.subtle?.digest || !cryptoImpl?.randomUUID || typeof fetchImpl !== 'function') throw new Error('unavailable');
      const probe = cryptoImpl.randomUUID();
      if (!UUID.test(probe)) throw new Error('unavailable');
      const digest = await cryptoImpl.subtle.digest('SHA-256', encoder.encode('public-inquiry-readiness'));
      if (digest.byteLength !== 32) throw new Error('unavailable');
      const probeKey = PENDING_STORAGE_KEY + '-probe';
      try { storage.setItem(probeKey, probe); if (storage.getItem(probeKey) !== probe) throw new Error('unavailable'); }
      finally { storage.removeItem(probeKey); }
      apiReady = readableStorage && !invalidStored;
    } catch { apiReady = false; }
  }
  emit(apiReady ? (pending ? 'pending' : 'ready') : 'fallback', pending || invalidStored ? PENDING + ' ' + (apiReady ? '' : FALLBACK) : apiReady ? 'Send your inquiry when you are ready. A receipt confirms it was saved.' : FALLBACK);

  function persist(attempt) {
    const previous = readStored();
    if (previous && (previous.key !== attempt.key || previous.hash !== attempt.hash)) throw new Error('pending_identity_changed');
    storage.setItem(PENDING_STORAGE_KEY, JSON.stringify({key: attempt.key, hash: attempt.hash}));
    const written = readStored();
    if (written?.key !== attempt.key || written?.hash !== attempt.hash) throw new Error('pending_identity_unavailable');
  }
  function clearOwn(attempt) {
    try {
      const stored = readStored();
      if (stored?.key === attempt.key && stored?.hash === attempt.hash) storage.removeItem(PENDING_STORAGE_KEY);
      return true;
    } catch { return false; }
  }
  async function dispatch(attempt, ticket) {
    if (!apiReady || !attempt?.body || ticket !== generation) return current;
    try { persist(attempt); }
    catch { busy = false; return emit('storage_error', 'This page cannot save the retry reference. Nothing new was sent by this action. Keep this tab open; reload recovery is unavailable. ' + FALLBACK); }
    const abort = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      cancel = () => { abort.abort(); reject(new Error('unconfirmed')); };
      timer = setTimer(cancel, Math.max(1, Math.min(timeoutMs, 30000)));
    });
    emit('sending', 'Sending your inquiry.');
    let measurementContext;
    try { measurementContext = measurement?.requestContext(attempt.key, config.endpoint, attempt.measurementEligible === true); }
    catch { /* Optional measurement must never block or change inquiry delivery. */ }
    try {
      const operation = (async () => {
        const response = await fetchImpl(config.endpoint, {method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: {'Content-Type': 'application/json', 'Idempotency-Key': attempt.key, ...measurementContext?.headers}, body: attempt.body, signal: abort.signal});
        return validatePublicResponse(response.status, await readResponseJSON(response, 8192));
      })();
      const result = await Promise.race([operation, deadline]);
      if (ticket !== generation || pending !== attempt) return current;
      busy = false;
      if (result.kind === 'receipt') {
        const cleared = clearOwn(attempt);
        attempt.body = null; pending = null;
        const receipt = result.receipt;
        try { measurement?.confirmedReceipt(receipt, attempt.key, measurementContext); }
        catch { /* A confirmed inquiry remains confirmed even if measurement fails. */ }
        const message = receipt.notification_status === 'simulated' ? 'Test inquiry saved. Its notification is simulated; this is not a live lead.' : receipt.notification_status === 'attention_required' ? "Your inquiry is saved. The staff notification needs attention; you don't need to submit it again." : 'Found First received your inquiry. This receipt confirms it was saved, not that an email was delivered or read.';
        return emit('received', message + (cleared ? '' : ' The saved retry reference could not be cleared; keep this receipt.'), {}, receipt);
      }
      if (result.kind === 'error') return emit('error', ERROR_MESSAGES[result.code] + ' An earlier attempt may still have been received.', result.fields);
      return emit('uncertain', UNCERTAIN);
    } catch {
      if (ticket !== generation || pending !== attempt) return current;
      busy = false; return emit('uncertain', UNCERTAIN);
    } finally {
      clearTimer(timer);
      if (ticket === generation) cancel = null;
    }
  }
  const controller = {
    getState: () => ({...current, fields: {...current.fields}, receipt: current.receipt && {...current.receipt}}),
    async submit(fields) {
      if (!apiReady || busy || current.type === 'received') return current;
      let input = {...fields, form_id: config.form_id, schema_version: 1, started_at: startedAt};
      fields = null;
      let canonical;
      try {
        canonical = canonicalizeInquiry(input);
        if (!pending) validateNewSubmission(canonical, now());
        if (encoder.encode(JSON.stringify(input)).length > MAX_BODY_BYTES) throw new InquiryValidationError('payload_too_large', {}, 413);
      } catch (error) {
        return emit('validation', error?.fields?.started_at ? 'Please wait a moment before sending, then try again.' : error?.fields?.website_confirm ? 'This form cannot send the message right now. Use the email fallback.' : 'Check the highlighted details. Your message remains in this tab.', error instanceof InquiryValidationError ? error.fields : {});
      }
      busy = true; const ticket = ++generation;
      emit('sending', 'Checking your inquiry.');
      try {
        const hash = await hashInquiry(canonical, cryptoImpl);
        if (ticket !== generation) return current;
        if (pending && pending.hash !== hash) { busy = false; return emit('changed', 'Your earlier inquiry may have been received. Retry its original message, or deliberately start a new inquiry with these details.'); }
        if (!pending) {
          const key = cryptoImpl.randomUUID();
          if (!UUID.test(key)) throw new Error('unavailable');
          pending = {key, hash, body: null, measurementEligible: true};
        }
        // Retain submitted input, not the canonical URL: the v1 website bound is input-only.
        if (!pending.body) pending.body = JSON.stringify(input);
        input = null; canonical = null;
        return await dispatch(pending, ticket);
      } catch {
        if (ticket !== generation) return current;
        busy = false; return emit('storage_error', 'Online submission could not be prepared. No new request was sent by this action. ' + FALLBACK);
      }
    },
    async retry() {
      if (!apiReady || busy || !pending?.body) return current;
      busy = true; return dispatch(pending, ++generation);
    },
    startNewInquiry() {
      generation++; cancel?.(); cancel = null; busy = false;
      if (pending) pending.body = null;
      try { storage.removeItem(PENDING_STORAGE_KEY); pending = null; invalidStored = false; }
      catch { apiReady = false; return emit('storage_error', 'The previous retry reference cannot be cleared here. ' + FALLBACK); }
      startedAt = new Date(now()).toISOString();
      return emit(apiReady ? 'ready' : 'fallback', apiReady ? 'New inquiry started. Review your details before sending.' : FALLBACK);
    },
    suspend() {
      generation++; cancel?.(); cancel = null; busy = false;
      if (pending) pending.body = null;
      startedAt = new Date(now()).toISOString();
      return emit(apiReady ? (pending ? 'pending' : 'ready') : 'fallback', pending || invalidStored ? PENDING : apiReady ? 'The form details were cleared when you left. Enter your inquiry when you are ready.' : FALLBACK);
    }
  };
  return controller;
}

const FIELD_IDS = Object.freeze({name: 'brief-name', email: 'brief-email', website_status: 'brief-website-status', website: 'brief-site', brief: 'brief-sell', interest: 'brief-interest', notes: 'brief-notes'});
const FIELD_MESSAGES = Object.freeze({required: 'Please complete this field.', invalid: 'Please check this value.', too_long: 'Please shorten this field.', inconsistent: 'Check your website choice and address.'});
async function loadMeasurement() {
  const [{mountMeasurement}, {default: config}] = await Promise.all([import('./measurement.js'), import('./measurement-config.js')]);
  return {mountMeasurement, config};
}

export async function mountInquiryForm(doc = document, win = window, {measurementLoader = loadMeasurement} = {}) {
  const form = doc.getElementById('brief-form');
  if (!form) return null;
  // First listener is installed before any editable control is enabled.
  form.addEventListener('submit', event => event.preventDefault());
  const byId = id => doc.getElementById(id);
  const fields = byId('brief-fields'), copy = byId('copy-brief'), send = byId('send-inquiry'), retry = byId('retry-inquiry'), newButton = byId('new-inquiry');
  const status = byId('brief-status'), summary = byId('brief-errors'), receipt = byId('brief-receipt'), warning = byId('brief-new-warning');
  const confirmNew = byId('confirm-new-inquiry'), cancelNew = byId('cancel-new-inquiry'), disclosure = byId('brief-api-disclosure');
  let controller = null, mountedGeneration = 0, latest = null, configurationAbort = null;
  const clearInputs = () => {
    for (const control of form.querySelectorAll('input, textarea')) {
      if (control.type === 'radio') control.checked = false; else control.value = '';
    }
    const unsure = byId('interest-unsure'); if (unsure) unsure.checked = true;
    receipt.textContent = ''; warning.hidden = true;
  };
  const updateWebsite = () => {
    const provided = form.querySelector('input[name="website_status"]:checked')?.value === 'provided';
    byId('brief-site-field').hidden = !provided;
    byId('brief-site').disabled = !provided;
    byId('brief-site').required = provided;
  };
  const getFields = () => {
    const choice = name => form.querySelector(`input[name="${name}"]:checked`)?.value;
    const websiteStatus = choice('website_status') || '';
    return {name: byId('brief-name').value, email: byId('brief-email').value, website_status: websiteStatus, website: websiteStatus === 'provided' ? byId('brief-site').value : null, brief: byId('brief-sell').value, interest: choice('interest') || 'unsure', notes: byId('brief-notes').value, website_confirm: byId('website-confirm').value};
  };
  const render = state => {
    latest = state;
    status.textContent = state.message; status.classList.add('is-ok');
    form.setAttribute('aria-busy', String(state.busy));
    fields.disabled = state.busy;
    copy.disabled = state.busy;
    send.hidden = !state.apiReady; send.disabled = state.busy || state.type === 'received'; send.type = state.apiReady ? 'submit' : 'button';
    retry.hidden = !state.canRetry; retry.disabled = state.busy;
    newButton.hidden = !state.hasPending && state.type !== 'received'; newButton.disabled = state.busy;
    newButton.textContent = state.type === 'received' ? 'Start another inquiry' : 'Start a new inquiry';
    disclosure.hidden = !state.apiReady;
    receipt.textContent = state.receipt ? `Reference: ${state.receipt.receipt_id}` : '';
    receipt.hidden = !state.receipt;
    summary.textContent = '';
    let first = null;
    for (const [field, id] of Object.entries(FIELD_IDS)) {
      const control = byId(id), error = byId(id + '-error');
      const message = FIELD_MESSAGES[state.fields[field]] || '';
      error.textContent = message; error.hidden = !message;
      control.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) {
        const link = doc.createElement('a');
        link.href = '#' + id; link.textContent = control.dataset.label + ': ' + message;
        const target = field === 'website' && byId('brief-site-field').hidden ? byId('brief-website-status').querySelector('input') : control.matches('fieldset') ? control.querySelector('input') : control;
        link.addEventListener('click', event => { event.preventDefault(); target.focus(); });
        summary.append(link);
        first ||= target;
      }
    }
    summary.hidden = !first;
    if (first) first.focus();
    updateWebsite();
  };
  try {
    for (const radio of form.querySelectorAll('input[name="website_status"]')) radio.addEventListener('change', updateWebsite);
    form.addEventListener('submit', () => { if (controller) void controller.submit(getFields()); });
    copy.addEventListener('click', async () => {
      const ticket = mountedGeneration;
      let data = getFields();
      const interests = {aeo: 'AEO', chatgpt_ads: 'ChatGPT ads', both: 'Both', unsure: 'Not sure yet'};
      let body = `To: ${EMAIL}\nSubject: Found First | AI visibility check\n\nHi Nick,\n\nName: ${data.name}\nReply email: ${data.email}\nWebsite: ${data.website || (data.website_status === 'none' ? 'Not yet' : 'Not sure')}\nWhat we sell, and who we serve: ${data.brief}\nInterested in: ${interests[data.interest]}\nNotes: ${data.notes}\n`;
      try { const writing = win.navigator.clipboard.writeText(body); body = null; data = null; await writing; if (ticket === mountedGeneration) status.textContent = `Copied. Paste it into an email to ${EMAIL}. Copying does not send it.`; }
      catch { if (ticket === mountedGeneration) status.textContent = `Copy is unavailable here. Open your email app and write to ${EMAIL}.`; }
    });
    retry.addEventListener('click', () => { if (controller) void controller.retry(); });
    newButton.addEventListener('click', () => { warning.hidden = false; confirmNew.focus(); });
    cancelNew.addEventListener('click', () => { warning.hidden = true; newButton.focus(); });
    confirmNew.addEventListener('click', () => { warning.hidden = true; controller?.startNewInquiry(); byId('brief-name').focus(); });
    const forgetPage = () => { mountedGeneration++; configurationAbort?.abort(); controller?.suspend(); clearInputs(); updateWebsite(); };
    win.addEventListener('pagehide', forgetPage);
    win.addEventListener('pageshow', event => { if (event.persisted) forgetPage(); });
    clearInputs(); updateWebsite();
    fields.disabled = false; copy.disabled = false;
    status.textContent = FALLBACK;
    const ticket = mountedGeneration;
    const abort = new AbortController();
    configurationAbort = abort;
    const timer = win.setTimeout(() => abort.abort(), 6000);
    let config;
    try {
      const response = await win.fetch(new URL('./config/public-inquiry.json', import.meta.url), {credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal});
      if (response.status !== 200) throw new Error('unavailable');
      config = await readResponseJSON(response, 4096);
    } finally { win.clearTimeout(timer); configurationAbort = null; }
    if (ticket !== mountedGeneration) return null;
    let storage;
    try { storage = win.sessionStorage; } catch { storage = null; }
    const allowLoopback = win.location.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(win.location.hostname);
    let optionalMeasurement = null;
    const measurement = {
      requestContext: (...args) => optionalMeasurement?.requestContext(...args),
      confirmedReceipt: (...args) => optionalMeasurement?.confirmedReceipt(...args)
    };
    const created = await createInquiryController({config, allowLoopback, storage, cryptoImpl: win.crypto, fetchImpl: win.fetch.bind(win), measurement, notify: state => { if (ticket === mountedGeneration || controller) render(state); }});
    // Notification closure follows future page lifecycles; no original form values are captured.
    if (ticket !== mountedGeneration) { created.suspend(); return null; }
    controller = created;
    // Even an indefinitely pending optional module must not delay submission.
    // Only newly consented attempts can acquire measurement context later.
    void Promise.resolve().then(measurementLoader).then(optional => {
      if (ticket === mountedGeneration) optionalMeasurement = optional.mountMeasurement(optional.config, doc, win);
    }).catch(() => { /* Submission remains available without measurement. */ });
    return controller;
  } catch {
    send.hidden = true; send.disabled = true;
    disclosure.hidden = true;
    status.textContent = 'Online submission is unavailable. If you already tried to send, that inquiry may have been received. ' + FALLBACK;
    // Handlers were installed before enablement. If initialization failed earlier, fail closed.
    if (!latest && fields.disabled) copy.disabled = true;
    return null;
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  void mountInquiryForm(document, window);
}
