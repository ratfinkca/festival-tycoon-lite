// src/game/types.ts
export type Rot = 0 | 90 | 180 | 270;

export type ItemKey = "speaker_s" | "speaker_l" | "deck" | "light" | "tent" | "genny";

export interface ItemDef {
  key: ItemKey;
  name: string;
  cost: number;
  baseVibe: number;
  noise: number;
  power: number;    // consumption; genny uses 0 and instead supplies power
  range?: number;   // generic radius for effects (tiles)
  coneDeg?: number; // for speakers (visual only in this MVP)
}

export interface PlacedItem {
  id: string;
  defKey: ItemKey;
  x: number; // grid coords
  y: number;
  rot: Rot;
  on?: boolean;   // for generators: running or not
  fuel?: number;  // (reserved) 0–100
}

export interface Score {
  vibe: number;
  noise: number;
}

export interface Wire {
  id: string;
  fromGenId: string;  // generator item id
  toItemId: string;   // consumer item id
  length: number;     // Manhattan distance in tiles
}
