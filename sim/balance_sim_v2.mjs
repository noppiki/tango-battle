// Monte Carlo balance regression check (post-refactor), wired to the real
// balance constants in js/balance.js instead of duplicated magic numbers.
//
// Scope note: this keeps sim/balance_sim.js's original simplified 10-question
// accuracy model (a fixed-accuracy coin flip per question, not a full
// createBattle() playthrough). js/battle.js's engine also carries items,
// requeue and open-ended sudden death, none of which were part of the model
// the 34% / 46-48% targets below were calibrated against; driving the full
// engine here would risk reporting "regressions" that are really just the
// item/steal system changing outcomes, not a parity/RS bug. Connecting to
// js/battle.js's core scoring/RS/steal/miracle functions directly isn't
// possible without exporting them (they're private closures inside
// createBattle), so this v2 intentionally limits its "connection to the new
// modules" to the balance constants, which is where the tunable numbers -
// and the risk of silent drift - actually live.
//
// Usage: node sim/balance_sim_v2.mjs

import {
  BASE,
  CATCHUP_GAP_SMALL,
  CATCHUP_BONUS_SMALL,
  CATCHUP_GAP_LARGE,
  CATCHUP_BONUS_LARGE,
  DYN_GAP_LARGE,
  DYN_LARGE_X3_P,
  DYN_LARGE_X2_P,
  DYN_GAP_SMALL,
  DYN_SMALL_X2_P,
  DYN_NORMAL_X2_P,
  MIRACLE_MIN_GAP,
  MIRACLE_BONUS,
  STEAL_CATCHUP_GAP,
  STEAL_CATCHUP_BONUS,
  STEAL_MIRACLE_FAIL_X,
  HANDICAP_PER_LOSS,
  HANDICAP_MAX,
  BATTLE_FINALS,
} from '../js/balance.js';

const SIM_QUESTIONS = 10; // shortened match length, kept from the original sim (speed, not the real DEFAULT_LENGTH)
const SIM_GAMES = 30000;

function makeLCG(seed) {
  let state = seed >>> 0;
  return function lcg() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function playGame(rng, acc0, acc1, adv0, adv1) {
  let sc = [adv0, adv1];
  const mir = [false, false];
  const acc = [acc0, acc1];
  const adv = [adv0, adv1];
  let RS = [0, 0];

  for (let q = 0; q < SIM_QUESTIONS; q++) {
    const t = q % 2;
    const o = 1 - t;
    if (t === 0) RS = [sc[0] - adv[0], sc[1] - adv[1]]; // frozen at the top of the round, handicap excluded
    const gap = RS[o] - RS[t];

    let m = q >= SIM_QUESTIONS - BATTLE_FINALS ? 3 : 1;
    if (m === 1) {
      if (gap >= DYN_GAP_LARGE) {
        const r = rng();
        m = r < DYN_LARGE_X3_P ? 3 : r < DYN_LARGE_X2_P ? 2 : 1;
      } else if (gap >= DYN_GAP_SMALL) {
        m = rng() < DYN_SMALL_X2_P ? 2 : 1;
      } else {
        m = rng() < DYN_NORMAL_X2_P ? 2 : 1;
      }
    }

    let useMiracle = false;
    if (!mir[t] && gap >= MIRACLE_MIN_GAP && sc[o] > sc[t]) {
      mir[t] = true;
      useMiracle = true;
    }

    if (rng() < acc[t]) {
      if (useMiracle) {
        sc[t] += Math.max(sc[o] - sc[t], 0) + MIRACLE_BONUS;
      } else {
        let pts = BASE * m;
        if (gap >= CATCHUP_GAP_LARGE) pts += CATCHUP_BONUS_LARGE;
        else if (gap >= CATCHUP_GAP_SMALL) pts += CATCHUP_BONUS_SMALL;
        sc[t] += pts;
      }
    } else {
      const opLeading = RS[o] > RS[t];
      if ((!opLeading || useMiracle) && rng() < acc[o]) {
        let stealPts = BASE * m * (useMiracle ? STEAL_MIRACLE_FAIL_X : 1);
        if (RS[t] - RS[o] >= STEAL_CATCHUP_GAP) stealPts += STEAL_CATCHUP_BONUS;
        sc[o] += stealPts;
      }
    }
  }

  if (sc[0] === sc[1]) {
    const p = (acc0 * (1 - acc1)) / (acc0 * (1 - acc1) + acc1 * (1 - acc0)) || 0.5;
    return rng() < p ? 0 : 1;
  }
  return sc[0] > sc[1] ? 0 : 1;
}

function series(rng, acc0, acc1, useHandicap) {
  const ls = [0, 0];
  let wins = 0;
  for (let g = 0; g < SIM_GAMES; g++) {
    const adv = useHandicap
      ? [Math.min(ls[0] * HANDICAP_PER_LOSS, HANDICAP_MAX), Math.min(ls[1] * HANDICAP_PER_LOSS, HANDICAP_MAX)]
      : [0, 0];
    const winner = playGame(rng, acc0, acc1, adv[0], adv[1]);
    if (winner === 0) wins++;
    ls[winner] = 0;
    ls[1 - winner]++;
  }
  return (wins / SIM_GAMES) * 100;
}

const rng = makeLCG(20260715);

const results = [
  { label: '55/85 ハンデあり', acc0: 0.55, acc1: 0.85, handi: true, expect: 34, tolerance: 3 },
  { label: '75/75 ハンデあり(先攻46-48%)', acc0: 0.75, acc1: 0.75, handi: true, expectRange: [46, 48] },
  { label: '80/70 ハンデあり', acc0: 0.8, acc1: 0.7, handi: true, expect: 52, tolerance: 4 },
];

let allPass = true;
for (const r of results) {
  const pct = series(rng, r.acc0, r.acc1, r.handi);
  let ok;
  if (r.expectRange) {
    ok = pct >= r.expectRange[0] - 1 && pct <= r.expectRange[1] + 1;
    console.log(`${r.label}: ${pct.toFixed(1)}% (expect ${r.expectRange[0]}-${r.expectRange[1]}%) -> ${ok ? 'PASS' : 'FAIL'}`);
  } else {
    ok = Math.abs(pct - r.expect) <= r.tolerance;
    console.log(`${r.label}: ${pct.toFixed(1)}% (expect ~${r.expect}% +-${r.tolerance}pt) -> ${ok ? 'PASS' : 'FAIL'}`);
  }
  if (!ok) allPass = false;
}

console.log('');
console.log(allPass ? 'sim: all balance checks within tolerance' : 'sim: one or more balance checks out of tolerance');
if (!allPass) process.exitCode = 1;
