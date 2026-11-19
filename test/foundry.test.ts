import { describe, expect, it } from "vitest";

import {
  foundryCombatStats,
  normalizeFoundryDocument,
  normalizeFoundryFiles,
  normalizeJsonData,
  packNameFromPath,
  stripHtml,
} from "../src/core/foundry";

const NPC = {
  _id: "abc123",
  name: "Test Ghoul",
  type: "npc",
  system: {
    description: {
      value:
        "<p>A hungry <strong>ghoul</strong> &mdash; it hunts at night.</p><ul><li>Paralyzing bite</li></ul>",
    },
    details: { level: { value: 1 }, source: { value: "Bestiary" } },
    traits: { value: ["undead", "ghoul"] },
    attributes: {
      ac: { value: 17 },
      hp: { max: 22, value: 22 },
      initiative: { mod: 5 },
    },
  },
};

const HAZARD = {
  _id: "trap1",
  name: "Test Trap",
  type: "hazard",
  system: {
    description: { value: "<p>A spike trap.</p>" },
    details: { level: { value: 3 } },
    traits: { value: ["trap", "mechanical"] },
    attributes: {
      ac: { value: 20 },
      hp: { max: 40 },
    },
  },
};

describe("stripHtml", () => {
  it("убирает теги и декодирует сущности", () => {
    const text = stripHtml(
      "<p>Fire &amp; ice</p><br><p>Second &quot;line&quot; &#39;here&#39;</p>",
    );
    expect(text).toContain("Fire & ice");
    expect(text).toContain("Second \"line\" 'here'");
    expect(text).not.toContain("<p>");
  });

  it("превращает списки в маркеры и переносы строк", () => {
    const text = stripHtml("<ul><li>One</li><li>Two</li></ul>");
    expect(text).toBe("• One\n• Two");
  });
});

describe("foundryCombatStats", () => {
  it("достаёт HP, AC и инициативу из system.attributes", () => {
    expect(foundryCombatStats(NPC)).toEqual({
      hp: 22,
      ac: 17,
      initiativeMod: 5,
    });
  });

  it("понимает альтернативные пути и отбрасывает мусор", () => {
    expect(
      foundryCombatStats({
        system: { hp: { value: 12 }, attributes: { ac: "18" } },
      }),
    ).toEqual({ hp: 12, ac: 18, initiativeMod: undefined });
    expect(foundryCombatStats({})).toEqual({
      hp: undefined,
      ac: undefined,
      initiativeMod: undefined,
    });
  });
});

describe("normalizeFoundryDocument", () => {
  it("нормализует NPC в правило и существо", () => {
    const result = normalizeFoundryDocument(NPC, "bestiary");
    expect(result).not.toBeNull();
    expect(result!.rule.id).toBe("foundry:bestiary/abc123");
    expect(result!.rule.title).toBe("Test Ghoul");
    expect(result!.rule.category).toBe("bestiary");
    expect(result!.rule.source).toBe("Bestiary");
    expect(result!.rule.text).toContain("hungry ghoul");
    expect(result!.monster).toMatchObject({
      id: "foundry:bestiary/abc123",
      name: "Test Ghoul",
      level: 1,
      kind: "creature",
      hp: 22,
      ac: 17,
      initiativeMod: 5,
    });
    expect(result!.monster!.traits).toContain("undead");
    expect(result!.monster!.roles).toContain("undead");
  });

  it("нормализует hazard", () => {
    const result = normalizeFoundryDocument(HAZARD, "hazards");
    expect(result!.monster).toMatchObject({
      kind: "hazard",
      level: 3,
      hp: 40,
      ac: 20,
    });
    expect(result!.monster!.roles).toContain("hazard");
  });

  it("возвращает только правило для не-существа", () => {
    const result = normalizeFoundryDocument(
      {
        name: "Grapple",
        type: "action",
        system: { description: { value: "<p>Grab a creature.</p>" } },
      },
      "actions",
    );
    expect(result!.rule.title).toBe("Grapple");
    expect(result!.monster).toBeUndefined();
  });

  it("пропускает документы без описания или имени", () => {
    expect(
      normalizeFoundryDocument({ name: "Empty", system: {} }, "pack"),
    ).toBeNull();
    expect(
      normalizeFoundryDocument(
        { system: { description: { value: "<p>x</p>" } } },
        "pack",
      ),
    ).toBeNull();
    expect(normalizeFoundryDocument(null, "pack")).toBeNull();
  });
});

describe("packNameFromPath", () => {
  it("находит пак после сегмента packs", () => {
    expect(packNameFromPath("packs/bestiary-1/abc.json")).toBe("bestiary-1");
    expect(packNameFromPath("pf2e/packs/actions/x.json")).toBe("actions");
  });

  it("использует ближайшую папку как запасной вариант", () => {
    expect(packNameFromPath("bestiary/abc.json")).toBe("bestiary");
    expect(packNameFromPath("abc.json")).toBe("abc.json");
  });
});

describe("normalizeJsonData", () => {
  it("читает массивы правил и существ", () => {
    const parsed = normalizeJsonData([
      { id: "r1", title: "Rule", text: "Text" },
      { id: "m1", name: "Monster", level: 2 },
    ]);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.monsters).toHaveLength(1);
  });

  it("читает объект { rules, monsters }", () => {
    const parsed = normalizeJsonData({
      rules: [{ id: "r1", title: "Rule", text: "Text" }],
      monsters: [{ id: "m1", name: "Monster", level: 1 }],
    });
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.monsters).toHaveLength(1);
  });

  it("игнорирует неподходящие значения", () => {
    expect(normalizeJsonData(null).rules).toHaveLength(0);
    expect(normalizeJsonData([1, "x", { title: "no text" }]).rules).toHaveLength(0);
  });
});

describe("normalizeFoundryFiles", () => {
  it("собирает правила и существ и считает пропуски", () => {
    const result = normalizeFoundryFiles([
      { path: "packs/bestiary/ghoul.json", doc: NPC },
      { path: "packs/hazards/trap.json", doc: HAZARD },
      { path: "packs/bestiary/empty.json", doc: { name: "Empty" } },
    ]);

    expect(result.rules).toHaveLength(2);
    expect(result.monsters).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.rules.map((rule) => rule.category)).toEqual([
      "bestiary",
      "hazards",
    ]);
  });

  it("уважает явно переданный пак", () => {
    const result = normalizeFoundryFiles([
      { path: "weird.json", pack: "custom", doc: NPC },
    ]);
    expect(result.rules[0]!.id).toBe("foundry:custom/abc123");
  });
});
