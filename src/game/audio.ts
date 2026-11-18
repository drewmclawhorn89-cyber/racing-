import type { WeaponId } from './catalog';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;
  public volume = 0.7;

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainLevel = 0.22,
    delay = 0
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);

    const vol = Math.max(0.001, gainLevel * this.volume);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq: number, gainLevel = 0.25) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const length = Math.max(128, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.4));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, gainLevel * this.volume), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  public shoot(weapon: WeaponId) {
    switch (weapon) {
      case 'shotgun':
        this.playNoise(0.22, 1100, 0.36);
        this.playTone(170, 48, 0.18, 'sawtooth', 0.26);
        break;
      case 'sniper':
        this.playNoise(0.28, 2200, 0.4);
        this.playTone(320, 60, 0.25, 'sawtooth', 0.28);
        break;
      case 'smg':
        this.playNoise(0.07, 1900, 0.16);
        this.playTone(260, 120, 0.06, 'square', 0.12);
        break;
      case 'rifle':
        this.playNoise(0.11, 1700, 0.22);
        this.playTone(220, 85, 0.1, 'sawtooth', 0.16);
        break;
      case 'pistol':
      default:
        this.playNoise(0.09, 1500, 0.2);
        this.playTone(290, 110, 0.08, 'triangle', 0.18);
        break;
    }
  }

  public harvest(material: 'wood' | 'brick' | 'metal') {
    if (material === 'metal') {
      this.playTone(720, 480, 0.14, 'square', 0.16);
    } else if (material === 'brick') {
      this.playTone(240, 110, 0.11, 'triangle', 0.22);
      this.playNoise(0.06, 800, 0.16);
    } else {
      this.playTone(190, 80, 0.12, 'sine', 0.24);
      this.playNoise(0.05, 650, 0.12);
    }
  }

  public build() {
    this.playTone(320, 520, 0.08, 'triangle', 0.18);
    this.playTone(540, 680, 0.07, 'sine', 0.14, 0.04);
  }

  public pickup() {
    this.playTone(520, 780, 0.09, 'sine', 0.18);
  }

  public chest() {
    this.playTone(523, 659, 0.12, 'triangle', 0.2, 0);
    this.playTone(659, 784, 0.14, 'triangle', 0.2, 0.09);
    this.playTone(784, 1046, 0.2, 'sine', 0.22, 0.18);
  }

  public heal(isShield: boolean) {
    if (isShield) {
      this.playTone(380, 640, 0.16, 'sine', 0.18, 0);
      this.playTone(520, 880, 0.22, 'sine', 0.2, 0.12);
    } else {
      this.playTone(440, 660, 0.18, 'triangle', 0.18, 0);
      this.playTone(660, 880, 0.22, 'sine', 0.18, 0.1);
    }
  }

  public hitmarker() {
    this.playTone(1150, 780, 0.06, 'triangle', 0.18);
  }

  public elimination() {
    this.playTone(587, 880, 0.12, 'triangle', 0.22, 0);
    this.playTone(880, 1174, 0.18, 'sine', 0.24, 0.09);
  }

  public jump() {
    this.playTone(180, 340, 0.1, 'sine', 0.14);
  }

  public victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, n * 1.02, 0.28, 'triangle', 0.25, i * 0.12);
    });
  }
}

export const soundEngine = new SoundEngine();
