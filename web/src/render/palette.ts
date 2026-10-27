import type { HouseId } from "./catalog";

/** The fixed comic palette shared by stage and print. */
export const COMIC = {
  ink: "#1b130b",
  paper: "#f2e4c4",
  paperShade: "#e0cb9e",
  red: "#c42a1f",
  darkRed: "#7c1712",
  blue: "#21508f",
  sky: "#8fb8d8",
  night: "#1d2a4a",
  yellow: "#efbd2e",
  gold: "#d4a326",
  green: "#2f6e3b",
  moss: "#5c7a3a",
  purple: "#5a2d82",
  orange: "#d9692a",
  teal: "#1e7a78",
  bone: "#efe6d2",
  steel: "#8d99a6",
  stone: "#9a9184",
  darkStone: "#5f574d",
  wood: "#8a5a32",
  darkWood: "#5a3a1f",
  snow: "#eef4fb",
  ice: "#b9d7ea",
} as const;

export interface FigurePalette {
  skin: string;
  hair: string;
  garment: string;
  trim: string;
}

/** Earthy peasant palettes: skin, hair, garment and trim. */
export const PALETTES: readonly FigurePalette[] = [
  { skin: "#f1c9a5", hair: "#3b2414", garment: "#8b5a2b", trim: "#d9b26a" },
  { skin: "#e0ac83", hair: "#d9a441", garment: "#56713f", trim: "#c9a04a" },
  { skin: "#c98e62", hair: "#1c1410", garment: "#7a3b2e", trim: "#e2c48a" },
  { skin: "#f5d7bd", hair: "#b5481f", garment: "#4f5d6e", trim: "#c7b48a" },
  { skin: "#a86c45", hair: "#2a1c12", garment: "#a0782f", trim: "#5a3a1c" },
  { skin: "#7d4b2e", hair: "#151010", garment: "#6a4a72", trim: "#d9b26a" },
  { skin: "#f1c9a5", hair: "#9b9ba0", garment: "#3f6066", trim: "#d8c79a" },
  { skin: "#e0ac83", hair: "#5c3a1e", garment: "#9c8a63", trim: "#6e4b26" },
  { skin: "#c98e62", hair: "#e8e2d5", garment: "#6b2f3a", trim: "#caa35a" },
  { skin: "#f5d7bd", hair: "#7a4a22", garment: "#4c6b3a", trim: "#e0c27a" },
];

export interface HouseColors {
  primary: string;
  secondary: string;
}

export const HOUSE_COLORS: Record<HouseId, HouseColors> = {
  wolf: { primary: "#6d7680", secondary: "#e9ecef" },
  eel: { primary: "#1e7a78", secondary: "#a8d5c2" },
  goat: { primary: "#b07a2a", secondary: "#f3e2b3" },
  raven: { primary: "#2b2340", secondary: "#8d7bb8" },
  boar: { primary: "#a3241c", secondary: "#2a1a12" },
  stag: { primary: "#2f6e3b", secondary: "#e1b93b" },
  owl: { primary: "#8c6d4f", secondary: "#f1e3c6" },
  crab: { primary: "#d9692a", secondary: "#7a1f12" },
};

export const GHOST: FigurePalette = { skin: "#dcebff", hair: "#c2d6f2", garment: "#a9c4ea", trim: "#e8f2ff" };
