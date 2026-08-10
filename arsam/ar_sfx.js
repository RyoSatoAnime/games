/**
 * Astral Remnant — shared in-run SFX (sortie / SAM).
 * window.AR_SFX.play(name, opts?)
 */
(function () {
  'use strict';

  const MASTER_GAIN = 0.55;

  const RATE_SEC = {
    enemy_destroy: 0.08,
    orb_pickup: 0.06,
    remnant_pickup: 0.04,
    no_ammo: 0.17,
    seeker_dash: 0.12,
    enemy_shot: 0.08,
  };

  const MONO = new Set(['enemy_destroy', 'orb_pickup']);

  let ctx = null;
  let master = null;
  const monoNodes = Object.create(null);
  const lastPlayAt = Object.create(null);

  function ensureAudio() {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
      }
      return ctx;
    } catch (_e) {
      return null;
    }
  }

  async function prepareAudio() {
    const c = ensureAudio();
    if (!c) return null;
    if (c.state === 'suspended') {
      try {
        await c.resume();
      } catch (_e) { /* no-op */ }
    }
    return c;
  }

  function connectOut(node) {
    node.connect(master);
  }

  function trackMono(voice, node) {
    if (!voice || !node) return;
    let list = monoNodes[voice];
    if (!list) {
      list = [];
      monoNodes[voice] = list;
    }
    list.push(node);
  }

  function stopMono(voice) {
    const list = monoNodes[voice];
    if (!list || !list.length || !ctx) return;
    const t = ctx.currentTime;
    for (const n of list) {
      try {
        n.stop(t + 0.01);
      } catch (_e) { /* already stopped */ }
    }
    list.length = 0;
  }

  function allowRate(name) {
    const min = RATE_SEC[name];
    if (!min || !ctx) return true;

    const now = ctx.currentTime;
    const last = lastPlayAt[name];

    if (typeof last === 'number' && now - last < min) {
      return false;
    }

    lastPlayAt[name] = now;
    return true;
  }

  function blip(freq, dur, gain, type, voice) {
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    connectOut(g);
    if (voice) trackMono(voice, o);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function sweep(from, to, dur, gain, type, voice) {
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(from, t);
    if (from > 0 && to > 0) {
      o.frequency.exponentialRampToValueAtTime(to, t + dur);
    } else {
      o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    connectOut(g);
    if (voice) trackMono(voice, o);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  function noiseHit(dur, gain, filterFreq, filterType, noiseRate, voice) {
    const t = ctx.currentTime + 0.005;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = b.getChannelData(0);

    const nr = Math.max(0, Number(noiseRate) || 0);
    if (nr > 0) {
      const hold = Math.max(1, Math.floor(ctx.sampleRate / nr));
      let v = Math.random() * 2 - 1;
      for (let i = 0; i < len; i++) {
        if ((i % hold) === 0) v = Math.random() * 2 - 1;
        const k = 1 - i / len;
        ch[i] = v * k;
      }
    } else {
      for (let i = 0; i < len; i++) {
        const k = 1 - i / len;
        ch[i] = (Math.random() * 2 - 1) * k;
      }
    }

    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    s.buffer = b;
    f.type = filterType || 'highpass';
    f.frequency.setValueAtTime(filterFreq, t);
    f.Q.setValueAtTime(0.7, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    connectOut(g);
    if (voice) trackMono(voice, s);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function noiseSweepHit({
    attack,
    hold,
    release,
    gain,
    filterType,
    filterFreq,
    filterFreqEnd,
    q,
  }) {
    const totalDur = attack + hold + release;
    const t = ctx.currentTime + 0.005;
    const len = Math.max(1, Math.floor(ctx.sampleRate * totalDur));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }

    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    s.buffer = b;
    f.type = filterType || 'bandpass';
    f.Q.setValueAtTime(q, t);
    f.frequency.setValueAtTime(filterFreq, t);
    f.frequency.exponentialRampToValueAtTime(filterFreqEnd, t + totalDur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + totalDur);
    s.connect(f);
    f.connect(g);
    connectOut(g);
    s.start(t);
    s.stop(t + totalDur + 0.02);
  }

  function arp(freqs, stepDur, gain, type) {
    const base = ctx.currentTime + 0.005;
    freqs.forEach((freq, i) => {
      const t = base + i * stepDur;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 1.15);
      o.connect(g);
      connectOut(g);
      o.start(t);
      o.stop(t + stepDur * 1.5);
    });
  }

  const SFX = {
    launch() {
      noiseSweepHit({
        attack: 0.002,
        hold: 0.6,
        release: 0.1,
        gain: 0.55,
        filterType: 'bandpass',
        filterFreq: 400,
        filterFreqEnd: 2500,
        q: 3,
      });
    },
    shot() {
      sweep(100, 40, 0.8, 0.30, 'sawtooth');
    },
    no_ammo() {
      blip(48, 0.3, 0.4, 'sawtooth');
    },
    enemy_destroy(_opts, voice) {
      noiseHit(1.5, 0.35, 10000, 'lowpass', 1000, voice);
      noiseHit(1.5, 0.30, 2000, 'lowpass', 2000, voice);
    },
    miss() {
      noiseHit(1.9, 0.35, 5000, 'lowpass', 3000);
      sweep(55, 13, 1.9, 0.45, 'sawtooth');
    },
    orb_pickup(_opts, voice) {
          sweep(440, 880, 0.3, 0.45, 'triangle', voice);
    },
    remnant_pickup() {
      sweep(440, 1174.7, 0.55, 0.50, 'triangle');
    },
    seeker_dash() {
      sweep(261.6, 65.4, 0.65, 0.12, 'sawtooth');
    },
    enemy_shot() {
      sweep(180, 60, 0.25, 0.12, 'sawtooth')
    },
    chain_bonus(opts) {
      const level = (opts && opts.level) | 0;
      let freqs;
      let stepDur;
      let gain;
      switch (level) {
        case 20:
          freqs = [587.33, 880, 1174.66, 1760, 2349.3];
          stepDur = 0.05;
          gain = 0.25;
          break;
        case 15:
          freqs = [587.33, 880, 1174.66, 1760];
          stepDur = 0.055;
          gain = 0.25;
          break;
        case 10:
          freqs = [440, 660, 990];
          // 587.33, 880, 1174.66, 1760 //
          stepDur = 0.055;
          gain = 0.25;
          break;
        default:
          freqs = [392, 587.33];
          stepDur = 0.06;
          gain = 0.25;
          break;
      }
      arp(freqs, stepDur, gain, 'square');
    },
  };

  function play(name, opts) {
    const fn = SFX[name];
    if (typeof fn !== 'function') return;

    const o = (opts && typeof opts === 'object') ? opts : {};

    void prepareAudio().then((c) => {
      if (!c) return;

      const isMono = MONO.has(name);
      if (isMono || RATE_SEC[name]) {
        if (!allowRate(name)) return;
      }
      if (isMono) stopMono(name);

      if (isMono) fn(o, name);
      else fn(o);
    }).catch(() => { /* no-op */ });
  }

  if (typeof window !== 'undefined') {
    window.AR_SFX = { play };
  }
})();
