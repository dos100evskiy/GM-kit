export type SystemId = "pf2e" | "dnd5e";

export interface SystemDefinition {
  id: SystemId;
  name: string;
  shortName: string;
  levelLabelRu: string;
  levelLabelEn: string;
  rankLabel: string;
  minLevel: number;
  maxLevel: number;
  difficulties: readonly string[];
  defaultDifficulty: string;
}

export const SYSTEMS: readonly SystemDefinition[] = [
  {
    id: "pf2e",
    name: "Pathfinder 2e",
    shortName: "PF2e",
    levelLabelRu: "Уровень партии",
    levelLabelEn: "Party level",
    rankLabel: "Уровень",
    minLevel: -1,
    maxLevel: 25,
    difficulties: ["trivial", "low", "moderate", "severe", "extreme"],
    defaultDifficulty: "moderate",
  },
  {
    id: "dnd5e",
    name: "D&D 5e (2014)",
    shortName: "D&D 5e",
    levelLabelRu: "Уровень партии",
    levelLabelEn: "Party level",
    rankLabel: "CR",
    minLevel: 1,
    maxLevel: 20,
    difficulties: ["easy", "medium", "hard", "deadly"],
    defaultDifficulty: "medium",
  },
];

export function isSystemId(value: unknown): value is SystemId {
  return value === "pf2e" || value === "dnd5e";
}

export function getSystem(id: SystemId): SystemDefinition {
  return SYSTEMS.find((system) => system.id === id) ?? SYSTEMS[0]!;
}

export const SYSTEM_KEY = "gmkit.system";
