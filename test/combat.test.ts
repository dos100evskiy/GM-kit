import { describe, expect, it } from "vitest";

import {
  actionsRemaining,
  addCondition,
  applyDamage,
  attack,
  beginTurn,
  conditionValue,
  createState,
  endTurn,
  findCombatant,
  makeCombatant,
  recoveryCheck,
  spendActions,
  startEncounter,
  type CombatState,
} from "../src/core/combat";

function setup(): { state: CombatState; id: string } {
  const state = createState();
  const fighter = makeCombatant({
    name: "Fighter",
    kind: "pc",
    level: 5,
    maxHp: 44,
    ac: 21,
    initiative: 15,
  });
  const goblin = makeCombatant({
    name: "Goblin",
    kind: "npc",
    level: -1,
    maxHp: 10,
    ac: 16,
    initiative: 10,
  });
  state.combatants.push(fighter, goblin);
  return { state, id: goblin.id };
}

describe("combat engine", () => {
  it("не складывает одинаковые состояния, берёт максимум", () => {
    const { state } = setup();
    addCondition(state, "Goblin", "frightened", 1);
    addCondition(state, "Goblin", "frightened", 2);
    addCondition(state, "Goblin", "frightened", 1);
    expect(conditionValue(findCombatant(state, "Goblin"), "frightened")).toBe(2);
  });

  it("уменьшает frightened в конце хода", () => {
    const { state } = setup();
    startEncounter(state);
    const goblin = findCombatant(state, "Goblin");
    endTurn(state); // ход переходит к гоблину
    addCondition(state, goblin.id, "frightened", 2);
    endTurn(state);
    expect(conditionValue(goblin, "frightened")).toBe(1);
  });

  it("наносит persistent damage и снимает его по flat check 15+", () => {
    const { state, id } = setup();
    startEncounter(state, () => 0.99);
    endTurn(state, () => 0.99); // ход гоблина
    addCondition(state, id, "persistent-damage", 3, { note: "fire" });
    endTurn(state, () => 0.99);

    const goblin = findCombatant(state, id);
    expect(goblin.hp.current).toBe(7);
    expect(goblin.conditions.some((c) => c.slug === "persistent-damage")).toBe(false);
  });

  it("оставляет persistent damage при провале flat check", () => {
    const { state, id } = setup();
    startEncounter(state, () => 0);
    endTurn(state, () => 0); // ход гоблина
    addCondition(state, id, "persistent-damage", 3, { note: "fire" });
    endTurn(state, () => 0);

    const goblin = findCombatant(state, id);
    expect(goblin.hp.current).toBe(7);
    expect(goblin.conditions.some((c) => c.slug === "persistent-damage")).toBe(true);
  });

  it("переводит в dying при 0 HP и увеличивает dying от урона", () => {
    const { state, id } = setup();
    const goblin = findCombatant(state, id);

    applyDamage(state, id, 10);
    expect(goblin.hp.current).toBe(0);
    expect(conditionValue(goblin, "dying")).toBe(1);
    expect(goblin.conditions.some((c) => c.slug === "unconscious")).toBe(true);

    applyDamage(state, id, 5);
    expect(conditionValue(goblin, "dying")).toBe(2);
  });

  it("стабилизирует при крит. успехе recovery check", () => {
    const { state, id } = setup();
    const goblin = findCombatant(state, id);
    applyDamage(state, id, 10);

    const result = recoveryCheck(state, goblin, () => 0.99);
    expect(result.roll).toBe(20);
    expect(result.stable).toBe(true);
    expect(conditionValue(goblin, "dying")).toBe(0);
    expect(conditionValue(goblin, "wounded")).toBe(1);
  });

  it("считает MAP и сбрасывает его в начале хода", () => {
    const { state } = setup();
    startEncounter(state, () => 0.99);

    expect(attack(state, "Fighter").penalty).toBe(0);
    expect(attack(state, "Fighter").penalty).toBe(-5);
    expect(attack(state, "Fighter", { agile: true }).penalty).toBe(-8);

    beginTurn(state, () => 0.99);
    expect(attack(state, "Fighter").penalty).toBe(0);
  });

  it("тратит действия и не даёт уйти в минус", () => {
    const { state } = setup();
    startEncounter(state);

    const fighter = findCombatant(state, "Fighter");
    expect(actionsRemaining(fighter)).toBe(3);
    spendActions(state, fighter.id, 3);
    expect(actionsRemaining(fighter)).toBe(0);
    expect(() => spendActions(state, fighter.id, 1)).toThrow(/осталось 0/);
  });

  it("сортирует инициативу и ведёт раунды", () => {
    const { state } = setup();
    startEncounter(state);
    expect(state.round).toBe(1);
    expect(findCombatant(state, "Fighter").id).toBe(state.activeId);

    endTurn(state);
    expect(findCombatant(state, "Goblin").id).toBe(state.activeId);
    endTurn(state);
    expect(state.round).toBe(2);
  });
});
