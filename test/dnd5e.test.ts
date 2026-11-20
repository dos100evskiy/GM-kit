import { describe, expect, it } from "vitest";

import dndMonsters from "../data/dnd5e/monsters.json";
import {
  addDndTempHp,
  applyDndDamage,
  createDndState,
  endDndEncounter,
  endDndTurn,
  healDnd,
  makeDndCombatant,
  rollD20Mode,
  rollDndDeathSave,
  setDndConcentration,
  spendDndAction,
  startDndEncounter,
  type DndCombatState,
} from "../src/systems/dnd5e/combat";
import {
  crToXp,
  dndBudget,
  encounterMultiplier,
  generateDndEncounter,
  type DndMonster,
} from "../src/systems/dnd5e/encounter";

const pool = dndMonsters as unknown as DndMonster[];

function combat(): { state: DndCombatState; id: string } {
  const state = createDndState();
  const fighter = makeDndCombatant({
    name: "Fighter",
    kind: "pc",
    level: 3,
    maxHp: 30,
    ac: 18,
    initiativeMod: 2,
  });
  state.combatants.push(fighter);
  state.combatants.push(
    makeDndCombatant({
      name: "Goblin",
      kind: "npc",
      level: 0.25,
      maxHp: 7,
      ac: 15,
      initiativeMod: 2,
    }),
  );
  return { state, id: fighter.id };
}

describe("D&D 5e encounter math", () => {
  it("считает бюджет по порогам 2014", () => {
    expect(dndBudget(1, 4, "easy")).toBe(100);
    expect(dndBudget(1, 4, "medium")).toBe(200);
    expect(dndBudget(1, 4, "hard")).toBe(300);
    expect(dndBudget(1, 4, "deadly")).toBe(400);
    expect(dndBudget(5, 4, "medium")).toBe(2000);
  });

  it("переводит CR в XP", () => {
    expect(crToXp(0)).toBe(10);
    expect(crToXp(0.125)).toBe(25);
    expect(crToXp(0.25)).toBe(50);
    expect(crToXp(0.5)).toBe(100);
    expect(crToXp(1)).toBe(200);
    expect(crToXp(5)).toBe(1800);
    expect(crToXp(17)).toBe(18000);
  });

  it("применяет множители и поправку на размер партии", () => {
    expect(encounterMultiplier(1, 4)).toBe(1);
    expect(encounterMultiplier(2, 4)).toBe(1.5);
    expect(encounterMultiplier(3, 4)).toBe(2);
    expect(encounterMultiplier(7, 4)).toBe(2.5);
    expect(encounterMultiplier(2, 2)).toBe(2);
    expect(encounterMultiplier(3, 6)).toBe(1.5);
  });

  it("генерирует состав под бюджет", () => {
    const plan = generateDndEncounter({
      partyLevel: 1,
      partySize: 4,
      difficulty: "medium",
      pool,
      seed: 42,
    });
    expect(plan.groups.length).toBeGreaterThan(0);
    expect(plan.totalCount).toBeGreaterThan(0);
    expect(plan.budget).toBe(200);
    expect(plan.spent).toBeGreaterThan(0);
    expect(plan.awardedXp).toBeGreaterThan(0);
    expect(plan.multiplier).toBeGreaterThanOrEqual(1);
    expect(plan.groups.reduce((sum, group) => sum + group.subtotal, 0)).toBe(
      plan.baseXp,
    );
  });

  it("фильтрует по теме", () => {
    const plan = generateDndEncounter({
      partyLevel: 5,
      partySize: 4,
      difficulty: "medium",
      theme: ["undead"],
      pool,
      seed: 7,
    });
    const names = plan.groups.map((group) => group.monster.name.toLowerCase());
    expect(names.length).toBeGreaterThan(0);
    expect(names.some((name) => name.includes("skeleton") || name.includes("zombie"))).toBe(
      true,
    );
  });

  it("предупреждает о пустом пуле", () => {
    const plan = generateDndEncounter({
      partyLevel: 1,
      partySize: 4,
      difficulty: "medium",
      pool: [],
    });
    expect(plan.groups).toHaveLength(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("D&D 5e combat", () => {
  it("бросает инициативу с модификатором", () => {
    const { state } = combat();
    let value = 0.5;
    startDndEncounter(state, () => value);
    expect(state.started).toBe(true);
    expect(state.round).toBe(1);
    expect(state.combatants[0]!.initiative).toBe(13);
    expect(state.activeId).toBe(state.combatants[0]!.id);
  });

  it("поглощает урон temp HP и снимает сознание на 0", () => {
    const { state, id } = combat();
    addDndTempHp(state, id, 5);
    const result = applyDndDamage(state, id, 9);
    expect(result.absorbed).toBe(5);
    expect(state.combatants[0]!.hp.current).toBe(26);
    applyDndDamage(state, id, 100);
    expect(state.combatants[0]!.hp.current).toBe(0);
    expect(
      state.combatants[0]!.conditions.some((item) => item.slug === "unconscious"),
    ).toBe(true);
    expect(state.combatants[0]!.deathSaves.failures).toBe(0);
  });

  it("считает DC концентрации 10 или половину урона", () => {
    const { state, id } = combat();
    setDndConcentration(state, id, "Bless");
    expect(applyDndDamage(state, id, 7).concentrationDc).toBe(10);
    expect(applyDndDamage(state, id, 30).concentrationDc).toBe(15);
  });

  it("advantage и disadvantage выбирают лучший/худший d20", () => {
    const values = [0.05, 0.95];
    let index = 0;
    const rng = () => values[index++] ?? 0.5;
    const advantage = rollD20Mode(rng, "advantage");
    expect(advantage.rolls).toEqual([2, 20]);
    expect(advantage.result).toBe(20);

    index = 0;
    const disadvantage = rollD20Mode(rng, "disadvantage");
    expect(disadvantage.result).toBe(2);
  });

  it("ведёт death saves: успех, провал и натуральная 20", () => {
    const { state, id } = combat();
    applyDndDamage(state, id, 100);
    const fail = rollDndDeathSave(state, id, () => 0.2);
    expect(fail.roll).toBe(5);
    expect(fail.failures).toBe(1);

    let value = 0.55;
    const success = rollDndDeathSave(state, id, () => value);
    expect(success.roll).toBe(12);
    expect(success.successes).toBe(1);

    const revive = rollDndDeathSave(state, id, () => 0.99);
    expect(revive.roll).toBe(20);
    expect(revive.revived).toBe(true);
    expect(state.combatants[0]!.hp.current).toBe(1);
  });

  it("лечение поднимает с 0 и сбрасывает death saves", () => {
    const { state, id } = combat();
    applyDndDamage(state, id, 100);
    healDnd(state, id, 5);
    expect(state.combatants[0]!.hp.current).toBe(5);
    expect(state.combatants[0]!.deathSaves).toEqual({
      successes: 0,
      failures: 0,
    });
    expect(
      state.combatants[0]!.conditions.some((item) => item.slug === "unconscious"),
    ).toBe(false);
  });

  it("не позволяет потратить действие дважды", () => {
    const { state, id } = combat();
    spendDndAction(state, id, "action");
    expect(() => spendDndAction(state, id, "action")).toThrow();
  });

  it("завершает бой, сохраняя состав и журнал", () => {
    const { state } = combat();
    startDndEncounter(state, () => 0.5);
    endDndEncounter(state);
    expect(state.ended).toBe(true);
    expect(state.started).toBe(false);
    expect(state.activeId).toBeNull();
    expect(state.combatants).toHaveLength(2);
    expect(state.log.at(-1)?.text).toBe("Бой окончен");
  });

  it("сбрасывает действия в начале хода и считает раунды", () => {
    const { state, id } = combat();
    startDndEncounter(state, () => 0.5);
    spendDndAction(state, id, "action");
    endDndTurn(state);
    expect(state.combatants[0]!.actions.action).toBe(true);
    endDndTurn(state);
    expect(state.round).toBe(2);
    expect(state.combatants[0]!.actions.action).toBe(false);
  });
});
