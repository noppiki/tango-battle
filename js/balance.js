// Central balance constants for the word-battle game.
// Source of truth: CLAUDE.md balance table. The item-roll tables and the
// "previous item weight 1/4" factor live in items.js (per CLAUDE.md), and the
// title ladder lives in srs.js; everything else is collected here.

// --- Storage ---
export const PROGRESS_KEY = 'eiken-p2-progress-v1';

// --- Grade levels (g5/g4/g3/p2) ---
export const GRADES = ['g5', 'g4', 'g3', 'p2'];
export const DEFAULT_GRADE = 'p2';
export const GRADE_LABEL = { g5: '5級', g4: '4級', g3: '3級', p2: '準2級' };
export const GRADE_BADGE = { g5: 'G5 LEVEL', g4: 'G4 LEVEL', g3: 'G3 LEVEL', p2: 'Pre-2 LEVEL' };

// --- Part-of-speech display names (v/n/a/d/c/j) ---
export const POSNAME = {
  v: '動詞',
  n: '名詞',
  a: '形容詞',
  d: '副詞',
  c: '接続詞・前置詞',
  j: '熟語',
};

// --- Scoring base ---
export const BASE = 10; // points per correct answer (before multipliers)

// --- Game length / question counts ---
export const LENGTHS = [10, 16, 20];
export const DEFAULT_LENGTH = 16;
export const SOLO_FINALS = 1; // final-chance questions in solo play
export const BATTLE_FINALS = 2; // final-chance questions in battle
export const FINAL_MULT = 3; // final-chance score multiplier
export const CHANCE_MULT = 2; // "chance question" score multiplier
export const MIN_DECK_FOR_FINALS = 5; // deck must have >=5 to assign finals
// Solo fixed chance-question count: max(2, round(deck.length/7))
export const SOLO_CHANCE_MIN = 2;
export const SOLO_CHANCE_DIVISOR = 7;

// --- Requeue (retry a missed word a bit later) ---
export const REQUEUE_OFFSET = 4; // insert +4 positions ahead

// --- Streak bonuses ---
export const STREAK_BONUS_EVERY = 3; // every 3 in a row
export const STREAK_BONUS = 10;
export const ITEM_BOX_EVERY = 2; // item box every 2 in a row (if none held)

// --- Catch-up bonus (based on RS gap, losing side only) ---
export const CATCHUP_GAP_SMALL = 20;
export const CATCHUP_BONUS_SMALL = 10;
export const CATCHUP_GAP_LARGE = 40;
export const CATCHUP_BONUS_LARGE = 20;

// --- Dynamic chance-question lottery (battle, based on RS gap) ---
// gap>=40: r<0.40 -> x3, else r<0.75 -> x2, else x1
export const DYN_GAP_LARGE = 40;
export const DYN_LARGE_X3_P = 0.40;
export const DYN_LARGE_X2_P = 0.75;
// gap>=20: 50% -> x2
export const DYN_GAP_SMALL = 20;
export const DYN_SMALL_X2_P = 0.50;
// otherwise: 12% -> x2
export const DYN_NORMAL_X2_P = 0.12;

// --- Steal ---
export const STEAL_CATCHUP_GAP = 20; // losing stealer (RS gap) gets +10
export const STEAL_CATCHUP_BONUS = 10;
export const STEAL_MIRACLE_FAIL_X = 2; // miracle failure doubles opponent steal

// --- Miracle ---
export const MIRACLE_MIN_GAP = 20; // RS gap needed to offer miracle
export const MIRACLE_BONUS = 20; // success = raw score diff + 20

// --- Losing-streak handicap (start-of-battle head start) ---
export const HANDICAP_PER_LOSS = 15;
export const HANDICAP_MAX = 45;

// --- Item drop immunity: behind side (RS gap >= 20) keeps its item on a miss ---
export const ITEM_DROP_IMMUNE_GAP = 20;

// --- Timers (ms) ---
export const TIMER_HANDICAP_MS = 8000; // "おうち" 8s limit handicap
export const TIMER_THUNDER_MS = 5000; // thunder item

// --- XP ---
export const XP_CORRECT = 10;
export const XP_SD_CORRECT = 20; // sudden-death correct
export const XP_STEAL = 15;
export const XP_MIRACLE_BONUS = 30; // added on top of correct XP
export const XP_ITEM_USE = 5;
export const XP_LEVEL_DIVISOR = 60; // level = 1 + floor(sqrt(xp/60))
