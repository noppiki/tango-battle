// Shared deterministic test doubles for battle.js scenario tests.
// No external dependencies; plain Node built-ins only.

// Scripted RNG: returns queued values in order, falling back to a fixed
// value once the queue is exhausted. Lets a test pin the exact branch a
// probabilistic roll takes without guessing how many rng() calls precede it.
export function makeScriptedRng(queue = [], fallback = 0.5) {
  let i = 0;
  return () => (i < queue.length ? queue[i++] : fallback);
}

// Simple LCG (Numerical Recipes constants) for statistical simulation runs
// where many draws are needed and only reproducibility (not exact branch
// targeting) matters.
export function makeLCG(seed) {
  let state = seed >>> 0;
  return function lcg() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// In-memory storage adapter matching js/storage.js's { get, set, persistent }
// shape, without touching window/localStorage.
export function makeMemStorage(initialRaw = null, { persistent = true } = {}) {
  let raw = initialRaw;
  return {
    async get() {
      return raw;
    },
    async set(value) {
      raw = value;
    },
    get persistent() {
      return persistent;
    },
    _read() {
      return raw;
    },
  };
}

// Headless UI stub for js/battle.js. Records what would have been rendered
// and exposes hooks (_nextReady / _sdDone / _finished) so a test can drive
// the battle step by step instead of relying on real DOM event handlers.
export function makeStubUi() {
  const ui = {
    questions: [],
    _nextReady: false,
    _sdDone: null,
    _finished: false,
    _resultView: null,
    _lastFb: null,
    gotoQuiz() {},
    gotoHome() {},
    clearSdMode() {},
    renderScorebar() {},
    renderItembar() {},
    animateItemRoll(_si, done) {
      done();
    },
    renderQuestion(B, view) {
      ui.questions.push({ qi: B.s.qi, turn: B.s.turn, view });
    },
    setMultMiracle() {},
    setFb(text, cls) {
      ui._lastFb = { text, cls };
    },
    showNext() {
      ui._nextReady = true;
    },
    hideMiracle() {},
    revealAnswer() {},
    markWrong() {},
    markNg() {},
    enableSteal() {},
    showStealBox(_opName, onPass) {
      ui._stealPass = onPass;
    },
    hideSteal() {},
    timerReset() {},
    timerSet() {},
    timerHide() {},
    showSuddenDeath(round, done) {
      ui._sdDone = done;
    },
    renderResult(_B, view) {
      ui._finished = true;
      ui._resultView = view;
    },
  };
  return ui;
}

export function makeStubAudio() {
  let muted = false;
  return {
    speak() {},
    sdSound() {},
    cancel() {},
    sfx() {},
    setMuted(v) {
      muted = !!v;
    },
    isMuted() {
      return muted;
    },
  };
}

// Drives a battle created with makeStubUi() to completion. `chooser(it, s)`
// is called with the currently-shown item and the live battle state and
// must return { opt, useMiracle?, steal? }. `steal` controls how a triggered
// steal prompt is resolved: undefined = attempt the correct answer,
// null = pass, any other string = attempt that (wrong) answer.
export async function driveBattle(battle, ui, chooser) {
  for (let guard = 0; guard < 10000; guard++) {
    if (ui._finished) return;
    const it = battle.s.deck[battle.s.qi].it;
    const decision = chooser(it, battle.s) || {};
    if (decision.useMiracle) battle.useMiracle();
    battle.answer(null, decision.opt, it);
    if (battle.s.stealing) {
      const stealOpt = 'steal' in decision ? decision.steal : it[1];
      if (stealOpt === null) battle.passSteal();
      else battle.handleSteal(null, stealOpt, it);
    }
    if (ui._finished) return;
    if (ui._sdDone) {
      const d = ui._sdDone;
      ui._sdDone = null;
      d();
      continue;
    }
    if (ui._nextReady) {
      ui._nextReady = false;
      battle.next();
      continue;
    }
    throw new Error('driveBattle: battle state did not advance');
  }
  throw new Error('driveBattle: guard limit reached (possible infinite loop)');
}

// Tokenizer mirroring js/battle.js's synonym-exclusion parsing, kept here
// only as an independent check (not imported from the source under test).
export function meaningTokens(t) {
  return t
    .replace(/[(（][^)）]*[)）]/g, '')
    .split('・')
    .map((x) => x.trim())
    .filter(Boolean);
}

// A modest synthetic word list spanning every pos code (v/n/a/d/c/j) with a
// few deliberate synonym clusters (shared meaning tokens) to exercise the
// wrong-option exclusion logic, plus enough unique filler per pos so
// wrong-option pools are never starved.
export const WORDS = [
  ['ill', '病気の・具合が悪い', 'a'],
  ['sick', '具合が悪い', 'a'],
  ['happy', 'うれしい・幸せな', 'a'],
  ['glad', 'うれしい', 'a'],
  ['big', '大きい', 'a'],
  ['small', '小さい', 'a'],
  ['tall', '背が高い', 'a'],
  ['short', '背が低い', 'a'],
  ['run', '走る', 'v'],
  ['jog', '走る・軽く走る', 'v'],
  ['walk', '歩く', 'v'],
  ['stroll', '歩く・散歩する', 'v'],
  ['eat', '食べる', 'v'],
  ['drink', '飲む', 'v'],
  ['sleep', '眠る', 'v'],
  ['wake', '起きる', 'v'],
  ['cat', 'ねこ', 'n'],
  ['dog', 'いぬ', 'n'],
  ['book', '本', 'n'],
  ['pen', 'ペン', 'n'],
  ['car', '車', 'n'],
  ['bike', '自転車', 'n'],
  ['house', '家', 'n'],
  ['tree', '木', 'n'],
  ['quickly', 'すばやく', 'd'],
  ['slowly', 'ゆっくりと', 'd'],
  ['and', 'そして', 'c'],
  ['but', 'しかし', 'c'],
  ['give up', 'あきらめる', 'j'],
  ['look up to', '尊敬する・あこがれる', 'j'],
  ['respect', '尊敬する', 'j'],
  ['turn on', 'スイッチを入れる', 'j'],
];
