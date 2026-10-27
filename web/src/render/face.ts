import type { Emotion } from "./catalog";
import { curvePath, linePath } from "./geometry";
import { HEAD_CENTER } from "./figure-parts";
import { g, path, s } from "./svg";

const [CX, CY] = HEAD_CENTER;
const EYE_Y = CY - 4;
const BROW_Y = CY - 18;
const MOUTH_Y = CY + 20;
const EYE_DX = 13;

const at = (x: number, y: number) => [CX + x, CY + y] as const;

function dotEyes(r = 4.5): SVGElement[] {
  return [-EYE_DX, EYE_DX].map((dx) => s("ellipse", { cx: CX + dx, cy: EYE_Y, rx: r, ry: r + 1, class: "ink-fill" }));
}

function brows(leftLift: number, rightLift: number, tilt = 0): SVGElement[] {
  return [
    path(linePath([[CX - 22, BROW_Y - leftLift + tilt], [CX - 6, BROW_Y - leftLift - tilt]]), "line"),
    path(linePath([[CX + 6, BROW_Y - rightLift - tilt], [CX + 22, BROW_Y - rightLift + tilt]]), "line"),
  ];
}

/** The face sub-group for one emotion; swapping it is all an expression change costs. */
export function renderFace(emotion: Emotion): SVGGElement {
  const parts: SVGElement[] = [];
  switch (emotion) {
    case "neutral":
      parts.push(...dotEyes(), ...brows(0, 0), path(linePath([at(-9, 20), at(9, 20)]), "line"));
      break;
    case "smug":
      parts.push(
        ...[-EYE_DX, EYE_DX].map((dx) => path(`M${CX + dx - 6} ${EYE_Y} Q${CX + dx} ${EYE_Y + 5} ${CX + dx + 6} ${EYE_Y} Z`, "ink-fill ink-thin")),
        ...brows(0, 7),
        path(curvePath([at(-10, 20), at(2, 24), at(12, 14)]), "line"),
      );
      break;
    case "scheming":
      parts.push(
        ...[-EYE_DX, EYE_DX].map((dx) => path(linePath([[CX + dx - 6, EYE_Y], [CX + dx + 6, EYE_Y - 1]]), "line")),
        ...brows(-3, -3, -4),
        path(curvePath([at(-12, 16), at(0, 24), at(14, 18), at(16, 12)]), "line"),
      );
      break;
    case "furious":
      parts.push(
        ...dotEyes(3.5),
        ...brows(-2, -2, -7),
        path(`M${CX - 14} ${MOUTH_Y - 4} L${CX + 14} ${MOUTH_Y - 4} L${CX + 10} ${MOUTH_Y + 10} L${CX - 10} ${MOUTH_Y + 10} Z`, "ink-fill"),
        path(linePath([[CX - 11, MOUTH_Y - 1], [CX + 11, MOUTH_Y - 1]]), "line-thin", { stroke: "#fffaf0" }),
        s("ellipse", { cx: CX - 26, cy: CY + 12, rx: 7, ry: 4, class: "cheek" }),
        s("ellipse", { cx: CX + 26, cy: CY + 12, rx: 7, ry: 4, class: "cheek" }),
      );
      break;
    case "terrified":
      parts.push(
        ...[-EYE_DX, EYE_DX].flatMap((dx) => [
          s("circle", { cx: CX + dx, cy: EYE_Y, r: 8, class: "white ink-thin" }),
          s("circle", { cx: CX + dx, cy: EYE_Y, r: 2, class: "ink-fill" }),
        ]),
        ...brows(8, 8, 4),
        path(curvePath([at(-10, 22), at(-5, 16), at(0, 22), at(5, 16), at(10, 22), at(0, 30), at(-10, 22)]), "ink-fill ink-thin"),
        path(`M${CX + 36} ${CY - 26} q4 8 0 10 q-4 -2 0 -10 Z`, "tear"),
      );
      break;
    case "grieving":
      parts.push(
        ...[-EYE_DX, EYE_DX].map((dx) => path(curvePath([[CX + dx - 6, EYE_Y - 1], [CX + dx, EYE_Y + 4], [CX + dx + 6, EYE_Y - 1]]), "line")),
        ...brows(4, 4, 5),
        path(curvePath([at(-10, 26), at(0, 18), at(10, 26)]), "line"),
        path(`M${CX - EYE_DX} ${EYE_Y + 6} q4 10 0 14 q-4 -4 0 -14 Z`, "tear"),
      );
      break;
    case "triumphant":
      parts.push(
        ...[-EYE_DX, EYE_DX].map((dx) => path(curvePath([[CX + dx - 6, EYE_Y + 2], [CX + dx, EYE_Y - 5], [CX + dx + 6, EYE_Y + 2]]), "line")),
        ...brows(6, 6),
        path(`M${CX - 16} ${MOUTH_Y - 4} Q${CX} ${MOUTH_Y + 24} ${CX + 16} ${MOUTH_Y - 4} Z`, "ink-fill"),
        path(`M${CX - 10} ${MOUTH_Y + 6} Q${CX} ${MOUTH_Y + 12} ${CX + 10} ${MOUTH_Y + 6} Z`, "red"),
      );
      break;
    case "dead":
      parts.push(
        ...[-EYE_DX, EYE_DX].flatMap((dx) => [
          path(linePath([[CX + dx - 5, EYE_Y - 5], [CX + dx + 5, EYE_Y + 5]]), "line"),
          path(linePath([[CX + dx + 5, EYE_Y - 5], [CX + dx - 5, EYE_Y + 5]]), "line"),
        ]),
        path(curvePath([at(-12, 22), at(-6, 18), at(0, 22), at(6, 18), at(12, 22)]), "line"),
      );
      break;
  }
  return g({ "data-part": "face", "data-emotion": emotion }, ...parts);
}
