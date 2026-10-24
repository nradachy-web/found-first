// Validate the shipped content graph without fetching any remote resources.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://befoundfirst.ai/';
const decode = text => text.replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
  .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const plain = text => decode(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export function validatePublicContent(root = ROOT) {
  const files = JSON.parse(fs.readFileSync(path.join(root, 'config/public-files.json'), 'utf8'));
  const allowed = new Set(files);
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  const errors = [];
  const markup = new Map(htmlFiles.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const ids = new Map();
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(htmlFiles.filter(file => /^learn\/[^/]+\/index.html$/.test(file)).length === 16, 'Expected all 16 field notes.');
  for (const [file, source] of markup) {
    const pageIds = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    check(new Set(pageIds).size === pageIds.length, `${file}: duplicate id`);
    ids.set(file, new Set(pageIds));
  }
  let links = 0, schemas = 0, faqs = 0;
  for (const [file, source] of markup) {
    const pageUrl = new URL(file === 'index.html' ? '' : file.replace(/index.html$/, ''), BASE);
    const canonical = source.match(/<link rel="canonical" href="([^"]+)"/);
    check(canonical?.[1] === pageUrl.href, `${file}: canonical must use the public domain`);
    check(!/nradachy-web\.github\.io\/found-first/.test(source), `${file}: stale project-domain reference`);
    check(!/\uFFFD|shown only to adults|as of September 2026|Three consecutive 30-day/.test(source), `${file}: stale or malformed content`);
    for (const match of source.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const reference = decode(match[1]);
      if (/^(?:mailto:|tel:|data:)/.test(reference)) continue;
      const url = new URL(reference, pageUrl);
      if (url.origin !== new URL(BASE).origin) continue;
      let target = decodeURIComponent(url.pathname.slice(1));
      if (!target || target.endsWith('/')) target += 'index.html';
      check(allowed.has(target), `${file}: missing published target ${target}`);
      if (url.hash && ids.has(target)) check(ids.get(target).has(decodeURIComponent(url.hash.slice(1))), `${file}: missing anchor ${target}${url.hash}`);
      links++;
    }
    for (const match of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let document;
      try { document = JSON.parse(match[1]); } catch { errors.push(`${file}: invalid JSON-LD`); continue; }
      schemas++;
      for (const item of document['@graph'] || [document]) {
        if (item['@type'] !== 'FAQPage') continue;
        const visible = new Map([...source.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
          .map(row => [plain(row[1].replace(/<span[^>]*>[\s\S]*?<\/span>/g, '')), plain(row[2])]));
        check(visible.size === item.mainEntity.length, `${file}: FAQ count differs from visible content`);
        for (const question of item.mainEntity) {
          check(visible.get(question.name) === plain(question.acceptedAnswer.text), `${file}: FAQ answer differs from visible content: ${question.name}`);
          faqs++;
        }
      }
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  return {html_pages: htmlFiles.length, field_notes: 16, local_references: links, json_ld_blocks: schemas, visible_faq_answers: faqs};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(validatePublicContent())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
