/**
 * Локальный сервер PF2e GM Kit.
 *
 * - Отдаёт собранный PWA из dist-web на http://localhost:4173
 * - Если сборки нет, собирает проект автоматически
 * - Открывает браузер (флаг --no-open отключает это)
 *
 * Запуск: node scripts/start.mjs [--port 4173] [--no-open]
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist-web");
const HOST = "127.0.0.1";

const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const portIndex = args.indexOf("--port");
const PORT = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Некорректный порт: ${args[portIndex + 1]}`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function ensureNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    console.error(
      `Нужен Node.js 20 или новее. Сейчас: ${process.versions.node}.`,
    );
    process.exit(1);
  }
}

function buildIfNeeded() {
  if (existsSync(path.join(DIST, "index.html"))) return;

  console.log("Сборка не найдена — собираю приложение (это займёт минуту)…");
  const result = spawnSync("npm run build:web", {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0 || !existsSync(path.join(DIST, "index.html"))) {
    console.error("");
    console.error("Сборка не удалась. Проверь вывод выше и запусти:");
    console.error("  npm install");
    console.error("  npm run build:web");
    process.exit(1);
  }
}

function openBrowser(url) {
  if (noOpen) return;
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    spawnSync(command[0], command[1], { stdio: "ignore", shell: false });
  } catch {
    console.log(`Открой вручную: ${url}`);
  }
}

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    decoded = "/";
  }
  const normalized = path
    .normalize(decoded)
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");

  let target = path.join(DIST, normalized);
  if (!target.startsWith(DIST)) target = path.join(DIST, "index.html");

  if (existsSync(target) && statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  }
  return target;
}

function sendFile(request, response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const type = MIME[extension] ?? "application/octet-stream";
  const isHashedAsset = /-[A-Za-z0-9_-]{8,}\./.test(path.basename(filePath));

  response.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": isHashedAsset
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      response.destroy();
    })
    .pipe(response);
}

ensureNode();
buildIfNeeded();

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  let filePath = safePath(request.url ?? "/");
  if (!path.extname(filePath)) filePath = path.join(DIST, "index.html");

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback: неизвестный путь отдаёт приложение.
    filePath = path.join(DIST, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found. Run: npm run build:web");
    return;
  }

  sendFile(request, response, filePath);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error(`Порт ${PORT} уже занят.`);
    console.error(
      "Закрой другое приложение на этом порту или запусти: node scripts/start.mjs --port 4174",
    );
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log("");
  console.log("  PF2e GM Kit");
  console.log(`  ${url}`);
  console.log("");
  console.log("  Остановить: Ctrl+C");
  console.log("");
  setTimeout(() => openBrowser(url), 400);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
