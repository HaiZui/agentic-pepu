import { BLEED, STAGE_HEIGHT, STAGE_WIDTH } from "../render";
import { SVG_NS } from "../render/svg";

export interface StageLayers {
  viewport: HTMLDivElement;
  stage: HTMLDivElement;
  backRaster: HTMLCanvasElement;
  back: SVGSVGElement;
  mid: SVGSVGElement;
  crowd: SVGSVGElement;
  puppets: SVGSVGElement;
  particles: HTMLCanvasElement;
  front: SVGSVGElement;
  bubbles: HTMLDivElement;
  proscenium: SVGSVGElement;
  panels: HTMLDivElement;
  /** Survivor tracker: above panels and montages, below full-stage overlays such as title cards. */
  tracker: HTMLDivElement;
  overlays: HTMLDivElement;
  letterbox: HTMLDivElement;
}

const WORLD_VIEWBOX = `${-BLEED} 0 ${STAGE_WIDTH + 2 * BLEED} ${STAGE_HEIGHT}`;

function worldSvg(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", WORLD_VIEWBOX);
  svg.setAttribute("class", `layer world layer-${name}`);
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

function div(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

/** The 1920x1080 stage with its layer stack, letterboxed into `host`. */
export function createStage(host: HTMLElement): StageLayers & { fit(): void; destroy(): void } {
  const viewport = div("stage-viewport");
  const stage = div("stage");
  stage.setAttribute("data-testid", "stage");

  const backRaster = document.createElement("canvas");
  backRaster.className = "layer world layer-back-raster";
  backRaster.width = STAGE_WIDTH + 2 * BLEED;
  backRaster.height = STAGE_HEIGHT;

  const particles = document.createElement("canvas");
  particles.className = "layer layer-particles";
  particles.width = STAGE_WIDTH;
  particles.height = STAGE_HEIGHT;

  const proscenium = document.createElementNS(SVG_NS, "svg");
  proscenium.setAttribute("viewBox", `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`);
  proscenium.setAttribute("class", "layer layer-proscenium");

  const layers: StageLayers = {
    viewport,
    stage,
    backRaster,
    back: worldSvg("back"),
    mid: worldSvg("mid"),
    crowd: worldSvg("crowd"),
    puppets: worldSvg("puppets"),
    particles,
    front: worldSvg("front"),
    bubbles: div("layer layer-bubbles"),
    proscenium,
    panels: div("layer layer-panels"),
    tracker: div("layer layer-tracker"),
    overlays: div("layer layer-overlays"),
    letterbox: div("layer layer-letterbox"),
  };
  layers.letterbox.append(div("bar bar-top"), div("bar bar-bottom"));
  stage.append(
    layers.backRaster,
    layers.back,
    layers.mid,
    layers.crowd,
    layers.puppets,
    layers.particles,
    layers.front,
    layers.proscenium,
    layers.letterbox,
    layers.bubbles,
    layers.panels,
    layers.tracker,
    layers.overlays,
  );
  viewport.append(stage);
  host.append(viewport);

  const fit = () => {
    const { width, height } = viewport.getBoundingClientRect();
    const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT) || 1;
    const left = (width - STAGE_WIDTH * scale) / 2;
    const top = (height - STAGE_HEIGHT * scale) / 2;
    stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    stage.dataset.scale = scale.toFixed(4);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(viewport);
  fit();

  return {
    ...layers,
    fit,
    destroy: () => {
      observer.disconnect();
      viewport.remove();
    },
  };
}
