/**
 * D&D 5e (2014): боевой трекер.
 *
 * Автоматизирует инициативу, ходы, HP/temp HP, состояния, преимущество/помеху,
 * концентрацию и спасброски от смерти. Спорные трактовки логируются, а не
 * блокируются.
 */

import {
  rollD20,
  type Condition,
  type Rng,
} from "../../core/combat";

export type DndRollMode = "normal" | "advantage" | "disadvantage";

export const DND_CONDITION_DEFS: Record<
  string,
  { name: string; valued?: boolean }
> = {
  blinded: { name: "blinded" },
  charmed: { name: "charmed" },
  deafened: { name: "deafened" },
  exhaustion: { name: "exhaustion", valued: true },
  frightened: { name: "frightened" },
  grappled: { name: "grappled" },
  incapacitated: { name: "incapacitated" },
  invisible: { name: "invisible" },
  paralyzed: { name: "paralyzed" },
  petrified: { name: "petrified" },
  poisoned: { name: "poisoned" },
  prone: { name: "prone" },
  restrained: { name: "restrained" },
  stunned: { name: "stunned" },
  unconscious: { name: "unconscious" },
};

export function dndConditionName(slug: string): string {
  return DND_CONDITION_DEFS[slug]?.name ?? slug;
}

export interface DndActions {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
}

export interface DndCombatant {
  id: string;
  name: string;
  kind: "pc" | "npc";
  level: number;
  cr?: string;
  ac?: number;
  hp: { current: number; max: number; temp: number };
  initiative: number | null;
  initiativeMod: number;
  conditions: Condition[];
  actions: DndActions;
  concentration?: { spell: string; rounds?: number };
  deathSaves: { successes: number; failures: number };
  stable: boolean;
  dead: boolean;
  rollMode: DndRollMode;
  notes?: string;
}

export interface DndCombatState {
  version: 1;
  systemId: "dnd5e";
  round: number;
  activeId: string | null;
  started: boolean;
  ended?: boolean;
  combatants: DndCombatant[];
  log: Array<{ round: number; text: string }>;
}

export interface NewDndCombatant {
  name: string;
  kind?: "pc" | "npc";
  level?: number;
  cr?: string;
  maxHp?: number;
  ac?: number;
  initiative?: number | null;
  initiativeMod?: number;
  notes?: string;
}

export function createDndState(): DndCombatState {
  return {
    version: 1,
    systemId: "dnd5e",
    round: 0,
    activeId: null,
    started: false,
    ended: false,
    combatants: [],
    log: [],
  };
}

export function makeDndCombatant(input: NewDndCombatant): DndCombatant {
  const max = Math.max(1, Math.round(input.maxHp ?? 1));
  return {
    id: globalThis.crypto.randomUUID(),
    name: input.name,
    kind: input.kind ?? "npc",
    level: input.level ?? 0,
    cr: input.cr,
    ac: input.ac,
    hp: { current: max, max, temp: 0 },
    initiative: input.initiative ?? null,
    initiativeMod: input.initiativeMod ?? 0,
    conditions: [],
    actions: { action: false, bonus: false, reaction: false },
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    rollMode: "normal",
    notes: input.notes,
  };
}

export function logDnd(state: DndCombatState, text: string): void {
  state.log.push({ round: state.round, text });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}

export function findDndCombatant(
  state: DndCombatState,
  ref: string,
): DndCombatant {
  const needle = ref.trim().toLowerCase();
  const exact = state.combatants.filter(
    (combatant) =>
      combatant.id === ref || combatant.name.toLowerCase() === needle,
  );
  if (exact.length === 1) return exact[0]!;
  const partial = state.combatants.filter((combatant) =>
    combatant.name.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return partial[0]!;
  if (!partial.length) throw new Error(`Не найден боец: «${ref}»`);
  throw new Error(
    `Неоднозначное имя «${ref}»: ${partial.map((c) => c.name).join(", ")}`,
  );
}

export function dndConditionValue(
  combatant: DndCombatant,
  slug: string,
): number {
  const condition = combatant.conditions.find((item) => item.slug === slug);
  return condition?.value ?? (condition ? 1 : 0);
}

export function hasDndCondition(
  combatant: DndCombatant,
  slug: string,
): boolean {
  return combatant.conditions.some((item) => item.slug === slug);
}

export function addDndCondition(
  state: DndCombatState,
  ref: string,
  slug: string,
  value?: number,
  options: { note?: string; rounds?: number } = {},
): void {
  const combatant = findDndCombatant(state, ref);
  const def = DND_CONDITION_DEFS[slug];
  if (!def) {
    throw new Error(
      `Неизвестное состояние «${slug}». Известные: ${Object.keys(
        DND_CONDITION_DEFS,
      ).join(", ")}`,
    );
  }
  const existing = combatant.conditions.find((item) => item.slug === slug);
  if (def.valued) {
    const next = Math.max(1, Math.min(6, Math.round(value ?? 1)));
    if (existing) {
      existing.value = Math.max(existing.value ?? 1, next);
    } else {
      combatant.conditions.push({
        slug,
        value: next,
        note: options.note,
        rounds: options.rounds,
      });
    }
    logDnd(state, `${combatant.name}: ${dndConditionName(slug)} ${next}`);
    return;
  }
  if (!existing) {
    combatant.conditions.push({
      slug,
      note: options.note,
      rounds: options.rounds,
    });
    logDnd(state, `${combatant.name}: +${dndConditionName(slug)}`);
  }
}

export function removeDndCondition(
  state: DndCombatState,
  ref: string,
  slug: string,
): void {
  const combatant = findDndCombatant(state, ref);
  if (!hasDndCondition(combatant, slug)) return;
  combatant.conditions = combatant.conditions.filter(
    (item) => item.slug !== slug,
  );
  logDnd(state, `${combatant.name}: −${dndConditionName(slug)}`);
}

export function formatDndConditions(combatant: DndCombatant): string {
  if (!combatant.conditions.length) return "—";
  return combatant.conditions
    .map((condition) => {
      const name = dndConditionName(condition.slug);
      return condition.value && condition.value > 1
        ? `${name} ${condition.value}`
        : name;
    })
    .join(", ");
}

function sortedDndCombatants(state: DndCombatState): DndCombatant[] {
  return [...state.combatants].sort((a, b) => {
    const ai = a.initiative ?? -1;
    const bi = b.initiative ?? -1;
    if (bi !== ai) return bi - ai;
    if (a.kind !== b.kind) return a.kind === "pc" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function setDndInitiative(
  state: DndCombatState,
  ref: string,
  value: number | null,
): void {
  const combatant = findDndCombatant(state, ref);
  combatant.initiative = value;
  logDnd(
    state,
    `${combatant.name}: инициатива ${value === null ? "—" : value}`,
  );
}

export function dndTurnOrder(state: DndCombatState): DndCombatant[] {
  return sortedDndCombatants(state).filter((combatant) => !combatant.dead);
}

export function dndActiveCombatant(
  state: DndCombatState,
): DndCombatant | null {
  if (!state.activeId) return null;
  return (
    state.combatants.find((combatant) => combatant.id === state.activeId) ??
    null
  );
}

export function startDndEncounter(
  state: DndCombatState,
  rng: Rng = Math.random,
): void {
  if (!state.combatants.length) {
    throw new Error("В трекере нет бойцов.");
  }
  if (state.started) {
    throw new Error("Бой уже идёт. Сначала заверши или сбрось его.");
  }
  if (!state.combatants.some((combatant) => !combatant.dead)) {
    throw new Error("Все бойцы мертвы.");
  }

  for (const combatant of state.combatants) {
    if (combatant.dead) continue;
    if (combatant.initiative === null) {
      combatant.initiative = rollD20(rng) + combatant.initiativeMod;
    }
    combatant.actions = { action: false, bonus: false, reaction: false };
  }

  const order = dndTurnOrder(state);
  state.started = true;
  state.ended = false;
  state.round = 1;
  state.activeId = order[0]!.id;
  logDnd(state, "Бой начался. Раунд 1");
  beginDndTurn(state);
}

/** Завершает бой, сохраняя состав, HP и журнал. */
export function endDndEncounter(state: DndCombatState): void {
  if (state.ended) return;
  if (!state.started) {
    throw new Error("Бой ещё не начат.");
  }
  state.ended = true;
  state.started = false;
  state.activeId = null;
  logDnd(state, "Бой окончен");
}

export function beginDndTurn(state: DndCombatState): void {
  const combatant = dndActiveCombatant(state);
  if (!combatant) return;
  combatant.actions = { action: false, bonus: false, reaction: false };
  logDnd(state, `Ход: ${combatant.name}`);
  if (combatant.hp.current <= 0 && !combatant.dead) {
    logDnd(
      state,
      `${combatant.name}: нужен спасбросок от смерти (DC 10).`,
    );
  }
}

export function endDndTurn(state: DndCombatState): void {
  if (!state.started) throw new Error("Бой ещё не начат.");
  const combatant = dndActiveCombatant(state);
  if (!combatant) return;

  for (const condition of [...combatant.conditions]) {
    if (condition.rounds === undefined) continue;
    condition.rounds -= 1;
    if (condition.rounds <= 0) {
      combatant.conditions = combatant.conditions.filter(
        (item) => item !== condition,
      );
      logDnd(
        state,
        `${combatant.name}: ${dndConditionName(condition.slug)} закончился.`,
      );
    }
  }

  if (combatant.concentration?.rounds !== undefined) {
    combatant.concentration.rounds -= 1;
    if (combatant.concentration.rounds <= 0) {
      logDnd(
        state,
        `${combatant.name}: концентрация «${combatant.concentration.spell}» закончилась.`,
      );
      combatant.concentration = undefined;
    }
  }

  advanceDndTurn(state);
}

function advanceDndTurn(state: DndCombatState): void {
  const order = sortedDndCombatants(state);
  if (!order.some((combatant) => !combatant.dead)) {
    state.started = false;
    state.activeId = null;
    logDnd(state, "Бой окончен: живых участников нет.");
    return;
  }

  const currentIndex = order.findIndex(
    (combatant) => combatant.id === state.activeId,
  );
  let nextIndex = -1;
  for (let step = 1; step <= order.length; step++) {
    const index = (currentIndex + step) % order.length;
    if (!order[index]!.dead) {
      nextIndex = index;
      break;
    }
  }
  if (nextIndex === -1) {
    state.started = false;
    state.activeId = null;
    logDnd(state, "Бой окончен.");
    return;
  }

  if (currentIndex >= 0 && nextIndex <= currentIndex) {
    state.round += 1;
    logDnd(state, `Раунд ${state.round}`);
  }
  state.activeId = order[nextIndex]!.id;
  beginDndTurn(state);
}

export interface DndDamageResult {
  dealt: number;
  absorbed: number;
  concentrationDc?: number;
  failures: number;
  dead: boolean;
}

function failDeathSave(
  state: DndCombatState,
  combatant: DndCombatant,
  amount: number,
): void {
  combatant.deathSaves.failures = Math.min(
    3,
    combatant.deathSaves.failures + amount,
  );
  if (combatant.deathSaves.failures >= 3) {
    combatant.dead = true;
    combatant.stable = false;
    logDnd(state, `${combatant.name} умирает.`);
  }
}

export function applyDndDamage(
  state: DndCombatState,
  ref: string,
  rawAmount: number,
  options: { crit?: boolean; type?: string } = {},
): DndDamageResult {
  const combatant = findDndCombatant(state, ref);
  const amount = Math.max(0, Math.round(rawAmount));
  let concentrationDc = combatant.concentration
    ? Math.max(10, Math.floor(amount / 2))
    : undefined;

  if (combatant.dead) {
    return {
      dealt: 0,
      absorbed: 0,
      concentrationDc,
      failures: combatant.deathSaves.failures,
      dead: true,
    };
  }

  if (combatant.hp.current <= 0) {
    if (options.crit) failDeathSave(state, combatant, 2);
    else failDeathSave(state, combatant, 1);
    logDnd(
      state,
      `${combatant.name}: урон по лежащему без сознания — провал спасброска от смерти.`,
    );
    return {
      dealt: amount,
      absorbed: 0,
      concentrationDc,
      failures: combatant.deathSaves.failures,
      dead: combatant.dead,
    };
  }

  let remaining = amount;
  const absorbed = Math.min(combatant.hp.temp, remaining);
  combatant.hp.temp -= absorbed;
  remaining -= absorbed;
  combatant.hp.current = Math.max(0, combatant.hp.current - remaining);

  logDnd(
    state,
    `${combatant.name}: −${amount} HP${options.type ? ` (${options.type})` : ""}${
      absorbed ? `, temp −${absorbed}` : ""
    } → ${combatant.hp.current}/${combatant.hp.max}`,
  );

  if (concentrationDc !== undefined) {
    logDnd(
      state,
      `${combatant.name}: проверка концентрации Constitution, DC ${concentrationDc}.`,
    );
  }

  if (combatant.hp.current === 0) {
    combatant.stable = false;
    combatant.deathSaves = { successes: 0, failures: 0 };
    if (!hasDndCondition(combatant, "unconscious")) {
      combatant.conditions.push({ slug: "unconscious" });
    }
    logDnd(
      state,
      `${combatant.name} падает без сознания. Начинаются спасброски от смерти.`,
    );
    if (amount >= combatant.hp.max && combatant.hp.max > 0) {
      logDnd(
        state,
        `${combatant.name}: урон не меньше максимума HP — возможна мгновенная смерть по правилу massive damage.`,
      );
    }
  }

  return {
    dealt: amount,
    absorbed,
    concentrationDc,
    failures: combatant.deathSaves.failures,
    dead: combatant.dead,
  };
}

export function healDnd(
  state: DndCombatState,
  ref: string,
  amount: number,
): void {
  const combatant = findDndCombatant(state, ref);
  if (combatant.dead) {
    throw new Error(`${combatant.name} мёртв — обычное лечение не поможет.`);
  }
  const wasDown = combatant.hp.current <= 0;
  const before = combatant.hp.current;
  combatant.hp.current = Math.min(
    combatant.hp.max,
    combatant.hp.current + Math.max(0, Math.round(amount)),
  );
  if (wasDown && combatant.hp.current > 0) {
    combatant.conditions = combatant.conditions.filter(
      (condition) => condition.slug !== "unconscious",
    );
    combatant.deathSaves = { successes: 0, failures: 0 };
    combatant.stable = false;
    logDnd(state, `${combatant.name} приходит в сознание.`);
  }
  logDnd(
    state,
    `${combatant.name}: +${combatant.hp.current - before} HP → ${combatant.hp.current}/${combatant.hp.max}`,
  );
}

export function addDndTempHp(
  state: DndCombatState,
  ref: string,
  amount: number,
): void {
  const combatant = findDndCombatant(state, ref);
  const value = Math.max(0, Math.round(amount));
  combatant.hp.temp = Math.max(combatant.hp.temp, value);
  logDnd(state, `${combatant.name}: temp HP ${combatant.hp.temp}`);
}

export function spendDndAction(
  state: DndCombatState,
  ref: string,
  kind: keyof DndActions,
): void {
  const combatant = findDndCombatant(state, ref);
  if (combatant.actions[kind]) {
    throw new Error(`Это ${kind} уже использовано в этом ходу.`);
  }
  combatant.actions[kind] = true;
  const labels: Record<keyof DndActions, string> = {
    action: "действие",
    bonus: "бонусное действие",
    reaction: "реакция",
  };
  logDnd(state, `${combatant.name}: использовано ${labels[kind]}.`);
}

export function setDndRollMode(
  state: DndCombatState,
  ref: string,
  mode: DndRollMode,
): void {
  const combatant = findDndCombatant(state, ref);
  combatant.rollMode = mode;
  const labels: Record<DndRollMode, string> = {
    normal: "обычный бросок",
    advantage: "преимущество",
    disadvantage: "помеха",
  };
  logDnd(state, `${combatant.name}: ${labels[mode]}.`);
}

export interface D20ModeResult {
  rolls: number[];
  result: number;
  mode: DndRollMode;
}

export function rollD20Mode(
  rng: Rng = Math.random,
  mode: DndRollMode = "normal",
): D20ModeResult {
  const first = rollD20(rng);
  if (mode === "normal") {
    return { rolls: [first], result: first, mode };
  }
  const second = rollD20(rng);
  return {
    rolls: [first, second],
    result: mode === "advantage" ? Math.max(first, second) : Math.min(first, second),
    mode,
  };
}

export interface DndCheckResult {
  total: number;
  roll: D20ModeResult;
  success?: boolean;
}

export function rollDndCheck(
  state: DndCombatState,
  ref: string,
  options: { bonus?: number; dc?: number; label?: string } = {},
  rng: Rng = Math.random,
): DndCheckResult {
  const combatant = findDndCombatant(state, ref);
  const roll = rollD20Mode(rng, combatant.rollMode);
  const total = roll.result + (options.bonus ?? 0);
  const success =
    options.dc === undefined ? undefined : total >= options.dc;
  const modeLabel =
    roll.mode === "advantage"
      ? " (преимущество)"
      : roll.mode === "disadvantage"
        ? " (помеха)"
        : "";
  const dcLabel =
    options.dc === undefined
      ? ""
      : ` против DC ${options.dc} — ${success ? "успех" : "провал"}`;
  logDnd(
    state,
    `${combatant.name}: ${options.label ?? "d20"}${modeLabel} [${roll.rolls.join(
      ", ",
    )}] → ${total}${dcLabel}`,
  );
  return { total, roll, success };
}

export function setDndConcentration(
  state: DndCombatState,
  ref: string,
  spell: string,
  rounds?: number,
): void {
  const combatant = findDndCombatant(state, ref);
  const trimmed = spell.trim();
  if (!trimmed) {
    combatant.concentration = undefined;
    logDnd(state, `${combatant.name}: концентрация снята.`);
    return;
  }
  combatant.concentration = {
    spell: trimmed,
    rounds: rounds && rounds > 0 ? rounds : undefined,
  };
  logDnd(state, `${combatant.name}: концентрация «${trimmed}».`);
}

export function clearDndConcentration(
  state: DndCombatState,
  ref: string,
): void {
  const combatant = findDndCombatant(state, ref);
  if (!combatant.concentration) return;
  logDnd(
    state,
    `${combatant.name}: концентрация «${combatant.concentration.spell}» прервана.`,
  );
  combatant.concentration = undefined;
}

export interface DeathSaveResult {
  roll: number;
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
  revived: boolean;
}

export function rollDndDeathSave(
  state: DndCombatState,
  ref: string,
  rng: Rng = Math.random,
): DeathSaveResult {
  const combatant = findDndCombatant(state, ref);
  if (combatant.dead) {
    return {
      roll: 0,
      successes: combatant.deathSaves.successes,
      failures: combatant.deathSaves.failures,
      stable: combatant.stable,
      dead: true,
      revived: false,
    };
  }
  if (combatant.hp.current > 0) {
    throw new Error(`${combatant.name} в сознании — спасбросок не нужен.`);
  }

  const roll = rollD20(rng);
  let revived = false;

  if (roll === 20) {
    combatant.hp.current = 1;
    combatant.conditions = combatant.conditions.filter(
      (condition) => condition.slug !== "unconscious",
    );
    combatant.deathSaves = { successes: 0, failures: 0 };
    combatant.stable = false;
    revived = true;
    logDnd(state, `${combatant.name}: натуральная 20 — приходит в сознание с 1 HP.`);
  } else if (roll === 1) {
    combatant.deathSaves.failures = Math.min(
      3,
      combatant.deathSaves.failures + 2,
    );
    logDnd(state, `${combatant.name}: натуральная 1 — два провала спасброска от смерти.`);
  } else if (roll >= 10) {
    combatant.deathSaves.successes = Math.min(
      3,
      combatant.deathSaves.successes + 1,
    );
    logDnd(state, `${combatant.name}: спасбросок от смерти ${roll} — успех.`);
  } else {
    combatant.deathSaves.failures = Math.min(
      3,
      combatant.deathSaves.failures + 1,
    );
    logDnd(state, `${combatant.name}: спасбросок от смерти ${roll} — провал.`);
  }

  if (combatant.deathSaves.failures >= 3) {
    combatant.dead = true;
    combatant.stable = false;
    logDnd(state, `${combatant.name} умирает.`);
  } else if (combatant.deathSaves.successes >= 3) {
    combatant.stable = true;
    logDnd(state, `${combatant.name} стабилизирован.`);
  }

  return {
    roll,
    successes: combatant.deathSaves.successes,
    failures: combatant.deathSaves.failures,
    stable: combatant.stable,
    dead: combatant.dead,
    revived,
  };
}

export function stabilizeDnd(
  state: DndCombatState,
  ref: string,
): void {
  const combatant = findDndCombatant(state, ref);
  if (combatant.hp.current > 0) return;
  combatant.stable = true;
  combatant.deathSaves = { successes: 3, failures: combatant.deathSaves.failures };
  logDnd(state, `${combatant.name} стабилизирован вручную.`);
}


