// Audio adapter: text-to-speech (speechSynthesis) + a small WebAudio chiptune
// SFX synth (sfx) and the sudden-death sting (sdSound). All Web Audio / speech
// APIs are confined here so a Capacitor build can swap in native plugins.
//
// A single AudioContext is created lazily on the first sound (i.e. only during
// gameplay, after a user gesture — autoplay policy). Signal chain:
//   oscillator/noise -> per-voice env gain -> bus (TTS ducking) -> master (mute)
// Muting is a master-gain switch; ducking briefly lowers the bus while the TTS
// voice is speaking so effects never fight the word being read aloud.

// Each SFX is a list of steps. A step is a `tone` (oscillator) by default, or a
// `noise` burst (k:'noise'). Fields: type (waveform), f0/f1 (start/optional
// glide-to freq), t (start offset s), d (duration s), g (peak gain),
// filter/cutoff (noise only).
const SFX = {
  tap: [{ f0: 660, d: 0.05, g: 0.13 }],
  correct: [
    { f0: 659, d: 0.08, g: 0.17 },
    { f0: 988, t: 0.075, d: 0.11, g: 0.18 },
  ],
  wrong: [{ type: 'triangle', f0: 196, f1: 150, d: 0.16, g: 0.15 }],
  start: [
    { f0: 523, d: 0.08, g: 0.18 },
    { f0: 659, t: 0.09, d: 0.08, g: 0.18 },
    { f0: 784, t: 0.18, d: 0.12, g: 0.2 },
  ],
  win: [
    { f0: 523, d: 0.1, g: 0.2 },
    { f0: 659, t: 0.11, d: 0.1, g: 0.2 },
    { f0: 784, t: 0.22, d: 0.1, g: 0.2 },
    { f0: 1047, t: 0.33, d: 0.24, g: 0.22 },
  ],
  lose: [
    { type: 'triangle', f0: 392, d: 0.12, g: 0.16 },
    { type: 'triangle', f0: 311, t: 0.12, d: 0.12, g: 0.15 },
    { type: 'triangle', f0: 233, t: 0.24, d: 0.18, g: 0.14 },
  ],
  coin: [
    { f0: 988, d: 0.06, g: 0.17 },
    { f0: 1319, t: 0.06, d: 0.16, g: 0.18 },
  ],
  roll: [{ f0: 880, d: 0.03, g: 0.1 }],
  item_get: [
    { f0: 659, d: 0.06, g: 0.18 },
    { f0: 784, t: 0.06, d: 0.06, g: 0.18 },
    { f0: 1047, t: 0.12, d: 0.14, g: 0.2 },
  ],
  item_thunder: [
    { type: 'sawtooth', f0: 1400, f1: 180, d: 0.18, g: 0.18 },
    { k: 'noise', filter: 'highpass', cutoff: 2000, d: 0.12, g: 0.12 },
  ],
  item_banana: [
    { type: 'sine', f0: 260, f1: 520, d: 0.09, g: 0.2 },
    { type: 'sine', f0: 520, f1: 300, t: 0.09, d: 0.13, g: 0.18 },
  ],
  item_ink: [{ k: 'noise', filter: 'lowpass', cutoff: 700, d: 0.18, g: 0.2 }],
  item_use: [
    { f0: 523, d: 0.05, g: 0.15 },
    { f0: 784, t: 0.05, d: 0.1, g: 0.16 },
  ],
  steal_ok: [
    { f0: 784, d: 0.05, g: 0.18 },
    { f0: 1047, t: 0.05, d: 0.05, g: 0.18 },
    { f0: 1319, t: 0.1, d: 0.12, g: 0.2 },
  ],
  steal_ng: [{ type: 'triangle', f0: 220, f1: 160, d: 0.14, g: 0.15 }],
  miracle_charge: [{ type: 'sawtooth', f0: 200, f1: 900, d: 0.5, g: 0.14 }],
  miracle_ok: [
    { f0: 1047, d: 0.09, g: 0.22 },
    { f0: 1319, t: 0.1, d: 0.09, g: 0.22 },
    { f0: 1568, t: 0.2, d: 0.26, g: 0.24 },
  ],
  miracle_ng: [
    { type: 'triangle', f0: 440, d: 0.12, g: 0.16 },
    { type: 'triangle', f0: 349, t: 0.12, d: 0.12, g: 0.15 },
    { type: 'triangle', f0: 262, t: 0.24, d: 0.2, g: 0.14 },
  ],
  mult: [
    { f0: 880, d: 0.05, g: 0.17 },
    { f0: 1175, t: 0.05, d: 0.14, g: 0.19 },
  ],
  levelup: [
    { f0: 523, d: 0.07, g: 0.2 },
    { f0: 659, t: 0.07, d: 0.07, g: 0.2 },
    { f0: 784, t: 0.14, d: 0.07, g: 0.2 },
    { f0: 1047, t: 0.21, d: 0.22, g: 0.22 },
  ],
  timer_tick: [{ f0: 880, d: 0.04, g: 0.06 }],
};

const DUCK_LEVEL = 0.35; // bus gain while the TTS voice is speaking

export function createAudio() {
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Prime the voice list (some browsers populate it asynchronously).
  if (hasSpeech) window.speechSynthesis.getVoices();

  let ctx = null;
  let bus = null; // ducking node (TTS)
  let master = null; // mute node
  let muted = false;
  const active = new Map(); // sfx name -> live source nodes (single-voice retrigger)

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(master).connect(ctx.destination);
    } catch (e) {
      ctx = null; // WebAudio unavailable -> silent
    }
    return ctx;
  }

  function playTone(spec, when) {
    const t = when + (spec.t || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = spec.type || 'square';
    o.frequency.setValueAtTime(spec.f0, t);
    if (spec.f1 != null) o.frequency.exponentialRampToValueAtTime(spec.f1, t + spec.d);
    const peak = spec.g != null ? spec.g : 0.2;
    const att = Math.min(0.008, spec.d * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.d);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + spec.d + 0.02);
    return o;
  }

  function playNoise(spec, when) {
    const t = when + (spec.t || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * spec.d));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const peak = spec.g != null ? spec.g : 0.15;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.d);
    let head = src;
    if (spec.filter) {
      const f = ctx.createBiquadFilter();
      f.type = spec.filter;
      f.frequency.value = spec.cutoff != null ? spec.cutoff : 1000;
      src.connect(f);
      head = f;
    }
    head.connect(g).connect(bus);
    src.start(t);
    src.stop(t + spec.d + 0.02);
    return src;
  }

  // Play a named effect. Same-name effects are single-voice: a retrigger stops
  // the previous instance so effects never pile up on rapid input.
  function sfx(name) {
    const def = SFX[name];
    if (!def) return;
    if (!ensureCtx()) return;
    const prev = active.get(name);
    if (prev) {
      for (const node of prev) {
        try {
          node.stop();
        } catch (e) {
          // already finished
        }
      }
    }
    const when = ctx.currentTime;
    const nodes = [];
    let total = 0;
    for (const step of def) {
      nodes.push(step.k === 'noise' ? playNoise(step, when) : playTone(step, when));
      total = Math.max(total, (step.t || 0) + step.d);
    }
    active.set(name, nodes);
    setTimeout(() => {
      if (active.get(name) === nodes) active.delete(name);
    }, (total + 0.1) * 1000);
  }

  function setMuted(next) {
    muted = !!next;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  }
  function isMuted() {
    return muted;
  }

  function duck() {
    if (ctx && bus) bus.gain.setTargetAtTime(DUCK_LEVEL, ctx.currentTime, 0.04);
  }
  function unduck() {
    if (ctx && bus) bus.gain.setTargetAtTime(1, ctx.currentTime, 0.12);
  }

  function speak(text) {
    if (!hasSpeech) return;
    window.speechSynthesis.cancel();
    const t = text
      .replace(/-ing/g, '')
      .replace(/ A /g, ' ')
      .replace(/ B\b/g, '')
      .replace(/[~〜]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US';
    u.rate = 0.85;
    const v = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('en'));
    if (v) u.voice = v;
    duck();
    u.onend = unduck;
    u.onerror = unduck;
    window.speechSynthesis.speak(u);
  }

  function cancel() {
    if (hasSpeech && window.speechSynthesis.cancel) window.speechSynthesis.cancel();
    unduck();
  }

  // Heartbeat "thumps" + a rising tension sweep for the SUDDEN DEATH intro.
  // Routed through the shared bus/master so mute applies.
  function sdSound() {
    if (!ensureCtx()) return;
    const thump = (t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(75, ctx.currentTime + t);
      o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + t + 0.16);
      g.gain.setValueAtTime(0.55, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.26);
      o.connect(g).connect(bus);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    };
    thump(0);
    thump(0.32);
    thump(0.85);
    thump(1.17); // ドクン…ドクン…
    const o = ctx.createOscillator();
    const g = ctx.createGain(); // rising tension sweep
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, ctx.currentTime + 1.55);
    o.frequency.exponentialRampToValueAtTime(720, ctx.currentTime + 2.25);
    g.gain.setValueAtTime(0.07, ctx.currentTime + 1.55);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.35);
    o.connect(g).connect(bus);
    o.start(ctx.currentTime + 1.55);
    o.stop(ctx.currentTime + 2.4);
  }

  return { speak, cancel, sdSound, sfx, setMuted, isMuted };
}
