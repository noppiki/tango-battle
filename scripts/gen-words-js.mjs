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

const banner =
  '// AUTO-GENERATED from data/words.json by scripts/gen-words-js.mjs. Do not edit by hand.\n' +
  '//\n' +
  '// Entry shape: ["word","意味","pos","grade"], pos in v|n|a|d|c|j, grade in g5|g4|g3|p2.\n' +
  '// grade is a curriculum-aligned estimate (中学英語範囲準拠の推定), not an official\n' +
  '// word list from any certifying body -- each word is graded at the lowest level it\n' +
  '// is commonly taught. See claudedocs/port-report.md for the merge/provenance detail\n' +
  '// (scripts/port-graded-words.mjs, 2026-07-23).\n';
const body = `window.WORDS=${JSON.stringify(words)};\n`;
writeFileSync(jsPath, banner + body);
console.log(`wrote data/words.js (${words.length} entries)`);
