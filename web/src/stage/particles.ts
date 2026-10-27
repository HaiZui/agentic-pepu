import { gsap } from "gsap";
import type { MusicMood, SettingId } from "./types";

export type ParticlePreset = "snow" | "embers" | "ash" | "rain" | "wildfire" | "confetti" | "petals";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  spin: number;
  angle: number;
  color: string;
}

interface PresetSpec {
  /** Particles per second at full quality. */
  rate: number;
  spawn(w: number, h: number): Omit<Particle, "life" | "angle">;
  draw(ctx: CanvasRenderingContext2D, p: Particle): void;
  gravity: number;
  sway: number;
  lifetime: number;
}

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const dot = (ctx: CanvasRenderingContext2D, p: Particle, alpha = 1) => {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
};

const PRESETS: Record<ParticlePreset, PresetSpec> = {
  snow: {
    rate: 70,
    gravity: 0,
    sway: 30,
    lifetime: 16,
    spawn: (w) => ({ x: rand(-50, w + 50), y: -10, vx: rand(-15, 15), vy: rand(40, 90), size: rand(2, 6), spin: 0, color: "#f4f8ff" }),
    draw: (ctx, p) => dot(ctx, p, 0.9),
  },
  embers: {
    rate: 45,
    gravity: -12,
    sway: 40,
    lifetime: 6,
    spawn: (w, h) => ({ x: rand(0, w), y: h + 10, vx: rand(-20, 20), vy: rand(-140, -60), size: rand(1.5, 4), spin: 0, color: pick(["#ffb347", "#ff7b25", "#ffd36b"]) }),
    draw: (ctx, p) => dot(ctx, p, Math.min(1, p.life / 2)),
  },
  ash: {
    rate: 30,
    gravity: 6,
    sway: 25,
    lifetime: 12,
    spawn: (w) => ({ x: rand(0, w), y: -10, vx: rand(-10, 25), vy: rand(20, 45), size: rand(1.5, 3.5), spin: 0, color: pick(["#8a837c", "#5f574d", "#b0a89e"]) }),
    draw: (ctx, p) => dot(ctx, p, 0.7),
  },
  rain: {
    rate: 140,
    gravity: 0,
    sway: 0,
    lifetime: 2,
    spawn: (w) => ({ x: rand(-100, w), y: -20, vx: 160, vy: rand(900, 1200), size: rand(14, 26), spin: 0, color: "#a9c4ea" }),
    draw: (ctx, p) => {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.02, p.y - p.size);
      ctx.stroke();
    },
  },
  wildfire: {
    rate: 60,
    gravity: -30,
    sway: 60,
    lifetime: 4,
    spawn: (w, h) => ({ x: rand(0, w), y: h + 10, vx: rand(-30, 30), vy: rand(-220, -110), size: rand(2, 5), spin: 0, color: pick(["#7dff6a", "#3fd13a", "#c6ff9e"]) }),
    draw: (ctx, p) => {
      ctx.shadowColor = "#7dff6a";
      ctx.shadowBlur = 8;
      dot(ctx, p, Math.min(1, p.life));
      ctx.shadowBlur = 0;
    },
  },
  confetti: {
    rate: 110,
    gravity: 60,
    sway: 50,
    lifetime: 8,
    spawn: (w) => ({ x: rand(0, w), y: -20, vx: rand(-60, 60), vy: rand(80, 200), size: rand(6, 12), spin: rand(-6, 6), color: pick(["#c42a1f", "#efbd2e", "#21508f", "#2f6e3b", "#f2e4c4", "#d4a326"]) }),
    draw: (ctx, p) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    },
  },
  petals: {
    rate: 35,
    gravity: 10,
    sway: 70,
    lifetime: 12,
    spawn: (w) => ({ x: rand(-50, w), y: -20, vx: rand(10, 50), vy: rand(30, 70), size: rand(5, 9), spin: rand(-2, 2), color: pick(["#f2a7b8", "#e8789a", "#fbd3dc"]) }),
    draw: (ctx, p) => {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },
};

/** Particle presets for a scene: the setting decides, the music mood can add to it. */
export function presetsFor(setting: SettingId | null, mood: MusicMood | null, card?: string): ParticlePreset[] {
  const chosen = new Set<ParticlePreset>();
  if (card === "wildfire") chosen.add("wildfire");
  if (setting === "ice_wall" || mood === "winter") chosen.add("snow");
  if (setting === "battlefield" || mood === "battle") chosen.add("embers");
  if (setting === "dungeon" || mood === "dread") chosen.add("ash");
  if (setting === "harbor" || mood === "sorrow") chosen.add("rain");
  if (setting === "temple" && mood === "triumph") chosen.add("petals");
  return [...chosen].slice(0, 2);
}

const MAX_PARTICLES = 900;

/** Canvas particles driven by GSAP's ticker, so pause and speed apply to them too. */
export class Particles {
  private particles: (Particle & { preset: ParticlePreset })[] = [];
  private presets: ParticlePreset[] = [];
  private carry = new Map<ParticlePreset, number>();
  private ctx: CanvasRenderingContext2D | null;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private lastFrame = 0;
  /** 1 = full density; lowered automatically when the frame rate drops. */
  quality = 1;
  fps = 60;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    gsap.ticker.add(this.tick);
  }

  destroy(): void {
    gsap.ticker.remove(this.tick);
  }

  set(presets: ParticlePreset[], clear = false): void {
    this.presets = presets;
    if (clear) this.particles = [];
  }

  get active(): ParticlePreset[] {
    return [...this.presets];
  }

  get count(): number {
    return this.particles.length;
  }

  private tick = (_time: number, deltaMs: number): void => {
    this.monitor(deltaMs);
    const timeline = gsap.globalTimeline;
    if (timeline.paused() || !this.ctx) return;
    const dt = Math.min(deltaMs / 1000, 0.1) * timeline.timeScale();
    const { width, height } = this.canvas;

    for (const preset of this.presets) {
      const spec = PRESETS[preset];
      const due = (this.carry.get(preset) ?? 0) + spec.rate * this.quality * dt;
      const whole = Math.floor(due);
      this.carry.set(preset, due - whole);
      for (let i = 0; i < whole && this.particles.length < MAX_PARTICLES * this.quality; i++) {
        this.particles.push({ ...spec.spawn(width, height), life: spec.lifetime, angle: Math.random() * Math.PI, preset });
      }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    const t = performance.now() / 1000;
    this.particles = this.particles.filter((p) => {
      const spec = PRESETS[p.preset];
      p.life -= dt;
      p.vy += spec.gravity * dt;
      p.x += (p.vx + Math.sin(t * 1.3 + p.size * 7) * spec.sway * 0.4) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      if (p.life <= 0 || p.y > height + 40 || p.y < -60 || p.x < -150 || p.x > width + 150) return false;
      spec.draw(ctx, p);
      return true;
    });
    ctx.globalAlpha = 1;
  };

  /** Frame-rate watchdog: under 30 fps for two seconds halves the density step by step. */
  private monitor(deltaMs: number): void {
    const now = performance.now();
    if (deltaMs <= 0) return;
    this.fps = this.fps * 0.9 + (1000 / deltaMs) * 0.1;
    if (now - this.lastFrame > 500) {
      // Ignore gaps (tab hidden, breakpoints) rather than treating them as slow frames.
      this.lastFrame = now;
      return;
    }
    this.lastFrame = now;
    if (this.fps < 30) {
      this.fastSince = null;
      this.slowSince ??= now;
      if (now - this.slowSince > 2000) {
        this.quality = Math.max(0.15, this.quality * 0.7);
        this.slowSince = now;
      }
    } else if (this.fps > 50) {
      this.slowSince = null;
      this.fastSince ??= now;
      if (now - this.fastSince > 5000 && this.quality < 1) {
        this.quality = Math.min(1, this.quality + 0.1);
        this.fastSince = now;
      }
    } else {
      this.slowSince = null;
      this.fastSince = null;
    }
  }
}
