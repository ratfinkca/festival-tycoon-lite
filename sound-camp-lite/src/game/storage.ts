import type { PlacedItem, Wire } from "./types";

export type GameStateV1 = {
  v: 1;
  ts: number;           // epoch ms
  money: number;
  items: PlacedItem[];
  wires?: Wire[];
};

const AUTO_KEY = "scb:auto";
const SAVE_PREFIX = "scb:save:"; // scb:save:<name>
const INDEX_KEY = "scb:saves";   // JSON string of string[] names

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); }
  catch { return []; }
}
function writeIndex(names: string[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(names));
}

export function makeState(money: number, items: PlacedItem[], wires: Wire[] = []): GameStateV1 {
  return { v: 1, ts: Date.now(), money, items, wires };
}

export function saveAuto(state: GameStateV1) {
  localStorage.setItem(AUTO_KEY, JSON.stringify(state));
}
export function loadAuto(): GameStateV1 | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameStateV1;
    return s?.v === 1 ? s : null;
  } catch { return null; }
}

export function saveNamed(name: string, state: GameStateV1) {
  const key = SAVE_PREFIX + name;
  localStorage.setItem(key, JSON.stringify(state));
  const idx = new Set(readIndex()); idx.add(name); writeIndex([...idx]);
}

export function loadNamed(name: string): GameStateV1 | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + name);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameStateV1;
    return s?.v === 1 ? s : null;
  } catch { return null; }
}

export function deleteNamed(name: string) {
  localStorage.removeItem(SAVE_PREFIX + name);
  writeIndex(readIndex().filter(n => n !== name));
}

export function listSaves(): { name: string; ts: number }[] {
  const out: { name: string; ts: number }[] = [];
  for (const name of readIndex()) {
    const s = loadNamed(name);
    if (s) out.push({ name, ts: s.ts });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

