/**
 * D&D 5e (2014): построение энкаунтеров по DMG.
 *
 * Бюджет = порог XP на персонажа × размер партии.
 * Стоимость энкаунтера = базовый XP монстров × множитель за количество,
 * с поправкой на партию меньше 3 или больше 5 человек.
 */

import type { MonsterRef } from "../../core/encounter";

export const DND_DIFFICULTIES = [
  "easy",
  "medium",
  "hard",
  "deadly",
] as const;

export type DndDifficulty = (typeof DND_DIFFICULTIES)[number];

export const DND_DIFFICULTY_LABELS: Record<DndDifficulty, string> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  deadly: "deadly",
};

/** Пороги XP на одного персонажа (DMG 2014, таблица «Encounter Difficulty»). */
export const DND_XP_THRESHOLDS: Record<
  number,
  Record<DndDifficulty, number>
> = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

export const CR_XP: ReadonlyArray<{ cr: number; xp: number }> = [
  { cr: 0, xp: 10 },
  { cr: 0.125, xp: 25 },
  { cr: 0.25, xp: 50 },
  { cr: 0.5, xp: 100 },
  { cr: 1, xp: 200 },
  { cr: 2, xp: 450 },
  { cr: 3, xp: 700 },
  { cr: 4, xp: 1100 },
  { cr: 5, xp: 1800 },
  { cr: 6, xp: 2300 },
  { cr: 7, xp: 2900 },
  { cr: 8, xp: 3900 },
  { cr: 9, xp: 5000 },
  { cr: 10, xp: 5900 },
  { cr: 11, xp: 7200 },
  { cr: 12, xp: 8400 },
  { cr: 13, xp: 10000 },
  { cr: 14, xp: 11500 },
  { cr: 15, xp: 13000 },
  { cr: 16, xp: 15000 },
  { cr: 17, xp: 18000 },
  { cr: 18, xp: 20000 },
  { cr: 19, xp: 22000 },
  { cr: 20, xp: 25000 },
  { cr: 21, xp: 33000 },
  { cr: 22, xp: 41000 },
  { cr: 23, xp: 50000 },
  { cr: 24, xp: 62000 },
  { cr: 25, xp: 75000 },
  { cr: 26, xp: 90000 },
  { cr: 27, xp: 105000 },
  { cr: 28, xp: 120000 },
  { cr: 29, xp: 135000 },
  { cr: 30, xp: 155000 },
];

export function crToXp(cr: number): number {
  if (!Number.isFinite(cr) || cr <= 0) return CR_XP[0]!.xp;
  let best = CR_XP[0]!;
  let bestDelta = Infinity;
  for (const row of CR_XP) {
    const delta = Math.abs(row.cr - cr);
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best.xp;
}

export function formatCr(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(Math.round(cr * 100) / 100);
}

export function dndBudget(
  partyLevel: number,
  partySize: number,
  difficulty: DndDifficulty,
): number {
  const level = Math.min(20, Math.max(1, Math.round(partyLevel)));
  const perCharacter = DND_XP_THRESHOLDS[level]![difficulty];
  return perCharacter * Math.max(1, partySize);
}

const MULTIPLIER_STEPS = [1, 1.5, 2, 2.5, 3, 4] as const;

/** Множитель DMG за количество монстров с поправкой на размер партии. */
export function encounterMultiplier(
  count: number,
  partySize = 4,
): number {
  let index: number;
  if (count <= 1) index = 0;
  else if (count === 2) index = 1;
  else if (count <= 6) index = 2;
  else if (count <= 10) index = 3;
  else if (count <= 14) index = 4;
  else index = 5;

  if (partySize < 3) index = Math.min(MULTIPLIER_STEPS.length - 1, index + 1);
  else if (partySize > 5) index = Math.max(0, index - 1);

  return MULTIPLIER_STEPS[index]!;
}

export interface DndMonster extends MonsterRef {
  cr?: number | string;
  xp?: number;
  url?: string;
}

export interface DndEncounterRequest {
  partyLevel: number;
  partySize?: number;
  difficulty?: DndDifficulty;
  theme?: string[];
  maxCreatures?: number;
  seed?: number;
  pool: DndMonster[];
}

export interface DndEncounterGroup {
  monster: DndMonster;
  count: number;
  xpEach: number;
  subtotal: number;
}

export interface DndEncounterPlan {
  partyLevel: number;
  partySize: number;
  difficulty: DndDifficulty;
  budget: number;
  baseXp: number;
  spent: number;
  awardedXp: number;
  multiplier: number;
  threat: DndDifficulty;
  groups: DndEncounterGroup[];
  totalCount: number;
  warnings: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number | undefined): T[] {
  const copy = [...items];
  if (seed === undefined) return copy;
  const rng = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

function themeTokens(theme: string[] | undefined): string[] {
  return (theme ?? [])
    .flatMap((token) => token.toLowerCase().split(/[\s,]+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

function matchesTheme(monster: DndMonster, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const haystack = [
    monster.name,
    ...(monster.traits ?? []),
    ...(monster.roles ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function threatFor(
  adjustedXp: number,
  partyLevel: number,
  partySize: number,
): DndDifficulty {
  let result: DndDifficulty = "easy";
  for (const difficulty of DND_DIFFICULTIES) {
    if (adjustedXp >= dndBudget(partyLevel, partySize, difficulty)) {
      result = difficulty;
    }
  }
  return result;
}

function emptyPlan(
  req: Required<
    Pick<DndEncounterRequest, "partyLevel" | "partySize" | "difficulty">
  >,
  warnings: string[],
): DndEncounterPlan {
  return {
    partyLevel: req.partyLevel,
    partySize: req.partySize,
    difficulty: req.difficulty,
    budget: dndBudget(req.partyLevel, req.partySize, req.difficulty),
    baseXp: 0,
    spent: 0,
    awardedXp: 0,
    multiplier: 1,
    threat: "easy",
    groups: [],
    totalCount: 0,
    warnings,
  };
}

/**
 * Подбирает состав для D&D 5e.
 *
 * Для каждого количества существ 1..max ищет точную комбинацию базового XP
 * так, чтобы после множителя попасть в бюджет. Сравнивает варианты по
 * отклонению от бюджета.
 */
export function generateDndEncounter(
  req: DndEncounterRequest,
): DndEncounterPlan {
  const partyLevel = Math.min(20, Math.max(1, Math.round(req.partyLevel)));
  const partySize = Math.max(1, req.partySize ?? 4);
  const difficulty = req.difficulty ?? "medium";
  const maxCreatures = Math.max(1, Math.min(16, req.maxCreatures ?? 8));
  const budget = dndBudget(partyLevel, partySize, difficulty);
  const warnings: string[] = [];
  const base = { partyLevel, partySize, difficulty };

  if (!req.pool.length) {
    return emptyPlan(base, [
      "Пул монстров пуст. Импортируй бестиарий D&D или используй встроенные примеры.",
    ]);
  }

  if (partySize < 3 || partySize > 5) {
    warnings.push(
      "Партия вне диапазона 3–5 персонажей: множитель скорректирован по DMG.",
    );
  }

  const tokens = themeTokens(req.theme);
  let pool = req.pool.filter((monster) => {
    if (!Number.isFinite(monster.level)) return false;
    if (monster.level < 0) return false;
    if (monster.level > partyLevel + 4) return false;
    return matchesTheme(monster, tokens);
  });

  if (!pool.length) {
    return emptyPlan(base, [
      "Под выбранную тему не нашлось монстров подходящего CR.",
    ]);
  }

  const byName = new Map<string, DndMonster>();
  for (const monster of pool) {
    byName.set(monster.name.toLowerCase(), monster);
  }
  pool = shuffled([...byName.values()], req.seed)
    .sort(
      (a, b) =>
        Math.abs(a.level - partyLevel) - Math.abs(b.level - partyLevel),
    )
    .slice(0, 120);

  const candidates = pool.map((monster) => ({
    monster,
    units: Math.max(1, Math.round((monster.xp ?? crToXp(monster.level)) / 5)),
    xp: monster.xp ?? crToXp(monster.level),
  }));

  interface Candidate {
    monster: DndMonster;
    units: number;
    xp: number;
  }

  let best:
    | {
        composition: Candidate[];
        adjusted: number;
        baseXp: number;
        multiplier: number;
        score: number;
      }
    | undefined;

  for (let count = 1; count <= maxCreatures; count++) {
    const multiplier = encounterMultiplier(count, partySize);
    const targetBase = budget / multiplier;
    const capUnits = Math.max(
      1,
      Math.ceil((budget * 1.35) / 5),
    );
    const targetUnits = targetBase / 5;

    const parents: Array<Map<number, { prev: number; item: number } | null>> =
      Array.from({ length: count + 1 }, () => new Map());
    parents[0]!.set(0, null);

    for (let depth = 1; depth <= count; depth++) {
      const current = parents[depth]!;
      const previous = parents[depth - 1]!;
      for (const [xp] of previous) {
        for (let index = 0; index < candidates.length; index++) {
          const next = xp + candidates[index]!.units;
          if (next > capUnits) continue;
          if (!current.has(next)) {
            current.set(next, { prev: xp, item: index });
          }
        }
      }
    }

    const final = parents[count]!;
    for (const [xp] of final) {
      const baseXp = xp * 5;
      const adjusted = Math.round(baseXp * multiplier);
      const score =
        Math.abs(adjusted - budget) +
        Math.abs(xp - targetUnits) * 2 +
        (count > 5 ? 20 : 0);
      if (!best || score < best.score) {
        const composition: Candidate[] = [];
        let cursor = xp;
        for (let depth = count; depth > 0; depth--) {
          const step = parents[depth]!.get(cursor);
          if (!step) break;
          composition.push(candidates[step.item]!);
          cursor = step.prev;
        }
        best = { composition, adjusted, baseXp, multiplier, score };
      }
    }
  }

  if (!best || !best.composition.length) {
    return emptyPlan(base, [
      "Не удалось подобрать состав под бюджет. Добавь монстров в пул.",
    ]);
  }

  const grouped = new Map<string, DndEncounterGroup>();
  for (const item of best.composition) {
    const key = item.monster.name.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal += item.xp;
    } else {
      grouped.set(key, {
        monster: item.monster,
        count: 1,
        xpEach: item.xp,
        subtotal: item.xp,
      });
    }
  }

  const groups = [...grouped.values()].sort((a, b) => b.subtotal - a.subtotal);
  const totalCount = groups.reduce((sum, group) => sum + group.count, 0);
  const baseXp = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const adjusted = Math.round(baseXp * best.multiplier);

  for (const group of groups) {
    if (group.monster.level > partyLevel + 3) {
      warnings.push(
        `${group.monster.name}: CR ${formatCr(group.monster.level)} выше партии более чем на 3 — возможен TPK.`,
      );
    }
  }
  if (totalCount === 1 && adjusted >= dndBudget(partyLevel, partySize, "hard")) {
    warnings.push(
      "Один монстр на hard/deadly: из-за действия-экономии бой может быть опаснее расчёта.",
    );
  }

  return {
    partyLevel,
    partySize,
    difficulty,
    budget,
    baseXp,
    spent: adjusted,
    awardedXp: Math.round(baseXp / partySize),
    multiplier: best.multiplier,
    threat: threatFor(adjusted, partyLevel, partySize),
    groups,
    totalCount,
    warnings,
  };
}
