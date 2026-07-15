// Generate data/words.js (window.WORDS fallback) from data/words.json.
// Usage: node scripts/gen-words-js.mjs
// The .js fallback is loaded via a dynamic <script> tag when fetch() of the
// JSON fails (e.g. opening index.html directly over file://).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const jsonPath = resolve(root, 'data/words.json');
const jsPath = resolve(root, 'data/words.js');

const words = JSON.parse(readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(words)) {
  throw new Error('data/words.json is not an array');
}

const banner = '// AUTO-GENERATED from data/words.json by scripts/gen-words-js.mjs. Do not edit by hand.\n';
const body = `window.WORDS=${JSON.stringify(words)};\n`;
writeFileSync(jsPath, banner + body);
console.log(`wrote data/words.js (${words.length} entries)`);
