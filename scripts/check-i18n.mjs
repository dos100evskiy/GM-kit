/** Проверяет, что все статические ключи t("...") есть в обоих словарях. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = path.join(ROOT, "src", "web");

const ru = (await import("../src/web/locales/ru.ts")).default;
const en = (await import("../src/web/locales/en.ts")).default;

function has(dict, key) {
  let current = dict;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const files = walk(WEB).filter((file) => !file.includes("locales"));
const missing = new Set();
const dynamic = new Set();

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(\s*["'`]([^"'`$]+)["'`]/g)) {
    const key = match[1];
    if (!has(ru, key)) missing.add(`RU ${key} (${path.basename(file)})`);
    if (!has(en, key)) missing.add(`EN ${key} (${path.basename(file)})`);
  }
  for (const match of source.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g)) {
    dynamic.add(`${match[1]} (${path.basename(file)})`);
  }
}

console.log("Dynamic keys (проверить вручную):");
for (const item of dynamic) console.log("  " + item);
console.log("");
if (missing.size) {
  console.log("Отсутствующие статические ключи:");
  for (const item of missing) console.log("  " + item);
  process.exitCode = 1;
} else {
  console.log("Все статические ключи на месте.");
}
