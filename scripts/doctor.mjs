/**
 * Диагностика окружения PF2e GM Kit.
 * Запуск: npm run doctor
 */

import { existsSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4173;

const rows = [];
let failed = false;

function check(label, ok, detail = "") {
  rows.push({ label, ok, detail });
  if (!ok) failed = true;
}

function fileCheck(label, relative, required = true) {
  const exists = existsSync(path.join(ROOT, relative));
  check(label, exists || !required, exists ? "" : "не найден");
}

const major = Number(process.versions.node.split(".")[0]);
check("Node.js ≥ 20", major >= 20, `сейчас ${process.versions.node}`);

const npm = spawnSync("npm --version", {
  encoding: "utf8",
  shell: true,
});
check(
  "npm доступен",
  npm.status === 0,
  (npm.stdout || npm.stderr || "").trim(),
);

fileCheck("Зависимости установлены", "node_modules");
fileCheck("CLI-сборка (dist)", "dist", false);
fileCheck("PWA-сборка (dist-web)", path.join("dist-web", "index.html"));
fileCheck("Иконка 192", path.join("public", "icons", "icon-192.png"));
fileCheck("Иконка 512", path.join("public", "icons", "icon-512.png"));
fileCheck(
  "Maskable-иконка",
  path.join("public", "icons", "icon-maskable-512.png"),
);
fileCheck(
  "Apple touch icon",
  path.join("public", "icons", "apple-touch-icon.png"),
);
fileCheck("Демо-бестиарий", path.join("data", "monsters", "sample.json"));
fileCheck("Стартовый сервер", path.join("scripts", "start.mjs"));

await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once("error", (error) => {
    check(
      `Порт ${PORT} свободен`,
      error.code !== "EADDRINUSE",
      error.code === "EADDRINUSE" ? "уже занят" : error.code,
    );
    resolve();
  });
  probe.once("listening", () => {
    probe.close(() => {
      check(`Порт ${PORT} свободен`, true);
      resolve();
    });
  });
  probe.listen(PORT, "127.0.0.1");
});

const width = Math.max(...rows.map((row) => row.label.length));
for (const row of rows) {
  const mark = row.ok ? "OK  " : "FAIL";
  console.log(`${mark}  ${row.label.padEnd(width)}  ${row.detail}`.trimEnd());
}

console.log("");
if (failed) {
  console.log("Есть проблемы. Для чистой установки:");
  console.log("  npm install");
  console.log("  npm run build:web");
  console.log("  node scripts/start.mjs");
  process.exit(1);
}

const distAge = existsSync(path.join(ROOT, "dist-web", "index.html"))
  ? statSync(path.join(ROOT, "dist-web", "index.html")).mtime
  : null;
if (distAge) {
  console.log(`PWA-сборка от ${distAge.toLocaleString()}`);
}
console.log("Всё готово: node scripts/start.mjs");
