// src/game/milestones.ts

export type GoalStatus = "pending" | "completed" | "failed";

export interface Goal {
  id: string;
  title: string;
  desc?: string;
  deadlineDay: number;   // day number (1-based)
  deadlineMin: number;   // minute-of-day 0..1439
  reward: number;        // money reward
  status: GoalStatus;    // runtime status
  condition: (snap: {
    money: number;
    crowd: number;
    vibe: number;
    noise: number;
    built: Record<string, number>;   // counts by defKey
    powered: Record<string, number>; // counts by defKey that are powered
  }) => boolean;
}

// Tiny helper to keep code readable
const has = (map: Record<string, number>, k: string, n: number) =>
  (map[k] ?? 0) >= n;

export function defaultGoals(): Goal[] {
  return [
    // --- Day 1 early-game ---
    {
      id: "g1",
      title: "Get the Party Started",
      desc: "Have a powered DJ Deck running.",
      deadlineDay: 1,
      deadlineMin: 18 * 60, // Day 1 18:00
      reward: 150,
      status: "pending",
      condition: (s) => has(s.powered, "deck", 1),
    },
    {
      id: "g2",
      title: "First Crowd",
      desc: "Reach a crowd of 100.",
      deadlineDay: 1,
      deadlineMin: 22 * 60, // Day 1 22:00
      reward: 200,
      status: "pending",
      condition: (s) => s.crowd >= 100,
    },

    // --- Day 1: sound setup ---
    {
      id: "g3",
      title: "Basic Sound System",
      desc: "Have a powered DJ Deck and at least 2 powered speakers.",
      deadlineDay: 1,
      deadlineMin: 23 * 60 + 30, // Day 1 23:30
      reward: 250,
      status: "pending",
      condition: (s) =>
        has(s.powered, "deck", 1) &&
        (s.powered["speaker_s"] ?? 0) + (s.powered["speaker_l"] ?? 0) >= 2,
    },

    // --- Day 1: comfort ---
    {
      id: "g4",
      title: "Chill Zone",
      desc: "Set up a cozy chill space: 2 tents and 1 light (powered).",
      deadlineDay: 1,
      deadlineMin: 24 * 60 - 1, // End of Day 1
      reward: 200,
      status: "pending",
      condition: (s) =>
        has(s.built, "tent", 2) && has(s.powered, "light", 1),
    },

    // --- Day 2: progression ---
    {
      id: "g5",
      title: "Sound Camp Basics",
      desc: "Have a powered large speaker and a light.",
      deadlineDay: 2,
      deadlineMin: 12 * 60, // Day 2 12:00
      reward: 250,
      status: "pending",
      condition: (s) =>
        has(s.powered, "speaker_l", 1) && has(s.powered, "light", 1),
    },
    {
      id: "g6",
      title: "Night Vibes",
      desc: "Reach a crowd of 200 while keeping noise at or below 16.",
      deadlineDay: 2,
      deadlineMin: 18 * 60, // Day 2 18:00
      reward: 300,
      status: "pending",
      condition: (s) => s.crowd >= 200 && s.noise <= 16,
    },

    // --- Day 2: economy ---
    {
      id: "g7",
      title: "In the Black",
      desc: "Hold $900 or more.",
      deadlineDay: 2,
      deadlineMin: 20 * 60, // Day 2 20:00
      reward: 300,
      status: "pending",
      condition: (s) => s.money >= 900,
    },

    // --- Later / stretch goals ---
    {
      id: "g8",
      title: "Grid of Dreams",
      desc: "Have at least 6 powered devices (speakers/decks/lights) at once.",
      deadlineDay: 3,
      deadlineMin: 12 * 60, // Day 3 12:00
      reward: 350,
      status: "pending",
      condition: (s) => {
        const poweredTotal =
          (s.powered["speaker_s"] ?? 0) +
          (s.powered["speaker_l"] ?? 0) +
          (s.powered["deck"] ?? 0) +
          (s.powered["light"] ?? 0);
        return poweredTotal >= 6;
      },
    },
    {
      id: "g9",
      title: "Headliner Hour",
      desc: "Hit a vibe score of 40+ at any time.",
      deadlineDay: 3,
      deadlineMin: 20 * 60, // Day 3 20:00
      reward: 400,
      status: "pending",
      condition: (s) => s.vibe >= 40,
    },
    {
      id: "g10",
      title: "Respect the Neighbours",
      desc: "Maintain noise ≤ 12 while crowd is at least 150.",
      deadlineDay: 3,
      deadlineMin: 24 * 60 - 1, // End of Day 3
      reward: 400,
      status: "pending",
      condition: (s) => s.crowd >= 150 && s.noise <= 12,
    },
  ];
}

// Time comparison
export function isPast(
  day: number,
  min: number,
  nowDay: number,
  nowMin: number
) {
  return nowDay > day || (nowDay === day && nowMin > min);
}
