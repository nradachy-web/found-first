import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = path.join(ROOT, 'config', 'offer-manifest.json');

// This public contract is deliberately independent of the private offer catalog.
// A new approved narrative or vocabulary requires an explicit versioned change.
const APPROVED = Object.freeze({
  schema_version: 1,
  offer_version: 'found-first-offer-2026-10-15',
  tracks: Object.freeze(['existing_eligible', 'new_build', 'rebuild']),
  period_semantics: 'Three consecutive 30-day service periods when agreed; renewal requires a new written agreement.',
  existing_site: 'Eligible existing sites can receive ordinary onboarding and in-scope AEO within recurring service. Separate builds or remediation require explicit scope and approval.',
  measurement_labels: Object.freeze(['observed', 'unavailable', 'not configured', 'not applicable'])
});
const FIELDS = Object.keys(APPROVED).sort();

function invalid(reason) {
  // Never include rejected values: the validator may be checking private decoys.
  throw new Error(`Invalid public offer manifest: ${reason}`);
}

export function validateOfferManifest(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    invalid('expected a JSON object');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== FIELDS.length || keys.some(key => !FIELDS.includes(key))) {
    invalid('unexpected or missing fields; only the approved public fields are allowed');
  }
  for (const field of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid('fields must be JSON data');
    const actual = descriptor.value;
    const expected = APPROVED[field];
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length ||
          Reflect.ownKeys(actual).length !== expected.length + 1 ||
          expected.some((item, index) => actual[index] !== item)) {
        invalid(`${field} must contain exactly the approved public values`);
      }
    } else if (actual !== expected) {
      invalid(`${field} does not match the approved public version`);
    }
  }
  return value;
}

export function serializeOfferManifest(value) {
  validateOfferManifest(value);
  return `${JSON.stringify(Object.fromEntries(FIELDS.map(field => [field, value[field]])), null, 2)}\n`;
}

export function parseOfferManifest(source) {
  if (typeof source !== 'string') invalid('expected UTF-8 JSON text');
  let value;
  try { value = JSON.parse(source); }
  catch { invalid('malformed JSON'); }
  validateOfferManifest(value);
  // Canonical bytes also reject duplicate keys containing discarded private data.
  // LF and a final newline are required, making the published bytes reviewable.
  if (source !== serializeOfferManifest(value)) invalid('JSON must use canonical public serialization');
  return value;
}

export function readOfferManifest(file = MANIFEST_PATH) {
  return parseOfferManifest(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = readOfferManifest(process.argv[2] || MANIFEST_PATH);
    console.log(`Validated ${manifest.offer_version} (public schema ${manifest.schema_version}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
