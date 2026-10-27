import "./render.css";

export * from "./catalog";
export { createDefs, ensureDefs, vectorizeTextures, type RenderMode } from "./defs";
export { PUPPET_VIEWBOX } from "./figure-parts";
export { COMIC, HOUSE_COLORS, PALETTES } from "./palette";
export { renderProscenium, type Proscenium } from "./proscenium";
export {
  MAD_KING_NAME,
  peasantSpec,
  puppetSpecForCharacter,
  puppetSvg,
  renderCrowdFigure,
  renderNameCard,
  renderPuppet,
  setEmotion,
  type PuppetSpec,
} from "./puppet";
export { BLEED, FLOOR_Y, renderScenery, SCENERY_VIEWBOX, scenerySvg, STAGE_HEIGHT, STAGE_WIDTH, type Scenery } from "./scenery";
export { renderBanner, renderSigil, renderSigilBadge } from "./sigils";
export { baseTraits, canonicalOrder, resolveCollisions, traitDifferences, type Traits } from "./traits";
