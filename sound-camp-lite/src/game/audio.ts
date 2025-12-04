// src/game/audio.ts

export type AmbientParams = {
  vibe: number;
  noise: number;
  crowd: number;
  musicLevel: number; // derived from powered speakers near decks
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

class TinyAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;

  crowdGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  genGain: GainNode | null = null;
  sfxGain: GainNode | null = null;

  noiseSource: AudioBufferSourceNode | null = null;
  musicOscs: OscillatorNode[] = [];
  genOscs: OscillatorNode[] = [];

  hasInit = false;

  // track whether at least one running generator is low on fuel
  private genLowFuel = false;

  ensureCtx() {
    if (this.ctx) return;

    const AC: typeof AudioContext | undefined =
      window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    // Mixer busses
    const crowdGain = ctx.createGain();
    const musicGain = ctx.createGain();
    const genGain = ctx.createGain();
    const sfxGain = ctx.createGain();

    crowdGain.gain.value = 0.0;
    musicGain.gain.value = 0;
    genGain.gain.value = 0;
    sfxGain.gain.value = 0.8;

    crowdGain.connect(master);
    musicGain.connect(master);
    genGain.connect(master);
    sfxGain.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.crowdGain = crowdGain;
    this.musicGain = musicGain;
    this.genGain = genGain;
    this.sfxGain = sfxGain;

    this.initNoiseBed();
    this.initMusicBed();
    this.initGenHum();
  }

  // ---------------------------------------------------------------
  // Beds
  // ---------------------------------------------------------------

  private initNoiseBed() {
    if (!this.ctx || !this.crowdGain) return;
    const ctx = this.ctx;

    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // slightly “crowd-ish” noise (a bit filtered)
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.4;

    src.connect(filter).connect(this.crowdGain!);
    src.start();

    this.noiseSource = src;
  }

  private initMusicBed() {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // simple 3-note chord, 8-bit-ish
    const freqs = [110, 220, 330];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;

      const g = ctx.createGain();
      g.gain.value = 0.5; // IMPORTANT: non-zero so music can be heard

      // slow filter to keep it from being too harsh
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1200;

      osc.connect(g).connect(filter).connect(this.musicGain!);
      osc.start();
      this.musicOscs.push(osc);

      // small LFO-ish wiggle
      const base = f;
      const spread = f * 0.02;
      let t = 0;
      const step = () => {
        if (!this.ctx) return;
        t += 0.15;
        const w = base + Math.sin(t) * spread;
        try {
          osc.frequency.linearRampToValueAtTime(
            w,
            this.ctx.currentTime + 0.14
          );
        } catch {
          /* ignore */
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  private initGenHum() {
    if (!this.ctx || !this.genGain) return;
    const ctx = this.ctx;

    // Deeper generator hum
    const baseFreqs = [40, 80];
    for (const f of baseFreqs) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;

      const g = ctx.createGain();
      g.gain.value = 0.6;

      osc.connect(g).connect(this.genGain!);
      osc.start();
      this.genOscs.push(osc);
    }

    // Start fully silent – setGeneratorState() will decide the volume.
    this.genGain.gain.value = 0;

    // subtle wobble / sputter depending on fuel state
    const wobble = () => {
      if (!this.ctx || !this.genGain) return;
      const now = this.ctx.currentTime;
      const current = this.genGain.gain.value;

      // if we're effectively silent (no generators running), don't do anything
      if (current <= 0.0001) {
        requestAnimationFrame(wobble);
        return;
      }

      let level = current;

      if (this.genLowFuel) {
        // LOW FUEL: choppy "vrr... vrr... vrr..."
        // ~2.2 Hz chopper: on ~40% of the time
        const phase = (now * 2.2) % 1; // 0..1
        const chop = phase < 0.4 ? 1.0 : 0.15;
        level = current * chop;
      } else {
        // NORMAL: gentle wobble, more like a steady hum
        const wobbleFactor = 0.9 + 0.1 * Math.sin(now * 0.8 + 1.7);
        level = current * wobbleFactor;
      }

      const target = clamp(level, 0, 0.6);

      try {
        this.genGain.gain.cancelScheduledValues(now);
        this.genGain.gain.linearRampToValueAtTime(target, now + 0.3);
      } catch {
        /* ignore */
      }

      requestAnimationFrame(wobble);
    };

    requestAnimationFrame(wobble);
  }

  // ---------------------------------------------------------------
  // Ambient mix
  // ---------------------------------------------------------------

  updateAmbient(params: AmbientParams) {
    this.ensureCtx();
    if (!this.ctx || !this.crowdGain || !this.musicGain) return;

    const { crowd, musicLevel } = params;
    const now = this.ctx.currentTime;

    // crowd 0..500 → gain 0..~0.25
    const targetCrowdGain = clamp(crowd / 400, 0, 1) * 0.45;
    this.crowdGain.gain.cancelScheduledValues(now);
    this.crowdGain.gain.linearRampToValueAtTime(
      targetCrowdGain,
      now + 0.25
    );

    // musicLevel is proportional to "powered speakers near decks"
    // We'll treat ~20 as "full" for now
    const normMusic = clamp(musicLevel / 4, 0, 1);
    const targetMusicGain = normMusic * 0.08;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.linearRampToValueAtTime(
      targetMusicGain,
      now + 0.25
    );
  }

  // runningCount = how many generators are on
  // minFuelRatio = 0..1 (lowest fuel % among running gens)
  setGeneratorState(
    runningCount: number,
    minFuelRatio: number | null
  ) {
    this.ensureCtx();
    if (!this.ctx || !this.genGain) return;

    const now = this.ctx.currentTime;

    if (runningCount <= 0) {
      // no gens: silent and not "low fuel"
      this.genLowFuel = false;
      this.genGain.gain.cancelScheduledValues(now);
      this.genGain.gain.linearRampToValueAtTime(0, now + 0.3);
      return;
    }

    // Base volume scales with number of running generators
    const base = 0.05 + 0.04 * runningCount;
    const clampedBase = clamp(base, 0, 0.25);

    // LOW FUEL: do NOT boost volume – keep it softer;
    // wobble() handles the choppy sputter pattern.
    const isLow = minFuelRatio != null && minFuelRatio < 0.25;
    const target = isLow ? clampedBase * 0.7 : clampedBase;

    this.genLowFuel = isLow;

    this.genGain.gain.cancelScheduledValues(now);
    this.genGain.gain.linearRampToValueAtTime(
      target,
      now + 0.25
    );
  }

  // ---------------------------------------------------------------
  // One-shot SFX
  // ---------------------------------------------------------------

  private oneShot(opts: {
    freqStart: number;
    freqEnd?: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
  }) {
    this.ensureCtx();
    if (!this.ctx || !this.sfxGain) return;

    const {
      freqStart,
      freqEnd,
      duration,
      type = "square",
      gain = 0.3,
    } = opts;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freqStart;
    g.gain.value = gain;

    osc.connect(g).connect(this.sfxGain);

    const now = ctx.currentTime;
    if (freqEnd != null) {
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.linearRampToValueAtTime(
        freqEnd,
        now + duration
      );
    }

    g.gain.setValueAtTime(gain, now);
    g.gain.linearRampToValueAtTime(0, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // ---------------------------------------------------------------
  // Public SFX helpers
  // ---------------------------------------------------------------

  playPlace(kind: string) {
    // slightly different pitch per item
    const base =
      kind === "genny"
        ? 220
        : kind.startsWith("speaker")
        ? 330
        : kind === "deck"
        ? 440
        : 300;
    this.oneShot({
      freqStart: base,
      freqEnd: base * 1.2,
      duration: 0.12,
      gain: 0.2,
      type: "triangle",
    });
  }

  playRemove() {
    this.oneShot({
      freqStart: 180,
      freqEnd: 120,
      duration: 0.15,
      gain: 0.25,
      type: "square",
    });
  }

  playGenToggle(on: boolean) {
    if (on) {
      this.oneShot({
        freqStart: 260,
        freqEnd: 520,
        duration: 0.18,
        gain: 0.25,
        type: "sawtooth",
      });
    } else {
      this.oneShot({
        freqStart: 220,
        freqEnd: 160,
        duration: 0.12,
        gain: 0.18,
        type: "triangle",
      });
    }
  }

  playGoalComplete() {
    this.oneShot({
      freqStart: 660,
      freqEnd: 990,
      duration: 0.2,
      gain: 0.3,
      type: "square",
    });
  }

  playGoalFail() {
    this.oneShot({
      freqStart: 330,
      freqEnd: 110,
      duration: 0.3,
      gain: 0.3,
      type: "sawtooth",
    });
  }
}

export const audioEngine = new TinyAudio();
