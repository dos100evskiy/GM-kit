import { describe, expect, it } from "vitest";

import { loadMonsters } from "../src/core/data";
import {
  budget,
  creatureXp,
  generateEncounter,
  threatFor,
} from "../src/core/encounter";

describe("encounter math", () => {
  it("считает бюджет по размеру партии", () => {
    expect(budget(4, "moderate")).toBe(80);
    expect(budget(5, "severe")).toBe(150);
    expect(budget(3, "trivial")).toBe(30);
    expect(budget(1, "extreme")).toBe(40);
  });

  it("считает XP существа по разнице уровней", () => {
    expect(creatureXp(5, 5)).toBe(40);
    expect(creatureXp(6, 5)).toBe(60);
    expect(creatureXp(8, 5)).toBe(120);
    expect(creatureXp(9, 5)).toBe(160);
    expect(creatureXp(1, 5)).toBe(10);
    expect(creatureXp(-1, 5)).toBe(10);
    expect(creatureXp(12, 5)).toBe(160);
  });

  it("определяет угрозу по потраченному XP", () => {
    expect(threatFor(40, 4)).toBe("trivial");
    expect(threatFor(80, 4)).toBe("moderate");
    expect(threatFor(120, 4)).toBe("severe");
    expect(threatFor(999, 4)).toBe("beyond-extreme");
  });

  it("собирает moderate на 4 персонажей 5 уровня", () => {
    const plan = generateEncounter({
      partyLevel: 5,
      partySize: 4,
      difficulty: "moderate",
      pool: loadMonsters(),
    });

    expect(plan.budget).toBe(80);
    expect(plan.spent).toBe(80);
    expect(plan.totalCount).toBeGreaterThan(0);
    expect(plan.totalCount).toBeLessThanOrEqual(8);
    expect(plan.groups.every((g) => g.monster.level <= 9)).toBe(true);
  });

  it("фильтрует по теме", () => {
    const plan = generateEncounter({
      partyLevel: 5,
      partySize: 4,
      difficulty: "moderate",
      theme: ["undead"],
      pool: loadMonsters(),
    });

    expect(plan.spent).toBe(80);
    expect(plan.groups.length).toBeGreaterThan(0);
    for (const group of plan.groups) {
      expect(group.monster.traits ?? []).toContain("undead");
    }
  });

  it("уважает лимит существ", () => {
    const plan = generateEncounter({
      partyLevel: 5,
      partySize: 4,
      difficulty: "severe",
      maxCreatures: 3,
      pool: loadMonsters(),
    });

    expect(plan.totalCount).toBeLessThanOrEqual(3);
  });

  it("предупреждает о пустом пуле", () => {
    const plan = generateEncounter({ partyLevel: 3, pool: [] });
    expect(plan.groups).toHaveLength(0);
    expect(plan.warnings.join(" ")).toMatch(/пул/i);
  });
});
