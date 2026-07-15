// DOM rendering + screen transitions. This is the only module that touches the
// document; the battle engine drives it through the returned adapter. Cosmetic
// randomness (score-pop position, ink placement) uses Math.random directly since
// it never affects game outcomes (the answer invariant: button.textContent holds
// the plain option text; inkify only hides characters visually).

import { POSNAME } from './balance.js';
import { ITEMS } from './items.js';
import { filterByCat } from './srs.js';

const $ = (id) => document.getElementById(id);

// createUI({ srs, words, audio }) -> ui adapter used by the battle engine + main.
export function createUI({ srs, words, audio }) {
  let sel = { player: 'child', cat: 'w', mode: 'normal', handi: 'off', len: '16' };

  // ---------- home screen ----------
  function segInit(id, key) {
    $(id)
      .querySelectorAll('button')
      .forEach((b) => {
        b.onclick = () => {
          $(id)
            .querySelectorAll('button')
            .forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          sel[key] = b.dataset.v;
          renderStats();
        };
      });
  }

  function initHome() {
    segInit('selPlayer', 'player');
    segInit('selCat', 'cat');
    segInit('selMode', 'mode');
    segInit('selHandi', 'handi');
    segInit('selLen', 'len');
  }

  function getSel() {
    return { ...sel };
  }

  function renderStats() {
    const pool = filterByCat(words, sel.cat);
    const players = sel.player === 'battle' ? ['child', 'parent'] : [sel.player];
    const nm = { child: 'こども', parent: 'おうち' };
    let html = '';
    players.forEach((pl) => {
      let m = 0;
      let l = 0;
      let wk = 0;
      let u = 0;
      pool.forEach((it) => {
        const r = srs.rec(pl, it[0]);
        if (!r) u++;
        else if (r.b >= 4) m++;
        else if (r.b >= 2) l++;
        else wk++;
      });
      const pct = Math.round((m / pool.length) * 100);
      const xpv = srs.meta().xp[pl] || 0;
      const lv = srs.level(xpv);
      const need = srs.lvlXp(lv + 1) - xpv;
      html += `<div style="display:flex;justify-content:space-between;align-items:baseline;">
      <b style="font-size:14px;">${nm[pl]} <span style="color:var(--amber-dk);font-size:13px;">Lv.${lv} ${srs.title(lv)}</span></b>
      <span style="font-size:11px;color:var(--sub);">${xpv}XP・次のLvまで${need}</span></div>`;
      if (sel.player === 'battle' && (srs.meta().ls[pl] || 0) > 0)
        html += `<div class="note" style="margin:0;">🤝 まけこしハンデ: 次の対戦は +${Math.min(srs.meta().ls[pl] * 15, 45)}点スタート</div>`;
      html += `<div style="margin-bottom:6px;"><b style="font-size:14px;">進み具合</b>
    <span style="font-size:12px;color:var(--sub);">(${POSNAME[sel.cat] || '全'}${pool.length}語中)</span></div>
    <div class="statgrid">
      <div class="stat"><b style="color:var(--green-dk)">${m}</b><span>マスター</span></div>
      <div class="stat"><b style="color:var(--blue-dk)">${l}</b><span>学習中</span></div>
      <div class="stat"><b style="color:var(--coral-dk)">${wk}</b><span>にがて</span></div>
      <div class="stat"><b>${u}</b><span>これから</span></div>
    </div>
    <div class="pbar"><i style="width:${pct}%"></i></div>
    <div class="note" style="text-align:right;">マスター率 ${pct}%</div>`;
    });
    $('statsCard').innerHTML = html;
    $('handiBlock').style.display = sel.player === 'battle' ? '' : 'none';
    $('homeNote').textContent = srs.memOnly
      ? '※この環境では進み具合を保存できません(遊ぶことはできます)'
      : '進み具合は自動で保存されます。';
  }

  // ---------- screens ----------
  function clearSdMode() {
    document.body.classList.remove('sdmode');
    $('sdfx').classList.add('hidden');
  }
  function gotoQuiz() {
    $('scr-home').classList.add('hidden');
    $('scr-result').classList.add('hidden');
    $('scr-quiz').classList.remove('hidden');
  }
  function gotoResult() {
    $('scr-quiz').classList.add('hidden');
    $('scr-result').classList.remove('hidden');
  }
  function gotoHome() {
    clearSdMode();
    $('scr-quiz').classList.add('hidden');
    $('scr-result').classList.add('hidden');
    $('scr-home').classList.remove('hidden');
    renderStats();
  }

  // ---------- scorebar / items ----------
  function animateScore(B, i, from, to, d) {
    const card = $('pc' + i);
    const num = $('sc' + i);
    if (!card || !num) return;
    // number roll (bigger change -> longer roll)
    const dur = Math.min(900, 320 + Math.abs(d) * 7);
    const t0 = performance.now();
    num.textContent = from;
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      num.textContent = Math.round(from + (to - from) * e);
      if (p < 1 && num.isConnected) requestAnimationFrame(tick);
    })(t0);
    // popup (>=40 is extra large)
    const pop = document.createElement('span');
    pop.className = 'scorepop ' + (d > 0 ? 'plus' : 'minus') + (Math.abs(d) >= 40 ? ' big' : '');
    pop.textContent = (d > 0 ? '+' : '') + d;
    pop.style.right = 10 + Math.random() * 35 + 'px';
    card.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
    // card flash (+) / shake (-)
    card.classList.add(d > 0 ? 'gain' : 'loss');
    // center-screen damage number (always visible regardless of scroll)
    const layer = $('fxlayer');
    const fx = document.createElement('div');
    fx.className = 'fxscore ' + (d > 0 ? 'plus' : 'minus') + (Math.abs(d) >= 40 ? ' big' : '');
    fx.textContent = (B.s.isBattle ? B.PNAME[i] + ' ' : '') + (d > 0 ? '+' : '') + d + '点';
    fx.style.top = 34 + layer.childElementCount * 9 + '%';
    layer.appendChild(fx);
    setTimeout(() => fx.remove(), 1550);
  }

  function renderScorebar(B) {
    const s = B.s;
    const prev = [...s.lastShown];
    if (s.isBattle) {
      // Tug-of-war: the rope boundary sits at the raw-score ratio (cyan grows
      // from the left, magenta from the right). Falls back to 50/50 at 0-0.
      const total = s.scores[0] + s.scores[1];
      const childPct = total > 0 ? (s.scores[0] / total) * 100 : 50;
      const parentPct = 100 - childPct;
      $('scorebar').innerHTML = `
    <div class="tugwrap">
      <div class="tuglabels">
        <div class="pcard ${s.turn === 0 ? 'active' : ''}" id="pc0"><div class="nm">こどもチーム</div>
          <span class="sc" id="sc0">${s.scores[0]}</span> <span class="st">${s.streaks[0] >= 2 ? s.streaks[0] + '連続中🔥' : ''}</span></div>
        <div class="pcard ${s.turn === 1 ? 'active' : ''}" id="pc1"><div class="nm">おうちチーム</div>
          <span class="sc" id="sc1">${s.scores[1]}</span> <span class="st">${s.streaks[1] >= 2 ? s.streaks[1] + '連続中🔥' : ''}</span></div>
      </div>
      <div class="tugbar">
        <i class="tug-c" style="width:${childPct}%"></i>
        <i class="tug-p" style="width:${parentPct}%"></i>
        <span class="tug-knot" style="left:${childPct}%"></span>
      </div>
    </div>`;
    } else {
      $('scorebar').innerHTML = `
    <div class="pcard active" id="pc0"><div class="nm">${sel.player === 'child' ? 'こども' : 'おうち'} ─ ひとりで特訓</div>
      <span class="sc" id="sc0">${s.scores[0]}</span> <span class="st">${s.streaks[0] >= 2 ? s.streaks[0] + '連続中🔥' : ''}</span></div>`;
    }
    (s.isBattle ? [0, 1] : [0]).forEach((i) => {
      const d = s.scores[i] - prev[i];
      if (d !== 0) animateScore(B, i, prev[i], s.scores[i], d);
      s.lastShown[i] = s.scores[i];
    });
    renderItembar(B);
  }

  function renderItembar(B) {
    const s = B.s;
    const bar = $('itembar');
    if (!s.isBattle) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const chips = [0, 1].map((i) => {
      const it = s.items[i] ? ITEMS[s.items[i]] : null;
      const sdq = s.deck[s.qi] && s.deck[s.qi].sd;
      const canUse = i === s.turn && it && !s.answered && !s.stealing && !s.rolling[i] && !sdq && !s.miracleActive;
      const buffs = (s.buffDash[i] ? ' 🍄発動中' : '') + (s.buffStar[i] ? ' 🌟発動中' : '');
      return `<div class="ichip ${i === s.turn ? 'on' : ''}" id="ichip${i}">
      <span class="iic">${s.rolling[i] ? '❓' : it ? it.ic : '➖'}</span>
      <span class="ids"><b>${B.PNAME[i]}</b> ${s.rolling[i] ? '🎁 ルーレット中…' : it ? it.nm + '「' + it.ds + '」' : 'アイテムなし'}${buffs}</span>
      ${canUse ? `<button data-use="${i}">つかう!</button>` : ''}
    </div>`;
    });
    const floorChip = s.floorItem
      ? `<div class="ichip" style="flex:0 0 auto;border-style:solid;border-color:var(--blue);background:var(--blue-bg);color:var(--blue-dk);"><span class="iic">${ITEMS[s.floorItem].ic}</span><span class="ids"><b>落ちてる!</b><br>次に正解した人がGET</span></div>`
      : '';
    bar.innerHTML = chips[0] + floorChip + chips[1];
    bar.querySelectorAll('button[data-use]').forEach((btn) => {
      btn.addEventListener('click', () => B.useItem(parseInt(btn.dataset.use)));
    });
  }

  function animateItemRoll(si, done) {
    const icons = Object.values(ITEMS).map((x) => x.ic);
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const el = $('ichip' + si);
      if (el) el.querySelector('.iic').textContent = icons[n % icons.length];
    }, 90);
    setTimeout(() => {
      clearInterval(iv);
      done();
    }, 1200);
  }

  // ---------- question ----------
  function inkify(t) {
    const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const n = t.length;
    if (n <= 2) return `<span class="ink">${esc}</span>`;
    const cover = Math.max(2, Math.round(n * 0.45));
    const start = 1 + Math.floor(Math.random() * Math.max(1, n - cover - 1));
    return esc.slice(0, start) + '<span class="ink">' + esc.slice(start, start + cover) + '</span>' + esc.slice(start + cover);
  }

  function setMult(m) {
    $('qmult').innerHTML =
      m === 3
        ? '<span class="multbadge final">🔥 ファイナルチャンス 得点3倍!</span>'
        : m === 2
          ? '<span class="multbadge">⭐ チャンス問題 得点2倍!</span>'
          : '';
  }
  function setMultMiracle(pts) {
    $('qmult').innerHTML = `<span class="multbadge final">🌟 ミラクル発動中! 正解で +${pts}点!</span>`;
  }

  function setFb(text, cls) {
    $('fb').textContent = text;
    $('fb').className = 'fb' + (cls ? ' ' + cls : '');
  }
  function clearFb() {
    $('fb').textContent = '';
    $('fb').className = 'fb';
  }

  function showNext() {
    $('btnNext').classList.remove('hidden');
  }
  function hideNext() {
    $('btnNext').classList.add('hidden');
  }

  function showMiracle(data, onActivate) {
    const box = $('miraclebox');
    box.classList.remove('hidden');
    box.innerHTML = `🌟 <b>ミラクルチャンス</b>が使えるよ!(1試合1回)<br>
    <span class="mnote">正解なら +${data.shownBonus}点 で大ぎゃくてん! はずすと相手のスティールが2倍(${data.penalty}点)…</span><br>
    <button>🌟 発動する!</button>`;
    box.querySelector('button').addEventListener('click', onActivate);
  }
  function hideMiracle() {
    $('miraclebox').classList.add('hidden');
  }

  function renderQuestion(B, view) {
    $('qbadge').textContent = view.badgeText;
    $('qbadge').className = 'badge' + (view.badgeRe ? ' re' : '');
    $('qcount').textContent = view.countText;
    $('qword').textContent = view.word;
    $('qword').className = 'word' + (view.wordSmall ? ' small' : '');
    $('qpos').textContent = view.posText;
    $('qdots').innerHTML = [0, 1, 2, 3, 4].map((i) => `<i class="${i < view.dotsFilled ? 'f' : ''}"></i>`).join('');
    setMult(view.mult);
    document.body.classList.toggle('sdmode', view.sdmode);
    if (view.fb) setFb(view.fb.text, view.fb.cls);
    else clearFb();
    hideNext();
    const box = $('choices');
    box.innerHTML = '';
    box.classList.remove('deink');
    view.opts.forEach((opt) => {
      const b = document.createElement('button');
      if (view.ink) b.innerHTML = inkify(opt);
      else b.textContent = opt;
      b.onclick = () => B.answer(b, opt, view.it);
      box.appendChild(b);
    });
    hideMiracle();
    if (view.miracle) showMiracle(view.miracle, () => B.useMiracle());
  }

  // ---------- answer feedback ----------
  function revealAnswer(it) {
    $('choices').classList.add('deink'); // ink fades out as the answer is revealed
    [...$('choices').children].forEach((b) => {
      b.disabled = true;
      b.classList.remove('stealable');
      if (b.textContent === it[1]) b.classList.add('ok');
    });
  }
  function markWrong(btn) {
    btn.classList.add('ng');
    btn.disabled = true;
  }
  function markNg(btn) {
    btn.classList.add('ng');
  }

  // ---------- steal ----------
  function enableSteal() {
    [...$('choices').children].forEach((b) => {
      if (!b.classList.contains('ng')) {
        b.disabled = false;
        b.classList.add('stealable');
      }
    });
  }
  function showStealBox(opName, onPass) {
    const box = $('stealbox');
    box.classList.remove('hidden');
    box.innerHTML = `⚡ スティールチャンス! ${opName}チーム、正解をうばえ!<br><button>パスする</button>`;
    box.querySelector('button').addEventListener('click', onPass);
  }
  function hideSteal() {
    $('stealbox').classList.add('hidden');
  }

  // ---------- timer ----------
  function timerReset() {
    $('timerwrap').classList.remove('hidden');
    const bar = $('timerbar');
    bar.style.width = '100%';
    bar.className = '';
  }
  function timerSet(pct) {
    const bar = $('timerbar');
    bar.style.width = pct + '%';
    if (pct < 30) bar.classList.add('low');
  }
  function timerHide() {
    $('timerwrap').classList.add('hidden');
  }

  // ---------- sudden death ----------
  function showSuddenDeath(round, done) {
    $('sdroundlbl').textContent = 'ROUND ' + round;
    $('sdfx').classList.remove('hidden');
    setTimeout(() => {
      $('sdfx').classList.add('hidden');
      done();
    }, 2700);
  }

  // ---------- result ----------
  function renderResult(B, view) {
    $('resultBox').innerHTML = view.headHtml;
    let html = '';
    if (view.missed.length) {
      html += `<b style="font-size:15px;">📖 今日まちがえた単語(${view.missed.length}語)</b>
    <div class="note" style="margin:2px 0 6px;">次に遊ぶとき、この単語が優先して出てきます。声に出して読んでみよう。</div>`;
      view.missed.forEach((it) => {
        html += `<div class="rvrow"><b>${it[0]}</b><span>${it[1]}</span><button class="sbtn" data-speak="${encodeURIComponent(it[0])}">🔊</button></div>`;
      });
    } else {
      html += `<div style="text-align:center;color:var(--green-dk);font-weight:700;">⭐ 全問正解! 復習する単語はありません</div>`;
    }
    $('reviewBox').innerHTML = html;
    $('reviewBox')
      .querySelectorAll('button[data-speak]')
      .forEach((btn) => {
        btn.addEventListener('click', () => audio.speak(decodeURIComponent(btn.dataset.speak)));
      });
    gotoResult();
  }

  return {
    initHome,
    getSel,
    renderStats,
    clearSdMode,
    gotoQuiz,
    gotoResult,
    gotoHome,
    renderScorebar,
    renderItembar,
    animateItemRoll,
    renderQuestion,
    setMult,
    setMultMiracle,
    setFb,
    clearFb,
    showNext,
    hideNext,
    showMiracle,
    hideMiracle,
    revealAnswer,
    markWrong,
    markNg,
    enableSteal,
    showStealBox,
    hideSteal,
    timerReset,
    timerSet,
    timerHide,
    showSuddenDeath,
    renderResult,
  };
}
