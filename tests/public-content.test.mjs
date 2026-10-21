import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../tools/build-public.mjs';
import {validatePublicContent} from '../tools/validate-public-content.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-content-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/public-files.json')));
  for (const file of ['config/public-files.json', ...files.filter(file => file.endsWith('.html'))]) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive:true});
    fs.copyFileSync(path.join(ROOT, file), path.join(directory, file));
  }
  return directory;
}

test('public links and structured answers cover the complete shipped library', () => {
  const result = validatePublicContent();
  assert.equal(result.field_notes, 16);
  assert.equal(result.html_pages, 19);
  assert.equal(result.visible_faq_answers, 57);
});

test('structured answers that disagree with the visible page are rejected', t => {
  const directory = fixture(t), file = path.join(directory, 'index.html');
  const source = fs.readFileSync(file, 'utf8').replace('"text":"Answer engine optimization', '"text":"Incorrect hidden promise. Answer engine optimization');
  fs.writeFileSync(file, source);
  assert.throws(() => validatePublicContent(directory), /FAQ answer differs/);
});

test('an unpublished internal target and a missing page anchor are rejected', t => {
  const directory = fixture(t), file = path.join(directory, 'index.html');
  fs.appendFileSync(file, '<a href="./private/account.json">Internal</a><a href="./learn/google-ai-overviews/#missing-target">Missing</a>');
  assert.throws(() => validatePublicContent(directory), error => /missing published target/.test(error.message) && /missing anchor/.test(error.message));
});

test('a stale project-domain metadata reference is rejected on the custom-domain site', t => {
  const directory = fixture(t), file = path.join(directory, 'index.html');
  const source = fs.readFileSync(file, 'utf8').replace('content="https://befoundfirst.ai/"', 'content="https://nradachy-web.github.io/found-first/"');
  fs.writeFileSync(file, source);
  assert.throws(() => validatePublicContent(directory), /stale project-domain reference/);
});
