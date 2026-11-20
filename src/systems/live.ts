import type { CombatState } from "../core/combat";
import type { DndCombatState } from "./dnd5e/combat";
import type { SystemId } from "./types";

export interface PlayerOrderEntry {
  id: string;
  name: string;
  initiative: number | null;
}

/**
 * Всё, что разрешено видеть игрокам.
 * Здесь принципиально нет HP, AC, состояний, заметок и журнала.
 */
export interface PlayerSnapshot {
  version: 1;
  systemId: SystemId;
  encounter: string;
  round: number;
  started: boolean;
  activeId: string | null;
  order: PlayerOrderEntry[];
}

export function snapshotFromPf2e(
  state: CombatState,
  encounter: string,
): PlayerSnapshot {
  const order = [...state.combatants]
    .filter((combatant) => !combatant.dead)
    .sort((a, b) => {
      const ai = a.initiative ?? -1;
      const bi = b.initiative ?? -1;
      if (bi !== ai) return bi - ai;
      if (a.kind !== b.kind) return a.kind === "pc" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      initiative: combatant.initiative,
    }));

  return {
    version: 1,
    systemId: "pf2e",
    encounter,
    round: state.round,
    started: state.started,
    activeId: state.activeId,
    order,
  };
}

export function snapshotFromDnd(
  state: DndCombatState,
  encounter: string,
): PlayerSnapshot {
  const order = [...state.combatants]
    .filter((combatant) => !combatant.dead)
    .sort((a, b) => {
      const ai = a.initiative ?? -1;
      const bi = b.initiative ?? -1;
      if (bi !== ai) return bi - ai;
      if (a.kind !== b.kind) return a.kind === "pc" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      initiative: combatant.initiative,
    }));

  return {
    version: 1,
    systemId: "dnd5e",
    encounter,
    round: state.round,
    started: state.started,
    activeId: state.activeId,
    order,
  };
}
