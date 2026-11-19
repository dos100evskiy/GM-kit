import { describe, expect, it } from "vitest";

import { loadRuleDocs } from "../src/core/data";
import { RuleIndex, tokenize } from "../src/core/search";

const index = new RuleIndex(loadRuleDocs());

describe("rules search", () => {
  it("находит Grapple по английскому запросу", () => {
    const hits = index.search("grapple");
    expect(hits[0]?.doc.id).toBe("grapple");
  });

  it("находит Frightened по русскому алиасу", () => {
    const hits = index.search("испуг");
    expect(hits[0]?.doc.id).toBe("frightened");
  });

  it("понимает сокращение MAP", () => {
    const hits = index.search("MAP");
    expect(hits[0]?.doc.id).toBe("multiple-attack-penalty");
  });

  it("находит persistent damage по описанию", () => {
    const hits = index.search("persistent damage");
    expect(hits[0]?.doc.id).toBe("persistent-damage");
  });

  it("фильтрует по категории", () => {
    const hits = index.search("attack", { category: "Магия", limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.doc.category === "Магия")).toBe(true);
  });

  it("возвращает пусто на бессмысленный запрос", () => {
    expect(index.search("qwzxvbnm")).toHaveLength(0);
  });

  it("токенизация выкидывает стоп-слова и однобуквенные", () => {
    expect(tokenize("the map and я")).toEqual(["map"]);
  });
});
