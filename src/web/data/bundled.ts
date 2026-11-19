import type { MonsterRef } from "../../core/encounter";
import type { RuleDoc } from "../../core/search";
import coreRules from "../../../data/rules/core.json";
import combatRules from "../../../data/rules/combat.json";
import sampleMonsters from "../../../data/monsters/sample.json";

export const bundledRules = [
  ...(coreRules as unknown as RuleDoc[]),
  ...(combatRules as unknown as RuleDoc[]),
];

export const bundledMonsters = sampleMonsters as unknown as MonsterRef[];

export const bundledRuleIds = new Set(bundledRules.map((doc) => doc.id));

export function isBundled(doc: RuleDoc): boolean {
  return bundledRuleIds.has(doc.id);
}
