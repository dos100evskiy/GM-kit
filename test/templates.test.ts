import { describe, expect, it } from "vitest";

import {
  createState,
  makeCombatant,
  setInitiative,
  startEncounter,
  turnOrder,
  type CombatState,
} from "../src/core/combat";
import {
  createDndState,
  makeDndCombatant,
  setDndInitiative,
  startDndEncounter,
  dndTurnOrder,
} from "../src/systems/dnd5e/combat";
import {
  instantiateDnd,
  instantiatePf2e,
  toDndTemplate,
  toPf2eTemplate,
} from "../src/systems/templates";

function pf2eState(): CombatState {
  const state = createState();
  const hero = makeCombatant({
    name: "Ария",
    kind: "pc",
    level: 5,
    maxHp: 40,
    ac: 20,
    initiative: 17,
  });
  hero.hp.current = 9;
  hero.hp.temp = 4;
  hero.conditions.push({ slug: "frightened", value: 2 });
  state.combatants.push(hero);
  state.started = true;
  state.round = 4;
  state.activeId = hero.id;
  state.log.push({ round: 4, text: "test" });
  return state;
}

describe("prepared battles", () => {
  it("PF2e: сохраняет состав, но сбрасывает бой", () => {
    const template = toPf2eTemplate(pf2eState());
    const combatant = template.combatants[0]!;
    expect(template.started).toBe(false);
    expect(template.ended).toBe(false);
    expect(template.round).toBe(0);
    expect(template.activeId).toBeNull();
    expect(template.log).toHaveLength(0);
    expect(combatant.hp).toEqual({ current: 40, max: 40, temp: 0 });
    expect(combatant.conditions).toHaveLength(0);
    expect(combatant.initiative).toBe(17);
    expect(combatant.ac).toBe(20);
  });

  it("PF2e: при загрузке выдаёт новые id", () => {
    const template = toPf2eTemplate(pf2eState());
    const instance = instantiatePf2e(template);
    expect(instance.combatants[0]!.id).not.toBe(template.combatants[0]!.id);
    expect(instance.combatants[0]!.name).toBe("Ария");
  });

  it("D&D: сбрасывает HP, состояния, концентрацию и death saves", () => {
    const state = createDndState();
    const hero = makeDndCombatant({
      name: "Ария",
      maxHp: 30,
      ac: 16,
      initiative: 14,
    });
    hero.hp.current = 0;
    hero.hp.temp = 5;
    hero.conditions.push({ slug: "unconscious" });
    hero.concentration = { spell: "Bless" };
    hero.deathSaves = { successes: 2, failures: 2 };
    hero.actions.action = true;
    state.combatants.push(hero);
    state.started = true;

    const template = toDndTemplate(state);
    const combatant = template.combatants[0]!;
    expect(template.started).toBe(false);
    expect(combatant.hp).toEqual({ current: 30, max: 30, temp: 0 });
    expect(combatant.conditions).toHaveLength(0);
    expect(combatant.concentration).toBeUndefined();
    expect(combatant.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(combatant.actions).toEqual({
      action: false,
      bonus: false,
      reaction: false,
    });
    expect(combatant.initiative).toBe(14);

    const instance = instantiateDnd(template);
    expect(instance.combatants[0]!.id).not.toBe(combatant.id);
  });
});

describe("initiative editing", () => {
  it("PF2e: меняет инициативу и порядок", () => {
    const state = createState();
    const a = makeCombatant({ name: "A", initiative: 20 });
    const b = makeCombatant({ name: "B", initiative: 10 });
    state.combatants.push(a, b);
    setInitiative(state, b.id, 25);
    expect(turnOrder(state).map((combatant) => combatant.name)).toEqual([
      "B",
      "A",
    ]);
  });

  it("D&D: меняет инициативу и порядок", () => {
    const state = createDndState();
    const a = makeDndCombatant({ name: "A", initiative: 20 });
    const b = makeDndCombatant({ name: "B", initiative: 10 });
    state.combatants.push(a, b);
    setDndInitiative(state, b.id, 25);
    expect(dndTurnOrder(state).map((combatant) => combatant.name)).toEqual([
      "B",
      "A",
    ]);
  });

  it("не меняет текущего активного бойца", () => {
    const state = createState();
    const a = makeCombatant({ name: "A", initiative: 20 });
    const b = makeCombatant({ name: "B", initiative: 10 });
    state.combatants.push(a, b);
    startEncounter(state, () => 0.5);
    const active = state.activeId;
    setInitiative(state, b.id, 99);
    expect(state.activeId).toBe(active);
  });
});
