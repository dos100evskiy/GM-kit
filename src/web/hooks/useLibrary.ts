import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import type { MonsterRef } from "../../core/encounter";
import type { RuleDoc } from "../../core/search";
import {
  bundledMonstersBySystem,
  bundledRulesBySystem,
} from "../data/bundled";
import { db, type MonsterRow, type RuleRow } from "../db";
import { useApp } from "../store";

export function useImportedRules(): RuleRow[] {
  const system = useApp((state) => state.system);
  return (
    useLiveQuery(
      () => db.rules.where("systemId").equals(system).toArray(),
      [system],
      [] as RuleRow[],
    ) ?? []
  );
}

export function useAllRules(): RuleDoc[] {
  const system = useApp((state) => state.system);
  const imported = useImportedRules();
  return useMemo(
    () => [...bundledRulesBySystem[system], ...imported],
    [imported, system],
  );
}

export function useAllMonsters(): MonsterRef[] {
  const system = useApp((state) => state.system);
  const imported =
    useLiveQuery(
      () => db.monsters.where("systemId").equals(system).toArray(),
      [system],
      [] as MonsterRow[],
    ) ?? [];

  return useMemo(() => {
    const byName = new Map<string, MonsterRef>();
    for (const monster of bundledMonstersBySystem[system]) {
      byName.set(monster.name.toLowerCase(), monster);
    }
    for (const monster of imported) {
      byName.set(monster.name.toLowerCase(), monster);
    }
    return [...byName.values()].sort(
      (a, b) => a.level - b.level || a.name.localeCompare(b.name),
    );
  }, [imported, system]);
}
