/**
 * Боевой трекер: инициатива, действия, MAP, условия, урон, dying/wounded,
 * persistent damage и восстановление.
 *
 * Движок помогает мастеру, но не заменяет решение за столом: спорные случаи
 * логируются, а не «запрещаются».
 */

export type Rng = () => number;
export function rollD20(rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * 20);
}

export type ConditionTick = "start" | "end";

export interface ConditionDef {
  name: string;
  valued?: boolean;
  tick?: ConditionTick;
}

export const CONDITION_DEFS: Record<string, ConditionDef> = {
  blinded: { name: "blinded" },
  broken: { name: "broken" },
  clumsy: { name: "clumsy", valued: true },
  concealed: { name: "concealed" },
  confused: { name: "confused" },
  controlled: { name: "controlled" },
  cursebound: { name: "cursebound", valued: true },
  dazzled: { name: "dazzled" },
  deafened: { name: "deafened" },
  doomed: { name: "doomed", valued: true },
  drained: { name: "drained", valued: true },
  dying: { name: "dying", valued: true },
  encumbered: { name: "encumbered" },
  enfeebled: { name: "enfeebled", valued: true },
  fascinated: { name: "fascinated" },
  fatigued: { name: "fatigued" },
  fleeing: { name: "fleeing" },
  friendly: { name: "friendly" },
  frightened: { name: "frightened", valued: true, tick: "end" },
  grabbed: { name: "grabbed" },
  helpful: { name: "helpful" },
  hidden: { name: "hidden" },
  hostile: { name: "hostile" },
  immobilized: { name: "immobilized" },
  indifferent: { name: "indifferent" },
  invisible: { name: "invisible" },
  observed: { name: "observed" },
  "off-guard": { name: "off-guard" },
  paralyzed: { name: "paralyzed" },
  "persistent-damage": { name: "persistent damage" },
  petrified: { name: "petrified" },
  prone: { name: "prone" },
  quickened: { name: "quickened", valued: true },
  restrained: { name: "restrained" },
  sickened: { name: "sickened", valued: true, tick: "end" },
  slowed: { name: "slowed", valued: true },
  stunned: { name: "stunned", valued: true, tick: "start" },
  stupefied: { name: "stupefied", valued: true },
  unconscious: { name: "unconscious" },
  undetected: { name: "undetected" },
  unfriendly: { name: "unfriendly" },
  unnoticed: { name: "unnoticed" },
  wounded: { name: "wounded", valued: true },
};

export function conditionName(slug: string): string {
  return CONDITION_DEFS[slug]?.name ?? slug;
}

export interface Condition {
  slug: string;
  value?: number;
  note?: string;
  /** Сколько ходов бойца ещё действует эффект (уменьшается в конце его хода). */
  rounds?: number;
}

export type CombatantKind = "pc" | "npc" | "hazard";

export interface Combatant {
  id: string;
  name: string;
  kind: CombatantKind;
  level: number;
  ac?: number;
  hp: { current: number; max: number; temp: number };
  initiative: number | null;
  conditions: Condition[];
  actionsSpent: number;
  /** Действия, потерянные из-за stunned в начале текущего хода. */
  actionsLost: number;
  attacksThisTurn: number;
  reactionsUsed: number;
  reactionsMax: number;
  resistances?: Record<string, number>;
  weaknesses?: Record<string, number>;
  immunities?: string[];
  notes?: string;
  dead?: boolean;
}

export interface LogEntry {
  round: number;
  text: string;
}

export interface CombatState {
  version: 1;
  round: number;
  activeId: string | null;
  started: boolean;
  combatants: Combatant[];
  log: LogEntry[];
}

export interface NewCombatant {
  name: string;
  kind?: CombatantKind;
  level?: number;
  maxHp?: number;
  ac?: number;
  initiative?: number | null;
  resistances?: Record<string, number>;
  weaknesses?: Record<string, number>;
  immunities?: string[];
  notes?: string;
}

export function makeCombatant(input: NewCombatant): Combatant {
  const max = Math.max(1, Math.round(input.maxHp ?? 1));
  return {
    id: globalThis.crypto.randomUUID(),
    name: input.name,
    kind: input.kind ?? "npc",
    level: input.level ?? 0,
    ac: input.ac,
    hp: { current: max, max, temp: 0 },
    initiative: input.initiative ?? null,
    conditions: [],
    actionsSpent: 0,
    actionsLost: 0,
    attacksThisTurn: 0,
    reactionsUsed: 0,
    reactionsMax: 1,
    resistances: input.resistances,
    weaknesses: input.weaknesses,
    immunities: input.immunities,
    notes: input.notes,
  };
}

export function createState(): CombatState {
  return {
    version: 1,
    round: 0,
    activeId: null,
    started: false,
    combatants: [],
    log: [],
  };
}

export function log(state: CombatState, text: string): void {
  state.log.push({ round: state.round, text });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}

export function findCombatant(state: CombatState, ref: string): Combatant {
  const needle = ref.trim().toLowerCase();
  const exact = state.combatants.filter(
    (c) => c.id === ref || c.name.toLowerCase() === needle,
  );
  if (exact.length === 1) return exact[0]!;

  const partial = state.combatants.filter((c) => c.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0]!;
  if (!partial.length) throw new Error(`Не найден боец: «${ref}»`);
  throw new Error(
    `Неоднозначное имя «${ref}»: ${partial.map((c) => c.name).join(", ")}`,
  );
}

export function conditionValue(c: Combatant, slug: string): number {
  const instance = c.conditions.find((x) => x.slug === slug);
  if (!instance) return 0;
  return instance.value ?? 1;
}

export function hasCondition(c: Combatant, slug: string): boolean {
  return c.conditions.some((x) => x.slug === slug);
}

function setConditionValue(c: Combatant, slug: string, value: number): void {
  const existing = c.conditions.find((x) => x.slug === slug);
  if (value <= 0) {
    c.conditions = c.conditions.filter((x) => x.slug !== slug);
    return;
  }
  if (existing) existing.value = value;
  else c.conditions.push({ slug, value });
}

function removeConditionSilent(c: Combatant, slug: string): void {
  c.conditions = c.conditions.filter((x) => x.slug !== slug);
}

export interface ConditionOptions {
  note?: string;
  rounds?: number;
}

export function addCondition(
  state: CombatState,
  ref: string,
  slug: string,
  value?: number,
  options: ConditionOptions = {},
): Condition {
  const c = findCombatant(state, ref);
  const def = CONDITION_DEFS[slug];
  if (!def) {
    throw new Error(
      `Неизвестное состояние «${slug}». Известные: ${Object.keys(CONDITION_DEFS).join(", ")}`,
    );
  }

  if (slug === "persistent-damage") {
    const instance: Condition = {
      slug,
      value: Math.max(1, Math.round(value ?? 1)),
      note: options.note,
      rounds: options.rounds,
    };
    c.conditions.push(instance);
    log(
      state,
      `${c.name}: persistent damage ${instance.value}${options.note ? ` (${options.note})` : ""}`,
    );
    return instance;
  }

  if (!def.valued) {
    if (!hasCondition(c, slug)) {
      c.conditions.push({ slug, rounds: options.rounds });
      log(state, `${c.name}: +${conditionName(slug)}`);
    }
    return c.conditions.find((x) => x.slug === slug)!;
  }

  const next = Math.max(1, Math.round(value ?? 1));
  const existing = c.conditions.find((x) => x.slug === slug);
  if (existing) {
    const updated = Math.max(existing.value ?? 1, next);
    existing.value = updated;
    log(state, `${c.name}: ${conditionName(slug)} → ${updated}`);
  } else {
    c.conditions.push({ slug, value: next, rounds: options.rounds });
    log(state, `${c.name}: +${conditionName(slug)} ${next}`);
  }
  return c.conditions.find((x) => x.slug === slug)!;
}

export function removeCondition(state: CombatState, ref: string, slug: string): void {
  const c = findCombatant(state, ref);
  if (!hasCondition(c, slug)) return;
  removeConditionSilent(c, slug);
  log(state, `${c.name}: −${conditionName(slug)}`);
}

function sortedCombatants(state: CombatState): Combatant[] {
  return [...state.combatants].sort((a, b) => {
    const ai = a.initiative ?? -1;
    const bi = b.initiative ?? -1;
    if (bi !== ai) return bi - ai;
    if (a.kind !== b.kind) return a.kind === "pc" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function turnOrder(state: CombatState): Combatant[] {
  return sortedCombatants(state).filter((c) => !c.dead);
}

export function activeCombatant(state: CombatState): Combatant | null {
  if (!state.activeId) return null;
  return state.combatants.find((c) => c.id === state.activeId) ?? null;
}

export function actionsRemaining(c: Combatant): number {
  const quickened = hasCondition(c, "quickened") ? Math.max(1, conditionValue(c, "quickened")) : 0;
  const slowed = hasCondition(c, "slowed") ? Math.max(1, conditionValue(c, "slowed")) : 0;
  return Math.max(
    0,
    3 + quickened - slowed - c.actionsLost - c.actionsSpent,
  );
}

export function startEncounter(state: CombatState, rng: Rng = Math.random): void {
  if (!state.combatants.length) throw new Error("В трекере нет бойцов.");
  if (state.started) throw new Error("Бой уже идёт. Сначала заверши или сбрось его.");

  for (const c of state.combatants) {
    if (c.initiative === null) c.initiative = rollD20(rng);
    c.actionsSpent = 0;
    c.actionsLost = 0;
    c.attacksThisTurn = 0;
    c.reactionsUsed = 0;
    c.dead = false;
  }

  const order = turnOrder(state);
  if (!order.length) throw new Error("Все бойцы мертвы.");

  state.started = true;
  state.round = 1;
  state.activeId = order[0]!.id;
  log(state, "Бой начался. Раунд 1");
  beginTurn(state, rng);
}

export function beginTurn(state: CombatState, rng: Rng = Math.random): void {
  const c = activeCombatant(state);
  if (!c) return;

  c.actionsSpent = 0;
  c.attacksThisTurn = 0;
  c.reactionsUsed = 0;

  const stunned = conditionValue(c, "stunned");
  c.actionsLost = stunned;
  if (stunned > 0) {
    if (stunned <= 1) removeConditionSilent(c, "stunned");
    else setConditionValue(c, "stunned", stunned - 1);
  }

  log(
    state,
    `Ход: ${c.name}${stunned > 0 ? ` (stunned: −${stunned} действия)` : ""}`,
  );

  if (conditionValue(c, "dying") > 0) recoveryCheck(state, c, rng);
}

export interface RecoveryResult {
  roll: number;
  dc: number;
  delta: number;
  dying: number;
  stable: boolean;
  dead: boolean;
}

/** Проверка восстановления (flat check) в начале хода при dying. */
export function recoveryCheck(
  state: CombatState,
  c: Combatant,
  rng: Rng = Math.random,
): RecoveryResult {
  const dying = conditionValue(c, "dying");
  const dc = 10 + dying;
  const roll = rollD20(rng);

  let degree: number;
  if (roll >= dc + 10) degree = 2;
  else if (roll >= dc) degree = 1;
  else if (roll <= dc - 10) degree = -1;
  else degree = 0;
  if (roll === 20) degree = Math.min(2, degree + 1);
  if (roll === 1) degree = Math.max(-1, degree - 1);

  const delta = degree === 2 ? -2 : degree === 1 ? -1 : degree === 0 ? 1 : 2;
  const next = dying + delta;

  if (next <= 0) {
    removeConditionSilent(c, "dying");
    setConditionValue(c, "wounded", conditionValue(c, "wounded") + 1);
    log(
      state,
      `${c.name}: recovery check ${roll} vs DC ${dc} — стабилизировался (wounded ${conditionValue(c, "wounded")})`,
    );
    return { roll, dc, delta, dying: 0, stable: true, dead: false };
  }

  setConditionValue(c, "dying", next);
  const dead = checkDeath(state, c);
  log(state, `${c.name}: recovery check ${roll} vs DC ${dc} → dying ${next}`);
  return { roll, dc, delta, dying: next, stable: false, dead };
}

function checkDeath(state: CombatState, c: Combatant): boolean {
  const threshold = 4 + conditionValue(c, "doomed");
  if (conditionValue(c, "dying") >= threshold) {
    c.dead = true;
    log(state, `${c.name} умирает (dying ≥ ${threshold}).`);
    return true;
  }
  return false;
}

export interface DamageOptions {
  type?: string;
  crit?: boolean;
}

export interface DamageResult {
  dealt: number;
  absorbed: number;
  dying: number;
  dead: boolean;
}

export function applyDamage(
  state: CombatState,
  ref: string,
  rawAmount: number,
  options: DamageOptions = {},
): DamageResult {
  const c = findCombatant(state, ref);
  const type = options.type?.toLowerCase().trim();
  let amount = Math.max(0, Math.round(rawAmount));

  if (type && c.immunities?.some((i) => i.toLowerCase() === type)) {
    log(state, `${c.name}: иммунитет к ${type}, урон 0`);
    return { dealt: 0, absorbed: 0, dying: conditionValue(c, "dying"), dead: !!c.dead };
  }

  if (type) {
    const resistance = c.resistances?.[type] ?? 0;
    const weakness = c.weaknesses?.[type] ?? 0;
    amount = Math.max(0, amount - resistance + weakness);
  }

  const dyingNow = conditionValue(c, "dying");
  if (dyingNow > 0 || c.hp.current <= 0) {
    const next = dyingNow + (options.crit ? 2 : 1);
    setConditionValue(c, "dying", next);
    const dead = checkDeath(state, c);
    log(state, `${c.name}: ${amount} урона, dying ${next}${dead ? " — смерть" : ""}`);
    return { dealt: amount, absorbed: 0, dying: next, dead };
  }

  let remaining = amount;
  const absorbed = Math.min(c.hp.temp, remaining);
  c.hp.temp -= absorbed;
  remaining -= absorbed;
  c.hp.current = Math.max(0, c.hp.current - remaining);

  log(
    state,
    `${c.name}: −${amount} HP${type ? ` (${type})` : ""}${absorbed ? `, temp −${absorbed}` : ""} → ${c.hp.current}/${c.hp.max}`,
  );

  if (c.hp.current === 0) {
    const dying = 1 + conditionValue(c, "wounded");
    if (!hasCondition(c, "unconscious")) {
      c.conditions.push({ slug: "unconscious" });
    }
    setConditionValue(c, "dying", dying);
    log(state, `${c.name} падает без сознания (dying ${dying}).`);
    checkDeath(state, c);
  }

  return {
    dealt: amount,
    absorbed,
    dying: conditionValue(c, "dying"),
    dead: !!c.dead,
  };
}

export function heal(state: CombatState, ref: string, amount: number): void {
  const c = findCombatant(state, ref);
  if (c.dead) throw new Error(`${c.name} мёртв — обычное лечение не поможет.`);

  const wasDying = conditionValue(c, "dying") > 0;
  const before = c.hp.current;
  c.hp.current = Math.min(c.hp.max, c.hp.current + Math.max(0, Math.round(amount)));

  if (wasDying && c.hp.current > 0) {
    removeConditionSilent(c, "dying");
    removeConditionSilent(c, "unconscious");
    setConditionValue(c, "wounded", conditionValue(c, "wounded") + 1);
    log(state, `${c.name} приходит в себя, wounded +1.`);
  }

  if (c.hp.current >= c.hp.max && conditionValue(c, "wounded") > 0) {
    removeConditionSilent(c, "wounded");
    log(state, `${c.name} полностью вылечен — wounded снят.`);
  }

  log(state, `${c.name}: +${c.hp.current - before} HP → ${c.hp.current}/${c.hp.max}`);
}

export function addTempHp(state: CombatState, ref: string, amount: number): void {
  const c = findCombatant(state, ref);
  const value = Math.max(0, Math.round(amount));
  c.hp.temp = Math.max(c.hp.temp, value);
  log(state, `${c.name}: temp HP ${c.hp.temp}`);
}

export function setHp(state: CombatState, ref: string, value: number): void {
  const c = findCombatant(state, ref);
  c.hp.current = Math.max(0, Math.min(c.hp.max, Math.round(value)));
  if (c.hp.current === 0 && !hasCondition(c, "dying")) {
    c.conditions.push({ slug: "unconscious" });
    setConditionValue(c, "dying", 1 + conditionValue(c, "wounded"));
    log(state, `${c.name}: HP 0 → dying ${conditionValue(c, "dying")}`);
  }
  if (c.hp.current > 0) {
    removeConditionSilent(c, "dying");
    removeConditionSilent(c, "unconscious");
  }
  log(state, `${c.name}: HP ${c.hp.current}/${c.hp.max}`);
}

export function spendActions(state: CombatState, ref: string, cost: number): number {
  const c = findCombatant(state, ref);
  const remaining = actionsRemaining(c);
  if (cost > remaining) {
    throw new Error(
      `У ${c.name} осталось ${remaining} действий, а нужно ${cost}.`,
    );
  }
  c.actionsSpent += cost;
  return actionsRemaining(c);
}

export interface AttackResult {
  map: number;
  penalty: number;
  attackNumber: number;
}

/** Считает MAP для текущей атаки и увеличивает счётчик атак. */
export function attack(
  state: CombatState,
  ref: string,
  options: { agile?: boolean; extraPenalty?: number } = {},
): AttackResult {
  const c = findCombatant(state, ref);
  const number = c.attacksThisTurn + 1;
  const step = Math.min(2, number - 1);
  const map = step === 0 ? 0 : (options.agile ? -4 : -5) * step;
  const penalty = map + (options.extraPenalty ?? 0);
  c.attacksThisTurn = number;
  return { map, penalty, attackNumber: number };
}

export function formatConditions(c: Combatant): string {
  if (!c.conditions.length) return "—";
  return c.conditions
    .map((cond) => {
      const name = conditionName(cond.slug);
      if (cond.slug === "persistent-damage") {
        return `${name} ${cond.value ?? 1}${cond.note ? ` ${cond.note}` : ""}`;
      }
      return cond.value && cond.value > 1 ? `${name} ${cond.value}` : name;
    })
    .join(", ");
}

export function endTurn(state: CombatState, rng: Rng = Math.random): void {
  if (!state.started) throw new Error("Бой ещё не начат.");
  const c = activeCombatant(state);
  if (!c) return;

  const persistent = c.conditions.filter((x) => x.slug === "persistent-damage");
  for (const instance of persistent) {
    if (c.dead) break;
    applyDamage(state, c.id, instance.value ?? 1, { type: instance.note });
    const flat = rollD20(rng);
    if (flat >= 15) {
      c.conditions = c.conditions.filter((x) => x !== instance);
      log(state, `${c.name}: persistent damage прекращается (flat ${flat}).`);
    } else {
      log(state, `${c.name}: persistent damage продолжается (flat ${flat} vs 15).`);
    }
  }

  for (const slug of ["frightened", "sickened"]) {
    const value = conditionValue(c, slug);
    if (value > 0) {
      if (value <= 1) removeConditionSilent(c, slug);
      else setConditionValue(c, slug, value - 1);
    }
  }

  for (const cond of [...c.conditions]) {
    if (cond.rounds === undefined) continue;
    cond.rounds -= 1;
    if (cond.rounds <= 0) {
      c.conditions = c.conditions.filter((x) => x !== cond);
      log(state, `${c.name}: ${conditionName(cond.slug)} закончился.`);
    }
  }

  advanceTurn(state, rng);
}

function advanceTurn(state: CombatState, rng: Rng): void {
  const order = sortedCombatants(state);
  if (!order.some((c) => !c.dead)) {
    state.started = false;
    state.activeId = null;
    log(state, "Бой окончен: живых участников нет.");
    return;
  }

  const currentIndex = order.findIndex((c) => c.id === state.activeId);
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
    log(state, "Бой окончен.");
    return;
  }

  if (currentIndex >= 0 && nextIndex <= currentIndex) {
    state.round += 1;
    log(state, `Раунд ${state.round}`);
  }

  state.activeId = order[nextIndex]!.id;
  beginTurn(state, rng);
}

export interface StatusRow {
  id: string;
  name: string;
  kind: CombatantKind;
  initiative: number | null;
  hp: string;
  ac: number | null;
  actions: number;
  conditions: string;
  active: boolean;
  dead: boolean;
}

export function statusRows(state: CombatState): StatusRow[] {
  return turnOrder(state).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    initiative: c.initiative,
    hp: `${c.hp.current}/${c.hp.max}${c.hp.temp ? ` +${c.hp.temp}` : ""}`,
    ac: c.ac ?? null,
    actions: actionsRemaining(c),
    conditions: formatConditions(c),
    active: c.id === state.activeId,
    dead: !!c.dead,
  }));
}
