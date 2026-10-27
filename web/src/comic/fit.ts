/** Balloon fitting: shrink the lettering up to two steps, then widen the text column, never clip. */

export const FONT_STEPS = [1, 0.88, 0.76] as const;
const EMERGENCY_STEPS = [0.68, 0.6, 0.54] as const;
export const WIDTHS = ["66%", "100%"] as const;
const SLACK = 6;

export interface FitResult {
  fits: boolean;
  scale: number;
  width: string;
}

function overflows(panel: HTMLElement, column: HTMLElement): boolean {
  if (column.scrollHeight > panel.clientHeight - SLACK) return true;
  // A long word (a name) must not poke out sideways; the balloon tail may hang below on purpose.
  for (const child of column.children) {
    const el = child as HTMLElement;
    if (el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

/** Fit the `.panel-text` column inside its panel. `base` is the normal lettering size in px. */
export function fitPanel(panel: HTMLElement, base: number): FitResult {
  const column = panel.querySelector<HTMLElement>(".panel-text");
  if (!column || column.childElementCount === 0) return { fits: true, scale: 1, width: WIDTHS[0] };
  const attempts: [number, string][] = [
    ...FONT_STEPS.map((s) => [s, WIDTHS[0]] as [number, string]),
    ...FONT_STEPS.map((s) => [s, WIDTHS[1]] as [number, string]),
    ...EMERGENCY_STEPS.map((s) => [s, WIDTHS[1]] as [number, string]),
  ];
  for (const [scale, width] of attempts) {
    column.style.width = width;
    column.style.fontSize = `${(base * scale).toFixed(2)}px`;
    if (!overflows(panel, column)) {
      if (scale < FONT_STEPS[FONT_STEPS.length - 1]) console.warn("Comic panel needed emergency lettering size", panel.dataset.panel);
      return { fits: true, scale, width };
    }
  }
  console.warn("Comic panel text does not fit", panel.dataset.panel);
  return { fits: false, scale: EMERGENCY_STEPS[EMERGENCY_STEPS.length - 1], width: WIDTHS[1] };
}
