// Battle items: 7 kinds, plus the rubber-band roll table
// (stronger items when further behind) with a 1/4 weight on the previously
// rolled item to avoid repeats. Roll selection is pure and RNG-injectable; the
// roulette animation and state mutation happen in the battle/ui layers.

// Each entry keeps its emoji `ic` as a fallback; `img` is the pixel sprite used
// by the UI. Sprite paths are relative so they work from file://, http, and the
// single-file build (bundle.mjs inlines them to data URIs).
export const ITEMS = {
  mush: { ic: '🍬', img: 'img/items/mush.png', nm: 'パワーグミ', ds: 'この問題の正解 +15点' },
  green: { ic: '🚀', img: 'img/items/green.png', nm: 'ちびロケット', ds: '相手 -10点&連続記録リセット' },
  banana: { ic: '🫠', img: 'img/items/banana.png', nm: 'ぬるぬるスライム', ds: '相手の次の問題の得点を半分に' },
  thunder: { ic: '⚡', img: 'img/items/thunder.png', nm: 'ビリビリ', ds: '相手の次の問題を5秒制限に' },
  red: { ic: '💥', img: 'img/items/red.png', nm: 'でかロケット', ds: '相手 -25点&連続記録リセット' },
  squid: { ic: '⚫', img: 'img/items/squid.png', nm: 'まっくろスミ', ds: '相手の次の問題の選択肢をスミまみれに' },
  star: { ic: '✨', img: 'img/items/star.png', nm: 'キラキラおまもり', ds: 'この問題 得点2倍&ミスしても盗まれない' },
};

// Sprite shown for an empty inventory slot / roulette placeholder.
export const EMPTY_ITEM_IMG = 'img/items/empty.png';

// Item points bonuses baked into scoring (kept here as item data).
export const MUSH_BONUS = 15;
export const GREEN_DAMAGE = 10;
export const RED_DAMAGE = 25;

const TABLE_GAP_HIGH = 40;
const TABLE_GAP_MID = 15;
const LAST_ITEM_WEIGHT_FACTOR = 0.25; // previously rolled item drops to 1/4

// 3-tier roll table keyed by the roller's RS gap (how far behind they are).
function tableFor(gap) {
  if (gap >= TABLE_GAP_HIGH) {
    return [['mush', 8], ['green', 8], ['banana', 12], ['squid', 16], ['thunder', 15], ['red', 20], ['star', 21]];
  }
  if (gap >= TABLE_GAP_MID) {
    return [['mush', 13], ['green', 14], ['banana', 15], ['squid', 17], ['thunder', 15], ['red', 15], ['star', 11]];
  }
  return [['mush', 20], ['green', 20], ['banana', 17], ['squid', 15], ['thunder', 12], ['red', 9], ['star', 4]];
}

// pickItem(gap, lastItem, rng) -> item key. gap = RS[opponent] - RS[roller].
export function pickItem(gap, lastItem, rng = Math.random) {
  const table = tableFor(gap).map(([k, w]) => [
    k,
    k === lastItem ? Math.max(1, Math.ceil(w * LAST_ITEM_WEIGHT_FACTOR)) : w,
  ]);
  const tot = table.reduce((a, b) => a + b[1], 0);
  let r = rng() * tot;
  let pick = table[0][0];
  for (const [k, w] of table) {
    if ((r -= w) < 0) {
      pick = k;
      break;
    }
  }
  return pick;
}
