import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import {canonicalizeInquiry, hashInquiry, validateNewSubmission, parseBoundedJSON, validateInquiryConfig, validatePublicResponse, InquiryValidationError} from '../inquiry.js';
import {readInquiryConfig} from '../tools/validate-inquiry-config.mjs';

const fixtureBytes = fs.readFileSync(new URL('./fixtures/public-inquiry-v1.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes);
const receipt = {receipt_id: '00000000-0000-4000-8000-000000000001', status: 'received', notification_status: 'queued'};
const api = {endpoint: 'https://inquiries.example.com/public/v1/inquiries', form_id: 'phase3_design', mode: 'api', schema_version: 1};

test('independent canonical fixture bytes remain pinned', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), 'c76578749d7492e022222f2331376f18b1cd66f12fe665d70b342570dc75a712');
});
test('all frozen accepted/replay vectors match independent objects, exact UTF-8 bytes and hashes', async () => {
  for (const vector of [...fixture.accepted_semantic_vectors, ...fixture.replay_semantic_vectors]) {
    const actual = canonicalizeInquiry(vector.input), expected = vector.expected;
    assert.deepEqual(actual.semantic, expected.semantic, vector.id);
    assert.equal(actual.canonicalJSON, expected.canonical_json, vector.id);
    assert.equal(Buffer.from(actual.canonicalBytes).toString('hex'), expected.utf8_hex, vector.id);
    assert.equal(actual.canonicalBytes.length, expected.utf8_byte_length, vector.id);
    assert.equal(await hashInquiry(actual, webcrypto), expected.sha256, vector.id);
  }
});
test('every discriminating rejected vector fails its field or new-acceptance boundary without echo', () => {
  for (const vector of fixture.rejected_vectors) {
    assert.throws(() => {
      const actual = canonicalizeInquiry(vector.input);
      if (vector.expected.stage === 'new_acceptance') validateNewSubmission(actual, Date.parse(fixture.fixture_context.now_utc));
    }, error => {
      assert.ok(error instanceof InquiryValidationError, vector.id);
      assert.ok(Object.hasOwn(error.fields, vector.expected.field), vector.id);
      assert.ok(['validation_failed', 'unsupported_schema', 'submission_rejected'].includes(error.message), vector.id);
      assert.doesNotMatch(JSON.stringify(error), /example\.com|Synthetic|Ada Example/);
      return true;
    }, vector.id);
  }
});
test('raw JSON rejects duplicate aliases, invalid UTF-8, nonfinite values and routing decoys', () => {
  for (const vector of fixture.rejected_wire_vectors) {
    const raw = vector.raw_utf8_hex ? Buffer.from(vector.raw_utf8_hex, 'hex') : vector.raw_json;
    assert.throws(() => canonicalizeInquiry(parseBoundedJSON(raw)), InquiryValidationError, vector.id);
  }
  assert.throws(() => parseBoundedJSON('{"x":1,"\\u0078":2}'), /malformed_request/);
  assert.throws(() => parseBoundedJSON('{"x":1e999}'), /malformed_request/);
});
test('raw byte limit is inclusive and independent of normalized field size', () => {
  for (const vector of fixture.wire_size_vectors) {
    const raw = vector.raw_body_recipe.literal_utf8_prefix + ' '.repeat(vector.raw_body_recipe.append_ascii_space_count);
    assert.equal(Buffer.byteLength(raw), vector.expected.utf8_byte_length);
    if (vector.expected.result === 'reject') assert.throws(() => parseBoundedJSON(raw), /payload_too_large/);
    else assert.deepEqual(canonicalizeInquiry(parseBoundedJSON(raw)).semantic, fixture.accepted_semantic_vectors[0].expected.semantic);
  }
});
test('typed replay metadata is not subject to first-acceptance age/honeypot policy', () => {
  for (const vector of fixture.replay_semantic_vectors.slice(0, 2)) {
    const canonical = canonicalizeInquiry(vector.input);
    assert.deepEqual(canonical.semantic, fixture.accepted_semantic_vectors[0].expected.semantic);
    assert.throws(() => validateNewSubmission(canonical, Date.parse(fixture.fixture_context.now_utc)), /submission_rejected/);
  }
  const canonical = canonicalizeInquiry(fixture.accepted_semantic_vectors[0].input);
  assert.doesNotThrow(() => validateNewSubmission(canonical, canonical.startedAt + 2000));
  assert.doesNotThrow(() => validateNewSubmission(canonical, canonical.startedAt + 86400000));
});
test('public configuration defaults to disabled email mode and rejects private or malformed decoys', () => {
  assert.deepEqual(readInquiryConfig(), {endpoint: null, form_id: null, mode: 'email', schema_version: 1});
  assert.deepEqual(validateInquiryConfig(api), api);
  for (const value of [null, [], {...api, recipient: 'PRIVATE-DECOY'}, {...api, form_id: {private: 'PRIVATE-DECOY'}}, {...api, schema_version: '1'}, {...api, mode: 'other'}, {...api, endpoint: null}, {...api, mode: 'email'}, {...api, endpoint: 'https://user:secret@example.com/public/v1/inquiries'}, {...api, endpoint: api.endpoint + '?value=PRIVATE-DECOY'}, {...api, endpoint: api.endpoint + '#value'}, {...api, endpoint: 'http://example.com/public/v1/inquiries'}, {...api, endpoint: 'https://example.com/wrong'}, {...api, endpoint: 'http://127.0.0.1:8000/public/v1/inquiries'}]) {
    assert.throws(() => validateInquiryConfig(value), error => error.message === 'invalid_inquiry_configuration');
  }
  assert.doesNotThrow(() => validateInquiryConfig({...api, endpoint: 'http://127.0.0.1:8000/public/v1/inquiries'}, {allowLoopback: true}));
  assert.throws(() => validateInquiryConfig({...api, endpoint: 'http://127.0.0.2:8000/public/v1/inquiries'}, {allowLoopback: true}));
});
test('receipt truth requires exact HTTP status, shape, UUID type and bounded notification enum', () => {
  for (const status of [200, 201]) for (const notification_status of ['queued', 'accepted', 'attention_required', 'simulated']) assert.equal(validatePublicResponse(status, {...receipt, notification_status}).kind, 'receipt');
  for (const value of [{...receipt, provider_id: 'PRIVATE-DECOY'}, {...receipt, receipt_id: [receipt.receipt_id]}, {...receipt, notification_status: 'delivered'}, {...receipt, status: 'ok'}, {status: 'received'}, null]) assert.equal(validatePublicResponse(201, value).kind, 'unconfirmed');
  assert.equal(validatePublicResponse(202, receipt).kind, 'unconfirmed');
  assert.equal(validatePublicResponse(500, receipt).kind, 'unconfirmed');
});
test('errors reject wrong status/code pairs, unknown fields and echoed inputs', () => {
  const valid = {error: {code: 'validation_failed', fields: {email: 'invalid'}}};
  assert.equal(validatePublicResponse(422, valid).kind, 'error');
  for (const value of [{error: {...valid.error, input: 'PRIVATE-DECOY'}}, {error: {code: ['validation_failed'], fields: {}}}, {error: {code: 'validation_failed', fields: {provider: 'invalid'}}}, {error: {code: 'validation_failed', fields: {email: 'RAW-DECOY'}}}, {error: {code: 'unexpected', fields: {}}}]) assert.equal(validatePublicResponse(422, value).kind, 'unconfirmed');
  assert.equal(validatePublicResponse(200, valid).kind, 'unconfirmed');
});
test('static form starts disabled with independent module, safe native semantics and fixed email links', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const form = html.match(/<form\b[^>]*id="brief-form"[^>]*>[\s\S]*?<\/form>/)[0];
  assert.match(form, /method="post"/);
  assert.match(form, /<fieldset id="brief-fields"[^>]*disabled>/);
  assert.match(form, /id="copy-brief" disabled/);
  assert.match(form, /id="send-inquiry" disabled hidden/);
  assert.doesNotMatch(form, /type="submit"/);
  assert.match(form, /role="status"[^>]*aria-live="polite"/);
  assert.match(form, /href="mailto:nick@modernapexstrategies\.com"/);
  assert.match(html, /<script type="module" src="\.\/inquiry\.js"><\/script>/);
  assert.doesNotMatch(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), /briefData|copy-brief|brief-form/);
  const shipped = JSON.parse(fs.readFileSync(new URL('../config/public-files.json', import.meta.url)));
  assert.equal(shipped.length, 46);
  for (const name of ['inquiry.js', 'config/public-inquiry.json', 'privacy/index.html']) assert.ok(shipped.includes(name));
  assert.ok(!shipped.some(name => /^(tests|tools)\//.test(name)));
});
