import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function normalizeBase(value: string | undefined): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.GITHUB_PAGES_BASE),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "PF2e GM Kit",
        short_name: "PF2e GM",
        description:
          "Справочник правил, генератор энкаунтеров и боевой трекер Pathfinder 2e",
        lang: "ru",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#100e0c",
        theme_color: "#100e0c",
        categories: ["games", "productivity"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: "dist-web",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const normalized = id.replace(/\\/g, "/");
          if (
            normalized.includes("/react/") ||
            normalized.includes("/react-dom/") ||
            normalized.includes("/scheduler/")
          ) {
            return "react";
          }
          if (
            normalized.includes("/dexie/") ||
            normalized.includes("/dexie-react-hooks/") ||
            normalized.includes("/zustand/")
          ) {
            return "data";
          }
          if (
            normalized.includes("/cmdk/") ||
            normalized.includes("/lucide-react/")
          ) {
            return "ui";
          }
          if (
            normalized.includes("/i18next/") ||
            normalized.includes("/react-i18next/")
          ) {
            return "i18n";
          }
          return undefined;
        },
      },
    },
  },
});
