// Spaced-repetition (Leitner box) engine + progress store + XP/level/title.
// Progress shape (backward compatible): { child:{word:{b,t,w}}, parent:{...},
// _m:{ ls:{child,parent}, xp:{child,parent} } }.

import { XP_LEVEL_DIVISOR } from './balance.js';

const DAY = 86400000;
const SAVE_DEBOUNCE_MS = 400;

// Title ladder: [minLevel, name] in descending order.
const TITLES = [
  [20, 'でんせつの単語王'],
  [15, 'えいごの達人'],
  [11, 'たんごマスター'],
  [8, 'フレーズ使い'],
  [5, 'ワードハンター'],
  [3, 'ことばコレクター'],
  [1, 'たんご見習い'],
];

export function level(xp) {
  return 1 + Math.floor(Math.sqrt(xp / XP_LEVEL_DIVISOR));
}
export function lvlXp(l) {
  return XP_LEVEL_DIVISOR * (l - 1) * (l - 1);
}
export function title(l) {
  for (const [t, n] of TITLES) if (l >= t) return n;
  return 'たんご見習い';
}

// Fisher-Yates shuffle with an injectable RNG.
export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Filter the word list by the selected category ("w" words, "j" idioms, else all).
export function filterByCat(words, cat) {
  if (cat === 'w') return words.filter((x) => x[2] !== 'j');
  if (cat === 'j') return words.filter((x) => x[2] === 'j');
  return words;
}

// Grade field index on 4-tuples; legacy entries without grade default to p2.
function wordGrade(it) {
  return it[3] || 'p2';
}

export function filterByGrade(words, grade) {
  return words.filter((x) => wordGrade(x) === grade);
}

// Session word pool: grade first, then category. At non-p2 grades, 熟語 (pos=j) are
// excluded even when cat is "all" (ぜんぶ = 単語 only below 準2級).
export function buildWordPool(words, cat, grade) {
  let pool = filterByGrade(words, grade);
  if (cat === 'w') return pool.filter((x) => x[2] !== 'j');
  if (cat === 'j') return pool.filter((x) => x[2] === 'j');
  if (grade !== 'p2') return pool.filter((x) => x[2] !== 'j');
  return pool;
}

// createSrs(storage) -> progress-bound engine instance.
export function createSrs(storage) {
  let progress = { child: {}, parent: {} };
  let memOnly = false;
  let saveTimer = null;

  async function load() {
    try {
      const raw = await storage.get();
      if (raw) progress = JSON.parse(raw);
    } catch (e) {
      // key not yet created or storage unavailable
    }
    memOnly = !storage.persistent;
  }

  function save() {
    if (memOnly) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await storage.set(JSON.stringify(progress));
      } catch (e) {
        // best-effort persistence
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function meta() {
    if (!progress._m) progress._m = { ls: { child: 0, parent: 0 }, xp: { child: 0, parent: 0 } };
    if (!progress._m.ls) progress._m.ls = { child: 0, parent: 0 };
    if (!progress._m.xp) progress._m.xp = { child: 0, parent: 0 };
    return progress._m;
  }

  function rec(pl, key) {
    return progress[pl][key] || null;
  }

  function setRec(pl, key, b) {
    const r = progress[pl][key] || { b: 0, t: 0, w: 0 };
    if (b < r.b && r.b > 0) r.w = (r.w || 0) + 1;
    r.b = Math.max(0, Math.min(5, b));
    r.t = Date.now();
    progress[pl][key] = r;
    save();
  }

  function weight(pl, item) {
    const r = rec(pl, item[0]);
    if (!r) return 5; // unseen words first
    const age = Date.now() - r.t;
    if (r.b <= 1) return 6; // weakest first
    if (r.b <= 3) return age > DAY ? 4 : 1; // learning: re-show after a day
    return age > 3 * DAY ? 2 : 0.3; // mastered: occasional review
  }

  function pickWeighted(pool, pl, n, rng = Math.random) {
    const scored = pool.map((it) => ({ it, s: weight(pl, it) * (0.5 + rng()) }));
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, n).map((x) => x.it);
  }

  return {
    load,
    save,
    meta,
    rec,
    setRec,
    weight,
    pickWeighted,
    level,
    lvlXp,
    title,
    get progress() {
      return progress;
    },
    get memOnly() {
      return memOnly;
    },
  };
}
