/**
 * Импорт данных из Foundry VTT (система pf2e) в локальные JSON-файлы.
 *
 * Использование:
 *   npm run import:foundry -- "/path/to/FoundryVTT/Data/systems/pf2e/packs"
 *
 * На macOS путь по умолчанию:
 *   ~/Library/Application Support/FoundryVTT/Data/systems/pf2e/packs
 *
 * Скрипт не копирует изображения и не требует запущенного Foundry.
 * Нормализация документов живёт в src/core/foundry.ts и переиспользуется
 * браузерной страницей настроек.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeFoundryDocument,
  type FoundryMonster,
  type FoundryRule,
} from "../src/core/foundry";
import type { RuleDoc } from "../src/core/search";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "data", "foundry");

function defaultPacksDir(): string {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "FoundryVTT",
      "Data",
      "systems",
      "pf2e",
      "packs",
    );
  }
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "FoundryVTT", "Data", "systems", "pf2e", "packs");
  }
  return path.join(
    os.homedir(),
    ".local",
    "share",
    "FoundryVTT",
    "Data",
    "systems",
    "pf2e",
    "packs",
  );
}

function walkJsonFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkJsonFiles(full, acc);
    else if (entry.toLowerCase().endsWith(".json")) acc.push(full);
  }
  return acc;
}

function main(): void {
  const arg = process.argv[2];
  const packsDir = arg ? path.resolve(arg) : defaultPacksDir();

  if (!existsSync(packsDir)) {
    console.error(`Не найдена папка паков: ${packsDir}`);
    console.error(
      'Укажи путь явно: npm run import:foundry -- "<...>/systems/pf2e/packs"',
    );
    process.exit(1);
  }

  const rules: Array<FoundryRule & RuleDoc> = [];
  const monsters: FoundryMonster[] = [];
  const packs = readdirSync(packsDir).filter((name) => {
    const full = path.join(packsDir, name);
    return statSync(full).isDirectory();
  });

  console.log(`Импорт из ${packsDir}`);
  console.log(`Паков: ${packs.length}`);

  for (const pack of packs) {
    const files = walkJsonFiles(path.join(packsDir, pack));
    let addedRules = 0;
    let addedMonsters = 0;

    for (const file of files) {
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }

      const normalized = normalizeFoundryDocument(doc, pack);
      if (!normalized) continue;

      rules.push(normalized.rule);
      addedRules++;
      if (normalized.monster) {
        monsters.push(normalized.monster);
        addedMonsters++;
      }
    }

    if (addedRules || addedMonsters) {
      console.log(`  ${pack}: правил ${addedRules}, существ ${addedMonsters}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "rules.json"), JSON.stringify(rules), "utf8");
  writeFileSync(
    path.join(OUT_DIR, "monsters.json"),
    JSON.stringify(monsters),
    "utf8",
  );
  writeFileSync(
    path.join(OUT_DIR, "meta.json"),
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        packsDir,
        rules: rules.length,
        monsters: monsters.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log(
    `Готово: ${rules.length} документов правил, ${monsters.length} существ.`,
  );
  console.log(`Записано в ${OUT_DIR}`);
}

main();
