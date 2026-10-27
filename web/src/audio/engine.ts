/** Minimal slice of the Web Audio API the engine uses (a real AudioContext satisfies it; tests fake it). */
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  gain: ParamLike;
}

export interface SourceLike extends NodeLike {
  buffer: AudioBuffer | null;
  loop: boolean;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
}

export interface ContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  createDynamicsCompressor(): NodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

export const CROSSFADE_SECONDS = 2;
/** About -6 dB under dialogue. */
export const DUCK_GAIN = 0.5;
const DUCK_IN = 0.15;
const DUCK_OUT = 0.6;
const SILENCE_FADE = 0.08;
const SILENCE_RESTORE = 0.4;
export const VOLUME_STEP = 0.1;

interface MusicVoice {
  mood: string;
  source: SourceLike;
  gain: GainLike;
}

/** Ramp a gain from where it is now to `value`, replacing whatever was scheduled after `from`. */
function rampTo(param: ParamLike, value: number, from: number, seconds: number): void {
  param.cancelScheduledValues(from);
  param.setValueAtTime(param.value, from);
  param.linearRampToValueAtTime(value, from + seconds);
}

/**
 * Music and SFX buses on Web Audio:
 * music voices -> music -> duck -> silence -+-> master -> compressor -> speakers
 * sfx one-shots -> sfx ---------------------+
 * voice (reserved for narrated TTS, not connected yet)
 */
export class AudioEngine {
  readonly master: GainLike;
  readonly compressor: NodeLike;
  readonly music: GainLike;
  readonly duck: GainLike;
  readonly silence: GainLike;
  readonly sfx: GainLike;
  readonly voice: GainLike;
  private buffers = new Map<string, AudioBuffer>();
  private warned = new Set<string>();
  private current: MusicVoice | null = null;
  private wantedMood: string | null = null;
  private oneShots = new Set<SourceLike>();
  private _muted = false;
  private _volume = 0.8;
  /** True while files are still being fetched; a sound asked for meanwhile is skipped quietly. */
  loading = false;

  constructor(readonly context: ContextLike) {
    const c = context;
    this.master = c.createGain();
    this.compressor = c.createDynamicsCompressor();
    this.music = c.createGain();
    this.duck = c.createGain();
    this.silence = c.createGain();
    this.sfx = c.createGain();
    this.voice = c.createGain();
    this.music.connect(this.duck);
    this.duck.connect(this.silence);
    this.silence.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(c.destination);
    this.music.gain.value = 0.7;
    this.applyVolume(0);
  }

  get now(): number {
    return this.context.currentTime;
  }

  get mood(): string | null {
    return this.current?.mood ?? null;
  }

  get muted(): boolean {
    return this._muted;
  }

  get volume(): number {
    return this._volume;
  }

  get playing(): number {
    return this.oneShots.size;
  }

  has(key: string): boolean {
    return this.buffers.has(key);
  }

  addBuffer(key: string, buffer: AudioBuffer): void {
    this.buffers.set(key, buffer);
    // The overture may be requested before its file has finished decoding.
    if (this.wantedMood && key === `music/${this.wantedMood}` && !this.current) this.setMood(this.wantedMood);
  }

  private missing(key: string): void {
    if (this.loading || this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`Audio asset "${key}" is not available; continuing without it`);
  }

  /** Crossfade to the loop for `mood`; the same mood keeps playing untouched. */
  setMood(mood: string): void {
    this.wantedMood = mood;
    if (this.current?.mood === mood) return;
    const buffer = this.buffers.get(`music/${mood}`);
    const t = this.now;
    const old = this.current;
    if (old) {
      rampTo(old.gain.gain, 0, t, CROSSFADE_SECONDS);
      old.source.stop(t + CROSSFADE_SECONDS + 0.05);
      this.current = null;
    }
    if (!buffer) return this.missing(`music/${mood}`);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + (old ? CROSSFADE_SECONDS : 0.6));
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.music);
    source.start(t);
    source.onended = () => gain.disconnect();
    this.current = { mood, source, gain };
  }

  /** Fade the music out (leaving the show page). */
  stopMusic(seconds = 0.8): void {
    this.wantedMood = null;
    const old = this.current;
    this.current = null;
    if (!old) return;
    rampTo(old.gain.gain, 0, this.now, seconds);
    old.source.stop(this.now + seconds + 0.05);
  }

  /** Lower the music about 6 dB while dialogue is on screen. */
  setDucked(on: boolean): void {
    rampTo(this.duck.gain, on ? DUCK_GAIN : 1, this.now, on ? DUCK_IN : DUCK_OUT);
  }

  /** One-shot sound `delay` seconds from now; with `preSilenceMs`, the music falls silent before it. */
  play(key: string, delay = 0, options: { preSilenceMs?: number } = {}): void {
    const buffer = this.buffers.get(key);
    if (!buffer) return this.missing(key);
    const when = this.now + Math.max(0, delay);
    if (options.preSilenceMs) this.silenceBefore(when, options.preSilenceMs / 1000);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfx);
    source.onended = () => {
      this.oneShots.delete(source);
      source.disconnect();
    };
    this.oneShots.add(source);
    source.start(when);
  }

  private silenceBefore(impact: number, seconds: number): void {
    const param = this.silence.gain;
    const cut = Math.max(this.now, impact - seconds);
    param.cancelScheduledValues(this.now);
    param.setValueAtTime(param.value, cut);
    param.linearRampToValueAtTime(0, cut + SILENCE_FADE);
    param.setValueAtTime(0, impact);
    param.linearRampToValueAtTime(1, impact + SILENCE_RESTORE);
  }

  /** Drop every one-shot and pending automation from content the presenter skipped past. */
  stopOneShots(): void {
    for (const source of this.oneShots) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.oneShots.clear();
    rampTo(this.silence.gain, 1, this.now, 0.05);
    rampTo(this.duck.gain, 1, this.now, 0.1);
  }

  suspend(): void {
    if (this.context.state === "running") void this.context.suspend();
  }

  resume(): void {
    if (this.context.state === "suspended") void this.context.resume();
  }

  private applyVolume(seconds = 0.05): void {
    rampTo(this.master.gain, this._muted ? 0 : this._volume, this.now, seconds);
  }

  toggleMute(): void {
    this._muted = !this._muted;
    this.applyVolume();
  }

  changeVolume(direction: 1 | -1): void {
    this._volume = Math.round(Math.min(1, Math.max(0, this._volume + direction * VOLUME_STEP)) * 10) / 10;
    if (this._muted && direction > 0) this._muted = false;
    this.applyVolume();
  }
}
