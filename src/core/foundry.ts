/**
 * Чистая нормализация данных Foundry VTT (система pf2e) и JSON из CLI.
 *
 * Здесь нет доступа к файловой системе: модуль используют и скрипт импорта,
 * и браузерная страница настроек.
 */

import type { MonsterRef } from "./encounter";
import type { RuleDoc } from "./search";

export interface FoundryRule extends RuleDoc {
  id: string;
}

export interface FoundryMonster extends MonsterRef {
  id: string;
  kind: "creature" | "hazard";
  traits: string[];
  roles: string[];
}

export interface NormalizedDocument {
  rule: FoundryRule;
  monster?: FoundryMonster;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function inferRoles(
  traits: string[],
  kind: "creature" | "hazard",
): string[] {
  const roles = new Set<string>();
  if (kind === "hazard") roles.add("hazard");
  if (traits.includes("dragon")) roles.add("boss");
  if (traits.includes("undead")) roles.add("undead");
  if (traits.includes("skeleton") || traits.includes("zombie"))
    roles.add("minion");
  if (traits.includes("giant") || traits.includes("troll")) roles.add("brute");
  if (traits.includes("animal")) roles.add("animal");
  if (traits.includes("goblin")) roles.add("skirmisher");
  if (traits.includes("humanoid")) roles.add("soldier");
  if (traits.includes("trap")) roles.add("hazard");
  if (!roles.size) roles.add("creature");
  return [...roles];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function firstFinite(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number === "number" && Number.isFinite(number)) return number;
  }
  return undefined;
}

/** Достаёт описание правила из документа Foundry. */
export function foundryDescription(doc: Record<string, any>): string {
  const system = asRecord(doc.system);
  const raw =
    system.description?.value ??
    system.description ??
    system.details?.description ??
    "";
  return typeof raw === "string" ? stripHtml(raw) : "";
}

export interface FoundrySource {
  hp?: number;
  ac?: number;
  initiativeMod?: number;
}

export function foundryCombatStats(
  doc: Record<string, any>,
): FoundrySource {
  const system = asRecord(doc.system);
  const attributes = asRecord(system.attributes);
  const hp = firstFinite(
    attributes.hp?.max,
    attributes.hp?.value,
    system.hp?.max,
    system.hp?.value,
    system.health?.max,
  );
  const ac = firstFinite(
    attributes.ac?.value,
    attributes.ac,
    system.ac?.value,
    system.ac,
  );
  const initiativeMod = firstFinite(
    attributes.initiative?.mod,
    system.initiative?.mod,
    system.initiative?.value,
    system.perception?.mod,
    attributes.perception?.mod,
  );
  return { hp, ac, initiativeMod };
}

/** Нормализует один документ Foundry. Возвращает null, если это не правило. */
export function normalizeFoundryDocument(
  doc: unknown,
  pack: string,
): NormalizedDocument | null {
  const record = asRecord(doc);
  if (typeof record.name !== "string") return null;

  const fullText = foundryDescription(record);
  if (!fullText) return null;
  const text = fullText.length > 12000 ? `${fullText.slice(0, 12000)}…` : fullText;

  const system = asRecord(record.system);
  const source = firstText(
    system.publication?.title,
    system.source?.value,
    system.details?.source?.value,
  );
  const id = `foundry:${pack}/${record._id ?? record.name}`;

  const rule: FoundryRule = {
    id,
    title: record.name,
    category: pack,
    text,
    source,
    url: `https://2e.aonprd.com/Search.aspx?Query=${encodeURIComponent(record.name)}`,
  };

  const type = String(record.type ?? "");
  const kind: "creature" | "hazard" | null =
    type === "npc" ? "creature" : type === "hazard" ? "hazard" : null;
  if (!kind) return { rule };

  const level = firstFinite(
    system.details?.level?.value,
    system.level?.value,
    system.level,
  );
  if (level === undefined) return { rule };

  const traits: string[] = Array.isArray(system.traits?.value)
    ? system.traits.value.filter(
        (trait: unknown): trait is string => typeof trait === "string",
      )
    : [];
  const stats = foundryCombatStats(record);

  const monster: FoundryMonster = {
    id,
    name: record.name,
    level,
    traits,
    roles: inferRoles(traits, kind),
    kind,
    source,
    hp: stats.hp,
    ac: stats.ac,
    initiativeMod: stats.initiativeMod,
  };

  return { rule, monster };
}

function isRuleLike(value: unknown): value is RuleDoc {
  const record = asRecord(value);
  return (
    typeof record.title === "string" && typeof record.text === "string"
  );
}

function isMonsterLike(value: unknown): value is MonsterRef {
  const record = asRecord(value);
  return (
    typeof record.name === "string" &&
    typeof record.level === "number" &&
    Number.isFinite(record.level)
  );
}

/**
 * Разбирает JSON из CLI или встроенного экспорта.
 * Поддерживает массив документов и объект `{ rules, monsters }`.
 */
export function normalizeJsonData(input: unknown): {
  rules: RuleDoc[];
  monsters: MonsterRef[];
} {
  const rules: RuleDoc[] = [];
  const monsters: MonsterRef[] = [];

  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRuleLike(item)) rules.push(item);
        if (isMonsterLike(item)) monsters.push(item);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = asRecord(value);
    if (Array.isArray(record.rules)) push(record.rules);
    else if (isRuleLike(record)) rules.push(record);

    const other = asRecord(value);
    if (Array.isArray(other.monsters)) push(other.monsters);
    else if (isMonsterLike(other)) monsters.push(other);
  };

  push(input);
  return { rules, monsters };
}

export interface FoundryFile {
  /** Относительное имя файла — используется для журнала и id. */
  path: string;
  /** Имя пака, если его уже вычислил вызывающий код. */
  pack?: string;
  /** Содержимое JSON-документа. */
  doc: unknown;
}

/** Вычисляет имя пака из относительного пути (`.../packs/<pack>/file.json`). */
export function packNameFromPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  const index = parts.lastIndexOf("packs");
  if (index >= 0 && parts[index + 1]) return parts[index + 1]!;
  if (parts.length >= 2) return parts[parts.length - 2]!;
  return parts[0] ?? "imported";
}

/** Нормализует набор файлов паков Foundry. */
export function normalizeFoundryFiles(files: FoundryFile[]): {
  rules: FoundryRule[];
  monsters: FoundryMonster[];
  skipped: number;
} {
  const rules: FoundryRule[] = [];
  const monsters: FoundryMonster[] = [];
  let skipped = 0;

  for (const file of files) {
    const pack = file.pack ?? packNameFromPath(file.path);
    const normalized = normalizeFoundryDocument(file.doc, pack);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    rules.push(normalized.rule);
    if (normalized.monster) monsters.push(normalized.monster);
  }

  return { rules, monsters, skipped };
}
