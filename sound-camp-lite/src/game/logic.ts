import { GRID_H, GRID_W, ITEM_DEFS, TILE, GEN_CAPACITY } from "./constants";
import type { PlacedItem, Wire, Score } from "./types";

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const dist2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const pxToTile = (px: number) => Math.floor(px / TILE);

export type Rot = 0 | 90 | 180 | 270;
export const nextRot = (r: Rot): Rot => (r===0?90:r===90?180:r===180?270:0);

export function canPlace(items: PlacedItem[], x: number, y: number) {
  if (x<0 || y<0 || x>=GRID_W || y>=GRID_H) return false;
  return !items.some(it => it.x===x && it.y===y);
}

export function computePowerAndLoads(items: PlacedItem[]): {
  powerMap: boolean[][];
  genLoads: Record<string, number>; // generator.id -> total power supplied
} {
  const powerMap: boolean[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  const genLoads: Record<string, number> = {};

  // running generators with fuel
  const gens = items.filter(i => i.defKey === "genny" && i.on && (i.fuel ?? 0) > 0);
  // items that need power
  const consumers = items.filter(i => ITEM_DEFS[i.defKey].power > 0);

  // Greedy assignment: for each generator, power nearest consumers within radius until capacity is full.
  const alreadyPowered = new Set<string>(); // "x,y" of tiles powered by some gen
  for (const g of gens) {
    let capacityLeft = GEN_CAPACITY;
    genLoads[g.id] = 0;

    // candidates within radius, sorted by distance to this generator
    const radius = ITEM_DEFS.genny.range ?? 4;
    const cands = consumers
      .filter(c => {
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        return d <= radius;
      })
      .sort((a, b) => {
        const da = Math.hypot(a.x - g.x, a.y - g.y);
        const db = Math.hypot(b.x - g.x, b.y - g.y);
        return da - db;
      });

    for (const c of cands) {
      const key = `${c.x},${c.y}`;
      if (alreadyPowered.has(key)) continue;
      const draw = ITEM_DEFS[c.defKey].power;
      if (draw <= 0) continue;
      if (draw > capacityLeft) continue; // not enough capacity

      // allocate
      capacityLeft -= draw;
      genLoads[g.id] += draw;
      alreadyPowered.add(key);
      powerMap[c.y][c.x] = true;
    }
  }

  return { powerMap, genLoads };
}
export function computePowerFromWires(items: PlacedItem[], wires: Wire[]) {
  const powerMap: boolean[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
  const genLoads: Record<string, number> = {};

  const itemById = new Map(items.map(i => [i.id, i]));
  const runningGens = items.filter(i => i.defKey === "genny" && i.on && (i.fuel ?? 0) > 0);

  // group wires by generator
  const byGen = new Map<string, Wire[]>();
  for (const w of wires) {
    if (!byGen.has(w.fromGenId)) byGen.set(w.fromGenId, []);
    byGen.get(w.fromGenId)!.push(w);
  }

  for (const g of runningGens) {
    let capLeft = GEN_CAPACITY;
    genLoads[g.id] = 0;

    const links = (byGen.get(g.id) || [])
      .map(w => ({ w, it: itemById.get(w.toItemId) }))
      .filter(x => !!x.it)
      // tiny quality: prefer shorter links first
      .sort((a, b) => a.w.length - b.w.length);

    for (const { it } of links) {
      const consumer = it!;
      const draw = ITEM_DEFS[consumer.defKey].power;
      if (draw <= 0) continue;
      if (draw > capLeft) continue;

      capLeft -= draw;
      genLoads[g.id] += draw;
      powerMap[consumer.y][consumer.x] = true; // mark tile powered
    }
  }

  return { powerMap, genLoads };
}
export function scoreAll(items: PlacedItem[], powerMap: boolean[][]): Score {
  let vibe = 0; let noise = 0;
  const decks = items.filter(i=>i.defKey==='deck');
  const speakers = items.filter(i=>i.defKey==='speaker_s' || i.defKey==='speaker_l');
  const tents = items.filter(i=>i.defKey==='tent');
  const lights = items.filter(i=>i.defKey==='light');

  for (const it of items) {
    const def = ITEM_DEFS[it.defKey];
    const basePowered = powerMap[it.y]?.[it.x] ?? false;
    let localVibe = def.baseVibe;
    let localNoise = def.noise;

    const needsPower = def.power > 0;
    if (needsPower && !basePowered) {
        localVibe = 0;        // ⬅ no output if unpowered
        localNoise += 1;      // a tiny hum / setup noise if you want to keep this
    }

    if (it.defKey === 'speaker_s' || it.defKey === 'speaker_l') {
      const nearDeck = decks.some(d => dist2(d.x, d.y, it.x, it.y) <= 3);
      if (nearDeck) localVibe += Math.round(def.baseVibe * 0.5);
      const closeSpk = speakers.some(s => s.id !== it.id && dist2(s.x, s.y, it.x, it.y) <= 2);
      if (closeSpk) localVibe -= 4;
      if (it.defKey === 'speaker_l') {
        const affectedTents = tents.filter(t => dist2(t.x, t.y, it.x, it.y) <= 2);
        localVibe -= affectedTents.length * 0.5;
      }
    }

    if (it.defKey === 'tent') {
      const nearLight = lights.some(l => dist2(l.x, l.y, it.x, it.y) <= 2);
      if (nearLight) localVibe += 3;
      const nearBig = speakers.some(s => s.defKey==='speaker_l' && dist2(s.x, s.y, it.x, it.y) <= 2);
      if (nearBig) localVibe -= 1.5;
    }

    vibe += Math.round(localVibe);
    noise += Math.max(0, Math.round(localNoise));
  }

  if (noise > 12) vibe -= Math.round((noise - 12) * 1.5);
  return { vibe: Math.max(0, Math.round(vibe)), noise };
}

export function vibeToTier(v: number) {
  if (v <= 5) return 0;
  if (v <= 15) return 1;
  if (v <= 30) return 2;
  if (v <= 50) return 3;
  return 4;
}

export function cryptoRandomId() {
  if ("randomUUID" in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2);
}

// Estimate a simple per-tile vibe field for crowd attraction.
// Items add their baseVibe with soft falloff by distance; unpowered consumers contribute 0.
export function computeVibeField(items: PlacedItem[], powerMap: boolean[][]): number[][] {
  const field: number[][] = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
  for (const it of items) {
    const def = ITEM_DEFS[it.defKey];
    let strength = def.baseVibe;
    if (def.power > 0 && !(powerMap[it.y]?.[it.x])) strength = 0;
    if (strength <= 0) continue;

    const r = Math.max(1, def.range ?? 2);
    for (let y = Math.max(0, it.y - r - 2); y <= Math.min(GRID_H - 1, it.y + r + 2); y++) {
      for (let x = Math.max(0, it.x - r - 2); x <= Math.min(GRID_W - 1, it.x + r + 2); x++) {
        const d = Math.hypot(x - it.x, y - it.y);
        const falloff = 1 / (1 + Math.max(0, d - 0.25)); // gentle 1/r falloff
        field[y][x] += strength * falloff;
      }
    }
  }
  return field;
}
