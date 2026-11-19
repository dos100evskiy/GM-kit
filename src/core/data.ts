import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { MonsterRef } from "./encounter";
import type { RuleDoc } from "./search";

/** Корень репозитория: работает и из src/, и из собранного dist/. */
export const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
export const DATA_DIR = path.join(ROOT_DIR, "data");

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[data] пропускаю ${file}: ${message}`);
    return null;
  }
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => path.join(dir, name));
}

function collectArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as any)[key])) {
    return (value as any)[key];
  }
  if (value && typeof value === "object") return [value];
  return [];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDoc(raw: any): RuleDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!title || !text) return null;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : slugify(title),
    title,
    aliases: Array.isArray(raw.aliases)
      ? raw.aliases.filter((a: unknown): a is string => typeof a === "string")
      : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    text,
    source: typeof raw.source === "string" ? raw.source : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t: unknown): t is string => typeof t === "string")
      : undefined,
  };
}

function normalizeMonster(raw: any): MonsterRef | null {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const level = Number(raw.level);
  if (!name || !Number.isFinite(level)) return null;

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    name,
    level,
    roles: Array.isArray(raw.roles)
      ? raw.roles.filter((r: unknown): r is string => typeof r === "string")
      : undefined,
    traits: Array.isArray(raw.traits)
      ? raw.traits.filter((t: unknown): t is string => typeof t === "string")
      : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    kind: raw.kind === "hazard" ? "hazard" : "creature",
  };
}

/** Все документы правил: data/rules/*.json + data/foundry/rules.json. */
export function loadRuleDocs(): RuleDoc[] {
  const docs: RuleDoc[] = [];

  for (const file of jsonFiles(path.join(DATA_DIR, "rules"))) {
    for (const item of collectArray(readJsonFile(file), "docs")) {
      const doc = normalizeDoc(item);
      if (doc) docs.push(doc);
    }
  }

  const foundry = path.join(DATA_DIR, "foundry", "rules.json");
  if (existsSync(foundry)) {
    for (const item of collectArray(readJsonFile(foundry), "docs")) {
      const doc = normalizeDoc(item);
      if (doc) docs.push(doc);
    }
  }

  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
}

/** Пул существ: data/monsters/*.json + data/foundry/monsters.json. */
export function loadMonsters(): MonsterRef[] {
  const monsters: MonsterRef[] = [];

  for (const file of jsonFiles(path.join(DATA_DIR, "monsters"))) {
    for (const item of collectArray(readJsonFile(file), "monsters")) {
      const monster = normalizeMonster(item);
      if (monster) monsters.push(monster);
    }
  }

  const foundry = path.join(DATA_DIR, "foundry", "monsters.json");
  if (existsSync(foundry)) {
    for (const item of collectArray(readJsonFile(foundry), "monsters")) {
      const monster = normalizeMonster(item);
      if (monster) monsters.push(monster);
    }
  }

  return monsters;
}
