// Audio adapter: text-to-speech (speechSynthesis) + sudden-death sound (WebAudio).
// All Web Audio / speech APIs are confined here so a Capacitor build can swap in
// a native TTS plugin. AudioContext is created lazily inside sdSound(), i.e. only
// during gameplay after a user gesture (autoplay policy).

export function createAudio() {
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Prime the voice list (some browsers populate it asynchronously).
  if (hasSpeech) window.speechSynthesis.getVoices();

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
    window.speechSynthesis.speak(u);
  }

  function cancel() {
    if (hasSpeech && window.speechSynthesis.cancel) window.speechSynthesis.cancel();
  }

  // Heartbeat "thumps" + a rising tension sweep for the SUDDEN DEATH intro.
  function sdSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const thump = (t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(75, ctx.currentTime + t);
        o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + t + 0.16);
        g.gain.setValueAtTime(0.55, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.26);
        o.connect(g).connect(ctx.destination);
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
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + 1.55);
      o.stop(ctx.currentTime + 2.4);
    } catch (e) {
      // WebAudio unavailable -> silent
    }
  }

  return { speak, cancel, sdSound };
}
