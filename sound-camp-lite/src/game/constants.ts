// src/game/constants.ts
import type { ItemDef, ItemKey } from "./types";


export const TILE = 48;
export const GRID_W = 20;
export const GRID_H = 12;
export const START_MONEY = 500;

// NEW: generator capability + fuel drain tuning
export const GEN_CAPACITY = 6;            // total power units a genny can supply
export const GEN_BASE_FUEL_DRAIN = 0.4;   // % fuel per second when ON with no load
export const GEN_FUEL_PER_POWER = 0.8;    // extra % fuel per second per power unit load

export const ITEM_DEFS: Record<ItemKey, ItemDef> = {
  speaker_s: { key: "speaker_s", name: "Small Speaker", cost: 50,  baseVibe: 6,  noise: 2, power: 1, range: 3, coneDeg: 90 },
  speaker_l: { key: "speaker_l", name: "Large Speaker",  cost: 120, baseVibe: 12, noise: 4, power: 2, range: 3, coneDeg: 120 },
  deck:      { key: "deck",      name: "DJ Deck",        cost: 150, baseVibe: 10, noise: 1, power: 1, range: 3 },
  light:     { key: "light",     name: "Light Tree",     cost: 80,  baseVibe: 5,  noise: 0, power: 1, range: 2 },
  tent:      { key: "tent",      name: "Chill Tent",     cost: 60,  baseVibe: 4,  noise: 0, power: 0, range: 2 },
  genny:     { key: "genny",     name: "Generator",      cost: 100, baseVibe: 0,  noise: 3, power: 0, range: 4 },
};

export const WIRE_COST_PER_TILE = 2;   // $ per tile
export const WIRE_BASE_COST = 5;       // flat fee per link
