/**
 * Математика энкаунтеров Pathfinder 2e.
 *
 * Бюджет = XP за персонажа (trivial 10 / low 15 / moderate 20 / severe 30 /
 * extreme 40) умножить на размер партии. Существа дают XP по разнице уровней
 * с партией: PL-4..10, PL-3..15, PL-2..20, PL-1..30, PL..40, PL+1..60,
 * PL+2..80, PL+3..120, PL+4..160.
 */

export type Difficulty = "trivial" | "low" | "moderate" | "severe" | "extreme";

export const DIFFICULTIES: readonly Difficulty[] = [
  "trivial",
  "low",
  "moderate",
  "severe",
  "extreme",
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  trivial: "trivial",
  low: "low",
  moderate: "moderate",
  severe: "severe",
  extreme: "extreme",
};

export const XP_PER_CHARACTER: Record<Difficulty, number> = {
  trivial: 10,
  low: 15,
  moderate: 20,
  severe: 30,
  extreme: 40,
};

export const CREATURE_XP: ReadonlyArray<{ diff: number; xp: number }> = [
  { diff: -4, xp: 10 },
  { diff: -3, xp: 15 },
  { diff: -2, xp: 20 },
  { diff: -1, xp: 30 },
  { diff: 0, xp: 40 },
  { diff: 1, xp: 60 },
  { diff: 2, xp: 80 },
  { diff: 3, xp: 120 },
  { diff: 4, xp: 160 },
];

/** XP за существо данного уровня относительно уровня партии. */
export function creatureXp(level: number, partyLevel: number): number {
  const diff = Math.round(level - partyLevel);
  if (diff <= -4) return 10;
  if (diff >= 4) return 160;
  const row = CREATURE_XP.find((r) => r.diff === diff);
  return row ? row.xp : 40;
}

/** Бюджет энкаунтера в XP. */
export function budget(partySize: number, difficulty: Difficulty): number {
  return XP_PER_CHARACTER[difficulty] * Math.max(1, partySize);
}

/** Уровень угрозы по фактически потраченному XP. */
export function threatFor(
  spent: number,
  partySize: number,
): Difficulty | "beyond-extreme" {
  if (spent > budget(partySize, "extreme")) return "beyond-extreme";
  let result: Difficulty = "trivial";
  for (const d of DIFFICULTIES) {
    if (spent >= budget(partySize, d)) result = d;
  }
  return result;
}

export interface MonsterRef {
  id?: string;
  name: string;
  level: number;
  roles?: string[];
  traits?: string[];
  source?: string;
  kind?: "creature" | "hazard";
  hp?: number;
  ac?: number;
  initiativeMod?: number;
}

export interface EncounterRequest {
  partyLevel: number;
  partySize?: number;
  difficulty?: Difficulty;
  theme?: string[];
  maxCreatures?: number;
  seed?: number;
  pool: MonsterRef[];
}

export interface EncounterGroup {
  monster: MonsterRef;
  count: number;
  xpEach: number;
  subtotal: number;
}

export interface EncounterPlan {
  partyLevel: number;
  partySize: number;
  difficulty: Difficulty;
  budget: number;
  spent: number;
  awardedXp: number;
  threat: Difficulty | "beyond-extreme";
  groups: EncounterGroup[];
  totalCount: number;
  warnings: string[];
}

interface CompositionPick {
  index: number;
  count: number;
}

const IDEAL_COUNT: Record<Difficulty, number> = {
  trivial: 1,
  low: 2,
  moderate: 3,
  severe: 4,
  extreme: 5,
};

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
    .flatMap((t) => t.toLowerCase().split(/[\s,]+/))
    .map((t) => t.trim())
    .filter(Boolean);
}

function matchesTheme(monster: MonsterRef, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const haystack = [monster.name, ...(monster.traits ?? []), ...(monster.roles ?? [])]
    .join(" ")
    .toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

function emptyPlan(
  req: Required<Pick<EncounterRequest, "partyLevel" | "partySize" | "difficulty">>,
  warnings: string[],
): EncounterPlan {
  const target = budget(req.partySize, req.difficulty);
  return {
    partyLevel: req.partyLevel,
    partySize: req.partySize,
    difficulty: req.difficulty,
    budget: target,
    spent: 0,
    awardedXp: 0,
    threat: "trivial",
    groups: [],
    totalCount: 0,
    warnings,
  };
}

/**
 * Подбирает состав энкаунтера под бюджет.
 *
 * Решение ищется динамическим программированием по «потраченным» единицам
 * (5 XP) и количеству существ. Сначала максимизируется точность попадания
 * в бюджет, затем — правдоподобный состав (2-5 существ, не один босс на
 * severe/extreme, не больше 6 инициатив).
 */
export function generateEncounter(req: EncounterRequest): EncounterPlan {
  const partyLevel = req.partyLevel;
  const partySize = req.partySize ?? 4;
  const difficulty = req.difficulty ?? "moderate";
  const target = budget(partySize, difficulty);
  const maxCreatures = Math.max(1, req.maxCreatures ?? 8);
  const warnings: string[] = [];
  const tokens = themeTokens(req.theme);

  const base = { partyLevel, partySize, difficulty };

  if (!Number.isFinite(partyLevel) || partyLevel < -1 || partyLevel > 25) {
    return emptyPlan(base, ["Уровень партии должен быть от -1 до 25."]);
  }
  if (!req.pool.length) {
    return emptyPlan(base, [
      "Пул существ пуст. Импортируй бестиарий: npm run import:foundry -- <путь к packs>",
    ]);
  }

  let pool = req.pool.filter((m) => {
    if (!Number.isFinite(m.level)) return false;
    if (m.level < partyLevel - 4 || m.level > partyLevel + 4) return false;
    return creatureXp(m.level, partyLevel) <= target;
  });

  if (tokens.length) {
    const themed = pool.filter((m) => matchesTheme(m, tokens));
    if (themed.length) pool = themed;
    else
      warnings.push(
        `По теме «${tokens.join(", ")}» подходящих существ нет — показываю любых.`,
      );
  }

  // Одинаковые имена (например, из разных книг) не должны дублироваться.
  const seen = new Set<string>();
  pool = pool.filter((m) => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!pool.length) {
    return emptyPlan(base, [
      ...warnings,
      `В пуле нет существ уровня ${partyLevel - 4}..${partyLevel + 4} при бюджете ${target} XP.`,
    ]);
  }

  const candidates = shuffled(pool, req.seed).map((m) => ({
    monster: m,
    units: creatureXp(m.level, partyLevel) / 5,
  }));

  // Допускаем перебор на 10 XP, чтобы не проваливаться в пустой состав.
  const maxUnits = Math.floor((target + 10) / 5);
  let states = new Map<string, CompositionPick[]>();
  states.set("0|0", []);

  for (let i = 0; i < candidates.length; i++) {
    const units = candidates[i]!.units;
    const maxCopies = Math.min(4, Math.floor(maxUnits / units));
    if (maxCopies < 1) continue;
    const next = new Map(states);
    for (const [key, picks] of states) {
      const [spentUnits, count] = key.split("|").map(Number) as [number, number];
      for (let k = 1; k <= maxCopies; k++) {
        const ns = spentUnits + units * k;
        const nc = count + k;
        if (ns > maxUnits || nc > maxCreatures) break;
        const nk = `${ns}|${nc}`;
        if (!next.has(nk)) next.set(nk, [...picks, { index: i, count: k }]);
      }
    }
    states = next;
  }

  const ideal = IDEAL_COUNT[difficulty];
  let best: { spent: number; picks: CompositionPick[]; score: number } | null = null;

  for (const [key, picks] of states) {
    const [units, count] = key.split("|").map(Number) as [number, number];
    if (!count) continue;
    const spent = units * 5;
    let score = Math.abs(spent - target) * 100;
    if (spent > target) score += (spent - target) * 50;
    score += Math.abs(count - ideal) * 15;
    if (count === 1 && (difficulty === "severe" || difficulty === "extreme"))
      score += 25;
    if (count > 6) score += (count - 6) * 20;
    if (!best || score < best.score) best = { spent, picks, score };
  }

  if (!best) {
    return emptyPlan(base, [...warnings, "Не удалось собрать состав под этот бюджет."]);
  }

  const groups: EncounterGroup[] = best.picks
    .map((pick) => {
      const monster = candidates[pick.index]!.monster;
      const xpEach = creatureXp(monster.level, partyLevel);
      return {
        monster,
        count: pick.count,
        xpEach,
        subtotal: xpEach * pick.count,
      };
    })
    .sort((a, b) => b.monster.level - a.monster.level || a.monster.name.localeCompare(b.monster.name));

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const spent = groups.reduce((sum, g) => sum + g.subtotal, 0);

  if (spent !== target) {
    warnings.push(
      `Точный бюджет не собирается: цель ${target} XP, состав ${spent} XP.`,
    );
  }
  if (totalCount > 6) {
    warnings.push("Больше 6 существ — бой будет медленным, готовь статблоки заранее.");
  }
  if (totalCount === 1 && (difficulty === "severe" || difficulty === "extreme")) {
    warnings.push(
      "Один монстр на severe/extreme: добавь миньонов, логово или сложную местность.",
    );
  }
  if (groups.some((g) => g.monster.level >= partyLevel + 4)) {
    warnings.push("В составе есть существо PL+4 — крайне смертельно, используй осознанно.");
  }
  if (groups.some((g) => g.monster.kind === "hazard")) {
    warnings.push("Опасности (hazards) тоже тратят XP — не забудь про их срабатывание.");
  }

  return {
    partyLevel,
    partySize,
    difficulty,
    budget: target,
    spent,
    awardedXp: spent,
    threat: threatFor(spent, partySize),
    groups,
    totalCount,
    warnings,
  };
}
