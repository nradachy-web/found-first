import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPublic, ROOT} from '../tools/build-public.mjs';

test('published artifact contains exactly approved files, never unrelated repository content', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ff-public-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const output=path.join(temp,'site');
  const files=buildPublic(ROOT,output);
  const actual=[];
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else actual.push(path.relative(output,p).replaceAll('\\','/'));}};
  walk(output);
  assert.deepEqual(actual.sort(),[...files].sort());
  for(const privatePath of ['.env','config/offers.json','source-requirements/implementation-brief.md','tests/fixtures/account.json','node_modules/x.js','artifacts/screenshot.png','README.md','.github/workflows/pages.yml']) {
    assert.equal(fs.existsSync(path.join(output,privatePath)),false,privatePath);
  }
  assert.throws(()=>buildPublic(ROOT,output),/overwrite/);
});

test('build fails closed for traversal allowlist entries', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ff-public-invalid-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temp,'config'));
  for(const bad of ['../private.txt','.env','assets/../../private.txt','node_modules/../private.js']) {
    fs.writeFileSync(path.join(temp,'config/public-files.json'),JSON.stringify([bad]));
    assert.throws(()=>buildPublic(temp,path.join(temp,'site')));
    assert.equal(fs.existsSync(path.join(temp,'site')),false);
  }
});

test('real file symlinks and parent-directory junctions cannot enter the artifact', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ff-public-symlinks-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const source=path.join(temp,'source'), privateDir=path.join(temp,'private');
  fs.mkdirSync(path.join(source,'config'),{recursive:true});fs.mkdirSync(privateDir);
  fs.writeFileSync(path.join(privateDir,'account.json'),'SYNTHETIC-PRIVATE');
  fs.symlinkSync(privateDir,path.join(source,'assets'),process.platform==='win32'?'junction':'dir');
  fs.symlinkSync(path.join(privateDir,'account.json'),path.join(source,'account.json'),'file');
  for(const file of ['assets/account.json','account.json']) {
    fs.writeFileSync(path.join(source,'config/public-files.json'),JSON.stringify([file]));
    const output=path.join(temp,'site');
    assert.throws(()=>buildPublic(source,output));
    assert.equal(fs.existsSync(output),false);
  }
});

test('decoy private files are excluded even when present beside public files', t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ff-public-decoys-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temp,'config'));
  fs.writeFileSync(path.join(temp,'config/public-files.json'),JSON.stringify(['index.html']));
  fs.writeFileSync(path.join(temp,'index.html'),'<!doctype html><title>Public</title>');
  const privateFiles=['.env','config/offers.json','source-notes.md','tests/fixtures/account.json','node_modules/x.js','artifacts/proof.png'];
  for(const name of privateFiles){fs.mkdirSync(path.dirname(path.join(temp,name)),{recursive:true});fs.writeFileSync(path.join(temp,name),'PRIVATE-SENTINEL');}
  const output=path.join(temp,'site');buildPublic(temp,output);
  assert.deepEqual(fs.readdirSync(output),['index.html']);
  assert.doesNotMatch(fs.readFileSync(path.join(output,'index.html'),'utf8'),/PRIVATE-SENTINEL/);
});

test('form has a safe default and does not encode contact values into URLs',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'inquiry.js'),'utf8');
  const form=html.match(/<form\b[^>]*id="brief-form"[^>]*>[\s\S]*?<\/form>/)[0];
  assert.match(form,/method="post"/);
  assert.doesNotMatch(form,/type="submit"/);
  assert.match(form,/id="copy-brief" disabled/);
  assert.match(form,/role="status"/);
  assert.doesNotMatch(js,/mailto:.*\?(?:subject|body)/);
  assert.match(js,/addEventListener\('submit', event => event.preventDefault\(\)\)/);
});

test('publication rejects an unsafe runtime endpoint before writing any output',t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ff-public-config-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temp,'config'));
  fs.writeFileSync(path.join(temp,'config/public-files.json'),JSON.stringify(['config/public-inquiry.json']));
  fs.writeFileSync(path.join(temp,'config/public-inquiry.json'),JSON.stringify({schema_version:1,mode:'api',endpoint:'http://127.0.0.1:8010/public/v1/inquiries',form_id:'synthetic'}));
  const output=path.join(temp,'site');
  assert.throws(()=>buildPublic(temp,output),/Invalid public inquiry configuration/);
  assert.equal(fs.existsSync(output),false);
});
