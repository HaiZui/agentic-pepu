export const SVG_NS = "http://www.w3.org/2000/svg";

type Attr = string | number | undefined | null | false;
type Child = SVGElement | null | undefined | false;

/** Creates an SVG element. Attribute values are set with setAttribute, never parsed as markup. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, Attr> = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

export const g = (attrs: Record<string, Attr> = {}, ...children: Child[]) => s("g", attrs, ...children);

export const path = (d: string, cls: string, extra: Record<string, Attr> = {}) => s("path", { d, class: cls, ...extra });

export function svgRoot(viewBox: string, attrs: Record<string, Attr> = {}, ...children: Child[]): SVGSVGElement {
  return s("svg", { viewBox, xmlns: SVG_NS, ...attrs }, ...children);
}
