import Dexie, { type Table } from "dexie";

import type { CombatState } from "../core/combat";
import type { MonsterRef } from "../core/encounter";
import type { RuleDoc } from "../core/search";
import type { DndCombatState } from "../systems/dnd5e/combat";
import type { SystemId } from "../systems/types";

export interface RuleRow extends RuleDoc {
  systemId: SystemId;
}

export interface MonsterRow extends MonsterRef {
  id: string;
  systemId: SystemId;
  imported?: boolean;
}

export interface EncounterRow {
  id: string;
  systemId: SystemId;
  name: string;
  state: CombatState | DndCombatState;
  createdAt: number;
  updatedAt: number;
}

export interface PreparedBattleRow {
  id: string;
  systemId: SystemId;
  name: string;
  state: CombatState | DndCombatState;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class GmDatabase extends Dexie {
  rules!: Table<RuleRow, string>;
  monsters!: Table<MonsterRow, string>;
  encounters!: Table<EncounterRow, string>;
  prepared!: Table<PreparedBattleRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("pf2e-gm-kit");
    this.version(1).stores({
      rules: "id, category",
      monsters: "id, name, level",
      encounters: "id, updatedAt",
      meta: "key",
    });
    this.version(2)
      .stores({
        rules: "id, systemId, category",
        monsters: "id, systemId, name, level",
        encounters: "id, systemId, updatedAt",
        meta: "key",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("rules")
          .toCollection()
          .modify((row: RuleRow) => {
            row.systemId = "pf2e";
          });
        await transaction
          .table("monsters")
          .toCollection()
          .modify((row: MonsterRow) => {
            row.systemId = "pf2e";
          });
        await transaction
          .table("encounters")
          .toCollection()
          .modify((row: EncounterRow) => {
            row.systemId = "pf2e";
          });
      });
    this.version(3).stores({
      rules: "id, systemId, category",
      monsters: "id, systemId, name, level",
      encounters: "id, systemId, updatedAt",
      prepared: "id, systemId, updatedAt",
      meta: "key",
    });
  }
}

export const db = new GmDatabase();

export async function clearImportedData(systemId: SystemId): Promise<void> {
  await db.transaction("rw", db.rules, db.monsters, db.meta, async () => {
    const ruleIds = await db.rules
      .where("systemId")
      .equals(systemId)
      .primaryKeys();
    const monsterIds = await db.monsters
      .where("systemId")
      .equals(systemId)
      .primaryKeys();
    await db.rules.bulkDelete(ruleIds);
    await db.monsters.bulkDelete(monsterIds);
    await db.meta.delete(`import:${systemId}`);
  });
}
