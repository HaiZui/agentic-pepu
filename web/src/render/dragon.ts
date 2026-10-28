import { papered } from "./defs";
import { COMIC } from "./palette";
import { g, path, s } from "./svg";

/** Cut-paper creature facing left; the origin is its feet. */
export function renderDragon(defeated = false): SVGGElement {
  const wing = papered("M20 -170 L135 -500 L260 -400 L330 -220 L235 -290 L180 -215 L110 -280 Z", "", { fill: COMIC.darkRed });
  const body = papered("M-110 -65 Q-170 -200 -85 -245 Q30 -310 125 -190 L215 -110 L320 -150 L275 -40 L155 -35 L110 0 L50 0 L50 -60 L-35 -60 L-50 0 L-110 0 Z", "", { fill: COMIC.green });
  body.setAttribute("data-dragon-part", "body");
  const neck = papered("M-75 -150 L-155 -320 L-250 -335 L-295 -280 L-235 -250 L-180 -255 L-130 -95 Z", "", { fill: COMIC.green });
  const art = g(
    { transform: defeated ? "translate(0 -45) rotate(-82) scale(0.82)" : undefined },
    wing, body, neck,
    path("M-80 -190 Q0 -245 95 -150 L135 -65 L-50 -65 Z", "halftone"),
    path("M-190 -322 L-183 -375 L-155 -310 M-148 -282 L-125 -345 L-100 -235", "bone ink"),
    path("M-250 -265 L-240 -238 L-226 -260 L-211 -235 L-200 -261", "bone ink"),
    path("M-260 -290 L-222 -280", "ink", { fill: "none", stroke: COMIC.ink, "stroke-width": 5 }),
    defeated
      ? path("M-240 -310 l20 20 m0 -20 l-20 20", "ink", { fill: "none", stroke: COMIC.ink, "stroke-width": 5 })
      : s("circle", { cx: -230, cy: -302, r: 8, fill: COMIC.yellow, stroke: COMIC.ink, "stroke-width": 4 }),
    path("M-20 -240 L15 -275 L40 -240 L70 -252 L90 -210", "gold ink"),
  );
  return g({ class: "paper", "data-creature": "dragon", "data-pose": defeated ? "defeated" : "threatening", "aria-label": defeated ? "Slain dragon" : "Dragon" }, art);
}
