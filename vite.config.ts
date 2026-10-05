import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "pwa-icon.svg",
        "apple-touch-icon.png",
        "licenses/DSEG-OFL-1.1.txt",
      ],
      manifest: {
        name: "Matchday Clock",
        short_name: "Matchday",
        description: "A local-first football match clock that works offline.",
        theme_color: "#0b1510",
        background_color: "#0b1510",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2,txt}"],
      },
    }),
  ],
});
