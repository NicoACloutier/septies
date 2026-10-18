// A small pipe-organ voice on the Web Audio API: additive "drawbar" harmonics
// (8', 4', 2 2/3', 2' …), a slightly detuned second rank for warmth, a soft 16'
// sub-octave, and a synthetic church reverb.
//
// Each phrase (from bar to bar) is played legato by one continuous voice: the
// pitch slides from note to note (a short portamento), and a repeated pitch is
// re-articulated with a shallow, rounded dip in volume rather than a new attack,
// so recitation flows. Each phrase swells in, the tone opening from dark to bright
// as the wind fills the pipes.

export interface PhraseNote {
  midi: number;
  /** AudioContext time. */
  start: number;
  duration: number;
  /** Loudness, 0–1. */
  level: number;
}

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Organ {
  readonly ctx: AudioContext;
  private input!: GainNode;
  private output!: AudioNode;
  private wave: PeriodicWave;
  private room: AudioBuffer;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    const ctx = this.ctx;

    // Fourier series of the principal stop: fundamental plus decaying upper partials.
    const real = new Float32Array([0, 1, 0.5, 0.28, 0.2, 0.07, 0.09, 0.03, 0.05]);
    this.wave = ctx.createPeriodicWave(real, new Float32Array(real.length));
    this.room = this.impulse(3.8, 3);
    this.buildChain();
  }

  /**
   * Discards all sound in the effects (the reverb's tail included) by replacing
   * them. Used when stopping while paused: the suspended context still holds the
   * sound of that moment, which would otherwise play out once it runs again.
   */
  flush(): void {
    this.output.disconnect();
    this.buildChain();
  }

  /** Tone filter, dry and reverberated paths, master volume and limiter. */
  private buildChain(): void {
    const ctx = this.ctx;
    this.input = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3600;

    const dry = ctx.createGain();
    dry.gain.value = 0.65;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.room;

    const master = ctx.createGain();
    master.gain.value = 0.22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 6;

    this.input.connect(tone);
    tone.connect(dry).connect(master);
    tone.connect(reverb).connect(wet).connect(master);
    master.connect(limiter).connect(ctx.destination);
    this.output = limiter;
  }

  /** A fresh bus for one run of playback, so it can be faded out at once. */
  createBus(): GainNode {
    const bus = this.ctx.createGain();
    bus.connect(this.input);
    return bus;
  }

  /** Schedules one legato phrase. */
  phrase(bus: AudioNode, notes: PhraseNote[]): void {
    if (!notes.length) return;
    const ctx = this.ctx;
    const first = notes[0];
    const last = notes[notes.length - 1];
    const end = last.start + last.duration;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, first.start);
    // Slow, soft onset: the wind fills the pipe over ~0.3 s.
    env.gain.setTargetAtTime(first.level, first.start, 0.1);
    env.connect(bus);

    // The pipe "speaks" gradually: its upper partials bloom in after the fundamental.
    const voice = ctx.createBiquadFilter();
    voice.type = 'lowpass';
    voice.Q.value = 0.5;
    voice.frequency.setValueAtTime(500, first.start);
    voice.frequency.setTargetAtTime(6000, first.start + 0.03, 0.15);
    voice.connect(env);

    // Principal, a celeste rank a few cents sharp, and a quiet 16' bourdon.
    const ranks: [OscillatorNode, number][] = [];
    const rank = (wave: PeriodicWave | 'sine', octave: number, detune: number, gain: number) => {
      const osc = ctx.createOscillator();
      if (wave === 'sine') osc.type = 'sine';
      else osc.setPeriodicWave(wave);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(voice);
      ranks.push([osc, octave]);
    };
    rank(this.wave, 1, 0, 0.8);
    rank(this.wave, 1, 4, 0.3);
    rank('sine', 0.5, 0, 0.3);

    for (const [osc, octave] of ranks) osc.frequency.setValueAtTime(midiToFreq(first.midi) * octave, first.start);

    for (let i = 1; i < notes.length; i++) {
      const n = notes[i];
      const prev = notes[i - 1];
      if (n.midi === prev.midi) {
        // Same pitch again: a rounded dip marks the syllable without an attack.
        env.gain.setTargetAtTime(n.level * 0.52, n.start - 0.08, 0.028);
        env.gain.setTargetAtTime(n.level, n.start - 0.005, 0.045);
      } else {
        // New pitch: a gentle portamento that begins just before the note, legato.
        const f = midiToFreq(n.midi);
        for (const [osc, octave] of ranks) osc.frequency.setTargetAtTime(f * octave, n.start - 0.028, 0.021);
        env.gain.setTargetAtTime(n.level, n.start - 0.015, 0.07);
      }
    }

    // Release into the breath at the bar.
    env.gain.setTargetAtTime(0, end - 0.06, 0.12);
    const stop = end + 0.9;
    for (const [osc] of ranks) {
      osc.start(first.start);
      osc.stop(stop);
    }
    ranks[0][0].onended = () => {
      voice.disconnect();
      env.disconnect();
    };
  }

  /** Stereo impulse response: decaying noise, like a stone nave. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
    return buffer;
  }
}
