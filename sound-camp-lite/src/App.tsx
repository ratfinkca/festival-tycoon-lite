import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GRID_H,
  GRID_W,
  TILE,
  START_MONEY,
  ITEM_DEFS,
  GEN_CAPACITY,
  GEN_BASE_FUEL_DRAIN,
  GEN_FUEL_PER_POWER,
  WIRE_BASE_COST,
  WIRE_COST_PER_TILE,
} from "./game/constants";
import {
  clamp,
  scoreAll,
  vibeToTier,
  pxToTile,
  nextRot,
  canPlace,
  cryptoRandomId,
  computePowerFromWires,
  computeVibeField,
} from "./game/logic";
import type { PlacedItem, ItemKey, Wire } from "./game/types";
import { audioEngine } from "./game/audio";
import {
  makeState,
  saveAuto,
  loadAuto,
  saveNamed,
  loadNamed,
  listSaves,
} from "./game/storage";
import { defaultGoals, isPast, type Goal } from "./game/milestones";

type Agent = { x: number; y: number; vx: number; vy: number };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core game state
  const [items, setItems] = useState<PlacedItem[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState<ItemKey>("speaker_s");
  const [money, setMoney] = useState<number>(START_MONEY);

  // UI + hover
  const [hoverGhost, setHoverGhost] = useState<{ x: number; y: number } | null>(
    null
  );
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Derived stats
  const [vibe, setVibe] = useState(0);
  const [noise, setNoise] = useState(0);
  const [crowd, setCrowd] = useState(0);
  const crowdTargetRef = useRef(0);

  // Time + run state
  const [dayNum, setDayNum] = useState(1);
  const [timeMin, setTimeMin] = useState(0); // 0..1439
  const [running, setRunning] = useState(false);

  // Goals / milestones
  const [goals, setGoals] = useState<Goal[]>(defaultGoals());
  const [toast, setToast] = useState<string | null>(null);

  // Wires connect mode
  const [connectFromGenId, setConnectFromGenId] = useState<string | null>(null);

  // Undo stack
  const undoStack = useRef<PlacedItem[][]>([]);

  // Crowd agents + sim time
  const agentsRef = useRef<Agent[]>([]);
  const simTimeRef = useRef(0);

  // Refs for loop
  const runningRef = useRef(running);
  const crowdRef = useRef(crowd);
  const genLoadsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    crowdRef.current = crowd;
  }, [crowd]);

  // Power + scoring
  const powerResult = useMemo(
    () => computePowerFromWires(items, wires),
    [items, wires]
  );
  const powerMap = powerResult.powerMap;
  const genLoads = powerResult.genLoads;
  useEffect(() => {
    genLoadsRef.current = genLoads;
  }, [genLoads]);

  const vibeField = useMemo(
    () => computeVibeField(items, powerMap),
    [items, powerMap]
  );
  const scoring = useMemo(
    () => scoreAll(items, powerMap),
    [items, powerMap]
  );

  // Track powerMap for drawing helpers if needed
  const powerMapRef = useRef<boolean[][]>([]);
  useEffect(() => {
    powerMapRef.current = powerMap;
  }, [powerMap]);

  // Update vibe/noise + audio tier
  useEffect(() => {
    setVibe(scoring.vibe);
    setNoise(scoring.noise);
    crowdTargetRef.current = clamp(scoring.vibe * 4, 0, 500);
    try {
      audioEngine.setTier(vibeToTier(scoring.vibe));
    } catch {
      // ignore
    }
  }, [scoring]);

  // Festival clock display
  function fmtClock(mins: number) {
    const m = Math.floor(mins % 60);
    const h = Math.floor((mins / 60) % 24);
    const z = (n: number) => (n < 10 ? "0" + n : "" + n);
    return `${z(h)}:${z(m)}`;
  }

  // Autosave
  const saveTimer = useRef<number | null>(null);
  function queueAutosave() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveAuto(makeState(money, items, wires));
      saveTimer.current = null;
    }, 300);
  }
  useEffect(() => {
    queueAutosave();
  }, [items, money, wires]);

  // Resume last session once
  useEffect(() => {
    if (sessionStorage.getItem("scb:resumePrompted") === "1") return;
    sessionStorage.setItem("scb:resumePrompted", "1");
    const s = loadAuto();
    if (!s) return;
    if (confirm("Resume your last session?")) {
      setItems(s.items);
      setMoney(s.money);
      setWires(s.wires ?? []);
      alert("Session restored.");
    }
  }, []);

  function doManualSave() {
    const name = prompt("Save name:");
    if (!name) return;
    saveNamed(name, makeState(money, items, wires));
    alert(`Saved as "${name}".`);
  }
  function doManualLoad() {
    const saves = listSaves();
    if (saves.length === 0) {
      alert("No manual saves yet.");
      return;
    }
    const line = saves
      .map(
        (s, i) => `${i + 1}. ${s.name} — ${new Date(s.ts).toLocaleString()}`
      )
      .join("\n");
    const pick = prompt(
      `Load which save?\n${line}\n\nEnter number (1-${saves.length}):`
    );
    if (!pick) return;
    const idx = Number(pick) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= saves.length) {
      alert("Invalid choice.");
      return;
    }
    const chosen = loadNamed(saves[idx].name);
    if (!chosen) {
      alert("Save not found or incompatible.");
      return;
    }
    setItems(chosen.items);
    setMoney(chosen.money);
    setWires(chosen.wires ?? []);
    setSelected(null);
  }

  // Item stats used in left card
  function itemStats(def: (typeof ITEM_DEFS)[keyof typeof ITEM_DEFS]) {
    return [
      `Vibe +${def.baseVibe}`,
      `Noise +${def.noise}`,
      `Power ${def.power}${def.power > 0 ? " (needs power)" : ""}`,
      def.range ? `Range ${def.range}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
  }

  // Build snapshot for goals
  function buildSnapshot() {
    const built: Record<string, number> = {};
    const powered: Record<string, number> = {};
    for (const it of items) {
      built[it.defKey] = (built[it.defKey] ?? 0) + 1;
      const p = powerMap[it.y]?.[it.x] ?? false;
      if (p) powered[it.defKey] = (powered[it.defKey] ?? 0) + 1;
    }
    return {
      money,
      crowd: Math.round(crowd),
      vibe,
      noise,
      built,
      powered,
    };
  }

  // Core game loop (economy, fuel, time, crowd agents, milestones)
  const econTsRef = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      if (econTsRef.current == null) econTsRef.current = now;
      const dt = (now - econTsRef.current) / 1000;
      econTsRef.current = now;

      // Only advance crowd + agents + economy when running
      if (runningRef.current) {
        // Crowd easing
        const target = crowdTargetRef.current;
        setCrowd((c) => {
          const diff = target - c;
          const step =
            Math.sign(diff) *
            Math.min(Math.abs(diff), 1.5 + Math.abs(diff) * 0.02);
          return Math.round((c + step) * 10) / 10;
        });

        // Time for animations
        simTimeRef.current += dt;

        // Agents: target ~1 per 4 ppl, 10..120
        const targetAgents = clamp(Math.floor(crowdRef.current / 4), 10, 120);
        const ag = agentsRef.current;
        while (ag.length < targetAgents) {
          ag.push({
            x: Math.random() * (GRID_W * TILE - 20) + 10,
            y: Math.random() * (GRID_H * TILE - 20) + 10,
            vx: 0,
            vy: 0,
          });
        }
        if (ag.length > targetAgents) ag.splice(targetAgents);

        // Agent movement toward high-vibe zones
        for (const a of ag) {
          const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(a.x / TILE)));
          const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(a.y / TILE)));

          let bestX = gx,
            bestY = gy,
            bestV = vibeField[gy][gx];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
              const v = vibeField[ny][nx];
              if (v > bestV) {
                bestV = v;
                bestX = nx;
                bestY = ny;
              }
            }
          }

          const targetPxX = bestX * TILE + TILE / 2;
          const targetPxY = bestY * TILE + TILE / 2;
          const ax = targetPxX - a.x;
          const ay = targetPxY - a.y;

          const jitter = 12;
          const jx = (Math.random() - 0.5) * jitter;
          const jy = (Math.random() - 0.5) * jitter;

          a.vx = a.vx * 0.85 + (ax + jx) * 0.02;
          a.vy = a.vy * 0.85 + (ay + jy) * 0.02;

          const spd = Math.hypot(a.vx, a.vy);
          const maxSpd = 90;
          if (spd > maxSpd) {
            a.vx *= maxSpd / spd;
            a.vy *= maxSpd / spd;
          }

          a.x = clamp(a.x + a.vx * dt, 8, GRID_W * TILE - 8);
          a.y = clamp(a.y + a.vy * dt, 8, GRID_H * TILE - 8);
        }

        // Economy + fuel + clock
        const incomePerPersonPerSec = 0.02;
        setMoney((m) =>
          Math.max(0, m + dt * (crowdRef.current * incomePerPersonPerSec))
        );

        const loads = genLoadsRef.current;
        setItems((prev) =>
          prev.map((i) => {
            if (i.defKey !== "genny" || !i.on) return i;
            const load = loads[i.id] ?? 0;
            const perSec = GEN_BASE_FUEL_DRAIN + load * GEN_FUEL_PER_POWER;
            const newFuel = Math.max(0, (i.fuel ?? 100) - dt * perSec);
            const stillOn = newFuel > 0;
            return { ...i, fuel: newFuel, on: stillOn };
          })
        );

        // 1 real second = 1 in-game minute
        const add = dt * 60;
        setTimeMin((prev) => {
          let next = prev + add;
          if (next >= 24 * 60) {
            next -= 24 * 60;
            setDayNum((d) => d + 1);
          }
          return next;
        });

        // Milestones
        setGoals((prev) => {
          const nowDay = dayNum;
          const nowMin = timeMin;
          const snap = buildSnapshot();
          let changed = false;

          const next = prev.map((g) => {
            if (g.status !== "pending") return g;

            if (g.condition(snap)) {
              changed = true;
              if (toast === null) {
                setToast(`✅ ${g.title} +$${g.reward}`);
              }
              setMoney((m) => m + g.reward);
              return { ...g, status: "completed" as const };
            }

            if (isPast(g.deadlineDay, g.deadlineMin, nowDay, nowMin)) {
              changed = true;
              if (toast === null) {
                setToast(`❌ Failed: ${g.title}`);
              }
              return { ...g, status: "failed" as const };
            }

            return g;
          });

          return changed ? (next as Goal[]) : prev;
        });
      }

      // keep RAF going either way so resume is smooth
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [vibeField, dayNum, timeMin, toast]); // vibeField as dep is OK (memoized)

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.fillStyle = "#0f113b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#2a2f6d";
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE, 0);
      ctx.lineTo(x * TILE, GRID_H * TILE);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE);
      ctx.lineTo(GRID_W * TILE, y * TILE);
      ctx.stroke();
    }

    // Generator aura
    ctx.fillStyle = "rgba(55,214,205,0.08)";
    for (const it of items) {
      if (it.defKey === "genny") {
        const r = (ITEM_DEFS.genny.range ?? 4) * TILE + TILE / 2;
        ctx.beginPath();
        ctx.arc(
          it.x * TILE + TILE / 2,
          it.y * TILE + TILE / 2,
          r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Wires
    ctx.strokeStyle = "#37d6cd";
    ctx.lineWidth = 2;
    for (const w of wires) {
      const g = items.find((i) => i.id === w.fromGenId);
      const t = items.find((i) => i.id === w.toItemId);
      if (!g || !t) continue;
      const x1 = g.x * TILE + TILE / 2;
      const y1 = g.y * TILE + TILE / 2;
      const x2 = t.x * TILE + TILE / 2;
      const y2 = t.y * TILE + TILE / 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Hover tooltip for existing item
    if (hoverItemId) {
      const it = items.find((i) => i.id === hoverItemId)!;
      const def = ITEM_DEFS[it.defKey];
      const powered = powerMap[it.y]?.[it.x] ?? false;
      const lines = [
        def.name,
        `Vibe +${def.baseVibe} • Noise +${def.noise}`,
        `Power ${def.power}${
          def.power > 0 ? (powered ? " (powered)" : " (unpowered)") : ""
        }`,
        def.range ? `Range ${def.range}` : null,
      ].filter(Boolean) as string[];

      const tipX = it.x * TILE + TILE + 6;
      const tipY = it.y * TILE + 6;
      const w = 220;
      const h = 14 + lines.length * 16;

      ctx.fillStyle = "rgba(10,12,28,0.92)";
      ctx.strokeStyle = "#2b3172";
      ctx.lineWidth = 1;
      ctx.fillRect(tipX, tipY, w, h);
      ctx.strokeRect(tipX, tipY, w, h);
      ctx.fillStyle = "#e7ebff";
      ctx.font = "12px system-ui, sans-serif";
      lines.forEach((t, i) =>
        ctx.fillText(t, tipX + 8, tipY + 18 + i * 16)
      );
    }

    // Items with pulsing aura
    for (const it of items) {
      const powered = powerMap[it.y]?.[it.x] ?? false;
      drawItem(ctx, it, selected === it.id, powered, simTimeRef.current);
    }

    // Hover ghost + palette tooltip
    if (hoverGhost) {
      const valid = canPlace(items, hoverGhost.x, hoverGhost.y);
      ctx.globalAlpha = 0.6;
      drawRect(
        ctx,
        hoverGhost.x,
        hoverGhost.y,
        valid ? "#37d6cd" : "#ff6b6b"
      );
      ctx.globalAlpha = 1.0;

      const def = ITEM_DEFS[palette];
      const lines = [
        def.name,
        `Vibe +${def.baseVibe} • Noise +${def.noise}`,
        `Power ${def.power}${
          def.power > 0 ? " (needs power)" : ""
        }${def.range ? ` • Range ${def.range}` : ""}`,
      ];
      const tipX = hoverGhost.x * TILE + 6;
      const tipY = hoverGhost.y * TILE + 6;
      const w = 220;
      const h = 14 + lines.length * 16;
      ctx.fillStyle = "rgba(10,12,28,0.92)";
      ctx.strokeStyle = "#2b3172";
      ctx.lineWidth = 1;
      ctx.fillRect(tipX, tipY, w, h);
      ctx.strokeRect(tipX, tipY, w, h);
      ctx.fillStyle = "#e7ebff";
      ctx.font = "12px system-ui, sans-serif";
      lines.forEach((t, i) =>
        ctx.fillText(t, tipX + 8, tipY + 18 + i * 16)
      );
    }

    // Crowd agents
    const agents = agentsRef.current;
    for (let i = 0; i < agents.length; i++) {
      const p = agents[i];
      const r = 2 + (i % 3);
      ctx.fillStyle = i % 7 === 0 ? "#ffd166" : "#e7ebff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    items,
    hoverGhost,
    hoverItemId,
    selected,
    crowd,
    palette,
    wires,
    powerMap,
  ]);

  // Mouse move
  function onMouseMove(e: React.MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const tx = pxToTile(e.clientX - rect.left);
    const ty = pxToTile(e.clientY - rect.top);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) {
      setHoverGhost(null);
      setHoverItemId(null);
      return;
    }
    const hit = items.find((it) => it.x === tx && it.y === ty);
    if (hit) {
      setHoverItemId(hit.id);
      setHoverGhost(null);
    } else {
      setHoverItemId(null);
      setHoverGhost({ x: tx, y: ty });
    }
  }

  // Click: connect mode → select → place
  function onCanvasClick(e: React.MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const tx = pxToTile(e.clientX - rect.left);
    const ty = pxToTile(e.clientY - rect.top);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return;

    const hit = items.find((it) => it.x === tx && it.y === ty);

    // Connect mode first
    if (connectFromGenId) {
      if (hit && ITEM_DEFS[hit.defKey].power > 0) {
        const gen = items.find((i) => i.id === connectFromGenId);
        if (gen) {
          const length =
            Math.abs(gen.x - hit.x) + Math.abs(gen.y - hit.y);
          const cost = WIRE_BASE_COST + length * WIRE_COST_PER_TILE;
          if (money < cost) {
            alert(`Need $${cost} to wire (${length} tiles).`);
          } else {
            pushUndo();
            setMoney((m) => m - cost);
            setWires((ws) => [
              ...ws,
              {
                id: cryptoRandomId(),
                fromGenId: gen.id,
                toItemId: hit.id,
                length,
              },
            ]);
          }
        }
      }
      setConnectFromGenId(null);
      return;
    }

    // Selecting existing item
    if (hit) {
      setSelected(hit.id);
      return;
    }

    // Place new item
    if (!canPlace(items, tx, ty)) return;
    const def = ITEM_DEFS[palette];
    if (money < def.cost) {
      alert("Not enough money!");
      return;
    }
    pushUndo();
    setMoney((m) => m - def.cost);
    const base: PlacedItem = {
      id: cryptoRandomId(),
      defKey: def.key,
      x: tx,
      y: ty,
      rot: 0,
    };
    const newItem: PlacedItem =
      def.key === "genny"
        ? { ...base, on: false, fuel: 100 }
        : base;
    setItems((arr) => [...arr, newItem]);
  }

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const sel = selected && items.find((i) => i.id === selected);
      if ((e.key === "r" || e.key === "R") && sel) {
        e.preventDefault();
        pushUndo();
        setItems((arr) =>
          arr.map((it) =>
            it.id === selected ? { ...it, rot: nextRot(it.rot) } : it
          )
        );
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        sel
      ) {
        e.preventDefault();
        pushUndo();
        setMoney(
          (m) =>
            m +
            Math.floor(ITEM_DEFS[sel.defKey].cost * 0.6)
        );
        setItems((arr) => arr.filter((it) => it.id !== selected));
        setWires((ws) =>
          ws.filter(
            (w) =>
              w.fromGenId !== selected && w.toItemId !== selected
          )
        );
        setSelected(null);
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if (
        sel &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.key
        )
      ) {
        e.preventDefault();
        const dx =
          e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy =
          e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const nx = clamp(sel.x + dx, 0, GRID_W - 1);
        const ny = clamp(sel.y + dy, 0, GRID_H - 1);
        if (canPlace(items.filter((i) => i.id !== sel.id), nx, ny)) {
          pushUndo();
          setItems((arr) =>
            arr.map((i) =>
              i.id === sel.id ? { ...i, x: nx, y: ny } : i
            )
          );
        }
      } else if (e.key.toLowerCase() === "h") {
        setShowHelp((s) => !s);
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        doScreenshot(
          canvasRef.current,
          {
            money: Math.floor(money),
            vibe,
            noise,
            crowd: Math.floor(crowd),
            tier: vibeToTier(vibe),
            day: dayNum,
            time: fmtClock(timeMin),
          },
          {
            completed: goals.filter((g) => g.status === "completed").length,
            failed: goals.filter((g) => g.status === "failed").length,
            total: goals.length,
          }
        );
      } else if (sel && sel.defKey === "genny" && e.key.toLowerCase() === "f") {
        e.preventDefault();
        pushUndo();
        setItems((arr) =>
          arr.map((i) =>
            i.id === sel.id ? { ...i, on: !i.on } : i
          )
        );
      } else if (sel && sel.defKey === "genny" && e.key.toLowerCase() === "c") {
        setConnectFromGenId(sel.id);
      } else if (e.key === " ") {
        e.preventDefault();
        setRunning((r) => !r);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, items, money, vibe, noise, crowd, dayNum, timeMin, goals]);

  // Undo helpers
  function pushUndo() {
    undoStack.current.push(structuredClone(items));
  }
  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setItems(prev);
    setSelected(null);
  }
  function clearAll() {
    if (!confirm("Clear layout?")) return;
    pushUndo();
    setItems([]);
    setSelected(null);
    setWires([]);
    setMoney(START_MONEY);
    sessionStorage.removeItem("scb:resumePrompted");
  }

  const tier = useMemo(() => vibeToTier(vibe), [vibe]);

  return (
    <div style={styles.app}>
      {/* LEFT BAR */}
      <div style={styles.leftBar}>
        <h3 style={styles.h3}>Palette</h3>
        {Object.values(ITEM_DEFS).map((d) => (
          <button
            key={d.key}
            onClick={() => setPalette(d.key)}
            style={{
              ...styles.paletteBtn,
              borderColor:
                palette === d.key ? "#37d6cd" : "#394184",
              boxShadow:
                palette === d.key
                  ? "0 0 0 2px #37d6cd55 inset"
                  : "none",
            }}
            title={`${d.name} • Cost ${d.cost} • Vibe +${
              d.baseVibe
            } • Noise +${d.noise} • Power ${d.power}`}
          >
            <div style={{ fontWeight: 600 }}>{d.name}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              Cost {d.cost}
            </div>
          </button>
        ))}

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            opacity: 0.7,
          }}
        >
          Tip: Select item, click grid to place. Press <b>R</b> rotate,{" "}
          <b>Del</b> remove, <b>Arrows</b> nudge.
        </div>

        <div style={{ marginTop: 12, ...styles.card }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Selected: {ITEM_DEFS[palette].name}
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {itemStats(ITEM_DEFS[palette])}
          </div>
        </div>
      </div>

      {/* MAIN (center column: HUD + board + inspector) */}
      <div style={styles.main}>
        <div style={styles.topBar}>
          <div>
            🕒 Day <b>{dayNum}</b> <b>{fmtClock(timeMin)}</b>
          </div>
          <div>
            💰 Money: <b>{Math.floor(money)}</b>
          </div>
          <div>
            🎚️ Vibe: <b>{vibe}</b> (Noise {noise})
          </div>
          <div>
            👥 Crowd: <b>{Math.round(crowd)}</b>
          </div>
          <div>
            🎵 Tier: <b>{tier}</b>
          </div>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
            }}
          >
            <button
              type="button"
              style={styles.smallBtn}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={undo}
            >
              Undo
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={doManualSave}
            >
              Save
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={doManualLoad}
            >
              Load
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={() =>
                doScreenshot(
                  canvasRef.current,
                  {
                    money: Math.floor(money),
                    vibe,
                    noise,
                    crowd: Math.floor(crowd),
                    tier,
                    day: dayNum,
                    time: fmtClock(timeMin),
                  },
                  {
                    completed: goals.filter((g) => g.status === "completed")
                      .length,
                    failed: goals.filter((g) => g.status === "failed").length,
                    total: goals.length,
                  }
                )
              }
              title="Screenshot (S)"
            >
              Screenshot
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={clearAll}
            >
              Clear
            </button>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={() => setShowHelp((s) => !s)}
            >
              Help
            </button>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            alignSelf: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={GRID_W * TILE}
            height={GRID_H * TILE}
            style={styles.canvas}
            onMouseMove={onMouseMove}
            onMouseLeave={() => {
              setHoverGhost(null);
              setHoverItemId(null);
            }}
            onClick={onCanvasClick}
            onMouseDown={() => {
              try {
                audioEngine.ensureCtx();
              } catch {
                /* ignore */
              }
            }}
          />
          {showHelp && (
            <div style={styles.helpOverlay}>
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Controls
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  lineHeight: 1.4,
                }}
              >
                <li>
                  Click grid to <b>place</b> selected palette item
                </li>
                <li>
                  Click an item to <b>select</b>
                </li>
                <li>
                  <b>R</b> rotate • <b>Delete</b> remove • <b>Arrows</b>{" "}
                  nudge
                </li>
                <li>
                  <b>S</b> screenshot • <b>H</b> toggle help
                </li>
                <li>
                  <b>Space</b> play / pause • <b>F</b> toggle generator •{" "}
                  <b>C</b> connect from generator
                </li>
              </ul>
            </div>
          )}
          {toast && (
            <div
              style={styles.toast}
              onAnimationEnd={() => setToast(null)}
            >
              {toast}
            </div>
          )}
        </div>

        {/* Inspector under board (center column) */}
        <div style={{ marginTop: 12 }}>
          <h3 style={styles.h3}>Inspector</h3>
          {selected ? (
            <SelectedInspector
              item={items.find((i) => i.id === selected)!}
              powerMap={powerMap}
              genLoad={genLoads[selected!] ?? 0}
              onToggleGenerator={(id) => {
                pushUndo();
                setItems((arr) =>
                  arr.map((i) =>
                    i.id === id ? { ...i, on: !i.on } : i
                  )
                );
              }}
              onRefuel={(id) => {
                if (money < 25) {
                  alert("Not enough money to refuel!");
                  return;
                }
                pushUndo();
                setMoney((m) => m - 25);
                setItems((arr) =>
                  arr.map((i) =>
                    i.id === id
                      ? {
                          ...i,
                          fuel: Math.min(100, (i.fuel ?? 100) + 50),
                        }
                      : i
                  )
                );
              }}
              onConnectStart={(id) => setConnectFromGenId(id)}
              connectActive={connectFromGenId === selected}
            />
          ) : (
            <div style={{ opacity: 0.7 }}>
              Select an item on the canvas.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT BAR = Goals */}
      <div style={styles.rightBar}>
        <h3 style={styles.h3}>Goals</h3>
        <div style={{ ...styles.card, marginBottom: 12 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Objectives
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {goals.map((g) => {
              const past = isPast(
                g.deadlineDay,
                g.deadlineMin,
                dayNum,
                timeMin
              );
              const status =
                g.status === "completed"
                  ? "✅"
                  : g.status === "failed"
                  ? "❌"
                  : past
                  ? "⏰"
                  : "•";
              const deadline = `D${g.deadlineDay} ${String(
                Math.floor(g.deadlineMin / 60)
              ).padStart(2, "0")}:${String(
                g.deadlineMin % 60
              ).padStart(2, "0")}`;
              const color =
                g.status === "completed"
                  ? "#37d6cd"
                  : g.status === "failed"
                  ? "#ff6b6b"
                  : past
                  ? "#ffd166"
                  : "#e7ebff";
              return (
                <div key={g.id} style={{ fontSize: 13, color }}>
                  <b>{status}</b> {g.title}{" "}
                  <span style={{ opacity: 0.8 }}>({deadline})</span>
                  {g.desc && (
                    <div style={{ opacity: 0.7 }}>{g.desc}</div>
                  )}
                  <div style={{ opacity: 0.7 }}>
                    Reward: ${g.reward}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Screenshot with HUD and objectives summary
function doScreenshot(
  canvas: HTMLCanvasElement | null,
  hud?: {
    money: number;
    vibe: number;
    noise: number;
    crowd: number;
    tier: number;
    day?: number;
    time?: string;
  },
  objectives?: {
    completed: number;
    failed: number;
    total: number;
  }
) {
  if (!canvas) return;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);

  if (hud) {
    const pad = 12;
    const panelW = 320;
    const panelH = 128;
    ctx.fillStyle = "rgba(10,12,28,0.86)";
    ctx.strokeStyle = "#2b3172";
    ctx.lineWidth = 1;
    ctx.fillRect(pad, pad, panelW, panelH);
    ctx.strokeRect(pad, pad, panelW, panelH);

    ctx.fillStyle = "#e7ebff";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("Session Stats", pad + 10, pad + 22);

    ctx.font = "13px system-ui, sans-serif";
    const lines = [
      hud.day && hud.time
        ? `🕒 Day ${hud.day} ${hud.time}`
        : undefined,
      `💰 Money: ${hud.money}`,
      `🎚️ Vibe: ${hud.vibe} (Noise ${hud.noise})`,
      `👥 Crowd: ${hud.crowd}`,
      `🎵 Tier: ${hud.tier}`,
    ].filter(Boolean) as string[];
    lines.forEach((t, i) =>
      ctx.fillText(t, pad + 10, pad + 44 + i * 18)
    );
  }

  if (objectives) {
    const pad = 12;
    const panelW = 220;
    const panelH = 80;
    const x = out.width - pad - panelW;
    const y = pad;

    ctx.fillStyle = "rgba(10,12,28,0.86)";
    ctx.strokeStyle = "#2b3172";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeRect(x, y, panelW, panelH);

    ctx.fillStyle = "#e7ebff";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillText("Objectives", x + 10, y + 20);

    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(
      `Completed: ${objectives.completed}/${objectives.total}`,
      x + 10,
      y + 40
    );
    ctx.fillText(`Failed: ${objectives.failed}`, x + 10, y + 58);
  }

  const url = out.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `sound-camp-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Inspector for selected item
function SelectedInspector({
  item,
  powerMap,
  onToggleGenerator,
  onRefuel,
  genLoad,
  onConnectStart,
  connectActive,
}: {
  item: PlacedItem;
  powerMap: boolean[][];
  onToggleGenerator?: (id: string) => void;
  onRefuel?: (id: string) => void;
  genLoad?: number;
  onConnectStart?: (id: string) => void;
  connectActive?: boolean;
}) {
  const def = ITEM_DEFS[item.defKey];
  const powered = powerMap[item.y]?.[item.x] ?? false;
  const isGen = item.defKey === "genny";

  return (
    <div style={styles.card}>
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {def.name}
      </div>
      <div style={styles.row}>
        <span>Base Vibe</span>
        <b>+{def.baseVibe}</b>
      </div>
      <div style={styles.row}>
        <span>Noise</span>
        <b>+{def.noise}</b>
      </div>
      <div style={styles.row}>
        <span>Power Use</span>
        <b>{def.power}</b>
      </div>
      <div style={styles.row}>
        <span>Powered</span>
        <b
          style={{
            color: powered ? "#37d6cd" : "#ff6b6b",
          }}
        >
          {powered ? "Yes" : "No"}
        </b>
      </div>

      {isGen && (
        <>
          <div style={styles.row}>
            <span>Load</span>
            <b>
              {Math.round(genLoad ?? 0)} / {GEN_CAPACITY}
            </b>
          </div>
          <div
            style={{
              marginTop: 8,
            }}
          />
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => onToggleGenerator?.(item.id)}
            title="Toggle generator (F)"
          >
            {item.on ? "Turn OFF Generator" : "Turn ON Generator"}
          </button>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            Fuel: {Math.round(item.fuel ?? 100)}%
          </div>
          <button
            type="button"
            style={{
              ...styles.smallBtn,
              marginTop: 6,
            }}
            onClick={() => onRefuel?.(item.id)}
          >
            Refuel (+50%) — $25
          </button>
          <button
            type="button"
            style={{
              ...styles.smallBtn,
              marginTop: 6,
            }}
            onClick={() => onConnectStart?.(item.id)}
            title="Connect to a device (press C)"
          >
            {connectActive
              ? "Connecting… click a device"
              : "Connect"}
          </button>
        </>
      )}

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          opacity: 0.8,
        }}
      >
        Rotate <b>R</b> • Delete <b>Del</b> • Nudge <b>Arrows</b>{" "}
        {isGen && (
          <>
            • Toggle <b>F</b> • Connect <b>C</b>
          </>
        )}
      </div>
    </div>
  );
}

// Drawing helpers
function drawItem(
  ctx: CanvasRenderingContext2D,
  it: PlacedItem,
  isSelected: boolean,
  powered: boolean,
  t: number
) {
  const x = it.x * TILE;
  const y = it.y * TILE;

  // Base outline
  drawRect(ctx, it.x, it.y, isSelected ? "#37d6cd" : "#8aa3ff");

  const isMusic =
    it.defKey === "deck" || it.defKey.startsWith("speaker");

  // Pulsing halo for powered music gear
  if (isMusic && powered) {
    const pulse =
      0.3 + 0.2 * (1 + Math.sin(t * 6.28)); // ~1Hz
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    ctx.fillStyle = "#37d6cd";
    ctx.beginPath();
    ctx.arc(
      x + TILE / 2,
      y + TILE / 2,
      TILE * (0.7 + 0.05 * Math.sin(t * 3.14)),
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // Icon
  ctx.save();
  ctx.translate(x + TILE / 2, y + TILE / 2);
  ctx.rotate((Math.PI / 180) * it.rot);
  ctx.strokeStyle = "#0f113b";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#ffffff";

  if (it.defKey.startsWith("speaker")) {
    roundRect(ctx, -12, -16, 24, 32, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, 0);
    ctx.strokeStyle = "#ffd166";
    ctx.stroke();
  } else if (it.defKey === "deck") {
    roundRect(ctx, -18, -10, 36, 20, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-8, 0, 5, 0, Math.PI * 2);
    ctx.arc(8, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#0f113b";
    ctx.fill();
  } else if (it.defKey === "light") {
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, 16);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -18, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd166";
    ctx.fill();
  } else if (it.defKey === "tent") {
    ctx.beginPath();
    ctx.moveTo(-16, 12);
    ctx.lineTo(0, -12);
    ctx.lineTo(16, 12);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0f113b";
    ctx.stroke();
  } else if (it.defKey === "genny") {
    roundRect(ctx, -16, -12, 32, 24, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.lineTo(8, 0);
    ctx.strokeStyle = "#ff6b6b";
    ctx.stroke();
  }

  ctx.restore();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(gx * TILE + 2, gy * TILE + 2, TILE - 4, TILE - 4);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "grid",
    gridTemplateColumns: "260px 1fr 260px",
    gap: 12,
    padding: 12,
    background: "#0b0e2a",
    color: "#e7ebff",
    height: "100dvh",
    boxSizing: "border-box",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
  },
  leftBar: {
    background: "#141a44",
    border: "1px solid #2b3172",
    borderRadius: 12,
    padding: 12,
    overflow: "auto",
  },
  rightBar: {
    background: "#141a44",
    border: "1px solid #2b3172",
    borderRadius: 12,
    padding: 12,
    overflow: "auto",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "8px 12px",
    background: "#141a44",
    border: "1px solid #2b3172",
    borderRadius: 12,
  } as React.CSSProperties,
  canvas: {
    borderRadius: 12,
    border: "1px solid #2b3172",
    imageRendering: "pixelated",
    cursor: "crosshair",
    alignSelf: "center",
  },
  h3: {
    margin: 0,
    marginBottom: 8,
    fontSize: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#9fb0ff",
  },
  paletteBtn: {
    width: "100%",
    textAlign: "left",
    background: "#1a2257",
    color: "#e7ebff",
    border: "1px solid #394184",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    cursor: "pointer",
  },
  smallBtn: {
    background: "#1a2257",
    color: "#e7ebff",
    border: "1px solid #394184",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
  },
  card: {
    background: "#1a2257",
    border: "1px solid #394184",
    borderRadius: 10,
    padding: 12,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 6,
  },
  helpOverlay: {
    position: "absolute",
    left: 8,
    top: 8,
    background: "rgba(10,12,28,0.92)",
    border: "1px solid #2b3172",
    borderRadius: 10,
    padding: 10,
    color: "#e7ebff",
    fontSize: 13,
    maxWidth: 260,
  },
  toast: {
    position: "absolute",
    left: "50%",
    top: 16,
    transform: "translateX(-50%)",
    background: "rgba(10,12,28,0.95)",
    border: "1px solid #2b3172",
    color: "#e7ebff",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 14,
    animation: "fadeOut 2.2s forwards",
  } as React.CSSProperties,
};
