// Entry point: load the word list, wire the modules together, bind the static
// buttons. Word data is fetched from data/words.json; if fetch fails (e.g. the
// page is opened directly over file://) we fall back to injecting data/words.js
// which sets window.WORDS.

import { PROGRESS_KEY, GRADES } from './balance.js';
import { createStorage } from './storage.js';
import { createSrs } from './srs.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createBattle } from './battle.js';

const $ = (id) => document.getElementById(id);

// Persisted UI settings (mute), kept separate from the progress key.
const SETTINGS_KEY = 'eiken-p2-settings-v1';

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
  const settingsStore = createStorage(SETTINGS_KEY);
  const srs = createSrs(storage);
  const audio = createAudio();
  const ui = createUI({
    srs,
    words,
    audio,
    onSettingsChange: (patch) => saveSettings(patch),
  });
  const battle = createBattle({ ui, audio, srs, words });

  ui.initHome();

  async function loadSettings() {
    try {
      const raw = await settingsStore.get();
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  async function saveSettings(patch) {
    const cur = await loadSettings();
    try {
      await settingsStore.set(JSON.stringify({ ...cur, ...patch }));
    } catch (e) {
      // persistence unavailable (memory tier)
    }
  }

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

  // --- mute toggle (persisted to the settings key, separate from progress) ---
  const btnMute = $('btnMute');
  function paintMute() {
    if (!btnMute) return;
    const icon = $('muteIcon');
    if (icon) icon.src = audio.isMuted() ? 'img/ui/spk_off.png' : 'img/ui/spk_on.png';
    btnMute.classList.toggle('muted', audio.isMuted());
    btnMute.setAttribute('aria-pressed', String(audio.isMuted()));
  }
  const settings = await loadSettings();
  if (typeof settings.muted === 'boolean') audio.setMuted(settings.muted);
  if (GRADES.includes(settings.grade)) ui.applyGrade(settings.grade);
  paintMute();
  if (btnMute) {
    btnMute.onclick = async () => {
      audio.setMuted(!audio.isMuted());
      paintMute();
      await saveSettings({ muted: audio.isMuted() });
    };
  }

  await srs.load();
  ui.renderStats();
}

main();
