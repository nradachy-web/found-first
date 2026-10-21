import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBoundedJSON, validateInquiryConfig} from '../inquiry.js';

export {validateInquiryConfig};
export const INQUIRY_CONFIG_PATH = fileURLToPath(new URL('../config/public-inquiry.json', import.meta.url));

export function readInquiryConfig(file = INQUIRY_CONFIG_PATH, options = {}) {
  try { return validateInquiryConfig(parseBoundedJSON(fs.readFileSync(file), 4096), options); }
  catch { throw new Error('Invalid public inquiry configuration.'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { readInquiryConfig(); process.stdout.write('Public inquiry configuration valid.\n'); }
  catch { process.stderr.write('Invalid public inquiry configuration.\n'); process.exitCode = 1; }
}
