// src/game/audio.ts
class TinyAudio {
  ctx: AudioContext | null = null;
  gainMaster: GainNode | null = null;
  layers: { osc: OscillatorNode; gain: GainNode }[] = [];
  tier: number = -1;

  ensureCtx() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.gainMaster = master;

    const freqs = [80, 110, 220, 440];
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : i === 1 ? "sawtooth" : i === 2 ? "sine" : "square";
      osc.frequency.value = freqs[i];
      const g = ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(g).connect(master);
      osc.start();
      this.layers.push({ osc, gain: g });
    }
  }

  setTier(tier: number) {
    this.ensureCtx();
    if (!this.ctx || !this.gainMaster) return;
    if (this.tier === -1) {
      this.gainMaster.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gainMaster.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.2);
    }
    this.tier = tier;
    const targetGains = [0.05, 0.08, 0.08, 0.06].map((g, i) => (tier >= i ? g : 0));
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.layers.length; i++) {
      const lg = this.layers[i].gain.gain;
      lg.cancelScheduledValues(now);
      lg.linearRampToValueAtTime(targetGains[i], now + 0.25);
    }
  }
}

export const audioEngine = new TinyAudio();
