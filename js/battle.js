// Battle/quiz engine. Owns all game state and decision logic (deck build,
// scoring, steal, miracle, sudden death, RS snapshot). All rendering is done
// through the injected `ui` adapter and all sound through `audio`, so the engine
// is headless-testable: createBattle({ rng }) makes every random draw injectable
// for deterministic simulation.

import {
  BASE,
  DEFAULT_LENGTH,
  SOLO_FINALS,
  BATTLE_FINALS,
  FINAL_MULT,
  CHANCE_MULT,
  MIN_DECK_FOR_FINALS,
  SOLO_CHANCE_MIN,
  SOLO_CHANCE_DIVISOR,
  REQUEUE_OFFSET,
  STREAK_BONUS_EVERY,
  STREAK_BONUS,
  ITEM_BOX_EVERY,
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
  STEAL_CATCHUP_GAP,
  STEAL_CATCHUP_BONUS,
  STEAL_MIRACLE_FAIL_X,
  MIRACLE_MIN_GAP,
  MIRACLE_BONUS,
  HANDICAP_PER_LOSS,
  HANDICAP_MAX,
  ITEM_DROP_IMMUNE_GAP,
  TIMER_HANDICAP_MS,
  TIMER_THUNDER_MS,
  XP_CORRECT,
  XP_SD_CORRECT,
  XP_STEAL,
  XP_MIRACLE_BONUS,
  XP_ITEM_USE,
  POSNAME,
} from './balance.js';
import { shuffle, filterByCat } from './srs.js';
import { ITEMS, MUSH_BONUS, GREEN_DAMAGE, RED_DAMAGE, pickItem } from './items.js';

const PNAME = ['こども', 'おうち'];

export function createBattle({ rng = Math.random, ui, audio, srs, words }) {
  // --- game state ---
  const s = {
    sel: { player: 'child', cat: 'w', mode: 'normal', handi: 'off', len: '16' },
    deck: [],
    qi: 0,
    turn: 0,
    scores: [0, 0],
    streaks: [0, 0],
    missed: new Map(),
    answered: false,
    isBattle: false,
    requeued: new Set(),
    stealing: false,
    stealWins: [0, 0],
    handicap: false,
    timerId: null,
    miracle: [false, false],
    miracleActive: false,
    miraclePts: 0,
    stealX: 1,
    sdRound: 0,
    RS: [0, 0], // start-of-round score gap snapshot (fair catch-up judging)
    xpGain: [0, 0],
    corr: [0, 0],
    advStart: [0, 0],
    lastShown: [0, 0],
    items: [null, null],
    trap: [null, null],
    buffDash: [false, false],
    buffStar: [false, false],
    qTrap: null,
    rolling: [false, false],
    lastItem: [null, null],
    floorItem: null,
  };

  const controller = {
    s,
    PNAME,
    start,
    prepareAndRender,
    answer,
    handleWrong,
    handleSteal,
    passSteal,
    useItem,
    useMiracle,
    rollItem,
    advance,
    next,
    startSudden,
    finish,
    quit,
    speak,
    curPlayer,
    startTimer,
    stopTimer,
  };

  function curPlayer() {
    return s.isBattle ? (s.turn === 0 ? 'child' : 'parent') : s.sel.player;
  }

  function start(sel) {
    s.sel = sel;
    s.isBattle = sel.player === 'battle';
    let pool = filterByCat(words, sel.cat);
    const basePl = s.isBattle ? 'child' : sel.player;
    if (sel.mode === 'weak') {
      pool = pool.filter((it) => {
        const r = srs.rec(basePl, it[0]);
        return r && r.b <= 1;
      });
      if (pool.length < 4) {
        return { error: '「にがて」の単語がまだ足りません。まずは「ふつう」モードで遊んでね!' };
      }
    }
    const LEN = parseInt(sel.len) || DEFAULT_LENGTH;
    const n = Math.min(LEN, pool.length);
    if (s.isBattle) {
      const half = Math.ceil(n / 2);
      const c = srs.pickWeighted(pool, 'child', half, rng);
      const rest = pool.filter((x) => !c.includes(x));
      const p = srs.pickWeighted(rest.length >= half ? rest : pool, 'parent', Math.floor(n / 2), rng);
      s.deck = [];
      const cs = shuffle(c, rng);
      const ps = shuffle(p, rng);
      for (let i = 0; i < half; i++) {
        if (cs[i]) s.deck.push({ it: cs[i], re: false });
        if (ps[i]) s.deck.push({ it: ps[i], re: false });
      }
    } else {
      s.deck = shuffle(srs.pickWeighted(pool, basePl, n, rng), rng).map((it) => ({ it, re: false }));
    }
    s.deck.forEach((q) => (q.m = 1));
    const finals = s.isBattle ? BATTLE_FINALS : SOLO_FINALS;
    if (s.deck.length >= MIN_DECK_FOR_FINALS) {
      for (let i = 1; i <= finals; i++) s.deck[s.deck.length - i].m = FINAL_MULT; // last = final chance x3
      const cand = shuffle([...Array(s.deck.length - finals).keys()].filter((i) => i > 0), rng);
      // solo: fixed chance questions; battle: rolled per-question in prepareAndRender
      if (!s.isBattle) {
        cand
          .slice(0, Math.max(SOLO_CHANCE_MIN, Math.round(s.deck.length / SOLO_CHANCE_DIVISOR)))
          .forEach((i) => (s.deck[i].m = CHANCE_MULT));
      }
    }
    s.handicap = s.isBattle && sel.handi === 'on';
    // reset all runtime state
    s.qi = 0;
    s.turn = 0;
    s.scores = [0, 0];
    s.streaks = [0, 0];
    s.missed = new Map();
    s.requeued = new Set();
    s.stealing = false;
    s.stealWins = [0, 0];
    s.miracle = [false, false];
    s.miracleActive = false;
    s.stealX = 1;
    s.sdRound = 0;
    s.RS = [0, 0];
    s.xpGain = [0, 0];
    s.corr = [0, 0];
    s.lastShown = [0, 0];
    s.items = [null, null];
    s.trap = [null, null];
    s.buffDash = [false, false];
    s.buffStar = [false, false];
    s.qTrap = null;
    s.rolling = [false, false];
    s.lastItem = [null, null];
    s.floorItem = null;
    s.advStart = [0, 0];
    if (s.isBattle) {
      // losing-streak handicap: the side on a losing streak starts ahead
      const M = srs.meta();
      s.advStart = [
        Math.min((M.ls.child || 0) * HANDICAP_PER_LOSS, HANDICAP_MAX),
        Math.min((M.ls.parent || 0) * HANDICAP_PER_LOSS, HANDICAP_MAX),
      ];
      s.scores = [s.advStart[0], s.advStart[1]];
    }
    ui.gotoQuiz();
    audio.sfx?.('start');
    ui.renderScorebar(controller);
    prepareAndRender();
    if (s.isBattle && (s.advStart[0] || s.advStart[1])) {
      const i = s.advStart[0] ? 0 : 1;
      ui.setFb(`🤝 まけこしハンデ: ${PNAME[i]}チームは +${s.advStart[i]}点スタート!`, 'ok');
    }
    return { ok: true };
  }

  function prepareAndRender() {
    s.answered = false;
    s.stealing = false;
    stopTimer();
    ui.hideSteal();
    const q = s.deck[s.qi];
    const it = q.it;
    const isJ = it[2] === 'j';

    const r0 = srs.rec(curPlayer(), it[0]);
    const dotsFilled = r0 ? r0.b : 0;

    if (s.isBattle && s.turn === 0) {
      // freeze the real-skill (handicap-excluded) score at the top of the round
      s.RS = [s.scores[0] - s.advStart[0], s.scores[1] - s.advStart[1]];
    }
    if (s.isBattle && !q.sd && !q.re && q.m === 1) {
      // losing side draws chance questions more often
      const gap = s.RS[1 - s.turn] - s.RS[s.turn];
      if (gap >= DYN_GAP_LARGE) {
        const r = rng();
        q.m = r < DYN_LARGE_X3_P ? 3 : r < DYN_LARGE_X2_P ? 2 : 1;
      } else if (gap >= DYN_GAP_SMALL) {
        q.m = rng() < DYN_SMALL_X2_P ? 2 : 1;
      } else {
        q.m = rng() < DYN_NORMAL_X2_P ? 2 : 1;
      }
      if (q.m > 1) audio.sfx?.('mult');
    }
    const m = q.m || 1;

    // trap consumption (banana / thunder / ink) applied at the start of the turn
    s.qTrap = null;
    let fb = null;
    if (s.isBattle && !q.sd && s.trap[s.turn]) {
      s.qTrap = s.trap[s.turn];
      s.trap[s.turn] = null;
      if (s.qTrap === 'banana') fb = { text: '🍌 バナナをふんでしまった! この問題の得点は半分…', cls: 'ng' };
      if (s.qTrap === 'thunder') fb = { text: '⚡ サンダー攻撃をうけた! この問題は5秒制限!', cls: 'ng' };
      if (s.qTrap === 'ink') fb = { text: '🦑 ゲッソーのスミで選択肢がよく見えない…!', cls: 'ng' };
    }

    // build answer options (exclude synonyms that share a meaning token)
    const tok = (t) =>
      t
        .replace(/[(（][^)）]*[)）]/g, '')
        .split('・')
        .map((x) => x.trim())
        .filter(Boolean);
    const ansTok = new Set(tok(it[1]));
    const wrongPool = words.filter(
      (x) =>
        x[0] !== it[0] &&
        (isJ ? x[2] === 'j' : x[2] === it[2]) &&
        x[1] !== it[1] &&
        !tok(x[1]).some((t) => ansTok.has(t)),
    );
    const opts = shuffle([it[1], ...shuffle(wrongPool, rng).slice(0, 3).map((x) => x[1])], rng);

    s.miracleActive = false;
    s.stealX = 1;

    let miracle = null;
    if (
      s.isBattle &&
      !q.sd &&
      !s.miracle[s.turn] &&
      s.RS[1 - s.turn] - s.RS[s.turn] >= MIRACLE_MIN_GAP &&
      s.scores[1 - s.turn] > s.scores[s.turn]
    ) {
      const gap = s.scores[1 - s.turn] - s.scores[s.turn];
      const sp = BASE * (q.m || 1) * 2;
      miracle = { shownBonus: gap + MIRACLE_BONUS, penalty: sp };
    }

    const view = {
      it,
      badgeText: q.sd ? '🔥 サドンデス' : q.re ? 'もう一回チャレンジ!' : POSNAME[it[2]],
      badgeRe: !!(q.re || q.sd),
      countText: `第${s.qi + 1}問 / ${s.deck.length}問${s.isBattle ? ' ・ ' + PNAME[s.turn] + 'の番' : ''}`,
      word: it[0],
      wordSmall: it[0].length > 13,
      posText: isJ ? 'この熟語の意味は?' : 'この単語の意味は?',
      dotsFilled,
      mult: m,
      sdmode: !!q.sd,
      fb,
      opts,
      ink: s.qTrap === 'ink',
      miracle,
    };
    ui.renderQuestion(controller, view);

    audio.speak(it[0]);
    if (s.qTrap === 'thunder') startTimer(TIMER_THUNDER_MS);
    else if (s.handicap && curPlayer() === 'parent') startTimer();
    ui.renderItembar(controller);
  }

  function answer(btn, opt, it) {
    if (s.stealing) {
      handleSteal(btn, opt, it);
      return;
    }
    if (s.answered) return;
    s.answered = true;
    stopTimer();
    ui.hideMiracle();
    if (opt === it[1]) {
      ui.revealAnswer(it);
      const pl = curPlayer();
      const si = s.isBattle ? s.turn : 0;
      const m = s.deck[s.qi].m || 1;
      s.streaks[si]++;
      let picked = null;
      if (s.isBattle && !s.deck[s.qi].sd && s.floorItem && !s.items[si]) {
        picked = s.floorItem;
        s.items[si] = s.floorItem;
        s.floorItem = null;
      }
      const gotBox =
        s.isBattle &&
        !s.deck[s.qi].sd &&
        s.streaks[si] > 0 &&
        s.streaks[si] % ITEM_BOX_EVERY === 0 &&
        !s.items[si] &&
        !s.rolling[si];
      let pts;
      let msg;
      if (s.miracleActive) {
        pts = s.miraclePts;
        msg = `🌟 ミラクル成功!! +${pts}点で大ぎゃくてん!`;
        if (s.qTrap === 'banana') {
          pts = Math.ceil(pts / 2);
          msg += ' …だが🍌バナナで半分!';
        }
      } else {
        pts = BASE * m;
        msg = `正解! +${pts}点` + (m > 1 ? `(${m}倍!)` : '');
        if (s.isBattle && !s.deck[s.qi].sd) {
          // catch-up bonus (losing side only)
          const gap = s.RS[1 - s.turn] - s.RS[s.turn];
          if (gap >= CATCHUP_GAP_LARGE) {
            pts += CATCHUP_BONUS_LARGE;
            msg += ' & おいつきボーナス +20点!🔥';
          } else if (gap >= CATCHUP_GAP_SMALL) {
            pts += CATCHUP_BONUS_SMALL;
            msg += ' & おいつきボーナス +10点!';
          }
        }
        if (!s.deck[s.qi].sd && s.streaks[si] % STREAK_BONUS_EVERY === 0) {
          pts += STREAK_BONUS;
          msg += ' & 3連続ボーナス +10点!🎉';
          audio.sfx?.('coin');
        }
        if (s.isBattle && s.buffDash[si]) {
          pts += MUSH_BONUS;
          msg += ' & 🍄ダッシュ +15点!';
          s.buffDash[si] = false;
        }
        if (s.isBattle && s.buffStar[si]) {
          pts *= 2;
          msg += ' & 🌟スターで2倍!';
          s.buffStar[si] = false;
        }
        if (s.qTrap === 'banana') {
          pts = Math.ceil(pts / 2);
          msg += ' …🍌バナナで半分!';
        }
      }
      if (picked) msg += ` & 落ちていた${ITEMS[picked].ic}${ITEMS[picked].nm}を拾った!`;
      if (gotBox) msg += ' 🎁アイテムボックスGET!';
      s.scores[si] += pts;
      s.corr[si]++;
      s.xpGain[si] += (s.deck[s.qi].sd ? XP_SD_CORRECT : XP_CORRECT) + (s.miracleActive ? XP_MIRACLE_BONUS : 0);
      const r = srs.rec(pl, it[0]);
      srs.setRec(pl, it[0], (r ? r.b : 0) + 1);
      ui.setFb(msg, 'ok');
      audio.sfx?.(s.miracleActive ? 'miracle_ok' : 'correct');
      if (gotBox) rollItem(si);
      advance();
    } else {
      handleWrong(btn, it, 'ざんねん!');
    }
  }

  function handleWrong(btn, it, prefix) {
    s.answered = true;
    stopTimer();
    ui.hideMiracle();
    audio.sfx?.(s.miracleActive ? 'miracle_ng' : 'wrong');
    const pl = curPlayer();
    const si = s.isBattle ? s.turn : 0;
    s.streaks[si] = 0;
    if (btn) ui.markWrong(btn);
    srs.setRec(pl, it[0], 0);
    if (!s.missed.has(it[0])) s.missed.set(it[0], it);
    if (!s.deck[s.qi].sd && !s.requeued.has(it[0])) {
      // re-show a bit later for retention
      s.requeued.add(it[0]);
      const pos = Math.min(s.qi + REQUEUE_OFFSET, s.deck.length);
      s.deck.splice(pos, 0, { it, re: true, m: 1 });
    }
    const starred = s.isBattle && s.buffStar[s.turn];
    if (s.isBattle) {
      s.buffStar[s.turn] = false;
      s.buffDash[s.turn] = false;
    }
    // behind side (real-skill gap >= 20) is exempt from dropping its item
    const behind = s.isBattle && s.RS[1 - s.turn] - s.RS[s.turn] >= ITEM_DROP_IMMUNE_GAP;
    if (s.isBattle && !s.deck[s.qi].sd && !starred && !behind && s.items[s.turn]) {
      s.floorItem = s.items[s.turn];
      s.items[s.turn] = null;
      prefix += ` 💦${ITEMS[s.floorItem].ic}を落とした!`;
    }
    const opLeading = s.isBattle && s.RS[1 - s.turn] > s.RS[s.turn];
    if (s.isBattle && !s.deck[s.qi].sd && (!opLeading || s.stealX > 1) && !starred) {
      s.stealing = true;
      const op = 1 - s.turn;
      ui.enableSteal();
      ui.setFb(prefix, 'ng');
      ui.showStealBox(PNAME[op], passSteal);
      ui.renderScorebar(controller);
    } else {
      ui.revealAnswer(it);
      const note = starred
        ? ' 🌟スターがミスを守った!(スティールなし)'
        : s.isBattle && !s.deck[s.qi].sd
          ? ' (リード中はスティールできないよ)'
          : '';
      ui.setFb(`${prefix} 正解は「${it[1]}」${note}`, 'ng');
      advance();
    }
  }

  function handleSteal(btn, opt, it) {
    s.stealing = false;
    const op = 1 - s.turn;
    const opKey = op === 0 ? 'child' : 'parent';
    const m = s.deck[s.qi].m || 1;
    ui.revealAnswer(it);
    ui.hideSteal();
    if (opt === it[1]) {
      let pts = BASE * m * s.stealX;
      if (s.isBattle && s.RS[s.turn] - s.RS[op] >= STEAL_CATCHUP_GAP) pts += STEAL_CATCHUP_BONUS; // losing stealer +10
      s.scores[op] += pts;
      s.stealWins[op]++;
      s.xpGain[op] += XP_STEAL;
      const r = srs.rec(opKey, it[0]);
      srs.setRec(opKey, it[0], (r ? r.b : 0) + 1);
      ui.setFb(
        `⚡ スティール成功! ${PNAME[op]}チームが +${pts}点よこどり!${s.stealX > 1 ? '(ミラクル失敗ペナルティ!)' : ''}`,
        'ok',
      );
      audio.sfx?.('steal_ok');
    } else {
      if (btn) ui.markNg(btn);
      ui.setFb(`スティール失敗… 正解は「${it[1]}」`, 'ng');
      audio.sfx?.('steal_ng');
    }
    advance();
  }

  function passSteal() {
    if (!s.stealing) return;
    s.stealing = false;
    const it = s.deck[s.qi].it;
    ui.revealAnswer(it);
    ui.hideSteal();
    ui.setFb(`正解は「${it[1]}」`, 'ng');
    advance();
  }

  function rollItem(si) {
    s.rolling[si] = true;
    ui.renderItembar(controller);
    audio.sfx?.('roll');
    const gap = s.RS[1 - si] - s.RS[si]; // further behind -> stronger items
    const pick = pickItem(gap, s.lastItem[si], rng);
    ui.animateItemRoll(si, () => {
      s.rolling[si] = false;
      s.items[si] = pick;
      s.lastItem[si] = pick;
      audio.sfx?.('item_get');
      ui.renderItembar(controller);
    });
  }

  function useItem(i) {
    const sdq = s.deck[s.qi] && s.deck[s.qi].sd;
    if (i !== s.turn || !s.items[i] || s.answered || s.stealing || s.rolling[i] || sdq || s.miracleActive) return;
    const k = s.items[i];
    s.items[i] = null;
    const op = 1 - i;
    if (k === 'mush') {
      s.buffDash[i] = true;
      ui.setFb('🍄 ダッシュキノコ! この問題の正解に +15点!', 'ok');
    } else if (k === 'star') {
      s.buffStar[i] = true;
      ui.setFb('🌟 スター発動! この問題は得点2倍&ミスしても盗まれない!', 'ok');
    } else if (k === 'green') {
      s.scores[op] = Math.max(0, s.scores[op] - GREEN_DAMAGE);
      const b = s.streaks[op] > 0;
      s.streaks[op] = 0;
      ui.setFb(`🐢 ミドリこうらが命中! ${PNAME[op]}チーム -10点${b ? ' & 連続記録ストップ' : ''}!`, 'ok');
    } else if (k === 'red') {
      s.scores[op] = Math.max(0, s.scores[op] - RED_DAMAGE);
      const b = s.streaks[op] > 0;
      s.streaks[op] = 0;
      ui.setFb(`🎯 アカこうらが命中!! ${PNAME[op]}チーム -25点${b ? ' & 連続記録ストップ' : ''}!`, 'ok');
    } else if (k === 'banana') {
      s.trap[op] = 'banana';
      ui.setFb('🍌 バナナを相手の道にしかけた…(相手の次の問題の得点が半分に)', 'ok');
    } else if (k === 'squid') {
      s.trap[op] = 'ink';
      ui.setFb('🦑 ゲッソーを放った! 相手の次の問題はスミまみれ!', 'ok');
    } else if (k === 'thunder') {
      s.trap[op] = 'thunder';
      ui.setFb('⚡ サンダーを相手にしかけた…(相手の次の問題は5秒制限!)', 'ok');
    }
    const itemSfx = { thunder: 'item_thunder', banana: 'item_banana', squid: 'item_ink' };
    audio.sfx?.(itemSfx[k] || 'item_use');
    s.xpGain[i] += XP_ITEM_USE;
    ui.renderScorebar(controller);
  }

  function useMiracle() {
    if (!s.isBattle || s.miracle[s.turn] || s.answered || s.stealing) return;
    s.miracle[s.turn] = true;
    s.miracleActive = true;
    s.miraclePts = s.scores[1 - s.turn] - s.scores[s.turn] + MIRACLE_BONUS;
    s.stealX = STEAL_MIRACLE_FAIL_X;
    ui.hideMiracle();
    audio.sfx?.('miracle_charge');
    ui.setMultMiracle(s.miraclePts);
  }

  function advance() {
    s.miracleActive = false;
    s.stealX = 1;
    ui.renderScorebar(controller);
    if (s.qi < s.deck.length - 1) ui.showNext();
    else if (s.isBattle && s.scores[0] === s.scores[1]) startSudden();
    else finish();
  }

  function next() {
    s.qi++;
    if (s.isBattle) s.turn = 1 - s.turn;
    ui.renderScorebar(controller);
    prepareAndRender();
  }

  function startSudden() {
    s.sdRound++;
    const used = new Set(s.deck.map((q) => q.it[0]));
    const pool = filterByCat(words, s.sel.cat).filter((x) => !used.has(x[0]));
    const rand = () => words[Math.floor(rng() * words.length)];
    const k1 = 1 - s.turn === 0 ? 'child' : 'parent'; // next to answer
    const k2 = s.turn === 0 ? 'child' : 'parent';
    const p1 = srs.pickWeighted(pool, k1, 1, rng)[0] || pool[0] || rand();
    const pool2 = pool.filter((x) => x !== p1);
    const p2 = srs.pickWeighted(pool2, k2, 1, rng)[0] || pool2[0] || rand();
    s.deck.push({ it: p1, re: false, m: 1, sd: true }, { it: p2, re: false, m: 1, sd: true });
    audio.sdSound();
    ui.showSuddenDeath(s.sdRound, () => {
      s.qi++;
      s.turn = 1 - s.turn;
      ui.renderScorebar(controller);
      prepareAndRender();
    });
  }

  function finish() {
    ui.clearSdMode();
    const M = srs.meta();
    const keys = s.isBattle ? ['child', 'parent'] : [s.sel.player];
    const oldLv = keys.map((k) => srs.level(M.xp[k] || 0));
    if (s.isBattle) {
      const wk = s.scores[0] > s.scores[1] ? 'child' : 'parent';
      const lk = wk === 'child' ? 'parent' : 'child';
      M.ls[wk] = 0;
      M.ls[lk] = (M.ls[lk] || 0) + 1;
    }
    keys.forEach((k, i) => {
      M.xp[k] = (M.xp[k] || 0) + s.xpGain[i];
    });
    const newLv = keys.map((k) => srs.level(M.xp[k] || 0));
    srs.save();

    let head;
    if (s.isBattle) {
      const w =
        s.scores[0] > s.scores[1]
          ? 'こどもチームの勝ち!🏆'
          : s.scores[1] > s.scores[0]
            ? 'おうちチームの勝ち!🏆'
            : '引き分け!🤝';
      head = `<div class="t">${w}</div><div class="d">こども ${s.scores[0]}点 / おうち ${s.scores[1]}点</div>`;
      if (s.stealWins[0] || s.stealWins[1])
        head += `<div class="d">⚡ スティール成功: こども${s.stealWins[0]}回 / おうち${s.stealWins[1]}回</div>`;
      if (s.sdRound) head += `<div class="d">🔥 サドンデス${s.sdRound}ラウンドの死闘!</div>`;
      head += `<div class="d">🌱 けいけんち: こども +${s.xpGain[0]}XP / おうち +${s.xpGain[1]}XP</div>`;
      const li = s.scores[0] > s.scores[1] ? 1 : 0;
      const margin = Math.abs(s.scores[0] - s.scores[1]);
      head += `<div class="d" style="margin-top:6px;">${PNAME[li]}チームも${s.corr[li]}問正解で着実にレベルアップ中!${margin <= 20 ? ' あと一歩だった…!!' : ''}</div>`;
    } else {
      head = `<div class="t">おつかれさま!🎉</div><div class="d">スコア ${s.scores[0]}点 / 🌱 +${s.xpGain[0]}XP</div>`;
    }
    keys.forEach((k, i) => {
      if (newLv[i] > oldLv[i])
        head += `<div class="d" style="color:var(--amber-dk);font-weight:700;margin-top:6px;">🎉 ${s.isBattle ? PNAME[i] + 'が' : ''}Lv.${newLv[i]}「${srs.title(newLv[i])}」にレベルアップ!</div>`;
    });

    audio.sfx?.(s.isBattle && s.scores[0] < s.scores[1] ? 'lose' : 'win');
    ui.renderResult(controller, { headHtml: head, missed: [...s.missed.values()] });
  }

  function quit() {
    stopTimer();
    audio.cancel();
    ui.gotoHome();
  }

  function speak() {
    if (s.deck[s.qi]) audio.speak(s.deck[s.qi].it[0]);
  }

  function startTimer(ms) {
    const LIM = ms || TIMER_HANDICAP_MS;
    ui.timerReset();
    const t0 = Date.now();
    let lastTick = null; // last whole-second announced (sfx only; no logic impact)
    s.timerId = setInterval(() => {
      const left = LIM - (Date.now() - t0);
      const pct = Math.max(0, (left / LIM) * 100);
      ui.timerSet(pct);
      if (left > 0 && left <= 3000) {
        const sec = Math.ceil(left / 1000);
        if (sec !== lastTick) {
          lastTick = sec;
          audio.sfx?.('timer_tick');
        }
      }
      if (left <= 0) {
        stopTimer();
        if (!s.answered) handleWrong(null, s.deck[s.qi].it, '⏰ 時間切れ!');
      }
    }, 100);
  }

  function stopTimer() {
    if (s.timerId) {
      clearInterval(s.timerId);
      s.timerId = null;
    }
    ui.timerHide();
  }

  return controller;
}
