/**
 * Procedural Web Audio API sound synthesizer for Oracle Arena.
 * Zero external audio dependencies; respects mute toggle and browser autoplay policy.
 */

type SoundCue =
  | 'select'
  | 'attack'
  | 'heavy'
  | 'heal'
  | 'shield'
  | 'guard'
  | 'ko'
  | 'victory'
  | 'defeat';

class ArenaSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined' || this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public play(cue: SoundCue): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    switch (cue) {
      case 'select':
        this.tone(ctx, 'triangle', 520 * pitchJitter, 660 * pitchJitter, now, 0.06, 0.08);
        break;
      case 'attack':
        this.tone(ctx, 'sawtooth', 260 * pitchJitter, 110, now, 0.13, 0.12);
        this.tone(ctx, 'triangle', 480 * pitchJitter, 220, now, 0.09, 0.08);
        break;
      case 'heavy':
        this.tone(ctx, 'sawtooth', 165 * pitchJitter, 58, now, 0.24, 0.16);
        this.tone(ctx, 'sine', 340 * pitchJitter, 95, now + 0.03, 0.2, 0.12);
        break;
      case 'heal':
        this.tone(ctx, 'sine', 440, 554, now, 0.16, 0.09);
        this.tone(ctx, 'sine', 554, 659, now + 0.08, 0.2, 0.09);
        break;
      case 'shield':
        this.tone(ctx, 'triangle', 392, 587, now, 0.14, 0.1);
        this.tone(ctx, 'sine', 784, 880, now + 0.05, 0.16, 0.07);
        break;
      case 'guard':
        this.tone(ctx, 'square', 220, 294, now, 0.1, 0.07);
        this.tone(ctx, 'triangle', 440, 330, now + 0.04, 0.12, 0.07);
        break;
      case 'ko':
        this.tone(ctx, 'sawtooth', 180, 48, now, 0.35, 0.16);
        this.tone(ctx, 'triangle', 260, 82, now + 0.06, 0.32, 0.12);
        break;
      case 'victory':
        this.tone(ctx, 'triangle', 392, 392, now, 0.14, 0.11);
        this.tone(ctx, 'triangle', 494, 494, now + 0.12, 0.14, 0.11);
        this.tone(ctx, 'triangle', 587, 587, now + 0.24, 0.16, 0.12);
        this.tone(ctx, 'sine', 784, 784, now + 0.38, 0.42, 0.14);
        break;
      case 'defeat':
        this.tone(ctx, 'triangle', 330, 294, now, 0.2, 0.11);
        this.tone(ctx, 'triangle', 262, 220, now + 0.18, 0.24, 0.11);
        this.tone(ctx, 'sine', 196, 146, now + 0.4, 0.45, 0.13);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const soundEngine = new ArenaSoundEngine();
