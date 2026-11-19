import Dexie, { type Table } from "dexie";

import type { CombatState } from "../core/combat";
import type { MonsterRef } from "../core/encounter";
import type { RuleDoc } from "../core/search";

export interface MonsterRow extends MonsterRef {
  id: string;
  imported?: boolean;
}

export interface EncounterRow {
  id: string;
  name: string;
  state: CombatState;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class GmDatabase extends Dexie {
  rules!: Table<RuleDoc, string>;
  monsters!: Table<MonsterRow, string>;
  encounters!: Table<EncounterRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("pf2e-gm-kit");
    this.version(1).stores({
      rules: "id, category",
      monsters: "id, name, level",
      encounters: "id, updatedAt",
      meta: "key",
    });
  }
}

export const db = new GmDatabase();

export async function clearImportedData(): Promise<void> {
  await db.transaction("rw", db.rules, db.monsters, db.meta, async () => {
    await db.rules.clear();
    await db.monsters.clear();
    await db.meta.delete("import");
  });
}
