(() => {
  "use strict";

  // ============================================================================
  // Shared audio context / master
  // ============================================================================

  const DEFAULT_MASTER_VOLUME = 1.0;

  let audioCtx = null;
  let ballRollGain = null;
  let ready = false;
  let masterVolume = DEFAULT_MASTER_VOLUME;

  function ensure() {
    if (ready) return true;

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;

    if (!audioCtx) {
      audioCtx = new AudioCtor();
    }

    initBallRollGraph();

    ready = true;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function warmup() {
    if (!ensure()) return false;

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    getSpinnerNoiseBuffer();
    getOneShotNoiseBuffer();

    return true;
  }

  function setMasterVolume(value) {
    const v = Number(value);
    masterVolume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_MASTER_VOLUME;
  }

  // ============================================================================
  // Utility
  // ============================================================================

  function clamp01(v) {
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  function scaledVol(baseVol, volumeScale = 1) {
    return baseVol * masterVolume * (Number.isFinite(volumeScale) ? volumeScale : 1);
  }

  function scaledPitch(basePitch, pitchScale = 1) {
    return basePitch * (Number.isFinite(pitchScale) ? pitchScale : 1);
  }

  // ============================================================================
  // Ball roll
  // ============================================================================

  const MIN_AUDIBLE_RATIO = 0.04;
  const MAX_GAIN = 0.065;
  const BASE_FREQ = 170;
  const FREQ_RANGE = 420;
  const BASE_Q = 0.8;
  const Q_RANGE = 0.35;
  const HPF_FREQ = 40;
  const HPF_Q = 0.2;
  const NOISE_RATE_HZ = 600;
  const GAIN_SMOOTH_TIME = 0.06;
  const FREQ_SMOOTH_TIME = 0.06;
  const Q_SMOOTH_TIME = 0.08;
  const FADE_OUT_TIME = 0.08;
  const STOP_FADE_TIME = 0.03;

  let rollSource = null;
  let rollHighpass = null;
  let rollLowpass = null;

  function initBallRollGraph() {
    const size = Math.floor(audioCtx.sampleRate * 2);
    const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    const holdSamples = Math.max(1, Math.floor(audioCtx.sampleRate / NOISE_RATE_HZ));
    let value = 0;

    for (let i = 0; i < size; i++) {
      if (i % holdSamples === 0) {
        value = Math.random() * 2 - 1;
      }
      data[i] = value;
    }

    rollSource = audioCtx.createBufferSource();
    rollSource.buffer = buffer;
    rollSource.loop = true;

    rollHighpass = audioCtx.createBiquadFilter();
    rollHighpass.type = "highpass";
    rollHighpass.frequency.value = HPF_FREQ;
    rollHighpass.Q.value = HPF_Q;

    rollLowpass = audioCtx.createBiquadFilter();
    rollLowpass.type = "lowpass";
    rollLowpass.frequency.value = BASE_FREQ;
    rollLowpass.Q.value = BASE_Q;

    ballRollGain = audioCtx.createGain();
    ballRollGain.gain.value = 0;

    rollSource.connect(rollHighpass);
    rollHighpass.connect(rollLowpass);
    rollLowpass.connect(ballRollGain);
    ballRollGain.connect(audioCtx.destination);

    rollSource.start(0);
  }

  function updateBallRoll({
    speedRatio = 0,
    active = false,
    muted = false
  } = {}) {
    if (!ensure()) return;

    const t = audioCtx.currentTime;
    const r = clamp01(speedRatio);

    if (!active || muted || r < MIN_AUDIBLE_RATIO) {
      ballRollGain.gain.setTargetAtTime(0, t, FADE_OUT_TIME);
      return;
    }

    const gainR = Math.min(0.75, r);
    const shaped = gainR * gainR;

    const toneR = 1 - Math.pow(1 - r, 3);
    const cappedToneR = Math.min(0.55, toneR);

    const targetGain = (0.008 + shaped * MAX_GAIN) * masterVolume;
    const targetFreq = BASE_FREQ + cappedToneR * FREQ_RANGE;
    const targetQ = BASE_Q + cappedToneR * Q_RANGE;

    ballRollGain.gain.setTargetAtTime(targetGain, t, GAIN_SMOOTH_TIME);
    rollLowpass.frequency.setTargetAtTime(targetFreq, t, FREQ_SMOOTH_TIME);
    rollLowpass.Q.setTargetAtTime(targetQ, t, Q_SMOOTH_TIME);
  }

  function stopBallRoll() {
    if (!ready || !audioCtx || !ballRollGain) return;
    ballRollGain.gain.setTargetAtTime(0, audioCtx.currentTime, STOP_FADE_TIME);
  }

  // ============================================================================
  // Spinner sfx
  // ============================================================================

  const SPINNER_SFX_STEPS = [
    { dur: 0.017, vol: 0.80, q: 6, freq: 1500, sweep: 500 },
    { dur: 0.020, vol: 0.80, q: 6, freq: 1450, sweep: 450 },
    { dur: 0.025, vol: 0.80, q: 6, freq: 1200, sweep: 400 },
    { dur: 0.032, vol: 0.80, q: 6, freq: 1000, sweep: 350 },
    { dur: 0.046, vol: 0.70, q: 6, freq: 850,  sweep: 300 },
    { dur: 0.058, vol: 0.60, q: 6, freq: 700,  sweep: 200 }
  ];
  let spinnerNoiseBuffer = null;

  function getSpinnerNoiseBuffer() {
    if (!audioCtx) return null;
    if (spinnerNoiseBuffer) return spinnerNoiseBuffer;
    const len = audioCtx.sampleRate * 2;
    spinnerNoiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = spinnerNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return spinnerNoiseBuffer;
  }

  function playSpinnerNoise({ dur = 0.1, vol = 0.3, type = "bandpass", q = 6, freq = 1000, sweep = 0, t0 = 0 } = {}) {
    if (!audioCtx) return;
    const buffer = getSpinnerNoiseBuffer();
    if (!buffer) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweep) {
      filter.frequency.linearRampToValueAtTime(freq + sweep, t0 + dur);
    }

    const gain = audioCtx.createGain();
    const attack = Math.min(0.005, dur * 0.1);
    const release = Math.min(0.02, dur * 0.25);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.setValueAtTime(vol, t0 + Math.max(attack, dur - release));
    gain.gain.linearRampToValueAtTime(0, t0 + dur);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    source.start(t0);
    source.stop(t0 + dur + 0.05);
  }

  function getSpinnerSfxStepsForSpinCount(spins) {
    const max = SPINNER_SFX_STEPS.length;
    const count = Math.max(1, Math.min(Math.floor(spins || 1), max));
    return SPINNER_SFX_STEPS.slice(max - count);
  }

  function playSpinnerStep(step, { muted = false } = {}) {
    if (muted) return;
    if (!step) return;
    if (!ensure()) return;

    const t0 = audioCtx.currentTime + 0.01;
    playSpinnerNoise({
      dur: step.dur,
      vol: step.vol,
      type: "bandpass",
      q: step.q,
      freq: step.freq,
      sweep: step.sweep,
      t0
    });
  }

  // ============================================================================
  // One-shot sfx
  // ============================================================================

  const ONE_SHOT_COOLDOWNS = {
    flipper: 0.025,
    bumper: 0.035,
    slingshot: 0.04,
    dropTarget: 0.05,
    wallBump: 0.04,
    target: 0.04,
    laneOn: 0.05,
    laneOff: 0.05,
    topLaneComplete: 0.1,
    ballLost: 0.2,
    orbit: 0.08,
    featureConsumed: 0.05,
    slotStop: 0.05,
    tableSelect: 0.03,
    nudge: 0.05
  };

  const ONE_SHOT_MONO_MODE = {
    flipper: "replace",
    bumper: "replace",
    slingshot: "replace",
    dropTarget: "replace",
    wallBump: "replace",
    target: "replace",
    laneOn: "replace",
    laneOff: "replace",
    topLaneComplete: "replace",
    ballLost: "replace",
    orbit: "replace",
    featureConsumed: "replace",
    slotStop: "replace",
    tableSelect: "replace",
    nudge: "replace"
  };

  const lastPlayedAtById = Object.create(null);
  const activeOneShotVoices = Object.create(null);
  let oneShotNoiseBuffer = null;

  function getOneShotNoiseBuffer() {
    if (!audioCtx) return null;
    if (oneShotNoiseBuffer) return oneShotNoiseBuffer;
    const len = Math.floor(audioCtx.sampleRate * 0.5);
    oneShotNoiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = oneShotNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return oneShotNoiseBuffer;
  }

  // ============================================================================
  // SFX definitions
  // ============================================================================

  window.RCP_AUDIO_SFX_DEFS = window.RCP_AUDIO_SFX_DEFS || {};

Object.assign(window.RCP_AUDIO_SFX_DEFS, {
  nudge: {
    id: "nudge",
    type: "oscillator",
    osc: {
      wave: "sine",
      freq: 82.4,
      freqEnd: 659.3
    },
    env: {
      attack: 0.002,
      hold: 0.04,
      release: 0.025,
      volume: 0.2
    }
  },

  tableSelect:
{
  "id": "tableSelect",
  "type": "oscillator",
  "osc": {
    "wave": "square",
    "freq": 311.1,
    "freqEnd": 311.1
  },
  "env": {
    "attack": 0.002,
    "hold": 0.004,
    "release": 0.025,
    "volume": 0.2
  }
},

  flipper:
{
  "id": "flipper",
  "type": "oscillator",
  "osc": {
    "wave": "triangle",
    "freq": 196,
    "freqEnd": 392
  },
  "env": {
    "attack": 0.001,
    "hold": 0.04,
    "release": 0.04,
    "volume": 0.45
  }
},

  laneOn:
{
  "id": "laneOn",
  "type": "oscillator",
  "osc": {
    "wave": "square",
    "freq": 246.9,
    "freqEnd": 523.3,
  },
  "env": {
    "attack": 0.002,
    "hold": 0.02,
    "release": 0.025,
    "volume": 0.12
  }
},

  laneOff:
{
  "id": "laneOff",
  "type": "oscillator",
  "osc": {
    "wave": "square",
    "freq": 246.9,
    "freqEnd": 123.5,
  },
  "env": {
    "attack": 0.002,
    "hold": 0.02,
    "release": 0.025,
    "volume": 0.10
  }
},

  target:
{
  "id": "target",
  "type": "oscillator",
  "osc": {
    "wave": "sawtooth",
    "freq": 440,
    "freqEnd": 3520,
    "wave32": {
      "nibbles": "88EDDEBA876554211111234469CEFEC8"
      }
  },
  "env": {
    "attack": 0.002,
    "hold": 0.02,
    "release": 0.2,
    "volume": 0.15
  }
},

  dropTarget:
{
  "id": "dropTarget",
  "type": "oscillator",
  "osc": {
    "wave": "square",
    "freq": 164.8,
    "freqEnd": 329.6
  },
  "env": {
    "attack": 0.002,
    "hold": 0.025,
    "release": 0.025,
    "volume": 0.15
  }
},

  slingshot:
{
  "id": "slingshot",
  "type": "oscillator",
  "osc": {
    "wave": "square",
    "freq": 82.4,
    "freqEnd": 220.0
  },
  "env": {
    "attack": 0.001,
    "hold": 0.01,
    "release": 0.2,
    "volume": 0.25
  }
},

    bumper:
{
  "id": "bumper",
  "type": "oscillator",
  "osc": {
    "wave": "square25",
    "freq": 98,
    "freqEnd": 246.9
  },
  "env": {
    "attack": 0.001,
    "hold": 0.01,
    "release": 0.4,
    "volume": 0.3
  }
},

  wallBump:
{
  "id": "wallBump",
  "type": "oscillator",
  "osc": {
    "wave": "triangle",
    "freq": 174.6,
    "freqEnd": 349.2
  },
  "env": {
    "attack": 0.001,
    "hold": 0.012,
    "release": 0.1,
    "volume": 0.45
  }
},

  orbit: {
    id: "orbit",
    type: "mix",
    osc: {
      wave: "wave32",
      freq: 220,
      freqEnd: 1320,
      wave32: {
        nibbles: "888C868382822468A221088FF3EEEEC8"
      }
    },
    noise: {
      volume: 0.4
    },
    filter: {
      type: "highpass",
      freq: 1000,
      freqEnd: 9000,
      q: 1
    },
    env: {
      attack: 0.004,
      hold: 0.2,
      release: 0.08,
      volume: 0.055
    }
  },

  featureConsumed: {
    id: "featureConsumed",
    type: "oscillator",
    osc: {
      wave: "square",
      freq: 180,
      freqEnd: 180
    },
    env: {
      attack: 0.004,
      hold: 0.02,
      release: 0.01,
      volume: 0.075
    }
  },

  slotStop: {
    id: "slotStop",
    type: "oscillator",
    osc: {
      wave: "sine",
      freq: 200,
      freqEnd: 600
    },
    env: {
      attack: 0.025,
      hold: 0.002,
      release: 0.025,
      volume: 0.52
    }
  },

  centerPost: {
    id: "centerPost",
    type: "oscillator",
    osc: {
      wave: "triangle",
      freq: 329.6,
      freqEnd: 329.6
    },
    env: {
      attack: 0.002,
      hold: 0.004,
      release: 0.025,
      volume: 0.35
    }
  }
});

  const SFX_TYPES = ["oscillator", "noise", "mix"];
  const OSC_WAVES = [
    "sine",
    "square",
    "square25",
    "triangle",
    "sawtooth",
    "wave32"
  ];
  const FILTER_TYPES = ["none", "lowpass", "highpass", "bandpass"];
  const WAVE32_NEUTRAL = "88888888888888888888888888888888";
  const WAVE32_HARMONIC_COUNT = 16;

  const pulsePeriodicWaveCache = new WeakMap();
  const wave32PeriodicWaveCache = Object.create(null);

  function normalizeWave32Nibbles(value) {
    const cleaned = String(value || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    return cleaned.length === 32 ? cleaned : WAVE32_NEUTRAL;
  }

  function wave32NibblesToPeriodicWave(ctx, nibblesString) {
    const nibs = normalizeWave32Nibbles(nibblesString);
    const sampleCount = 32;
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = (parseInt(nibs[i], 16) - 7.5) / 7.5;
    }

    const real = new Float32Array(WAVE32_HARMONIC_COUNT + 1);
    const imag = new Float32Array(WAVE32_HARMONIC_COUNT + 1);
    real[0] = 0;
    imag[0] = 0;

    for (let k = 1; k <= WAVE32_HARMONIC_COUNT; k++) {
      let cosSum = 0;
      let sinSum = 0;
      for (let n = 0; n < sampleCount; n++) {
        const angle = (2 * Math.PI * k * n) / sampleCount;
        cosSum += samples[n] * Math.cos(angle);
        sinSum += samples[n] * Math.sin(angle);
      }
      real[k] = (cosSum / sampleCount) * 0.5;
      imag[k] = (sinSum / sampleCount) * 0.5;
    }

    try {
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch {
      return ctx.createPeriodicWave(real, imag);
    }
  }

  function getWave32PeriodicWave(nibblesString) {
    if (!audioCtx) return null;
    const key = normalizeWave32Nibbles(nibblesString);
    if (wave32PeriodicWaveCache[key]) return wave32PeriodicWaveCache[key];
    const wave = wave32NibblesToPeriodicWave(audioCtx, key);
    wave32PeriodicWaveCache[key] = wave;
    return wave;
  }

  function getPulsePeriodicWave(ctx, dutyCycle) {
    let cache = pulsePeriodicWaveCache.get(ctx);
    if (!cache) {
      cache = Object.create(null);
      pulsePeriodicWaveCache.set(ctx, cache);
    }
    const key = String(dutyCycle);
    if (cache[key]) return cache[key];

    const harmonicCount = 64;
    const real = new Float32Array(harmonicCount + 1);
    const imag = new Float32Array(harmonicCount + 1);
    for (let n = 1; n <= harmonicCount; n++) {
      real[n] = (2 / (Math.PI * n)) * Math.sin(2 * Math.PI * n * dutyCycle);
      imag[n] = (2 / (Math.PI * n)) * (1 - Math.cos(2 * Math.PI * n * dutyCycle));
    }
    cache[key] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return cache[key];
  }

  function getSafeNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function getSafeString(value, allowed, fallback) {
    if (typeof value !== "string") return fallback;
    return allowed.includes(value) ? value : fallback;
  }

  function normalizeSfxDef(def) {
    if (!def || typeof def !== "object") return null;

    const type = getSafeString(def.type, SFX_TYPES, null);
    if (!type) return null;

    const osc = def.osc && typeof def.osc === "object" ? def.osc : {};
    const noise = def.noise && typeof def.noise === "object" ? def.noise : {};
    const filter = def.filter && typeof def.filter === "object" ? def.filter : {};
    const env = def.env && typeof def.env === "object" ? def.env : {};

    const wave = getSafeString(osc.wave, OSC_WAVES, "sine");
    const freq = getSafeNumber(osc.freq, 440, 20, 12000);
    const filterFreq = getSafeNumber(filter.freq, 1000, 20, 12000);

    const normalizedOsc = {
      wave,
      freq,
      freqEnd: getSafeNumber(osc.freqEnd, freq, 20, 12000)
    };

    if (wave === "wave32") {
      const wave32 = osc.wave32 && typeof osc.wave32 === "object" ? osc.wave32 : {};
      normalizedOsc.wave32 = {
        nibbles: normalizeWave32Nibbles(wave32.nibbles)
      };
    }

    return {
      id: typeof def.id === "string" ? def.id : "untitled",
      type,
      osc: normalizedOsc,
      noise: {
        volume: getSafeNumber(noise.volume, 0, 0, 1)
      },
      filter: {
        type: getSafeString(filter.type, FILTER_TYPES, "none"),
        freq: filterFreq,
        freqEnd: getSafeNumber(filter.freqEnd, filterFreq, 20, 12000),
        q: getSafeNumber(filter.q, 1, 0.1, 30)
      },
      env: {
        attack: getSafeNumber(env.attack, 0.01, 0.001, 0.25),
        hold: getSafeNumber(env.hold, 0, 0, 0.75),
        release: getSafeNumber(env.release, 0.1, 0.001, 1.0),
        volume: getSafeNumber(env.volume, 0.3, 0.01, 0.7)
      }
    };
  }

  function sweepParam(param, start, end, t0, duration) {
    const safeStart = Math.max(0.001, start);
    const safeEnd = Math.max(0.001, end);
    param.setValueAtTime(safeStart, t0);
    if (duration > 0) {
      param.exponentialRampToValueAtTime(safeEnd, t0 + duration);
    }
  }

  function getOneShotDef(soundId) {
    const defs = window.RCP_AUDIO_SFX_DEFS;
    if (!defs || typeof defs !== "object") return null;
    const def = defs[soundId];
    return def && typeof def === "object" ? def : null;
  }

  function playSynthDefSfx(t0, def, options = {}) {
    const normalized = normalizeSfxDef(def);
    if (!normalized || !audioCtx) return null;

    const { volumeScale = 1, pitchScale = 1 } = options;
    const env = normalized.env;
    const peakAt = t0 + env.attack;
    const releaseAt = peakAt + env.hold;
    const endAt = releaseAt + env.release;
    const duration = endAt - t0;
    const vol = scaledVol(env.volume, volumeScale);
    const sources = [];
    const stopAt = endAt + 0.02;

    try {
      const envelope = audioCtx.createGain();
      envelope.gain.setValueAtTime(0, t0);
      envelope.gain.linearRampToValueAtTime(vol, peakAt);
      envelope.gain.setValueAtTime(vol, releaseAt);
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
      envelope.connect(audioCtx.destination);

      if (normalized.type === "oscillator" || normalized.type === "mix") {
        const osc = audioCtx.createOscillator();
        if (normalized.osc.wave === "wave32") {
          const wave = getWave32PeriodicWave(normalized.osc.wave32?.nibbles);
          if (wave) {
            osc.setPeriodicWave(wave);
          } else {
            osc.type = "sine";
          }
        } else if (normalized.osc.wave === "square25") {
          osc.setPeriodicWave(getPulsePeriodicWave(audioCtx, 0.25));
        } else {
          osc.type = normalized.osc.wave;
        }
        const freqStart = scaledPitch(normalized.osc.freq, pitchScale);
        const freqEnd = scaledPitch(normalized.osc.freqEnd, pitchScale);
        sweepParam(osc.frequency, freqStart, freqEnd, t0, duration);
        osc.connect(envelope);
        osc.start(t0);
        osc.stop(stopAt);
        sources.push(osc);
      }

      if (normalized.type === "noise" || normalized.type === "mix") {
        const buffer = getOneShotNoiseBuffer();
        if (buffer) {
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;

          const noiseGain = audioCtx.createGain();
          noiseGain.gain.value = normalized.noise.volume;

          source.connect(noiseGain);

          if (normalized.filter.type !== "none") {
            const filterNode = audioCtx.createBiquadFilter();
            filterNode.type = normalized.filter.type;
            filterNode.Q.value = normalized.filter.q;
            const maxFreq = audioCtx.sampleRate * 0.45;
            const filterStart = scaledPitch(Math.min(normalized.filter.freq, maxFreq), pitchScale);
            const filterEnd = scaledPitch(Math.min(normalized.filter.freqEnd, maxFreq), pitchScale);
            sweepParam(filterNode.frequency, filterStart, filterEnd, t0, duration);
            noiseGain.connect(filterNode);
            filterNode.connect(envelope);
          } else {
            noiseGain.connect(envelope);
          }

          source.start(t0);
          source.stop(stopAt);
          sources.push(source);
        }
      }

      if (sources.length === 0) return null;

      return { stopAt, gain: envelope, sources };
    } catch {
      return null;
    }
  }

  function canPlayOneShot(soundId, t) {
    const cooldown = ONE_SHOT_COOLDOWNS[soundId];
    if (cooldown == null) return true;
    const last = lastPlayedAtById[soundId] ?? -Infinity;
    return (t - last) >= cooldown;
  }

  function stopActiveOneShot(soundId, t, fadeTime = 0.006) {
    const voice = activeOneShotVoices[soundId];
    if (!voice) return;

    if (voice.gain?.gain) {
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0.0001, t + fadeTime);
      } catch {
        // ignore
      }
    }

    const stopTime = t + fadeTime + 0.002;
    for (const source of voice.sources || []) {
      try {
        source.stop(stopTime);
      } catch {
        // ignore already stopped
      }
    }

    delete activeOneShotVoices[soundId];
  }

  function registerOneShotVoice(soundId, voice) {
    activeOneShotVoices[soundId] = voice;

    const sources = voice.sources || [];
    if (sources.length === 0) return;

    let ended = 0;
    const tryCleanup = () => {
      ended++;
      if (ended >= sources.length && activeOneShotVoices[soundId] === voice) {
        delete activeOneShotVoices[soundId];
      }
    };

    for (const source of sources) {
      source.onended = tryCleanup;
    }
  }

  function playFlipperSfx(t0, { volumeScale = 1, pitchScale = 1 } = {}) {
    const dur = 0.025;
    const vol = scaledVol(0.35, volumeScale);
    const freq = scaledPitch(950, pitchScale);

    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t0);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const stopAt = t0 + dur + 0.01;
    osc.start(t0);
    osc.stop(stopAt);

    return {
      stopAt,
      gain,
      sources: [osc]
    };
  }

  function playBumperSfx(t0, { volumeScale = 1, pitchScale = 1 } = {}) {
    const dur = 0.04;
    const vol = scaledVol(0.4, volumeScale);
    const freq = scaledPitch(1400, pitchScale);

    const osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + dur);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const stopAt = t0 + dur + 0.01;
    osc.start(t0);
    osc.stop(stopAt);

    return {
      stopAt,
      gain,
      sources: [osc]
    };
  }

  function playDropTargetSfx(t0, { volumeScale = 1, pitchScale = 1 } = {}) {
    const buffer = getOneShotNoiseBuffer();
    if (!buffer) return;

    const dur = 0.06;
    const vol = scaledVol(0.45, volumeScale);
    const startFreq = scaledPitch(400, pitchScale);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const lpf = audioCtx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(startFreq, t0);
    lpf.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    lpf.Q.value = 0.7;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    source.connect(lpf);
    lpf.connect(gain);
    gain.connect(audioCtx.destination);
    const stopAt = t0 + dur + 0.02;
    source.start(t0);
    source.stop(stopAt);

    return {
      stopAt,
      gain,
      sources: [source]
    };
  }

  const ONE_SHOT_PLAYERS = {
    flipper: playFlipperSfx,
    bumper: playBumperSfx,
    dropTarget: playDropTargetSfx
  };

  function play(soundId, options = {}) {
    if (options.muted) return;
    if (!ensure()) return;

    const player = ONE_SHOT_PLAYERS[soundId];
    const sfxDef = getOneShotDef(soundId);

    if (!player && !sfxDef) return;

    const t = audioCtx.currentTime;
    if (!canPlayOneShot(soundId, t)) return;

    if (ONE_SHOT_MONO_MODE[soundId] === "replace") {
      stopActiveOneShot(soundId, t);
    }

    lastPlayedAtById[soundId] = t;

    let voice = null;
    if (sfxDef) {
      voice = playSynthDefSfx(t, sfxDef, options);
    }
    if (!voice && player) {
      voice = player(t, options);
    }
    if (voice) {
      registerOneShotVoice(soundId, voice);
    }
  }

  // ============================================================================
  // Slot spin loop noise (table777, separate from one-shot / melody)
  // ============================================================================

  const SLOT_SPIN_PULSE_INTERVAL_SEC = 0.055;
  const SLOT_SPIN_ATTACK_SEC = 0.025;
  const SLOT_SPIN_RELEASE_SEC = 0.025;
  const SLOT_SPIN_NOISE_VOLUME = 0.08;
  const SLOT_SPIN_OUTPUT_VOLUME = 0.50;
  const SLOT_SPIN_SCHEDULE_AHEAD_SEC = 0.4;
  const SLOT_SPIN_FADE_OUT_SEC = 0.03;

  let slotSpinVoice = null;
  let slotSpinScheduleTimerId = null;

  function clearSlotSpinScheduleTimer() {
    if (slotSpinScheduleTimerId != null) {
      clearTimeout(slotSpinScheduleTimerId);
      slotSpinScheduleTimerId = null;
    }
  }

  function scheduleSlotSpinPulses(voice) {
    if (!audioCtx || slotSpinVoice !== voice) return;

    const now = audioCtx.currentTime;
    const until = now + SLOT_SPIN_SCHEDULE_AHEAD_SEC;
    let t = voice.nextPulseTime;

    if (t < now) {
      t = now;
    }

    const pulseGain = voice.pulseGain.gain;
    while (t < until) {
      const peakAt = t + SLOT_SPIN_ATTACK_SEC;
      const endAt = peakAt + SLOT_SPIN_RELEASE_SEC;
      try {
        pulseGain.setValueAtTime(0.0001, t);
        pulseGain.linearRampToValueAtTime(1, peakAt);
        pulseGain.linearRampToValueAtTime(0.0001, endAt);
      } catch {
        // ignore automation failures
      }
      t += SLOT_SPIN_PULSE_INTERVAL_SEC;
    }

    voice.nextPulseTime = t;

    const delayMs = Math.max(50, (SLOT_SPIN_SCHEDULE_AHEAD_SEC - 0.12) * 1000);
    clearSlotSpinScheduleTimer();
    slotSpinScheduleTimerId = setTimeout(() => {
      slotSpinScheduleTimerId = null;
      if (slotSpinVoice === voice) {
        scheduleSlotSpinPulses(voice);
      }
    }, delayMs);
  }

  function startSlotSpin(options = {}) {
    stopSlotSpin();

    if (options.muted) return;
    if (!ensure()) return;

    const buffer = getOneShotNoiseBuffer();
    if (!buffer) return;

    try {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const pulseGain = audioCtx.createGain();
      pulseGain.gain.value = 0;

      const outputGain = audioCtx.createGain();
      outputGain.gain.value = scaledVol(SLOT_SPIN_NOISE_VOLUME * SLOT_SPIN_OUTPUT_VOLUME);

      source.connect(pulseGain);
      pulseGain.connect(outputGain);
      outputGain.connect(audioCtx.destination);

      const voice = {
        source,
        pulseGain,
        outputGain,
        nextPulseTime: audioCtx.currentTime
      };

      slotSpinVoice = voice;
      source.start(0);
      scheduleSlotSpinPulses(voice);
    } catch {
      slotSpinVoice = null;
      clearSlotSpinScheduleTimer();
    }
  }

  function stopSlotSpin() {
    clearSlotSpinScheduleTimer();

    const voice = slotSpinVoice;
    if (!voice) return;
    slotSpinVoice = null;

    if (!audioCtx) return;

    const t = audioCtx.currentTime;
    const fade = SLOT_SPIN_FADE_OUT_SEC;

    try {
      if (voice.pulseGain?.gain) {
        voice.pulseGain.gain.cancelScheduledValues(t);
        voice.pulseGain.gain.setValueAtTime(Math.max(0.0001, voice.pulseGain.gain.value), t);
        voice.pulseGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      }
    } catch {
      // ignore
    }

    try {
      if (voice.outputGain?.gain) {
        voice.outputGain.gain.cancelScheduledValues(t);
        voice.outputGain.gain.setValueAtTime(Math.max(0.0001, voice.outputGain.gain.value), t);
        voice.outputGain.gain.linearRampToValueAtTime(0.0001, t + fade);
      }
    } catch {
      // ignore
    }

    try {
      voice.source.stop(t + fade + 0.01);
    } catch {
      // ignore already stopped
    }
  }

  // ============================================================================
  // Melody (monophonic foreground + boosted background layer)
  // ============================================================================

  const BOOSTED_MELODY_ID = "boosted";
  const BOOSTED_DUCK_FADE_SEC = 0.01;
  const BOOSTED_RESTORE_FADE_SEC = 0.02;
  const MELODY_STOP_FADE_SEC = 0.02;

  let activeMelodyVoice = null;
  let backgroundMelodyVoice = null;
  let melodyPlaybackToken = 0;
  let backgroundMelodyToken = 0;

  function midiNoteToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function applyMelodyWave(osc, instrument) {
    const wave = instrument.wave;

    if (wave === "wave32") {
      const wavePeriodic = getWave32PeriodicWave(instrument.wave32?.nibbles);
      if (wavePeriodic) {
        osc.setPeriodicWave(wavePeriodic);
      } else {
        osc.type = "sine";
      }
      return;
    }

    if (wave === "square25") {
      osc.setPeriodicWave(getPulsePeriodicWave(audioCtx, 0.25));
      return;
    }

    if (wave === "sine" || wave === "square" || wave === "triangle" || wave === "sawtooth") {
      osc.type = wave;
      return;
    }

    osc.type = "sine";
  }

  function fadeAndStopMelodyVoice(voice, fadeTime = MELODY_STOP_FADE_SEC) {
    if (!voice) return;

    const t = audioCtx ? audioCtx.currentTime : 0;

    if (voice.outputGain) {
      try {
        const g = voice.outputGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + fadeTime);
      } catch {
        // ignore stop/schedule errors on ended nodes
      }
    }

    for (const gain of voice.gains || []) {
      try {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeTime);
      } catch {
        // ignore stop/schedule errors on ended nodes
      }
    }

    const stopTime = t + fadeTime + 0.002;
    for (const osc of voice.oscillators || []) {
      try {
        osc.stop(stopTime);
      } catch {
        // ignore already stopped
      }
    }
  }

  function setBackgroundMelodyAudible(audible) {
    const voice = backgroundMelodyVoice;
    if (!voice || !voice.outputGain || !audioCtx) return;

    const g = voice.outputGain.gain;
    const t = audioCtx.currentTime;
    const fade = audible ? BOOSTED_RESTORE_FADE_SEC : BOOSTED_DUCK_FADE_SEC;
    const target = audible ? 1 : 0;

    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(target, t + fade);
    } catch {
      // ignore schedule errors on ended nodes
    }
  }

  function stopForegroundMelody() {
    melodyPlaybackToken += 1;

    const voice = activeMelodyVoice;
    activeMelodyVoice = null;
    fadeAndStopMelodyVoice(voice);
  }

  function stopBackgroundMelody() {
    backgroundMelodyToken += 1;

    const voice = backgroundMelodyVoice;
    backgroundMelodyVoice = null;
    fadeAndStopMelodyVoice(voice);
  }

  function stopMelody() {
    stopForegroundMelody();
    stopBackgroundMelody();
  }

  function resolveMelodyDef(id) {
    const defs = window.RCP_MELODY_DEFS;
    if (!defs || typeof defs !== "object") return null;

    const def = defs[id];
    if (!def || typeof def !== "object") return null;

    const bpm = Number(def.bpm);
    if (!Number.isFinite(bpm) || bpm <= 0) return null;

    const instrument = def.instrument;
    if (!instrument || typeof instrument !== "object") return null;

    const notes = def.notes;
    if (!Array.isArray(notes) || notes.length === 0) return null;

    return def;
  }

  function scheduleMelodyVoice(def, voice, isTokenCurrent, destinationNode) {
    const instrument = def.instrument;
    const notes = def.notes;
    const secondsPerBeat = 60 / Number(def.bpm);
    const filterType = instrument.filter?.type || "none";
    const filterFreq = Number(instrument.filter?.freq);
    const filterQ = Number(instrument.filter?.q);
    const baseVolume = Number(instrument.volume);
    const attack = Number(instrument.attack);
    const gate = Number(instrument.gate);
    const release = Number(instrument.release);

    let cursor = audioCtx.currentTime;

    for (let i = 0; i < notes.length; i++) {
      if (!isTokenCurrent()) return;

      const entry = notes[i];
      if (!entry || typeof entry !== "object") continue;

      const beats = Number(entry.beats);
      if (!Number.isFinite(beats) || beats <= 0) continue;

      const stepDuration = beats * secondsPerBeat;

      if (entry.rest) {
        cursor += stepDuration;
        continue;
      }

      const note = Number(entry.note);
      if (!Number.isFinite(note)) {
        cursor += stepDuration;
        continue;
      }

      const velocity = Number(entry.velocity);
      const velocityScale = 0.75 + ((Number.isFinite(velocity) ? velocity : 100) / 127) * 0.25;
      const peak =
        (Number.isFinite(baseVolume) ? baseVolume : 0.05) *
        velocityScale *
        masterVolume;

      const noteStart = cursor;
      const attackEnd =
        noteStart + Math.min(Number.isFinite(attack) ? attack : 0.004, stepDuration * 0.5);
      const gateEnd =
        noteStart +
        Math.max(
          Number.isFinite(attack) ? attack : 0.004,
          stepDuration * (Number.isFinite(gate) ? gate : 0.88)
        );
      const releaseEnd = Math.min(
        noteStart + stepDuration,
        gateEnd + (Number.isFinite(release) ? release : 0.04)
      );

      try {
        const osc = audioCtx.createOscillator();
        applyMelodyWave(osc, instrument);
        osc.frequency.setValueAtTime(midiNoteToFrequency(note), noteStart);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(peak, attackEnd);
        gain.gain.setValueAtTime(peak, gateEnd);
        gain.gain.linearRampToValueAtTime(0, releaseEnd);

        if (filterType === "none") {
          osc.connect(gain);
        } else {
          const filterNode = audioCtx.createBiquadFilter();
          filterNode.type = filterType;
          filterNode.frequency.value = Number.isFinite(filterFreq) ? filterFreq : 1200;
          filterNode.Q.value = Number.isFinite(filterQ) ? filterQ : 1;
          osc.connect(filterNode);
          filterNode.connect(gain);
        }

        gain.connect(destinationNode);

        const stopAt = noteStart + stepDuration + 0.02;
        osc.start(noteStart);
        osc.stop(stopAt);

        voice.oscillators.push(osc);
        voice.gains.push(gain);
      } catch {
        // ignore individual note failures
      }

      cursor += stepDuration;
    }
  }

  function playMelody(id, options = {}) {
    if (options.muted) return;
    if (!ensure()) return;

    const def = resolveMelodyDef(id);
    if (!def) return;

    if (id === BOOSTED_MELODY_ID) {
      stopBackgroundMelody();

      const token = backgroundMelodyToken;
      const outputGain = audioCtx.createGain();
      const startAudible = !activeMelodyVoice;
      outputGain.gain.value = startAudible ? 1 : 0;
      outputGain.connect(audioCtx.destination);

      const voice = {
        token,
        oscillators: [],
        gains: [],
        outputGain
      };
      backgroundMelodyVoice = voice;

      scheduleMelodyVoice(def, voice, () => backgroundMelodyToken === token, outputGain);

      if (backgroundMelodyVoice === voice && voice.oscillators.length > 0) {
        const lastOsc = voice.oscillators[voice.oscillators.length - 1];
        lastOsc.onended = () => {
          if (backgroundMelodyVoice === voice && backgroundMelodyToken === token) {
            backgroundMelodyVoice = null;
          }
        };
      } else if (backgroundMelodyVoice === voice) {
        backgroundMelodyVoice = null;
      }
      return;
    }

    stopForegroundMelody();
    setBackgroundMelodyAudible(false);

    const token = melodyPlaybackToken;
    const voice = {
      token,
      oscillators: [],
      gains: []
    };
    activeMelodyVoice = voice;

    scheduleMelodyVoice(def, voice, () => melodyPlaybackToken === token, audioCtx.destination);

    if (activeMelodyVoice === voice && voice.oscillators.length > 0) {
      const lastOsc = voice.oscillators[voice.oscillators.length - 1];
      lastOsc.onended = () => {
        if (activeMelodyVoice === voice && melodyPlaybackToken === token) {
          activeMelodyVoice = null;
          setBackgroundMelodyAudible(true);
        }
      };
    } else if (activeMelodyVoice === voice) {
      activeMelodyVoice = null;
      setBackgroundMelodyAudible(true);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  window.RCPAudio = {
    unlock,
    warmup,
    updateBallRoll,
    stopBallRoll,
    setMasterVolume,
    getSpinnerSfxStepsForSpinCount,
    playSpinnerStep,
    play,
    playMelody,
    stopMelody,
    stopBoostedMelody: stopBackgroundMelody,
    startSlotSpin,
    stopSlotSpin
  };
})();
