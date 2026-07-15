// Entry point: load the word list, wire the modules together, bind the static
// buttons. Word data is fetched from data/words.json; if fetch fails (e.g. the
// page is opened directly over file://) we fall back to injecting data/words.js
// which sets window.WORDS.

import { PROGRESS_KEY } from './balance.js';
import { createStorage } from './storage.js';
import { createSrs } from './srs.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createBattle } from './battle.js';

const $ = (id) => document.getElementById(id);

async function loadWords() {
  // Single-file dist build injects window.WORDS inline; use it directly.
  if (Array.isArray(window.WORDS) && window.WORDS.length) return window.WORDS;
  try {
    const res = await fetch('data/words.json');
    if (res.ok) {
      const w = await res.json();
      if (Array.isArray(w) && w.length) return w;
    }
  } catch (e) {
    // fetch blocked (file://) or network error -> fall through to script fallback
  }
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'data/words.js';
    sc.onload = () => resolve(window.WORDS || []);
    sc.onerror = () => reject(new Error('word data failed to load'));
    document.head.appendChild(sc);
  });
}

async function main() {
  const words = await loadWords();
  const storage = createStorage(PROGRESS_KEY);
  const srs = createSrs(storage);
  const audio = createAudio();
  const ui = createUI({ srs, words, audio });
  const battle = createBattle({ ui, audio, srs, words });

  ui.initHome();

  function startGame() {
    const r = battle.start(ui.getSel());
    if (r && r.error) alert(r.error);
  }

  $('btnStart').onclick = startGame;
  $('btnSpeak').onclick = () => battle.speak();
  $('btnNext').onclick = () => battle.next();
  $('btnQuit').onclick = () => battle.quit();
  $('btnAgain').onclick = () => {
    $('scr-result').classList.add('hidden');
    startGame();
  };
  $('btnHome').onclick = () => ui.gotoHome();

  await srs.load();
  ui.renderStats();
}

main();
