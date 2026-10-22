import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  // es2018 — поддержка старых мобильных браузеров (трансляция ?. и ??)
  build: { target: "es2018" },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "101 цель",
        short_name: "101 цель",
        description: "Трекер целей с синхронизацией через Яндекс.Диск",
        lang: "ru",
        display: "standalone",
        orientation: "any",
        background_color: "#111318",
        theme_color: "#4f7cff",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
