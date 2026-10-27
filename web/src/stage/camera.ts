import { gsap } from "gsap";
import { cameraFor, STAGE_H, STAGE_W, type ViewBox } from "../shared/panels";
import { BLEED } from "../render";

/** How strongly each layer follows the camera: far scenery drifts less, the front layer more. */
export const PARALLAX = { back: 0.3, mid: 0.6, crowd: 0.8, puppets: 1, particles: 0.9, front: 1.3 } as const;

interface Target {
  element: HTMLElement | SVGElement;
  factor: number;
  world: boolean;
}

/** A theater camera: push-ins, pans and shakes applied to every layer with its own parallax factor. */
export class Camera {
  readonly view = { cx: STAGE_W / 2, cy: STAGE_H / 2, zoom: 1, shakeX: 0, shakeY: 0 };
  private targets: Target[] = [];
  private listeners: (() => void)[] = [];

  add(element: HTMLElement | SVGElement, factor: number, world = true): void {
    this.targets.push({ element, factor, world });
    element.style.transformOrigin = `${STAGE_W / 2 + (world ? BLEED : 0)}px ${STAGE_H / 2}px`;
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  apply = (): void => {
    const v = this.view;
    for (const t of this.targets) {
      const zoom = 1 + (v.zoom - 1) * t.factor;
      const dx = (STAGE_W / 2 - v.cx) * t.factor + v.shakeX * t.factor;
      const dy = (STAGE_H / 2 - v.cy) * t.factor + v.shakeY * t.factor;
      t.element.style.transform = `scale(${zoom.toFixed(4)}) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    for (const listener of this.listeners) listener();
  };

  /** Stage coordinates of a point on the puppet layer, as seen through the camera. */
  toScreen(x: number, y: number): { x: number; y: number } {
    const v = this.view;
    return {
      x: STAGE_W / 2 + v.zoom * (x - v.cx + v.shakeX),
      y: STAGE_H / 2 + v.zoom * (y - v.cy + v.shakeY),
    };
  }

  set(view: ViewBox | null): void {
    Object.assign(this.view, view ? cameraFor(view) : { cx: STAGE_W / 2, cy: STAGE_H / 2, zoom: 1 }, { shakeX: 0, shakeY: 0 });
    this.apply();
  }

  moveTo(tl: gsap.core.Timeline, at: number, view: ViewBox | null, duration = 0.9, ease = "power2.inOut"): void {
    const target = view ? cameraFor(view) : { cx: STAGE_W / 2, cy: STAGE_H / 2, zoom: 1 };
    tl.to(this.view, { ...target, duration, ease, onUpdate: this.apply }, at);
  }

  shake(tl: gsap.core.Timeline, at: number, strength = 14, duration = 0.45): void {
    const steps = 6;
    const shake = gsap.timeline();
    for (let i = 0; i < steps; i++) {
      const fade = 1 - i / steps;
      shake.to(this.view, {
        shakeX: (i % 2 ? -1 : 1) * strength * fade,
        shakeY: (i % 3 ? 1 : -1) * strength * 0.6 * fade,
        duration: duration / (steps + 1),
        ease: "none",
        onUpdate: this.apply,
      });
    }
    shake.to(this.view, { shakeX: 0, shakeY: 0, duration: duration / (steps + 1), onUpdate: this.apply });
    tl.add(shake, at);
  }
}
