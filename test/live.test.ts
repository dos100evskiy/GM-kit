import { describe, expect, it } from "vitest";

import {
  createState,
  makeCombatant,
  type CombatState,
} from "../src/core/combat";
import {
  createDndState,
  makeDndCombatant,
  type DndCombatState,
} from "../src/systems/dnd5e/combat";
import {
  snapshotFromDnd,
  snapshotFromPf2e,
} from "../src/systems/live";

function pf2eState(): CombatState {
  const state = createState();
  state.round = 3;
  state.started = true;
  const hero = makeCombatant({
    name: "Ария",
    kind: "pc",
    level: 5,
    maxHp: 44,
    ac: 21,
    initiative: 18,
  });
  const goblin = makeCombatant({
    name: "Гоблин",
    kind: "npc",
    level: -1,
    maxHp: 7,
    ac: 15,
    initiative: 12,
  });
  goblin.conditions.push({ slug: "frightened", value: 2 });
  state.combatants.push(hero, goblin);
  state.activeId = hero.id;
  state.log.push({ round: 3, text: "Гоблин: −7 HP" });
  return state;
}

function dndState(): DndCombatState {
  const state = createDndState();
  state.round = 2;
  state.started = true;
  const hero = makeDndCombatant({
    name: "Ария",
    kind: "pc",
    level: 5,
    maxHp: 30,
    ac: 17,
    initiative: 15,
  });
  const goblin = makeDndCombatant({
    name: "Гоблин",
    kind: "npc",
    level: 0.25,
    cr: "1/4",
    maxHp: 7,
    ac: 15,
    initiative: 18,
  });
  hero.concentration = { spell: "Bless" };
  state.combatants.push(hero, goblin);
  state.activeId = goblin.id;
  return state;
}

function keys(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>);
}

describe("player snapshot", () => {
  it("PF2e: оставляет только очередь, раунд и текущего бойца", () => {
    const snapshot = snapshotFromPf2e(pf2eState(), "Тестовый бой");
    expect(snapshot.systemId).toBe("pf2e");
    expect(snapshot.round).toBe(3);
    expect(snapshot.activeId).toBeTruthy();
    expect(snapshot.order.map((entry) => entry.name)).toEqual([
      "Ария",
      "Гоблин",
    ]);
    expect(keys(snapshot).sort()).toEqual(
      ["activeId", "encounter", "order", "round", "started", "systemId", "version"].sort(),
    );
    for (const entry of snapshot.order) {
      expect(keys(entry).sort()).toEqual(["id", "initiative", "name"]);
    }
    expect(JSON.stringify(snapshot)).not.toMatch(
      /"(hp|ac|conditions|log|notes)"/i,
    );
  });

  it("D&D: не раскрывает HP, концентрацию и состояние", () => {
    const snapshot = snapshotFromDnd(dndState(), "D&D бой");
    expect(snapshot.systemId).toBe("dnd5e");
    expect(snapshot.round).toBe(2);
    expect(snapshot.order[0]!.name).toBe("Гоблин");
    expect(snapshot.activeId).toBe(snapshot.order[0]!.id);
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("Bless");
    expect(json).not.toMatch(
      /"(hp|ac|conditions|concentration|log|notes)"/i,
    );
  });

  it("убирает мёртвых из очереди", () => {
    const state = pf2eState();
    state.combatants[1]!.dead = true;
    const snapshot = snapshotFromPf2e(state, "Бой");
    expect(snapshot.order.map((entry) => entry.name)).toEqual(["Ария"]);
  });
});
