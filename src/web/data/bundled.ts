import type { MonsterRef } from "../../core/encounter";
import type { RuleDoc } from "../../core/search";
import type { SystemId } from "../../systems/types";
import coreRules from "../../../data/rules/core.json";
import combatRules from "../../../data/rules/combat.json";
import sampleMonsters from "../../../data/monsters/sample.json";
import dndRules from "../../../data/dnd5e/rules.json";
import dndMonsters from "../../../data/dnd5e/monsters.json";

const pf2eRules = [
  ...(coreRules as unknown as RuleDoc[]),
  ...(combatRules as unknown as RuleDoc[]),
];

const pf2eMonsters = sampleMonsters as unknown as MonsterRef[];

const dnd5eRules = dndRules as unknown as RuleDoc[];
const dnd5eMonsters = dndMonsters as unknown as MonsterRef[];

export const bundledRulesBySystem: Record<SystemId, RuleDoc[]> = {
  pf2e: pf2eRules,
  dnd5e: dnd5eRules,
};

export const bundledMonstersBySystem: Record<SystemId, MonsterRef[]> = {
  pf2e: pf2eMonsters,
  dnd5e: dnd5eMonsters,
};

export const bundledRules = pf2eRules;
export const bundledMonsters = pf2eMonsters;

const bundledRuleIds = new Set(
  [...pf2eRules, ...dnd5eRules].map((doc) => doc.id),
);

export function isBundled(doc: RuleDoc): boolean {
  return bundledRuleIds.has(doc.id);
}
