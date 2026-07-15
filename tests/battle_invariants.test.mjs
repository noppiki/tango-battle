// Deterministic scenario tests for js/battle.js invariants documented in
// CLAUDE.md. Run with: node tests/battle_invariants.test.mjs
// No test runner / no dependencies: a tiny assert-based harness below.

import assert from 'node:assert/strict';
import { createBattle } from '../js/battle.js';
import { createSrs } from '../js/srs.js';
import {
  BASE,
  CATCHUP_GAP_SMALL,
  CATCHUP_BONUS_SMALL,
  CATCHUP_GAP_LARGE,
  CATCHUP_BONUS_LARGE,
  DYN_GAP_LARGE,
  DYN_GAP_SMALL,
  STEAL_CATCHUP_GAP,
  STEAL_CATCHUP_BONUS,
  STEAL_MIRACLE_FAIL_X,
  MIRACLE_MIN_GAP,
  MIRACLE_BONUS,
  HANDICAP_PER_LOSS,
  HANDICAP_MAX,
  XP_STEAL,
} from '../js/balance.js';
import {
  makeScriptedRng,
  makeMemStorage,
  makeStubUi,
  makeStubAudio,
  driveBattle,
  meaningTokens,
  WORDS,
} from './helpers.mjs';

// ---------------------------------------------------------------------------
// tiny test harness
// ---------------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`FAIL - ${name}`);
    console.log(`  ${err.stack || err}`);
  }
}

async function freshSrs(initialRaw = null) {
  const storage = makeMemStorage(initialRaw);
  const srs = createSrs(storage);
  await srs.load();
  return { srs, storage };
}

function makeUnitBattle({ words = WORDS, rngQueue = [], fallback = 0.99 } = {}) {
  const ui = makeStubUi();
  const audio = makeStubAudio();
  const rng = makeScriptedRng(rngQueue, fallback);
  return { battle: null, ui, audio, rng, words };
}

async function createUnitBattle(opts) {
  const { ui, audio, rng, words } = makeUnitBattle(opts);
  const { srs } = await freshSrs();
  const battle = createBattle({ rng, ui, audio, srs, words });
  return { battle, ui, audio, srs };
}

// ---------------------------------------------------------------------------
// 1. RS snapshot: frozen at the top of the round, handicap excluded
// ---------------------------------------------------------------------------
await test('RS snapshot excludes handicap and is frozen across a round', async () => {
  const initialRaw = JSON.stringify({
    child: {},
    parent: {},
    _m: { ls: { child: 2, parent: 0 }, xp: { child: 0, parent: 0 } },
  });
  const { srs } = await freshSrs(initialRaw);
  const ui = makeStubUi();
  const audio = makeStubAudio();
  const rng = makeScriptedRng([], 0.99); // never triggers a probabilistic bonus
  const battle = createBattle({ rng, ui, audio, srs, words: WORDS });

  const expectedAdvStart0 = Math.min(2 * HANDICAP_PER_LOSS, HANDICAP_MAX);
  const res = battle.start({ player: 'battle', cat: 'all', mode: 'normal', handi: 'off', len: '8' });
  assert.equal(res.ok, true);
  assert.deepEqual(battle.s.advStart, [expectedAdvStart0, 0]);
  assert.deepEqual(battle.s.scores, [expectedAdvStart0, 0]);
  assert.deepEqual(battle.s.RS, [0, 0], 'RS at round 1 start must exclude the handicap head start');

  // child (turn 0) answers correctly
  let it = battle.s.deck[0].it;
  battle.answer(null, it[1], it);
  assert.equal(ui._nextReady, true);
  ui._nextReady = false;
  battle.next();

  // parent's turn now (turn 1, qi 1): RS must NOT have been recomputed
  assert.equal(battle.s.turn, 1);
  assert.deepEqual(battle.s.RS, [0, 0], 'RS must stay frozen through the rest of the round');
  assert.ok(battle.s.scores[0] > expectedAdvStart0, 'raw score moved even though RS did not');

  // parent answers correctly too
  it = battle.s.deck[1].it;
  battle.answer(null, it[1], it);
  assert.equal(ui._nextReady, true);
  ui._nextReady = false;
  battle.next();

  // next round (turn 0 again): RS recomputed, handicap still excluded
  assert.equal(battle.s.turn, 0);
  const rawGap = battle.s.scores[0] - battle.s.scores[1];
  assert.equal(rawGap, expectedAdvStart0, 'raw score gap should equal exactly the handicap (equal real skill)');
  assert.deepEqual(battle.s.RS, [battle.s.scores[0] - expectedAdvStart0, battle.s.scores[1] - 0]);
  assert.equal(battle.s.RS[0], battle.s.RS[1], 'with equal real performance RS must show no gap despite the handicap');
});

// ---------------------------------------------------------------------------
// 2a. Alternating parity through a normal run + a requeue (+4) insertion
// ---------------------------------------------------------------------------
await test('turn parity holds through normal play and a requeued question', async () => {
  const { srs } = await freshSrs();
  const ui = makeStubUi();
  const audio = makeStubAudio();
  const rng = makeScriptedRng([], 0.99);
  const battle = createBattle({ rng, ui, audio, srs, words: WORDS });
  battle.start({ player: 'battle', cat: 'all', mode: 'normal', handi: 'off', len: '6' });

  let sdMisses = 0;
  await driveBattle(battle, ui, (it, s) => {
    if (s.deck[s.qi].sd) {
      // answer the 2nd sudden-death question wrong (and decline any steal) to
      // guarantee the tie breaks instead of looping forever.
      sdMisses++;
      return sdMisses % 2 === 0 ? { opt: '__WRONG__', steal: null } : { opt: it[1] };
    }
    return { opt: s.qi === 2 ? '__WRONG__' : it[1], steal: s.qi === 2 ? null : undefined };
  });

  assert.ok(ui.questions.length >= 7, 'the missed question must have been requeued (deck grew by 1)');
  for (const q of ui.questions) {
    assert.equal(q.turn, q.qi % 2, `turn/qi parity broke at qi=${q.qi} (turn=${q.turn})`);
  }
});

// ---------------------------------------------------------------------------
// 2b. Alternating parity through sudden death (2-question push)
// ---------------------------------------------------------------------------
await test('turn parity holds through sudden death', async () => {
  const { srs } = await freshSrs();
  const ui = makeStubUi();
  const audio = makeStubAudio();
  const rng = makeScriptedRng([], 0.99); // deterministic -> both sides tie exactly
  const battle = createBattle({ rng, ui, audio, srs, words: WORDS });
  battle.start({ player: 'battle', cat: 'all', mode: 'normal', handi: 'off', len: '4' });
  const originalLen = battle.s.deck.length;

  await driveBattle(battle, ui, (it, s) => {
    if (s.deck[s.qi].sd) {
      const sdIndex = s.qi - originalLen;
      return { opt: sdIndex === 1 ? '__WRONG__' : it[1] }; // break the tie on the 2nd sd question
    }
    return { opt: it[1] };
  });

  assert.ok(ui.questions.some((q) => q.qi >= originalLen), 'sudden death must have been entered');
  for (const q of ui.questions) {
    assert.equal(q.turn, q.qi % 2, `turn/qi parity broke at qi=${q.qi} (turn=${q.turn})`);
  }
});

// ---------------------------------------------------------------------------
// 3. Steal permission and bonus rules
// ---------------------------------------------------------------------------
await test('steal: leading side (RS) is denied a steal chance', async () => {
  const { battle } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1; // parent about to miss
  s.RS = [30, 0]; // child (op=0) leads by 30
  s.scores = [30, 5];
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.handleWrong(null, WORDS[0], 'ざんねん!');
  assert.equal(s.stealing, false, 'the already-leading side must not get a steal chance');
});

await test('steal: trailing side succeeds and gets the +10 catch-up bonus', async () => {
  const { battle } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 0; // child (leading in RS) about to miss
  s.RS = [25, 0]; // child leads by 25; parent (stealer) trails
  s.scores = [25, 0];
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.handleWrong(null, WORDS[0], 'ざんねん!');
  assert.equal(s.stealing, true, 'trailing side must be offered a steal');

  const before = s.scores[1];
  battle.handleSteal(null, WORDS[0][1], WORDS[0]);
  const gained = s.scores[1] - before;
  assert.equal(gained, BASE * 1 + STEAL_CATCHUP_BONUS, 'successful trailing steal must include the +10 bonus');
  assert.equal(s.stealWins[1], 1);
  assert.equal(s.xpGain[1], XP_STEAL);
});

await test('steal: miracle-failure grants a forced steal chance at 2x, bypassing the leader lock', async () => {
  const { battle } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1; // parent used (and is about to fail) a miracle
  s.RS = [30, 0]; // child leads (would normally deny a steal to the child)
  s.scores = [30, 5];
  s.miracle = [false, false];
  s.answered = false;
  s.stealing = false;
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.useMiracle();
  assert.equal(s.stealX, STEAL_MIRACLE_FAIL_X);

  battle.handleWrong(null, WORDS[0], 'ざんねん!');
  assert.equal(s.stealing, true, 'a failed miracle must force a steal chance even for the leading opponent');

  const before = s.scores[0];
  battle.handleSteal(null, WORDS[0][1], WORDS[0]);
  const gained = s.scores[0] - before;
  assert.equal(gained, BASE * 1 * STEAL_MIRACLE_FAIL_X, 'miracle-failure steal must be worth 2x (no catch-up bonus here)');
});

// ---------------------------------------------------------------------------
// 4. Miracle: gating, single-use, payout, failure doubling
// ---------------------------------------------------------------------------
// NOTE: these use turn=1 (parent) deliberately. prepareAndRender() only
// recomputes s.RS from s.scores/s.advStart when s.turn===0 (top-of-round
// snapshot); turn=1 lets a test pin s.RS directly without it being
// overwritten as a side effect of calling prepareAndRender().
await test('miracle: not offered below the RS gap threshold', async () => {
  const { battle, ui } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1;
  s.RS = [MIRACLE_MIN_GAP - 1, 0];
  s.scores = [20, 0];
  s.miracle = [false, false];
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.prepareAndRender();
  const view = ui.questions.at(-1).view;
  assert.equal(view.miracle, null, 'gap below threshold must not offer a miracle');
});

await test('miracle: offered at the threshold with raw-score payout preview', async () => {
  const { battle, ui } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1;
  s.RS = [MIRACLE_MIN_GAP, 0];
  s.scores = [25, 0];
  s.miracle = [false, false];
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.prepareAndRender();
  const view = ui.questions.at(-1).view;
  assert.ok(view.miracle, 'gap at threshold must offer a miracle');
  assert.equal(view.miracle.shownBonus, s.scores[0] - s.scores[1] + MIRACLE_BONUS);
});

await test('miracle: one use per match (already-used side never gets offered again)', async () => {
  const { battle, ui } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1;
  s.RS = [MIRACLE_MIN_GAP + 20, 0];
  s.scores = [45, 0];
  s.miracle = [false, true]; // parent already used its miracle earlier in the match
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;
  battle.prepareAndRender();
  const view = ui.questions.at(-1).view;
  assert.equal(view.miracle, null, 'a side that already used its miracle must not be offered another');
});

await test('miracle: success pays raw score diff + 20, and marks the side as spent', async () => {
  const { battle } = await createUnitBattle();
  const s = battle.s;
  s.isBattle = true;
  s.turn = 1;
  s.RS = [MIRACLE_MIN_GAP, 0];
  s.scores = [25, 0];
  s.miracle = [false, false];
  s.answered = false;
  s.stealing = false;
  s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
  s.qi = 0;

  battle.useMiracle();
  assert.equal(s.miracle[1], true, 'miracle use must be marked immediately on activation');
  const expectedPts = s.scores[0] - s.scores[1] + MIRACLE_BONUS;
  assert.equal(s.miraclePts, expectedPts);

  const before = s.scores[1];
  battle.answer(null, WORDS[0][1], WORDS[0]);
  assert.equal(s.scores[1] - before, expectedPts, 'a successful miracle must pay exactly the previewed amount');
});

// ---------------------------------------------------------------------------
// 5. Catch-up bonus and dynamic chance-multiplier lottery
// ---------------------------------------------------------------------------
await test('catch-up bonus: +10 at a 20pt RS gap, +20 at a 40pt RS gap', async () => {
  for (const [gap, bonus] of [
    [CATCHUP_GAP_SMALL, CATCHUP_BONUS_SMALL],
    [CATCHUP_GAP_LARGE, CATCHUP_BONUS_LARGE],
  ]) {
    const { battle } = await createUnitBattle({ rngQueue: [0.99] }); // keep the dynamic mult at x1
    const s = battle.s;
    s.isBattle = true;
    s.turn = 1; // avoid the turn===0 auto-recompute of s.RS from scores/advStart
    s.RS = [gap, 0];
    s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
    s.qi = 0;
    battle.prepareAndRender();
    assert.equal(s.deck[0].m, 1, 'precondition: multiplier must be x1 for this bonus check');
    const before = s.scores[1];
    battle.answer(null, WORDS[0][1], WORDS[0]);
    assert.equal(s.scores[1] - before, BASE + bonus, `gap=${gap} must award BASE + ${bonus}`);
  }
});

await test('dynamic chance multiplier: gap>=40 lottery (x3 / x2 / x1)', async () => {
  const cases = [
    [0.1, 3],
    [0.5, 2],
    [0.9, 1],
  ];
  for (const [roll, expectedMult] of cases) {
    const { battle } = await createUnitBattle({ rngQueue: [roll] });
    const s = battle.s;
    s.isBattle = true;
    s.turn = 1; // avoid the turn===0 auto-recompute of s.RS from scores/advStart
    s.RS = [DYN_GAP_LARGE, 0];
    s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
    s.qi = 0;
    battle.prepareAndRender();
    assert.equal(s.deck[0].m, expectedMult, `roll=${roll} at gap>=40 should yield x${expectedMult}`);
  }
});

await test('dynamic chance multiplier: 20<=gap<40 lottery (50% x2)', async () => {
  const cases = [
    [0.3, 2],
    [0.9, 1],
  ];
  for (const [roll, expectedMult] of cases) {
    const { battle } = await createUnitBattle({ rngQueue: [roll] });
    const s = battle.s;
    s.isBattle = true;
    s.turn = 1;
    s.RS = [DYN_GAP_SMALL, 0];
    s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
    s.qi = 0;
    battle.prepareAndRender();
    assert.equal(s.deck[0].m, expectedMult, `roll=${roll} at 20<=gap<40 should yield x${expectedMult}`);
  }
});

await test('dynamic chance multiplier: gap<20 lottery (12% x2)', async () => {
  const cases = [
    [0.05, 2],
    [0.9, 1],
  ];
  for (const [roll, expectedMult] of cases) {
    const { battle } = await createUnitBattle({ rngQueue: [roll] });
    const s = battle.s;
    s.isBattle = true;
    s.turn = 1;
    s.RS = [0, 0];
    s.deck = [{ it: WORDS[0], m: 1, re: false, sd: false }];
    s.qi = 0;
    battle.prepareAndRender();
    assert.equal(s.deck[0].m, expectedMult, `roll=${roll} at gap<20 should yield x${expectedMult}`);
  }
});

// ---------------------------------------------------------------------------
// 6. Losing-streak handicap math
// ---------------------------------------------------------------------------
await test('losing-streak handicap: linear per loss, capped, excluded from RS (already covered in test 1)', async () => {
  const initialRaw = JSON.stringify({
    child: {},
    parent: {},
    _m: { ls: { child: 5, parent: 1 }, xp: { child: 0, parent: 0 } }, // 5 losses -> would be 75, capped at 45
  });
  const { srs } = await freshSrs(initialRaw);
  const ui = makeStubUi();
  const audio = makeStubAudio();
  const battle = createBattle({ rng: makeScriptedRng([], 0.99), ui, audio, srs, words: WORDS });
  battle.start({ player: 'battle', cat: 'all', mode: 'normal', handi: 'off', len: '4' });
  assert.deepEqual(battle.s.advStart, [HANDICAP_MAX, 1 * HANDICAP_PER_LOSS]);
});

// ---------------------------------------------------------------------------
// 7. Progress data backward compatibility through the storage stub
// ---------------------------------------------------------------------------
await test('legacy progress schema round-trips through srs + storage stub', async () => {
  const legacy = {
    child: { apple: { b: 3, t: 1690000000000, w: 1 } },
    parent: { run: { b: 2, t: 1690000001000, w: 0 } },
    _m: { ls: { child: 1, parent: 2 }, xp: { child: 120, parent: 80 } },
  };
  const { srs, storage } = await freshSrs(JSON.stringify(legacy));
  assert.deepEqual(srs.rec('child', 'apple'), legacy.child.apple);
  assert.deepEqual(srs.meta(), legacy._m);

  srs.setRec('child', 'apple', 4);
  await new Promise((r) => setTimeout(r, 500)); // let the debounced save() fire

  const saved = JSON.parse(storage._read());
  assert.equal(saved.child.apple.b, 4);
  assert.deepEqual(saved.parent, legacy.parent, 'unrelated fields must survive the save untouched');
  assert.deepEqual(saved._m, legacy._m);
});

await test('missing _m metadata is backfilled with zeroed defaults, not dropped fields', async () => {
  const { srs } = await freshSrs(JSON.stringify({ child: {}, parent: {} }));
  assert.deepEqual(srs.meta(), { ls: { child: 0, parent: 0 }, xp: { child: 0, parent: 0 } });
});

// ---------------------------------------------------------------------------
// 8. Synonym exclusion in wrong-option generation
// ---------------------------------------------------------------------------
await test('wrong options never share a meaning token with the correct answer', async () => {
  for (const word of WORDS) {
    const { battle, ui } = await createUnitBattle({ rngQueue: [], fallback: 0.42 });
    const s = battle.s;
    s.isBattle = false;
    s.deck = [{ it: word, m: 1, re: false, sd: false }];
    s.qi = 0;
    battle.prepareAndRender();
    const view = ui.questions.at(-1).view;
    const correctTokens = new Set(meaningTokens(word[1]));
    assert.ok(view.opts.includes(word[1]), 'the correct meaning must be among the options');
    for (const opt of view.opts) {
      if (opt === word[1]) continue;
      const overlap = meaningTokens(opt).some((t) => correctTokens.has(t));
      assert.equal(overlap, false, `option "${opt}" must not share a meaning token with "${word[1]}" (word: ${word[0]})`);
    }
  }
});

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('');
console.log(`${passed} passed, ${failed} failed (${results.length} total)`);
if (failed > 0) process.exitCode = 1;
