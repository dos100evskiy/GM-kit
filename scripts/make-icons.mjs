/**
 * Генерирует PNG-иконки PWA без нативных зависимостей.
 *
 * Запуск: node scripts/make-icons.mjs
 * Результат: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "public", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function inPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function distanceToPolygon(px, py, points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    best = Math.min(best, distanceToSegment(px, py, ax, ay, bx, by));
  }
  return best;
}

const GOLD = hexToRgb("#c9a227");
const GOLD_DARK = hexToRgb("#8a7020");
const RED = hexToRgb("#b03a2e");
const RED_BRIGHT = hexToRgb("#d4564a");

function render(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.8 : 1;
  const hexRadius = 0.335 * scale;
  const center = 0.5;
  const hexPoints = Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * (Math.PI / 180);
    return [
      center + Math.cos(angle) * hexRadius,
      center + Math.sin(angle) * hexRadius,
    ];
  });
  const triPoints = [
    [center, center - 0.185 * scale],
    [center - 0.195 * scale, center + 0.19 * scale],
    [center + 0.195 * scale, center + 0.19 * scale],
  ];
  const stroke = 0.019 * scale;

  const bgCenter = hexToRgb("#1c1815");
  const bgEdge = hexToRgb("#0d0b0a");

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = (x + (sx + 0.5) / 3) / size;
          const py = (y + (sy + 0.5) / 3) / size;

          const dx = px - 0.5;
          const dy = py - 0.5;
          const radius = Math.hypot(dx, dy) / 0.75;
          let color = mix(bgCenter, bgEdge, Math.min(1, radius));

          const glow = Math.exp(
            -((px - 0.22) ** 2 + (py - 0.16) ** 2) / 0.16,
          );
          color = mix(color, [58, 26, 22], glow * 0.55);

          const goldGlow = Math.exp(
            -((px - 0.8) ** 2 + (py - 0.2) ** 2) / 0.1,
          );
          color = mix(color, [52, 42, 16], goldGlow * 0.4);

          if (inPolygon(px, py, triPoints)) {
            color = mix(color, RED, 0.14);
          }

          const hexEdge = distanceToPolygon(px, py, hexPoints);
          if (hexEdge < stroke) {
            const t = Math.min(1, Math.max(0, 1 - hexEdge / stroke));
            color = mix(color, GOLD, t * 0.95);
          }

          const triEdge = distanceToPolygon(px, py, triPoints);
          if (triEdge < stroke * 0.9) {
            const t = Math.min(1, Math.max(0, 1 - triEdge / (stroke * 0.9)));
            color = mix(color, RED_BRIGHT, t);
          }

          for (const [vx, vy] of hexPoints) {
            const spokeDistance = distanceToSegment(
              px,
              py,
              center,
              center,
              vx,
              vy,
            );
            if (spokeDistance < 0.0035 * scale) {
              color = mix(color, GOLD_DARK, 0.85);
            }
          }

          const dotDistance = Math.hypot(px - center, py - center);
          if (dotDistance < 0.018 * scale) {
            color = mix(color, GOLD, 1);
          }

          // Фон всегда непрозрачный: maskable-иконку платформа обрезает сама.
          a += 255;
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }

      const index = (y * size + x) * 4;
      rgba[index] = Math.round(r / 9);
      rgba[index + 1] = Math.round(g / 9);
      rgba[index + 2] = Math.round(b / 9);
      rgba[index + 3] = Math.round(a / 9);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });

writeFileSync(path.join(OUT, "icon-192.png"), render(192));
writeFileSync(path.join(OUT, "icon-512.png"), render(512));
writeFileSync(
  path.join(OUT, "icon-maskable-512.png"),
  render(512, { maskable: true }),
);
writeFileSync(path.join(OUT, "apple-touch-icon.png"), render(180));

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="90%">
      <stop offset="0" stop-color="#241d18"/>
      <stop offset="1" stop-color="#0d0b0a"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <polygon points="32,5 55,18 55,45 32,58 9,45 9,18" fill="none" stroke="#c9a227" stroke-width="2.4"/>
  <polygon points="32,14 47,43 17,43" fill="rgba(176,58,46,0.14)" stroke="#d4564a" stroke-width="2"/>
  <path d="M32 14 V32 M47 43 L55 45 M17 43 L9 45 M32 5 V14 M32 5 L9 18 M32 5 L55 18" stroke="#8a7020" stroke-width="1.2"/>
  <circle cx="32" cy="32" r="2" fill="#c9a227"/>
</svg>
`;
writeFileSync(path.join(OUT, "favicon.svg"), favicon, "utf8");

console.log(`Иконки записаны в ${OUT}`);
