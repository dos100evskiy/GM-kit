/**
 * Заготовки боёв: сохраняем только состав и параметры, без текущего урона,
 * состояний, журнала и незавершённых ходов.
 */

import type { CombatState } from "../core/combat";
import type { DndCombatState } from "./dnd5e/combat";

export function toPf2eTemplate(state: CombatState): CombatState {
  const copy = structuredClone(state);
  copy.started = false;
  copy.ended = false;
  copy.round = 0;
  copy.activeId = null;
  copy.log = [];
  copy.combatants = copy.combatants.map((combatant) => ({
    ...combatant,
    hp: {
      current: combatant.hp.max,
      max: combatant.hp.max,
      temp: 0,
    },
    conditions: [],
    actionsSpent: 0,
    actionsLost: 0,
    attacksThisTurn: 0,
    reactionsUsed: 0,
    dead: false,
  }));
  return copy;
}

export function instantiatePf2e(state: CombatState): CombatState {
  const copy = toPf2eTemplate(state);
  copy.combatants = copy.combatants.map((combatant) => ({
    ...combatant,
    id: globalThis.crypto.randomUUID(),
  }));
  return copy;
}

export function toDndTemplate(state: DndCombatState): DndCombatState {
  const copy = structuredClone(state);
  copy.started = false;
  copy.ended = false;
  copy.round = 0;
  copy.activeId = null;
  copy.log = [];
  copy.combatants = copy.combatants.map((combatant) => ({
    ...combatant,
    hp: {
      current: combatant.hp.max,
      max: combatant.hp.max,
      temp: 0,
    },
    conditions: [],
    actions: { action: false, bonus: false, reaction: false },
    concentration: undefined,
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    dead: false,
    rollMode: "normal",
  }));
  return copy;
}

export function instantiateDnd(state: DndCombatState): DndCombatState {
  const copy = toDndTemplate(state);
  copy.combatants = copy.combatants.map((combatant) => ({
    ...combatant,
    id: globalThis.crypto.randomUUID(),
  }));
  return copy;
}
