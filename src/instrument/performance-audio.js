import * as Tone from "tone";
import { clamp } from "./performance-controls.js";

const PRESETS = {
  synth: {
    name: "Synth",
    create: () => new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", rolloff: -24, Q: 2 },
      envelope: { attack: 0.025, decay: 0.16, sustain: 0.55, release: 0.32 },
      filterEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.3, baseFrequency: 180, octaves: 4 },
    }),
  },
  violin: {
    name: "Violin-style",
    create: () => new Tone.FMSynth({
      harmonicity: 1.7,
      modulationIndex: 2.8,
      oscillator: { type: "sine" },
      modulation: { type: "triangle" },
      envelope: { attack: 0.16, decay: 0.18, sustain: 0.78, release: 0.75 },
      modulationEnvelope: { attack: 0.08, decay: 0.25, sustain: 0.45, release: 0.5 },
    }),
  },
  pad: {
    name: "Pad",
    create: () => new Tone.AMSynth({
      harmonicity: 0.75,
      oscillator: { type: "sine" },
      modulation: { type: "sine" },
      envelope: { attack: 0.55, decay: 0.3, sustain: 0.82, release: 1.6 },
      modulationEnvelope: { attack: 0.45, decay: 0.25, sustain: 0.6, release: 1.2 },
    }),
  },
  bass: {
    name: "Bass",
    create: () => new Tone.MonoSynth({
      oscillator: { type: "square" },
      filter: { type: "lowpass", rolloff: -24, Q: 3 },
      envelope: { attack: 0.018, decay: 0.2, sustain: 0.58, release: 0.34 },
      filterEnvelope: { attack: 0.01, decay: 0.24, sustain: 0.2, release: 0.28, baseFrequency: 65, octaves: 3.2 },
    }),
  },
};

function getRealtimeAudioContext() {
  return /** @type {AudioContext} */ (Tone.getContext().rawContext);
}

export function createPerformanceAudioEngine({ initialVolume = -8 } = {}) {
  let voice;
  let expressionGain;
  let filter;
  let vibrato;
  let delay;
  let reverb;
  let compressor;
  let limiter;
  let master;
  let recordingDestination;
  let started = false;
  let active = false;
  let currentNote;
  let presetId = "synth";
  let overrideUntil = 0;
  let restoreTimer;
  let latestExpression = { cutoff: 1800, space: 0.2, intensity: 0.72, vibrato: 0.08 };

  function ensureStarted() {
    if (!started || !expressionGain || !filter || !vibrato || !delay || !reverb || !master) {
      throw new Error("Start audio before controlling the performance engine.");
    }
  }

  function createVoice() {
    const preset = PRESETS[presetId] ?? PRESETS.synth;
    voice = preset.create().connect(expressionGain);
  }

  function applyExpression(expression, ramp = 0.08) {
    if (!started || !expressionGain || !filter || !vibrato || !delay || !reverb) return;
    const cutoff = clamp(expression.cutoff, 250, 9000);
    const space = clamp(expression.space);
    const intensity = clamp(expression.intensity);
    const vibratoAmount = clamp(expression.vibrato);
    filter.frequency.rampTo(cutoff, ramp);
    filter.Q.rampTo(0.8 + intensity * 5.2, ramp);
    expressionGain.gain.rampTo(0.08 + intensity * 0.92, ramp);
    vibrato.depth.rampTo(vibratoAmount * 0.35, ramp);
    vibrato.frequency.rampTo(4.2 + vibratoAmount * 2.8, ramp);
    delay.wet.rampTo(space * 0.34, ramp);
    delay.feedback.rampTo(0.08 + space * 0.38, ramp);
    reverb.wet.rampTo(0.08 + space * 0.62, ramp);
  }

  function scheduleRestore(milliseconds) {
    if (restoreTimer) globalThis.clearTimeout(restoreTimer);
    restoreTimer = globalThis.setTimeout(() => {
      overrideUntil = 0;
      applyExpression(latestExpression, 0.2);
    }, milliseconds);
  }

  return {
    async start() {
      if (started) return;
      await Tone.start();
      expressionGain = new Tone.Gain(0.72);
      filter = new Tone.Filter({ frequency: 1800, type: "lowpass", rolloff: -24, Q: 1.5 });
      vibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.04, wet: 1 });
      delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.16, wet: 0.08 });
      reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 0.2 });
      compressor = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.01, release: 0.18 });
      limiter = new Tone.Limiter(-1);
      master = new Tone.Volume(initialVolume);
      recordingDestination = getRealtimeAudioContext().createMediaStreamDestination();
      expressionGain.chain(filter, vibrato, delay, reverb, compressor, limiter, master);
      master.connect(Tone.getDestination());
      master.connect(recordingDestination);
      started = true;
      createVoice();
      applyExpression(latestExpression, 0.01);
    },

    setPreset(nextPreset) {
      if (!(nextPreset in PRESETS)) return;
      if (nextPreset === presetId && voice) return;
      const note = currentNote;
      const wasActive = active;
      voice?.triggerRelease?.();
      voice?.dispose?.();
      presetId = nextPreset;
      if (started) {
        createVoice();
        if (wasActive && note) voice?.triggerAttack?.(note, Tone.now(), latestExpression.intensity);
      }
    },

    attack(note, intensity = latestExpression.intensity) {
      ensureStarted();
      if (active && currentNote === note) return;
      if (active) voice?.triggerRelease?.();
      currentNote = note;
      active = true;
      voice?.triggerAttack?.(note, Tone.now(), clamp(intensity, 0.05, 1));
    },

    setNote(note) {
      if (!started || !active || !voice || note === currentNote) return;
      currentNote = note;
      if (typeof voice.setNote === "function") voice.setNote(note, 0.06);
      else {
        voice.triggerRelease?.();
        voice.triggerAttack?.(note, Tone.now(), latestExpression.intensity);
      }
    },

    release() {
      if (!started || !active) return;
      voice?.triggerRelease?.();
      active = false;
      currentNote = undefined;
    },

    setExpression(expression) {
      latestExpression = {
        cutoff: clamp(expression.cutoff, 250, 9000),
        space: clamp(expression.space),
        intensity: clamp(expression.intensity),
        vibrato: clamp(expression.vibrato),
      };
      if (performance.now() >= overrideUntil) applyExpression(latestExpression);
    },

    triggerRiser() {
      if (!started || !filter || !expressionGain || !delay || !reverb || !vibrato) return;
      overrideUntil = performance.now() + 720;
      filter.frequency.rampTo(9000, 0.5);
      filter.Q.rampTo(8.5, 0.42);
      expressionGain.gain.rampTo(1, 0.45);
      vibrato.depth.rampTo(0.24, 0.45);
      delay.wet.rampTo(0.46, 0.5);
      reverb.wet.rampTo(0.72, 0.52);
      scheduleRestore(720);
    },

    triggerDrop() {
      if (!started || !filter || !expressionGain || !delay || !reverb) return;
      overrideUntil = performance.now() + 520;
      filter.frequency.rampTo(280, 0.18);
      filter.Q.rampTo(5, 0.16);
      expressionGain.gain.rampTo(0.12, 0.2);
      delay.wet.rampTo(0.4, 0.12);
      reverb.wet.rampTo(0.68, 0.12);
      scheduleRestore(520);
    },

    setMasterVolume(decibels) {
      master?.volume.rampTo(clamp(decibels, -30, 0), 0.08);
    },

    connectExternalStream(stream) {
      ensureStarted();
      const source = getRealtimeAudioContext().createMediaStreamSource(stream);
      source.connect(recordingDestination);
      return () => source.disconnect();
    },

    getRecordingStream() {
      return recordingDestination?.stream;
    },

    get preset() {
      return presetId;
    },

    get presetName() {
      return (PRESETS[presetId] ?? PRESETS.synth).name;
    },

    get isStarted() {
      return started;
    },

    dispose() {
      if (restoreTimer) globalThis.clearTimeout(restoreTimer);
      voice?.triggerRelease?.();
      voice?.dispose?.();
      expressionGain?.dispose?.();
      filter?.dispose?.();
      vibrato?.dispose?.();
      delay?.dispose?.();
      reverb?.dispose?.();
      compressor?.dispose?.();
      limiter?.dispose?.();
      master?.dispose?.();
      started = false;
      active = false;
    },
  };
}