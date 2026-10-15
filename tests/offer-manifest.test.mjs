import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPublic, ROOT} from '../tools/build-public.mjs';
import {MANIFEST_PATH, parseOfferManifest, readOfferManifest, serializeOfferManifest, validateOfferManifest} from '../tools/validate-offer-manifest.mjs';

function approvedFixture() {
  return {
    schema_version: 1,
    offer_version: 'found-first-offer-2026-10-15',
    tracks: ['existing_eligible', 'new_build', 'rebuild'],
    period_semantics: 'Three consecutive 30-day service periods when agreed; renewal requires a new written agreement.',
    existing_site: 'Eligible existing sites can receive ordinary onboarding and in-scope AEO within recurring service. Separate builds or remediation require explicit scope and approval.',
    measurement_labels: ['observed', 'unavailable', 'not configured', 'not applicable']
  };
}

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-offer-manifest-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('shipped manifest contains the exact approved public contract and canonical bytes', () => {
  assert.deepEqual(readOfferManifest(), approvedFixture());
  assert.equal(fs.readFileSync(MANIFEST_PATH, 'utf8'), serializeOfferManifest(approvedFixture()));
});

test('non-object, missing and unknown fields fail closed without exposing rejected values', () => {
  for (const value of [null, [], 1, true, 'PRIVATE-SENTINEL']) {
    assert.throws(() => validateOfferManifest(value), /Invalid public offer manifest/);
  }
  for (const field of Object.keys(approvedFixture())) {
    const value = approvedFixture();
    delete value[field];
    assert.throws(() => validateOfferManifest(value), /missing fields/);
  }
  for (const field of ['prices', 'fees', 'catalog', 'ads_only', 'recipients', 'accounts', 'credentials', 'source', 'private_terms', '__proto__']) {
    const value = JSON.parse(JSON.stringify(approvedFixture()));
    Object.defineProperty(value, field, {value: 'PRIVATE-SENTINEL', enumerable: true});
    assert.throws(() => validateOfferManifest(value), error => {
      assert.doesNotMatch(error.message, /PRIVATE-SENTINEL/);
      return /unexpected or missing fields/.test(error.message);
    });
  }
});

test('versions and public lists reject type coercion, internal tracks, duplicates and omissions', () => {
  const replacements = {
    schema_version: ['1', 2, null],
    offer_version: ['found-first-offer-draft', 1, null],
    tracks: ['existing_eligible', ['existing_eligible', 'new_build', 'ads_only'], ['existing_eligible', 'new_build'], ['existing_eligible', 'new_build', 'new_build'], ['rebuild', 'new_build', 'existing_eligible']],
    measurement_labels: ['observed', ['observed', 'unavailable', 'not configured', 'zero'], ['observed', 'unavailable', 'not configured'], ['observed', 'observed', 'not configured', 'not applicable']]
  };
  for (const [field, values] of Object.entries(replacements)) {
    for (const replacement of values) {
      const value = approvedFixture();
      value[field] = replacement;
      assert.throws(() => validateOfferManifest(value), /Invalid public offer manifest/);
    }
  }
});

test('private values cannot hide inside permitted narratives or nested list values', () => {
  for (const field of ['period_semantics', 'existing_site']) {
    for (const replacement of [null, 30, {price: 199, recipient: 'fixture@example.test'}, `${approvedFixture()[field]} PRIVATE-SENTINEL: $199, ads_only, account-fixture`]) {
      const value = approvedFixture();
      value[field] = replacement;
      assert.throws(() => validateOfferManifest(value), error => {
        assert.doesNotMatch(error.message, /PRIVATE-SENTINEL|fixture@example|account-fixture/);
        return true;
      });
    }
  }
  const nested = approvedFixture();
  nested.tracks[0] = {name: 'existing_eligible', recipient: 'PRIVATE-SENTINEL'};
  assert.throws(() => validateOfferManifest(nested));
  const extendedArray = approvedFixture();
  extendedArray.tracks.price = 'PRIVATE-SENTINEL';
  assert.throws(() => validateOfferManifest(extendedArray));
});

test('malformed JSON and duplicate-key private content cannot pass the byte contract', () => {
  const valid = serializeOfferManifest(approvedFixture());
  for (const source of ['', '{', valid.slice(0, -3), `${valid}PRIVATE-SENTINEL`, valid.replace('"schema_version": 1,', '"schema_version": 1,,')]) {
    assert.throws(() => parseOfferManifest(source), /malformed JSON/);
  }
  const hiddenPrivate = valid.replace('{', '{\n  "existing_site": "PRIVATE-SENTINEL",');
  assert.deepEqual(JSON.parse(hiddenPrivate), approvedFixture());
  assert.throws(() => parseOfferManifest(hiddenPrivate), /canonical public serialization/);
  for (const source of [valid.replaceAll('\n', '\r\n'), valid.trim(), JSON.stringify(approvedFixture())]) {
    assert.throws(() => parseOfferManifest(source), /canonical public serialization/);
  }
});

test('CLI validates the shipped manifest and rejects private content without printing it', t => {
  const command = path.join(ROOT, 'tools/validate-offer-manifest.mjs');
  const passed = spawnSync(process.execPath, [command], {encoding: 'utf8'});
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Validated found-first-offer-2026-10-15/);
  const file = path.join(temporaryDirectory(t), 'invalid.json');
  fs.writeFileSync(file, '{"PRIVATE-SENTINEL":"fixture@example.test"}');
  const rejected = spawnSync(process.execPath, [command, file], {encoding: 'utf8'});
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Invalid public offer manifest/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /PRIVATE-SENTINEL|fixture@example/);
});

test('actual publication builder rejects private manifest bytes before creating output', t => {
  const source = temporaryDirectory(t);
  fs.mkdirSync(path.join(source, 'config'));
  fs.writeFileSync(path.join(source, 'config/public-files.json'), JSON.stringify(['config/offer-manifest.json']));
  const valid = serializeOfferManifest(approvedFixture());
  const invalid = [
    valid.replace('"schema_version": 1', '"private_recipient": "PRIVATE-SENTINEL", "schema_version": 1'),
    valid.replace('{', '{\n  "existing_site": "PRIVATE-SENTINEL",'),
    valid.replace('Eligible existing sites', 'PRIVATE-SENTINEL existing sites')
  ];
  for (const bytes of invalid) {
    fs.writeFileSync(path.join(source, 'config/offer-manifest.json'), bytes);
    const output = path.join(source, 'site');
    assert.throws(() => buildPublic(source, output), error => {
      assert.doesNotMatch(error.message, /PRIVATE-SENTINEL/);
      return /Invalid public offer manifest/.test(error.message);
    });
    assert.equal(fs.existsSync(output), false);
  }
});

test('42-file artifact preserves exact manifest bytes and every private-data exclusion', t => {
  const temp = temporaryDirectory(t);
  const source = path.join(temp, 'source');
  const output = path.join(temp, 'site');
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/public-files.json'), 'utf8'));
  assert.equal(files.length, 42);
  assert.equal(files.filter(file => file === 'config/offer-manifest.json').length, 1);
  fs.mkdirSync(path.join(source, 'config'), {recursive: true});
  fs.writeFileSync(path.join(source, 'config/public-files.json'), JSON.stringify(files));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
    fs.copyFileSync(path.join(ROOT, file), path.join(source, file));
  }
  const privateFiles = ['.env', 'config/offers.json', 'config/accounts.json', 'source-requirements/implementation-brief.md', 'tests/fixtures/account.json', 'node_modules/x.js', 'artifacts/screenshot.png', 'README.md', '.github/workflows/pages.yml', 'tools/validate-offer-manifest.mjs', 'tests/offer-manifest.test.mjs'];
  for (const file of privateFiles) {
    fs.mkdirSync(path.dirname(path.join(source, file)), {recursive: true});
    fs.writeFileSync(path.join(source, file), 'PRIVATE-ARTIFACT-SENTINEL');
  }
  assert.deepEqual(buildPublic(source, output), files);
  const actual = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else actual.push(path.relative(output, full).replaceAll('\\', '/'));
    }
  };
  walk(output);
  assert.deepEqual(actual.sort(), [...files].sort());
  assert.deepEqual(fs.readFileSync(path.join(output, 'config/offer-manifest.json')), fs.readFileSync(MANIFEST_PATH));
  assert.deepEqual(readOfferManifest(path.join(output, 'config/offer-manifest.json')), approvedFixture());
  for (const file of privateFiles) assert.equal(fs.existsSync(path.join(output, file)), false, file);
  for (const file of actual) assert.equal(fs.readFileSync(path.join(output, file)).includes(Buffer.from('PRIVATE-ARTIFACT-SENTINEL')), false, file);
});
