/**
 * Локальный сервер GM Kit.
 *
 * - Отдаёт собранный PWA из dist-web на http://localhost:4173
 * - Слушает локальную сеть: игроки открывают http://<LAN-IP>:4173
 * - Держит live-состояние боя и библиотеку правил для игроков
 * - Если сборки нет, собирает проект автоматически
 *
 * Запуск: node scripts/start.mjs [--port 4173] [--no-open]
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pickNetworks } from "./network.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist-web");
const DATA_DIR = path.join(ROOT, ".pf2e");
const LIBRARY_FILE = path.join(DATA_DIR, "library.json");
const HOST = "0.0.0.0";

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

const clients = new Set();
let liveState = null;
let liveRevision = 0;
let hiddenReason = null;
let libraries = loadLibraries();

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

function networkInfo() {
  return pickNetworks(os.networkInterfaces(), PORT);
}

function normalizeLibrary(value) {
  if (!value || !Array.isArray(value.rules)) return null;
  return {
    systemId: value.systemId === "dnd5e" ? "dnd5e" : "pf2e",
    updatedAt: Number(value.updatedAt) || 0,
    rules: value.rules,
  };
}

function loadLibraries() {
  try {
    const parsed = JSON.parse(readFileSync(LIBRARY_FILE, "utf8"));
    if (parsed?.libraries && typeof parsed.libraries === "object") {
      const result = {};
      for (const [id, value] of Object.entries(parsed.libraries)) {
        const normalized = normalizeLibrary(value);
        if (normalized) result[id] = normalized;
      }
      return result;
    }
    const single = normalizeLibrary(parsed);
    return single ? { [single.systemId]: single } : {};
  } catch {
    return {};
  }
}

function saveLibraries(value) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(LIBRARY_FILE, JSON.stringify({ libraries: value }), "utf8");
  } catch (error) {
    console.error("Не удалось сохранить библиотеку правил:", error.message);
  }
}

function latestLibrarySystem() {
  let best = null;
  for (const [id, value] of Object.entries(libraries)) {
    if (!best || value.updatedAt > libraries[best].updatedAt) best = id;
  }
  return best;
}

function getLibrary(systemId) {
  return libraries[systemId] ?? null;
}

function isLoopback(request) {
  const address = request.socket.remoteAddress ?? "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function sendJson(request, response, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  const acceptsGzip = String(request.headers["accept-encoding"] ?? "").includes(
    "gzip",
  );
  const encoded = acceptsGzip && body.length > 1024 ? gzipSync(body) : body;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...(encoded !== body ? { "Content-Encoding": "gzip" } : {}),
  });
  response.end(encoded);
}

function readJson(request, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Слишком большой запрос"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Некорректный JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sanitizeSnapshot(input) {
  if (!input || typeof input !== "object") return null;
  const systemId = input.systemId === "dnd5e" ? "dnd5e" : "pf2e";
  const order = Array.isArray(input.order)
    ? input.order
        .slice(0, 200)
        .map((entry) => ({
          id: String(entry?.id ?? "").slice(0, 100),
          name: String(entry?.name ?? "").slice(0, 200),
          initiative: Number.isFinite(Number(entry?.initiative))
            ? Number(entry.initiative)
            : null,
        }))
        .filter((entry) => entry.id && entry.name)
    : [];

  return {
    version: 1,
    systemId,
    encounter: String(input.encounter ?? "").slice(0, 200),
    round: Number.isFinite(Number(input.round))
      ? Math.max(0, Math.round(Number(input.round)))
      : 0,
    started: Boolean(input.started),
    activeId:
      typeof input.activeId === "string" ? input.activeId.slice(0, 100) : null,
    order,
  };
}

function sanitizeRules(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  for (const rule of input.slice(0, 50000)) {
    if (!rule || typeof rule !== "object") continue;
    const id = String(rule.id ?? "").slice(0, 200);
    const title = String(rule.title ?? "").slice(0, 300);
    const text = String(rule.text ?? "").slice(0, 20000);
    if (!id || !title || !text) continue;
    result.push({
      id,
      title,
      text,
      category:
        typeof rule.category === "string"
          ? rule.category.slice(0, 200)
          : undefined,
      source:
        typeof rule.source === "string" ? rule.source.slice(0, 300) : undefined,
      url: typeof rule.url === "string" ? rule.url.slice(0, 500) : undefined,
      aliases: Array.isArray(rule.aliases)
        ? rule.aliases.filter((item) => typeof item === "string").slice(0, 30)
        : undefined,
      tags: Array.isArray(rule.tags)
        ? rule.tags.filter((item) => typeof item === "string").slice(0, 30)
        : undefined,
    });
  }
  return result;
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function handleSse(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 3000\n\n");
  response.write(": connected\n\n");
  if (liveState) {
    response.write(`event: state\ndata: ${JSON.stringify(liveState)}\n\n`);
  } else if (hiddenReason) {
    response.write(
      `event: hidden\ndata: ${JSON.stringify({
        revision: liveRevision,
        reason: hiddenReason,
      })}\n\n`,
    );
  }
  for (const library of Object.values(libraries)) {
    response.write(
      `event: library\ndata: ${JSON.stringify({
        systemId: library.systemId,
        count: library.rules.length,
        updatedAt: library.updatedAt,
      })}\n\n`,
    );
  }
  clients.add(response);
  const heartbeat = setInterval(() => {
    try {
      response.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(response);
    }
  }, 15000);
  request.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
  });
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/config") {
    const systemId =
      liveState?.systemId ?? latestLibrarySystem() ?? "pf2e";
    const library = getLibrary(systemId);
    sendJson(request, response, 200, {
      version: 1,
      mode: isLoopback(request) ? "gm" : "player",
      live: true,
      systemId,
      network: networkInfo(),
      library: {
        systemId: library?.systemId ?? null,
        count: library?.rules.length ?? 0,
        updatedAt: library?.updatedAt ?? 0,
      },
    });
    return true;
  }

  if (pathname === "/api/live") {
    if (request.method !== "GET") {
      sendJson(request, response, 405, { error: "Method not allowed" });
      return true;
    }
    handleSse(request, response);
    return true;
  }

  if (pathname === "/api/state") {
    sendJson(request, response, 200, {
      revision: liveRevision,
      snapshot: liveState,
      hiddenReason,
    });
    return true;
  }

  if (pathname === "/api/publish") {
    if (request.method !== "POST") {
      sendJson(request, response, 405, { error: "Method not allowed" });
      return true;
    }
    if (!isLoopback(request)) {
      sendJson(request, response, 403, {
        error: "Публикация доступна только мастеру на localhost",
      });
      return true;
    }
    try {
      const body = await readJson(request);
      if (body.hidden) {
        liveState = null;
        hiddenReason = body.reason === "ended" ? "ended" : "manual";
        liveRevision += 1;
        broadcast("hidden", {
          revision: liveRevision,
          reason: hiddenReason,
        });
        sendJson(request, response, 200, {
          ok: true,
          hidden: true,
          reason: hiddenReason,
        });
        return true;
      }
      const snapshot = sanitizeSnapshot(body);
      if (!snapshot) {
        sendJson(request, response, 400, { error: "Некорректный снимок" });
        return true;
      }
      liveState = snapshot;
      hiddenReason = null;
      liveRevision += 1;
      broadcast("state", snapshot);
      sendJson(request, response, 200, {
        ok: true,
        revision: liveRevision,
      });
    } catch (error) {
      sendJson(request, response, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === "/api/library") {
    if (request.method === "GET") {
      const requested = new URL(
        request.url ?? "/",
        `http://localhost:${PORT}`,
      ).searchParams.get("systemId");
      const systemId = requested ?? latestLibrarySystem() ?? "pf2e";
      const library = getLibrary(systemId);
      sendJson(request, response, 200, {
        systemId: library?.systemId ?? systemId,
        updatedAt: library?.updatedAt ?? 0,
        rules: library?.rules ?? [],
      });
      return true;
    }
    if (request.method !== "POST") {
      sendJson(request, response, 405, { error: "Method not allowed" });
      return true;
    }
    if (!isLoopback(request)) {
      sendJson(request, response, 403, {
        error: "Публикация доступна только мастеру на localhost",
      });
      return true;
    }
    try {
      const body = await readJson(request, 64 * 1024 * 1024);
      const systemId = body.systemId === "dnd5e" ? "dnd5e" : "pf2e";
      const rules = sanitizeRules(body.rules);
      const library = {
        systemId,
        updatedAt: Date.now(),
        rules,
      };
      libraries[systemId] = library;
      saveLibraries(libraries);
      broadcast("library", {
        systemId,
        count: rules.length,
        updatedAt: library.updatedAt,
      });
      sendJson(request, response, 200, {
        ok: true,
        count: rules.length,
        updatedAt: library.updatedAt,
      });
    } catch (error) {
      sendJson(request, response, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === "/api/library/meta") {
    const requested = new URL(
      request.url ?? "/",
      `http://localhost:${PORT}`,
    ).searchParams.get("systemId");
    const systemId = requested ?? latestLibrarySystem() ?? "pf2e";
    const library = getLibrary(systemId);
    sendJson(request, response, 200, {
      systemId: library?.systemId ?? systemId,
      count: library?.rules.length ?? 0,
      updatedAt: library?.updatedAt ?? 0,
    });
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(request, response, 404, { error: "Not found" });
    return true;
  }

  return false;
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

const server = createServer(async (request, response) => {
  const pathname = (request.url ?? "/").split("?")[0];

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }
  } catch (error) {
    console.error("API error:", error);
    if (!response.headersSent) {
      sendJson(request, response, 500, { error: "Internal error" });
    } else {
      response.destroy();
    }
    return;
  }

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
  const { primary } = networkInfo();
  console.log("");
  console.log("  GM Kit");
  console.log(`  Мастер:  ${url}`);
  if (primary) {
    console.log(`  Игроки:  ${primary.url}`);
  } else {
    console.log("  Игроки:  LAN-адрес не найден (нет сети?)");
  }
  console.log("");
  console.log("  Игроки открывают адрес в браузере — установка не нужна.");
  console.log("  Остановить: Ctrl+C");
  console.log("");
  setTimeout(() => openBrowser(url), 400);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
