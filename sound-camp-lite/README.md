# Festival Tycoon: Sound Camp Builder (Lite)

A tiny **festival sound camp sandbox** built with **React + TypeScript + Vite**.

Design your own sound camp layout on a tile grid, wire up generators, manage fuel and power loads, balance vibe vs noise, grow your crowd, and complete objectives — all in a lightweight browser-based prototype.

> This is a small but surprisingly deep toy project. The code is written to be **easy to read, easy to mod, and easy to extend**.

---

## ✨ Features

* 🎛️ **Palette of placeable items**
  Small/large speakers, DJ deck, generator, light tree, chill tent.

* ⚡ **Power & wiring system**

  * Generators supply limited power.
  * Items that need power must be wired.
  * Fuel drains over time — faster with heavier loads.
  * Refuel from the inspector panel.

* 🎚️ **Vibe / Noise / Crowd simulation**

  * Synergy bonuses (tents near lights, speakers near decks).
  * Penalties (speaker overlap, tents near large speakers).
  * Noise soft-cap affecting vibe.
  * Crowd grows/shrinks based on vibe.

* ⏱️ **Festival time system**
  Play/pause simulation, day/night cycles, objective deadlines.

* 🧩 **Objectives / Milestones**
  Automatically tracked goals with deadlines, rewards, and fail states.
  Objective summary included in screenshots.

* 💾 **Save / Load / Autosave**
  Multiple named saves + automatic session resume.

* 📸 **Screenshot export**
  Captures the board + HUD + objective summary.

* 🎧 **Tiny dynamic audio engine**
  Background layers that fade in/out based on vibe tier.

* 🧰 **Quality-of-life**
  Undo stack, rotation, nudging, power toggling, keyboard shortcuts, help overlay.

---

## 🧱 Tech Stack

* **React 18**
* **TypeScript**
* **Vite** (dev server & bundler)
* Custom canvas renderer
* No external UI frameworks

---

## 🚀 Getting Started

### Prerequisites

* **Node.js ≥ 18**
* **npm** (or `pnpm`/`yarn`)

### Install & Run (Development)

```bash
git clone <your-repo-url> festival-tycoon-lite
cd festival-tycoon-lite
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🕹️ Gameplay Overview

### Placement

* Select an item from the **Palette**
* Click on the grid to place it
* Click an item to select it

### Generators & Power

* Press **C** or click **Connect** to start wiring
* Click a device to attach power
* Press **F** or use inspector to toggle generator ON/OFF
* Fuel drains while running; refuel for **$25**

### Simulation

* **Space** toggles Play/Pause
* Money increases with crowd size
* Crowd size depends on vibe
* Vibe depends on layout synergies, penalties, spacing, power, and noise

### Objectives

* Goals listed in the **right sidebar**
* Completion gives rewards
* Failure occurs after deadline
* Summary appears in screenshots

### Keyboard Shortcuts

* **R** — Rotate item
* **Delete / Backspace** — Remove item
* **Arrow Keys** — Nudge
* **Space** — Play/Pause
* **F** — Toggle generator
* **C** — Connect wiring
* **S** — Screenshot
* **H** — Help overlay
* **Esc** — Cancel selection

---

## 🗂️ Project Structure

```text
src/
  main.tsx            # App entry point
  App.tsx             # Main component, layout, game loop, UI, canvas rendering
  index.css           # Global styles

  game/
    constants.ts      # Item definitions, tile/grid sizes, generator settings
    types.ts          # Shared types (PlacedItem, Wire, GameState, etc.)
    logic.ts          # Scoring, power logic, vibe field, placement rules
    audio.ts          # Tiny WebAudio-based ambient tier system
    storage.ts        # Autosave, manual save/load, session state builders
    milestones.ts     # Objectives, conditions, deadlines, rewards
```

### Editing the Game

* **Item stats / costs / ranges** → `game/constants.ts`
* **Scoring / synergies / penalties** → `game/logic.ts`
* **Power, wiring, fuel drain** → `game/logic.ts`
* **Objectives** → `game/milestones.ts`
* **Audio** → `game/audio.ts`

---

## 🧩 Roadmap / Future Ideas

* Additional item types (decor, vendors, utilities)
* Multi-day festival modes
* Crowd sprites or flocking behavior
* Weather or noise zones
* More generator types (solar, batteries)
* Export/import festival presets

---

## 🤝 Contributing

Pull requests welcome! Please keep code style consistent with existing files:

* Functional React components
* TypeScript strict mode
* No external UI frameworks
* Canvas rendering kept simple and readable

Open an issue if you have feature ideas or encounter bugs.

---

## 📜 License

This app has no license at this time.
