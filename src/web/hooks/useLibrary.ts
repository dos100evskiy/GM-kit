import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import type { MonsterRef } from "../../core/encounter";
import type { RuleDoc } from "../../core/search";
import { bundledMonsters, bundledRules } from "../data/bundled";
import { db } from "../db";

export function useImportedRules(): RuleDoc[] {
  return useLiveQuery(() => db.rules.toArray(), []) ?? [];
}

export function useAllRules(): RuleDoc[] {
  const imported = useImportedRules();
  return useMemo(() => [...bundledRules, ...imported], [imported]);
}

export function useAllMonsters(): MonsterRef[] {
  const imported = useLiveQuery(() => db.monsters.toArray(), []) ?? [];
  return useMemo(() => {
    const byName = new Map<string, MonsterRef>();
    for (const monster of bundledMonsters) {
      byName.set(monster.name.toLowerCase(), monster);
    }
    for (const monster of imported) {
      byName.set(monster.name.toLowerCase(), monster);
    }
    return [...byName.values()].sort(
      (a, b) => a.level - b.level || a.name.localeCompare(b.name),
    );
  }, [imported]);
}
