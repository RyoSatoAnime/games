/**
 * ARSAM lightweight multi-track BGM scheduler (Web Audio API).
 * window.AR_BGM = { init, load, start, stop, pause, resume, setMuted, isPlaying, isPaused, playOneShotMelody }
 *
 * Instrument types:
 *   (omit) / oscillator  → melodic oscillator (MIDI note → freq)
 *   instrument.wave='wave32' → 32-step nibble waveform via PeriodicWave
 *   drumOscillator       → fixed freq → freqEnd sweep (kick)
 *   noise                → shared noise buffer + filter (hihat / sample fallback)
 *   sample               → PCM AudioBuffer (snare); falls back to noise if unloaded
 * Melodic oscillator may set instrument.echo = { delaySec, volumeMul }
 * for one extra delayed quieter hit (no feedback / no DelayNode).
 */
(function () {
  'use strict';

  // Game-wide BGM master volume (independent of per-track instrument.volume).
  const DEFAULT_BGM_GAIN = 0.55;

  const SCHEDULER_INTERVAL_MS = 50;
  const SCHEDULE_AHEAD_SEC = 0.15;
  const STOP_FADE_SEC = 0.025;
  const GAIN_FLOOR = 0.0001;
  const NOISE_BUFFER_SEC = 1;
  const SAMPLE_ATTACK_SEC = 0.001;
  const SAMPLE_RELEASE_SEC = 0.01;

  const OSC_WAVES = new Set(['sine', 'square', 'triangle', 'sawtooth']);
  const WAVE32_SAMPLE_COUNT = 32;
  const periodicWaveCache = new Map();
  const sampleBufferCache = new Map();
  const sampleLoadPromises = new Map();

  const state = {
    ctx: null,
    destination: null,
    bgmGain: null,
    noiseBuffer: null,
    song: null,
    events: [],
    loopEvents: [],
    loopStartEffective: 0,
    playing: false,
    paused: false,
    muted: false,
    inIntroPass: true,
    songStartTime: 0,
    nextEventIndex: 0,
    loopIteration: 0,
    schedulerTimer: null,
    activeVoices: new Set(),
    pausedAbsoluteBeat: 0
  };

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function buildWave32PeriodicWave(ctx, wave32) {
    const raw = wave32 && typeof wave32.nibbles === 'string'
      ? wave32.nibbles.trim().toUpperCase()
      : '';
    if (!/^[0-9A-F]{32}$/.test(raw)) return null;

    const cacheKey = raw;
    const cached = periodicWaveCache.get(cacheKey);
    if (cached) return cached;

    const samples = new Float32Array(WAVE32_SAMPLE_COUNT);
    let mean = 0;
    for (let i = 0; i < WAVE32_SAMPLE_COUNT; i++) {
      const nibble = parseInt(raw[i], 16);
      const value = (nibble / 15) * 2 - 1;
      samples[i] = value;
      mean += value;
    }
    mean /= WAVE32_SAMPLE_COUNT;
    for (let i = 0; i < WAVE32_SAMPLE_COUNT; i++) samples[i] -= mean;

    const harmonicCount = WAVE32_SAMPLE_COUNT / 2;
    const real = new Float32Array(harmonicCount + 1);
    const imag = new Float32Array(harmonicCount + 1);
    for (let harmonic = 1; harmonic <= harmonicCount; harmonic++) {
      let cosine = 0;
      let sine = 0;
      for (let i = 0; i < WAVE32_SAMPLE_COUNT; i++) {
        const phase = 2 * Math.PI * harmonic * i / WAVE32_SAMPLE_COUNT;
        cosine += samples[i] * Math.cos(phase);
        sine += samples[i] * Math.sin(phase);
      }
      real[harmonic] = (2 / WAVE32_SAMPLE_COUNT) * cosine;
      imag[harmonic] = (2 / WAVE32_SAMPLE_COUNT) * sine;
    }

    const periodicWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    periodicWaveCache.set(cacheKey, periodicWave);
    return periodicWave;
  }

  function applyOscillatorWave(ctx, osc, inst) {
    const wave = inst.wave || 'square';
    if (wave === 'wave32') {
      const periodicWave = buildWave32PeriodicWave(ctx, inst.wave32);
      if (periodicWave) {
        osc.setPeriodicWave(periodicWave);
        return;
      }
    }
    osc.type = OSC_WAVES.has(wave) ? wave : 'square';
  }

  function secondsPerBeat() {
    const bpm = state.song && state.song.bpm > 0 ? state.song.bpm : 120;
    return 60 / bpm;
  }

  function loopBeats() {
    const lb = state.song && state.song.loopBeats;
    return lb > 0 ? lb : 1;
  }

  function loopStartBeat() {
    return state.loopStartEffective;
  }

  function resolveLoopStartBeat() {
    const beat = state.song && +state.song.loopStartBeat;
    if (!(beat >= 0)) return 0;
    const end = loopBeats();
    if (!(beat < end)) return 0;
    return beat;
  }

  function resetTransport() {
    state.inIntroPass = true;
    state.nextEventIndex = 0;
    state.loopIteration = 0;
    state.songStartTime = 0;
    state.pausedAbsoluteBeat = 0;
  }

  /**
   * Rebuild inIntroPass / nextEventIndex / loopIteration so the next
   * scheduled note is the first event whose absolute beat is after absoluteBeat.
   * Does not restart mid-note voices.
   */
  function seekTransportAfterAbsoluteBeat(absoluteBeat) {
    const loopStart = loopStartBeat();
    const loopEnd = loopBeats();
    const loopLength = Math.max(0.0001, loopEnd - loopStart);
    const beat = Math.max(0, +absoluteBeat || 0);

    if (beat < loopEnd) {
      // Still on the intro (full-song) pass.
      state.inIntroPass = true;
      state.loopIteration = 0;
      const list = state.events;
      let idx = 0;
      while (idx < list.length && list[idx].beat <= beat) idx++;
      if (idx >= list.length) {
        // Intro exhausted: first loop event is next.
        state.inIntroPass = false;
        state.loopIteration = 0;
        state.nextEventIndex = 0;
      } else {
        state.nextEventIndex = idx;
      }
      return;
    }

    // Past intro: map onto looped region.
    state.inIntroPass = false;
    const intoLoop = beat - loopEnd;
    const loopIteration = Math.floor(intoLoop / loopLength);
    const beatInLoop = loopStart + (intoLoop - loopIteration * loopLength);
    state.loopIteration = loopIteration;

    const list = state.loopEvents;
    let idx = 0;
    while (idx < list.length && list[idx].beat <= beatInLoop) idx++;
    if (idx >= list.length) {
      // Past last event of this iteration → next loop.
      state.loopIteration = loopIteration + 1;
      state.nextEventIndex = 0;
    } else {
      state.nextEventIndex = idx;
    }
  }

  function buildLoopEvents() {
    const start = resolveLoopStartBeat();
    const loopEvents = state.events.filter(function (event) {
      return event.beat >= start;
    });
    if (!loopEvents.length) {
      // No events after loopStart: fall back to full song from beat 0.
      state.loopEvents = state.events.slice();
      state.loopStartEffective = 0;
    } else {
      state.loopEvents = loopEvents;
      state.loopStartEffective = start;
    }
  }

  function ensureNoiseBuffer() {
    const ctx = state.ctx;
    if (!ctx || state.noiseBuffer) return state.noiseBuffer;
    const len = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SEC));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    state.noiseBuffer = buf;
    return buf;
  }

  function loadSampleBuffer(src) {
    if (!src || typeof src !== 'string') return Promise.resolve(null);
    if (sampleBufferCache.has(src)) return Promise.resolve(sampleBufferCache.get(src));
    if (sampleLoadPromises.has(src)) return sampleLoadPromises.get(src);

    const ctx = state.ctx;
    if (!ctx) return Promise.resolve(null);

    const promise = fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error('sample fetch failed: ' + src);
        return res.arrayBuffer();
      })
      .then(function (arrayBuffer) {
        return ctx.decodeAudioData(arrayBuffer.slice(0));
      })
      .then(function (audioBuffer) {
        sampleBufferCache.set(src, audioBuffer);
        sampleLoadPromises.delete(src);
        return audioBuffer;
      })
      .catch(function () {
        sampleLoadPromises.delete(src);
        return null;
      });

    sampleLoadPromises.set(src, promise);
    return promise;
  }

  function preloadSongSamples(song) {
    const ctx = state.ctx;
    if (!ctx || !song) return;
    const tracks = Array.isArray(song.tracks) ? song.tracks : [];
    for (let i = 0; i < tracks.length; i++) {
      const inst = tracks[i] && tracks[i].instrument;
      if (!inst || inst.type !== 'sample') continue;
      if (!inst.src) continue;
      loadSampleBuffer(inst.src);
    }
  }

  function buildEvents(song) {
    const events = [];
    const tracks = song && Array.isArray(song.tracks) ? song.tracks : [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const notes = tracks[ti] && Array.isArray(tracks[ti].notes) ? tracks[ti].notes : [];
      for (let ni = 0; ni < notes.length; ni++) {
        const n = notes[ni];
        if (!n) continue;
        events.push({
          beat: +n.beat || 0,
          trackIndex: ti,
          note: +n.note || 0,
          duration: Math.max(0, +n.duration || 0)
        });
      }
    }
    events.sort(function (a, b) {
      if (a.beat !== b.beat) return a.beat - b.beat;
      return a.trackIndex - b.trackIndex;
    });
    return events;
  }

  function clearScheduler() {
    if (state.schedulerTimer != null) {
      clearInterval(state.schedulerTimer);
      state.schedulerTimer = null;
    }
  }

  function peakVolume(volume) {
    // Mute at schedule time: keep this voice silent so unmute cannot revive mid-note.
    return state.muted ? 0 : Math.max(0, volume);
  }

  function applyGainEnvelope(noteGain, startTime, attackEnd, holdEnd, releaseEnd, peak) {
    noteGain.gain.setValueAtTime(GAIN_FLOOR, startTime);
    if (peak > 0) {
      noteGain.gain.linearRampToValueAtTime(peak, attackEnd);
      noteGain.gain.setValueAtTime(peak, holdEnd);
      noteGain.gain.linearRampToValueAtTime(GAIN_FLOOR, releaseEnd);
    } else {
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.setValueAtTime(0, releaseEnd);
    }
  }

  function connectFilter(ctx, input, filter, startTime) {
    if (!filter || !filter.type || filter.type === 'none') return input;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.setValueAtTime(+filter.freq || 1200, startTime);
    biquad.Q.setValueAtTime(+filter.q || 1, startTime);
    input.connect(biquad);
    return biquad;
  }

  function startRegisteredSource(source, noteGain, startTime, stopTime) {
    const voice = { source: source, gain: noteGain };
    state.activeVoices.add(voice);
    source.onended = function () {
      state.activeVoices.delete(voice);
    };
    try {
      source.start(startTime);
      source.stop(stopTime);
    } catch (_e) {
      state.activeVoices.delete(voice);
    }
  }

  function fadeOutAndStopVoices() {
    const ctx = state.ctx;
    if (!ctx) {
      state.activeVoices.clear();
      return;
    }
    const t = ctx.currentTime;
    const voices = Array.from(state.activeVoices);
    state.activeVoices.clear();
    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i];
      try {
        const g = voice.gain.gain;
        g.cancelScheduledValues(t);
        const cur = Math.max(g.value, GAIN_FLOOR);
        g.setValueAtTime(cur, t);
        g.linearRampToValueAtTime(GAIN_FLOOR, t + STOP_FADE_SEC);
        voice.source.stop(t + STOP_FADE_SEC + 0.01);
      } catch (_e) { /* already stopped */ }
    }
  }

  // One melodic oscillator hit (waveform / envelope / filter / freq). No echo nesting.
  // Optional spbOverride: use for one-shot melodies that must not depend on main BGM tempo.
  function scheduleMelodicOscillatorAt(event, startTime, inst, peak, spbOverride) {
    const ctx = state.ctx;
    const spb = spbOverride != null ? spbOverride : secondsPerBeat();
    const noteSeconds = event.duration * spb;
    if (!(noteSeconds > 0)) return;

    const attack = Math.max(0, +inst.attack || 0);
    const gate = Math.max(0, +inst.gate || 0);
    const release = Math.max(0, +inst.release || 0);

    const attackEnd = startTime + Math.min(attack, noteSeconds * 0.5);
    const gateEnd = startTime + Math.max(attack, noteSeconds * gate);
    const releaseEnd = Math.min(startTime + noteSeconds, gateEnd + release);

    const osc = ctx.createOscillator();
    applyOscillatorWave(ctx, osc, inst);
    osc.frequency.setValueAtTime(midiToFreq(event.note), startTime);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(GAIN_FLOOR, startTime);
    if (peak > 0) {
      noteGain.gain.linearRampToValueAtTime(peak, attackEnd);
      noteGain.gain.setValueAtTime(peak, gateEnd);
      noteGain.gain.linearRampToValueAtTime(GAIN_FLOOR, releaseEnd);
    } else {
      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.setValueAtTime(0, releaseEnd);
    }

    const out = connectFilter(ctx, osc, inst.filter, startTime);
    out.connect(noteGain);
    noteGain.connect(state.bgmGain);
    startRegisteredSource(osc, noteGain, startTime, releaseEnd + 0.02);
  }

  function scheduleMelodicOscillatorVoice(event, startTime, inst, spbOverride) {
    const peak = peakVolume(+inst.volume || 0);
    scheduleMelodicOscillatorAt(event, startTime, inst, peak, spbOverride);

    // Optional one-shot echo: same voice, delayed start, quieter peak. Never echoes itself.
    const echo = inst.echo;
    if (!echo) return;
    const delaySec = Math.max(0, +echo.delaySec || 0);
    const volumeMul = Math.max(0, +echo.volumeMul || 0);
    scheduleMelodicOscillatorAt(
      event,
      startTime + delaySec,
      inst,
      peak * volumeMul,
      spbOverride
    );
  }

  /**
   * Schedule a non-looping melody from now (does not start main BGM transport / scheduler).
   * def: { bpm, instrument, notes: [{ beat, note, duration }, ...] }
   * Voices register into activeVoices so stop()/start() can cut them.
   */
  function playOneShotMelody(def) {
    if (!def || !state.ctx || !state.bgmGain) return;
    if (state.muted) return;

    if (state.ctx.state === 'suspended') {
      try { state.ctx.resume(); } catch (_e) { /* no-op */ }
    }

    const bpm = +def.bpm > 0 ? +def.bpm : 120;
    const spb = 60 / bpm;
    const inst = def.instrument || {};
    const notes = Array.isArray(def.notes) ? def.notes : [];
    const baseTime = state.ctx.currentTime;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (!n) continue;
      scheduleMelodicOscillatorVoice(
        {
          note: +n.note || 0,
          duration: Math.max(0, +n.duration || 0)
        },
        baseTime + (+n.beat || 0) * spb,
        inst,
        spb
      );
    }
  }

  function scheduleNoiseVoice(event, startTime, inst) {
    const ctx = state.ctx;
    const buf = ensureNoiseBuffer();
    if (!buf) return;

    const attack = Math.max(0, +inst.attack || 0);
    const hold = Math.max(0, +inst.hold || 0);
    const release = Math.max(0, +inst.release || 0);
    const peak = peakVolume(+inst.volume || 0);

    const attackEnd = startTime + attack;
    const holdEnd = attackEnd + hold;
    const releaseEnd = holdEnd + release;

    const source = ctx.createBufferSource();
    source.buffer = buf;

    const noteGain = ctx.createGain();
    applyGainEnvelope(noteGain, startTime, attackEnd, holdEnd, releaseEnd, peak);

    const out = connectFilter(ctx, source, inst.filter, startTime);
    out.connect(noteGain);
    noteGain.connect(state.bgmGain);
    startRegisteredSource(source, noteGain, startTime, releaseEnd + 0.02);
  }

  function scheduleSampleVoice(event, startTime, inst) {
    const ctx = state.ctx;
    if (!ctx || !state.bgmGain) return;

    const src = inst && inst.src;
    const buf = src ? sampleBufferCache.get(src) : null;
    if (!buf) {
      const fallback = (inst && inst.fallback) || {
        type: 'noise',
        volume: +inst.volume || 0,
        attack: 0.002,
        hold: 0.05,
        release: 0.02,
        filter: { type: 'lowpass', freq: 2800, q: 10 }
      };
      scheduleNoiseVoice(event, startTime, fallback);
      return;
    }

    const attack = SAMPLE_ATTACK_SEC;
    const release = SAMPLE_RELEASE_SEC;
    const peak = peakVolume(+inst.volume || 0);
    const playDur = Math.max(buf.duration, attack + release);
    const attackEnd = startTime + attack;
    const holdEnd = startTime + Math.max(attack, playDur - release);
    const releaseEnd = startTime + playDur;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.setValueAtTime(1, startTime);
    source.loop = false;

    const noteGain = ctx.createGain();
    applyGainEnvelope(noteGain, startTime, attackEnd, holdEnd, releaseEnd, peak);

    source.connect(noteGain);
    noteGain.connect(state.bgmGain);
    startRegisteredSource(source, noteGain, startTime, releaseEnd + 0.02);
  }

  function scheduleDrumOscillatorVoice(event, startTime, inst) {
    const ctx = state.ctx;
    const attack = Math.max(0, +inst.attack || 0);
    const hold = Math.max(0, +inst.hold || 0);
    const release = Math.max(0, +inst.release || 0);
    const peak = peakVolume(+inst.volume || 0);

    const attackEnd = startTime + attack;
    const holdEnd = attackEnd + hold;
    const releaseEnd = holdEnd + release;

    let freq = +inst.freq;
    let freqEnd = +inst.freqEnd;
    if (!(freq > 0)) freq = 110;
    if (!(freqEnd > 0)) freqEnd = 45;

    const osc = ctx.createOscillator();
    const wave = inst.wave || 'square';
    osc.type = OSC_WAVES.has(wave) ? wave : 'square';
    osc.frequency.setValueAtTime(freq, startTime);
    try {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, releaseEnd);
    } catch (_e) {
      osc.frequency.linearRampToValueAtTime(freqEnd, releaseEnd);
    }

    const noteGain = ctx.createGain();
    applyGainEnvelope(noteGain, startTime, attackEnd, holdEnd, releaseEnd, peak);

    const out = connectFilter(ctx, osc, inst.filter, startTime);
    out.connect(noteGain);
    noteGain.connect(state.bgmGain);
    startRegisteredSource(osc, noteGain, startTime, releaseEnd + 0.02);
  }

  function scheduleVoice(event, startTime) {
    const ctx = state.ctx;
    const song = state.song;
    if (!ctx || !song || !state.bgmGain) return;

    const track = song.tracks[event.trackIndex];
    if (!track) return;
    const inst = track.instrument || {};
    const type = inst.type || 'oscillator';

    if (type === 'sample') {
      scheduleSampleVoice(event, startTime, inst);
    } else if (type === 'noise') {
      scheduleNoiseVoice(event, startTime, inst);
    } else if (type === 'drumOscillator') {
      scheduleDrumOscillatorVoice(event, startTime, inst);
    } else {
      // Melodic oscillator (bass / lead). type omitted or 'oscillator'.
      scheduleMelodicOscillatorVoice(event, startTime, inst);
    }
  }

  function schedulerTick() {
    if (!state.playing || state.paused || !state.ctx || !state.song) return;
    const now = state.ctx.currentTime;
    const horizon = now + SCHEDULE_AHEAD_SEC;
    const spb = secondsPerBeat();
    const loopStart = loopStartBeat();
    const loopEnd = loopBeats();
    const loopLength = Math.max(0.0001, loopEnd - loopStart);

    // Safety: avoid unbounded catch-up if tab was suspended.
    let guard = 0;
    while (guard++ < 2048) {
      const list = state.inIntroPass ? state.events : state.loopEvents;
      if (!list.length) return;
      const event = list[state.nextEventIndex];
      let absoluteBeat;
      if (state.inIntroPass) {
        absoluteBeat = event.beat;
      } else {
        absoluteBeat =
          loopEnd +
          state.loopIteration * loopLength +
          (event.beat - loopStart);
      }
      const startTime = state.songStartTime + absoluteBeat * spb;
      if (startTime > horizon) break;
      if (startTime >= now - 0.001) {
        scheduleVoice(event, startTime);
      }
      state.nextEventIndex++;
      if (state.nextEventIndex >= list.length) {
        state.nextEventIndex = 0;
        if (state.inIntroPass) {
          state.inIntroPass = false;
          state.loopIteration = 0;
        } else {
          state.loopIteration++;
        }
      }
    }
  }

  function init(audioCtx, destinationNode) {
    if (!audioCtx || !destinationNode) return;
    state.ctx = audioCtx;
    state.destination = destinationNode;
    if (!state.bgmGain) {
      state.bgmGain = audioCtx.createGain();
      state.bgmGain.gain.value = state.muted ? 0 : DEFAULT_BGM_GAIN;
      state.bgmGain.connect(destinationNode);
    }
    ensureNoiseBuffer();
    if (state.song) preloadSongSamples(state.song);
  }

  function load(song) {
    if (!song) return;
    if (state.playing) stop();
    state.song = song;
    state.events = buildEvents(song);
    buildLoopEvents();
    resetTransport();
    preloadSongSamples(song);
  }

  function start() {
    if (!state.ctx || !state.song || !state.bgmGain) return;
    if (state.playing) return;

    if (state.ctx.state === 'suspended') {
      try { state.ctx.resume(); } catch (_e) { /* no-op */ }
    }

    // Clear leftover one-shot voices (e.g. result melody) before main transport.
    fadeOutAndStopVoices();

    ensureNoiseBuffer();
    state.playing = true;
    state.paused = false;
    state.inIntroPass = true;
    state.nextEventIndex = 0;
    state.loopIteration = 0;
    state.songStartTime = state.ctx.currentTime;
    clearScheduler();
    schedulerTick();
    state.schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  }

  function stop() {
    clearScheduler();
    fadeOutAndStopVoices();
    state.playing = false;
    state.paused = false;
    resetTransport();
  }

  function pause() {
    if (!state.playing || state.paused) return;
    if (!state.ctx || !state.song) return;

    const spb = secondsPerBeat();
    state.pausedAbsoluteBeat = Math.max(
      0,
      (state.ctx.currentTime - state.songStartTime) / spb
    );
    clearScheduler();
    fadeOutAndStopVoices();
    state.paused = true;
  }

  function resume() {
    if (!state.playing || !state.paused) return;
    if (!state.ctx || !state.song || !state.bgmGain) return;

    if (state.ctx.state === 'suspended') {
      try { state.ctx.resume(); } catch (_e) { /* no-op */ }
    }

    const beat = state.pausedAbsoluteBeat;
    const spb = secondsPerBeat();
    // Re-anchor songStartTime so absoluteBeat maps to "now".
    state.songStartTime = state.ctx.currentTime - beat * spb;
    seekTransportAfterAbsoluteBeat(beat);
    state.paused = false;
    clearScheduler();
    schedulerTick();
    state.schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  }

  function setMuted(muted) {
    state.muted = !!muted;
    const ctx = state.ctx;
    const t = ctx ? ctx.currentTime : 0;
    if (state.bgmGain) {
      state.bgmGain.gain.setValueAtTime(state.muted ? 0 : DEFAULT_BGM_GAIN, t);
    }
    // Zero in-flight note gains on mute so unmute cannot revive mid-note.
    if (state.muted) {
      state.activeVoices.forEach(function (voice) {
        try {
          const g = voice.gain.gain;
          g.cancelScheduledValues(t);
          g.setValueAtTime(0, t);
        } catch (_e) { /* already stopped */ }
      });
    }
  }

  function isPlaying() {
    return !!state.playing;
  }

  function isPaused() {
    return !!state.paused;
  }

  window.AR_BGM = {
    init: init,
    load: load,
    start: start,
    stop: stop,
    pause: pause,
    resume: resume,
    setMuted: setMuted,
    isPlaying: isPlaying,
    isPaused: isPaused,
    playOneShotMelody: playOneShotMelody
  };
})();
