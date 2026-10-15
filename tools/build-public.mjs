import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildPublic(root = ROOT, output = path.join(root, '_site')) {
  root = fs.realpathSync(root);
  const files = JSON.parse(fs.readFileSync(path.join(root, 'config/public-files.json'), 'utf8'));
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) throw Error('Invalid public file allowlist');
  const inputs = files.map(name => {
    if (typeof name !== 'string' || name.includes('\\') || name.startsWith('/') || name.split('/').some(p => p === '..' || p === '.' || !p)) throw Error('Unsafe public file path');
    if (name !== '.nojekyll' && (name.split('/').some(p => p.startsWith('.')) || !/\.(html|css|js|json|xml|txt|png|svg|woff2|csv|pdf)$/.test(name))) throw Error('Unapproved public file type');
    const source = path.join(root, name);
    if (!fs.lstatSync(source).isFile() || fs.realpathSync(source) !== source) throw Error('Public file must be a regular file without symlinks');
    return {name, source};
  });
  if (fs.existsSync(output)) throw Error('Refusing to overwrite an existing build; choose a fresh output directory');
  fs.mkdirSync(output, {recursive:true});
  for (const {name, source} of inputs) {
    const target = path.join(output, name);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prepared ${buildPublic().length} explicitly approved public files.`);
}
