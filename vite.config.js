import { resolve } from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const root = process.cwd();

export default defineConfig({
  plugins: [tailwindcss()],
  worker: { format: "es" },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision", "@mediapipe/tasks-genai"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(root, "index.html"),
        chat: resolve(root, "chat/index.html"),
        instrument: resolve(root, "instrument/index.html"),
        canvas: resolve(root, "canvas/index.html"),
        filters: resolve(root, "filters/index.html"),
        greenscreen: resolve(root, "greenscreen/index.html"),
      },
    },
  },
});
