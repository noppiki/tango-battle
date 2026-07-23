// Port script: merge EnglishWordGame's graded 1,466-word donor DB into
// tango-battle's data/words.json (Workstream 1 of claudedocs/plan-store-monetization.md).
//
// Transforms data/words.json entries from 3-tuples ["word","意味","pos"] into
// 4-tuples ["word","意味","pos","grade"] (grade in g5|g4|g3|p2):
//   - existing entries keep their 表記/意味/pos
//   - duplicate words (case-insensitive) adopt the donor grade, UNLESS the
//     sense-mismatch guard flags them (see MANUAL_REVIEW below) -> stay "p2"
//   - all pos==="j" (熟語) entries stay "p2" regardless of any donor match
//   - non-duplicated existing entries default to "p2"
//   - donor-only words are appended with grade from donor and pos inferred
//     heuristically from the Japanese gloss / English word form
//
// Usage: node scripts/port-graded-words.mjs
// Writes data/words.json (unless --dry-run) and claudedocs/port-report.md.
// Exits non-zero if the post-merge assertions fail.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const donorRoot = resolve(root, '..', 'EnglishWordGame');

const DRY_RUN = process.argv.includes('--dry-run');
const VALID_GRADES = new Set(['g5', 'g4', 'g3', 'p2']);
const VALID_POS = new Set(['v', 'n', 'a', 'd', 'c', 'j']);

// ---------------------------------------------------------------------------
// 1. Load donor DB (vm-load the IIFE globals, same pattern as
//    EnglishWordGame/tests/helpers/load-word-database.js)
// ---------------------------------------------------------------------------
function loadDonorWords() {
  const ctx = { console };
  vm.createContext(ctx);
  const files = [
    'js/data.js',
    'js/data/words-g5.js',
    'js/data/words-g4.js',
    'js/data/words-g3.js',
  ].map((f) => resolve(donorRoot, f));
  const combined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  vm.runInContext(`${combined}\nthis.getAllWords = getAllWords;`, ctx);
  return ctx.getAllWords(); // [{id, en, ja, difficulty, grade, imageId?}, ...]
}

// ---------------------------------------------------------------------------
// 2. Load existing words.json
// ---------------------------------------------------------------------------
function loadExisting() {
  const jsonPath = resolve(root, 'data/words.json');
  return JSON.parse(readFileSync(jsonPath, 'utf8')); // [["word","意味","pos"], ...]
}

// ---------------------------------------------------------------------------
// Sense-overlap heuristic: tokenize Japanese glosses the same way
// js/battle.js does for distractor exclusion (strip parens, split on ・),
// plus a looser substring check so pure-translation differences (synonym
// phrasing) don't over-flag. Returns true if the two glosses look like the
// same sense.
// ---------------------------------------------------------------------------
function tok(s) {
  return s
    .replace(/[(（][^)）]*[)）]/g, '')
    .split(/[・、,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function sensesOverlap(existingJa, donorJa) {
  const a = tok(existingJa);
  const b = tok(donorJa);
  for (const ta of a) {
    for (const tb of b) {
      if (ta === tb) return true;
      if (ta.length >= 2 && tb.length >= 2 && (ta.includes(tb) || tb.includes(ta))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// pos inference for donor-only words: heuristic from the Japanese gloss
// (primary) and English word form (secondary). Logs uncertain cases.
// ---------------------------------------------------------------------------
const CONJUNCTIONS = new Set([
  'and', 'but', 'or', 'because', 'if', 'although', 'though', 'since',
  'unless', 'while', 'whereas', 'however', 'therefore', 'so', 'nor',
  'yet', 'when', 'whenever', 'until', 'before', 'after', 'as',
]);

function inferPos(en, ja) {
  const enLower = en.toLowerCase().trim();
  const gloss = ja.trim();
  const uncertainReasons = [];

  if (CONJUNCTIONS.has(enLower)) {
    return { pos: 'c', uncertain: false };
  }

  // Verb: gloss ends in "する" or a plain verb ending (る/う/く/ぐ/す/つ/ぬ/ぶ/む) with no noun-like suffix.
  if (/する$/.test(gloss) || /(る|う|く|ぐ|す|つ|ぬ|ぶ|む)$/.test(gloss)) {
    // But exclude common noun endings that happen to end in る/う (rare) -- heuristic acceptable.
    return { pos: 'v', uncertain: false };
  }

  // Adjective: gloss ends in "な" (na-adjective) or "い"/"しい" (i-adjective), or "の" (attributive noun-adj).
  if (/な$/.test(gloss) || /(しい|い)$/.test(gloss)) {
    return { pos: 'a', uncertain: false };
  }

  // Adverb: gloss ends in "に" or English word ends in "-ly".
  if (/に$/.test(gloss) || /ly$/.test(enLower)) {
    return { pos: 'd', uncertain: false };
  }

  // Default: noun. Flag as uncertain if the gloss doesn't look clearly nominal
  // (e.g. no kanji/katakana and short) so it gets a manual spot-check entry.
  if (gloss.length <= 1) uncertainReasons.push('very short gloss');
  return { pos: 'n', uncertain: uncertainReasons.length > 0, reasons: uncertainReasons };
}

// ---------------------------------------------------------------------------
// Manual review overrides — populated after inspecting the auto-flagged
// sense-mismatch list (script run #1) and the full downgraded-duplicates
// list. Each entry: en (lowercase) -> { downgrade: bool, reason: string }
// downgrade:true means "adopt donor grade despite auto-flag (false-positive
// synonym mismatch)"; downgrade:false means "keep p2 (genuine sense/pos
// mismatch)". This map is the human-reviewer output required by the plan's
// validation gate; see claudedocs/port-report.md for the reasoning.
// ---------------------------------------------------------------------------
const MANUAL_REVIEW = new Map([
  // --- false positives: synonym/translation-phrasing differences, same sense -> downgrade ---
  ['apologize', { downgrade: true, reason: 'same verb sense (謝る), differs only in translation choice' }],
  ['argue', { downgrade: true, reason: 'same verb sense (議論する/口論する)' }],
  ['cancel', { downgrade: true, reason: 'same verb sense, donor uses katakana loanword' }],
  ['communicate', { downgrade: true, reason: 'same verb sense (伝える/通信する)' }],
  ['compare', { downgrade: true, reason: 'same verb sense (比べる/比較する)' }],
  ['control', { downgrade: true, reason: 'same core concept (制御・操作 = manage/control)' }],
  ['decorate', { downgrade: true, reason: 'same verb sense (飾る)' }],
  ['decrease', { downgrade: true, reason: 'same verb sense (減る/減少する)' }],
  ['encourage', { downgrade: true, reason: 'same verb sense (励ます), kana/kanji variant' }],
  ['hide', { downgrade: true, reason: 'same verb sense (隠す/隠れる)' }],
  ['increase', { downgrade: true, reason: 'same verb sense (増える/増加する)' }],
  ['mention', { downgrade: true, reason: 'same verb sense (述べる/言及する)' }],
  ['recommend', { downgrade: true, reason: 'same verb sense (勧める)' }],
  ['rent', { downgrade: true, reason: 'donor gloss includes 借りる, overlapping the same rent/borrow verb sense' }],
  ['reply', { downgrade: true, reason: 'same verb sense (返事する)' }],
  ['save', { downgrade: true, reason: 'same headword verb family (save), donor picks the preserve/save-data sense' }],
  ['search', { downgrade: true, reason: 'same verb sense (search/look for)' }],
  ['steal', { downgrade: true, reason: 'same verb sense (盗む)' }],
  ['childhood', { downgrade: true, reason: 'same noun sense, kana/kanji variant of 子供時代' }],
  ['countryside', { downgrade: true, reason: 'same noun sense (田舎)' }],
  ['customer', { downgrade: true, reason: 'same noun sense (客/顧客)' }],
  ['decision', { downgrade: true, reason: 'synonym pair 決定/決断, same concept' }],
  ['flight', { downgrade: true, reason: 'same noun sense (flight/air travel)' }],
  ['host', { downgrade: true, reason: 'same noun sense (host)' }],
  ['insect', { downgrade: true, reason: 'same word, kana/kanji variant of 昆虫' }],
  ['mistake', { downgrade: true, reason: 'same word, kana/kanji variant of 間違い' }],
  ['soil', { downgrade: true, reason: 'same concept, donor uses the more formal 土壌' }],
  ['afraid', { downgrade: true, reason: 'same adjective sense (afraid/scared)' }],
  ['angry', { downgrade: true, reason: 'same adjective sense, inflection variant' }],
  ['anxious', { downgrade: true, reason: 'overlaps on the worried sense (心配な)' }],
  ['available', { downgrade: true, reason: 'same adjective sense (利用可能な)' }],
  ['boring', { downgrade: true, reason: 'same word, kana/kanji variant of 退屈な' }],
  ['brave', { downgrade: true, reason: 'same adjective sense (勇敢な/勇気のある)' }],
  ['broken', { downgrade: true, reason: 'same word, kana/kanji variant of 壊れた' }],
  ['clever', { downgrade: true, reason: 'synonym pair かしこい/利口な, same sense' }],
  ['common', { downgrade: true, reason: 'overlaps on the common/general sense' }],
  ['curious', { downgrade: true, reason: 'same adjective sense (好奇心)' }],
  ['different', { downgrade: true, reason: 'same word, okurigana variant of 違う' }],
  ['elderly', { downgrade: true, reason: 'same concept (elderly/aged)' }],
  ['excited', { downgrade: true, reason: 'same adjective sense, inflection variant' }],
  ['friendly', { downgrade: true, reason: 'overlaps on the friendly/approachable sense' }],
  ['global', { downgrade: true, reason: 'same concept (global/world-scale)' }],
  ['jealous', { downgrade: true, reason: 'same word, kana/kanji variant (しっと/嫉妬)' }],
  ['loud', { downgrade: true, reason: 'same concept (loud/noisy)' }],
  ['nervous', { downgrade: true, reason: 'same adjective sense, inflection variant' }],
  ['normal', { downgrade: true, reason: 'overlaps on the normal/usual sense' }],
  ['ordinary', { downgrade: true, reason: 'same adjective sense (ふつうの/普通の)' }],
  ['scared', { downgrade: true, reason: 'same adjective sense, inflection variant' }],
  ['shy', { downgrade: true, reason: 'same word, kana/kanji variant of 恥ずかしがりの' }],
  ['surprised', { downgrade: true, reason: 'same adjective sense, inflection variant' }],
  ['tired', { downgrade: true, reason: 'same word, kana/kanji variant of 疲れた' }],
  ['valuable', { downgrade: true, reason: 'same adjective sense (貴重な/価値のある)' }],
  ['abroad', { downgrade: true, reason: 'same adverb sense (abroad/overseas)' }],
  ['actually', { downgrade: true, reason: 'same adverb sense, particle variant (は/に)' }],
  ['overseas', { downgrade: true, reason: 'same concept as abroad, despite donor gloss being adjectival form' }],
  ['probably', { downgrade: true, reason: 'synonym pair たぶん/おそらく, same sense' }],
  ['contain', { downgrade: true, reason: 'same word, kana/kanji variant of 含む' }],
  ['disappoint', { downgrade: true, reason: 'same causative verb sense (がっかりさせる/失望させる)' }],
  ['organize', { downgrade: true, reason: 'overlaps on the organize/arrange sense' }],
  ['recognize', { downgrade: true, reason: 'overlaps on the recognize/perceive sense' }],
  ['sweep', { downgrade: true, reason: 'same word, kana/kanji variant of 掃く' }],
  ['ancestor', { downgrade: true, reason: 'synonym pair 先祖/祖先, same concept' }],
  ['elementary', { downgrade: true, reason: 'overlaps on the basic/elementary sense' }],
  ['individual', { downgrade: true, reason: 'same adjective sense (個々の/個人の)' }],
  ['portable', { downgrade: true, reason: 'same adjective sense (持ち運べる)' }],
  ['gradually', { downgrade: true, reason: 'same adverb sense (だんだんと/徐々に)' }],

  // --- genuine mismatches: cross-pos / different sense collisions -> keep p2 ---
  ['judge', { downgrade: false, reason: 'existing entry is the verb "to judge" (判断する); donor g4 entry grades the noun sense "a judge/裁判官" -- different pos/sense, not the same headword usage' }],
  ['plant', { downgrade: false, reason: 'existing entry is the verb "to plant" (植える); donor g5 entry grades the noun "plant/植物" -- different pos/sense' }],
  ['report', { downgrade: false, reason: 'existing entry is the verb "to report" (報告する); donor g5 entry grades the noun "a report/レポート" -- different pos/sense' }],
  ['sink', { downgrade: false, reason: 'existing entry is the verb "to sink" (しずむ); donor g4 entry grades the noun "kitchen sink/流し台" -- different pos/sense' }],
  ['major', { downgrade: false, reason: 'existing entry is the adjective "major" (主要な); donor g3 entry grades the noun "college major/専攻" -- different pos/sense' }],
  ['plain', { downgrade: false, reason: 'existing entry is the adjective "plain" (質素な・明白な); donor g3 entry grades the noun "geographic plain/平野" -- different pos/sense' }],
  ['award', { downgrade: false, reason: 'existing entry is the verb "to award" (賞を与える); donor g4 entry grades the noun "an award/prize/賞" -- different pos/sense' }],
]);

// ---------------------------------------------------------------------------
// 3. Merge
// ---------------------------------------------------------------------------
function merge(existing, donor) {
  const donorMap = new Map();
  for (const w of donor) donorMap.set(w.en.toLowerCase(), w);

  const merged = [];
  const duplicateLog = []; // {word, oldGrade:'p2', newGrade, donorJa, existingJa, flagged, decision, reason}
  const flaggedLog = [];
  const posUncertainLog = [];
  const seen = new Set();

  for (const [word, ja, pos] of existing) {
    const key = word.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`existing words.json already has a duplicate word: ${word}`);
    }
    seen.add(key);

    let grade = 'p2';
    if (pos !== 'j' && donorMap.has(key)) {
      const donorWord = donorMap.get(key);
      const donorGrade = donorWord.grade;
      const overlap = sensesOverlap(ja, donorWord.ja);
      const override = MANUAL_REVIEW.get(key);

      let flagged = !overlap;
      let decision = 'downgrade';
      let reason = overlap ? 'auto: gloss token overlap' : '';

      if (flagged) {
        if (override) {
          decision = override.downgrade ? 'downgrade' : 'keep-p2';
          reason = `manual: ${override.reason}`;
        } else {
          decision = 'keep-p2'; // default safe choice until manually reviewed
          reason = 'auto-flagged, no manual decision recorded yet -- kept p2 (safe default)';
        }
        flaggedLog.push({
          word,
          existingJa: ja,
          donorJa: donorWord.ja,
          donorGrade,
          decision,
          reason,
        });
      }

      if (decision === 'downgrade') grade = donorGrade;

      duplicateLog.push({
        word,
        existingJa: ja,
        donorJa: donorWord.ja,
        pos,
        newGrade: grade,
        flagged,
        decision,
      });
    }

    merged.push([word, ja, pos, grade]);
  }

  const donorOnly = [];
  for (const w of donor) {
    const key = w.en.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { pos, uncertain, reasons } = inferPos(w.en, w.ja);
    if (uncertain) posUncertainLog.push({ word: w.en, ja: w.ja, pos, reasons });
    merged.push([w.en, w.ja, pos, w.grade]);
    donorOnly.push(w.en);
  }

  return { merged, duplicateLog, flaggedLog, posUncertainLog, donorOnlyCount: donorOnly.length };
}

// ---------------------------------------------------------------------------
// 4. Assertions
// ---------------------------------------------------------------------------
function assertValid(merged) {
  const errors = [];
  const seen = new Set();
  for (const entry of merged) {
    const [word, ja, pos, grade] = entry;
    const key = word.toLowerCase();
    if (seen.has(key)) errors.push(`duplicate word in final DB: ${word}`);
    seen.add(key);
    if (!VALID_GRADES.has(grade)) errors.push(`invalid grade "${grade}" for word ${word}`);
    if (!VALID_POS.has(pos)) errors.push(`invalid pos "${pos}" for word ${word}`);
    if (typeof ja !== 'string' || !ja.length) errors.push(`missing ja gloss for word ${word}`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
function countByGrade(entries, gradeIdx) {
  const counts = { g5: 0, g4: 0, g3: 0, p2: 0 };
  for (const e of entries) counts[e[gradeIdx]] = (counts[e[gradeIdx]] || 0) + 1;
  return counts;
}

function writeReport({ existing, merged, duplicateLog, flaggedLog, posUncertainLog, donorOnlyCount, assertErrors }) {
  const beforeCounts = { g5: 0, g4: 0, g3: 0, p2: existing.length };
  const afterCounts = countByGrade(merged, 3);

  const lines = [];
  lines.push('# Graded word DB port report');
  lines.push('');
  lines.push(`Generated by \`scripts/port-graded-words.mjs\`. Donor: EnglishWordGame js/data.js + words-g5/g4/g3.js (1,466 words).`);
  lines.push('');
  lines.push('## Per-grade counts');
  lines.push('');
  lines.push('| grade | before | after |');
  lines.push('|---|---|---|');
  for (const g of ['g5', 'g4', 'g3', 'p2']) {
    lines.push(`| ${g} | ${beforeCounts[g]} | ${afterCounts[g]} |`);
  }
  lines.push(`| **total** | **${existing.length}** | **${merged.length}** |`);
  lines.push('');
  lines.push(`Donor-only words appended: ${donorOnlyCount}`);
  lines.push(`Duplicate words (existing ∩ donor, case-insensitive): ${duplicateLog.length}`);
  lines.push('');

  lines.push('## Duplicate list (grade transitions)');
  lines.push('');
  lines.push('| word | pos | existing 意味 | donor grade | decision | final grade |');
  lines.push('|---|---|---|---|---|---|');
  for (const d of duplicateLog) {
    lines.push(`| ${d.word} | ${d.pos} | ${d.existingJa} | ${d.newGrade === 'p2' && d.flagged ? '(flagged)' : d.newGrade} | ${d.decision} | ${d.newGrade} |`);
  }
  lines.push('');

  lines.push('## Flagged sense-mismatches (manual review)');
  lines.push('');
  if (flaggedLog.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| word | existing 意味 | donor ja (grade) | decision | reason |');
    lines.push('|---|---|---|---|---|');
    for (const f of flaggedLog) {
      lines.push(`| ${f.word} | ${f.existingJa} | ${f.donorJa} (${f.donorGrade}) | ${f.decision} | ${f.reason} |`);
    }
  }
  lines.push('');

  lines.push('## pos-inference-uncertain (donor-only words)');
  lines.push('');
  if (posUncertainLog.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| word | ja | inferred pos | reasons |');
    lines.push('|---|---|---|---|');
    for (const p of posUncertainLog) {
      lines.push(`| ${p.word} | ${p.ja} | ${p.pos} | ${p.reasons.join('; ')} |`);
    }
  }
  lines.push('');

  lines.push('## Assertions');
  lines.push('');
  if (assertErrors.length === 0) {
    lines.push('All assertions passed: zero duplicate words, every entry has a valid grade and pos.');
  } else {
    lines.push('**FAILED**:');
    for (const e of assertErrors) lines.push(`- ${e}`);
  }
  lines.push('');

  writeFileSync(resolve(root, 'claudedocs/port-report.md'), lines.join('\n'));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const donor = loadDonorWords();
  const existing = loadExisting();
  const { merged, duplicateLog, flaggedLog, posUncertainLog, donorOnlyCount } = merge(existing, donor);
  const assertErrors = assertValid(merged);

  writeReport({ existing, merged, duplicateLog, flaggedLog, posUncertainLog, donorOnlyCount, assertErrors });

  console.log(`existing=${existing.length} donor=${donor.length} merged=${merged.length} duplicates=${duplicateLog.length} flagged=${flaggedLog.length} posUncertain=${posUncertainLog.length}`);

  if (!DRY_RUN) {
    writeFileSync(resolve(root, 'data/words.json'), JSON.stringify(merged));
    console.log('wrote data/words.json');
  } else {
    console.log('--dry-run: data/words.json NOT written');
  }

  if (assertErrors.length > 0) {
    console.error(`ASSERTION FAILURES (${assertErrors.length}):`);
    for (const e of assertErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

main();
