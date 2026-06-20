import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Pyodide runtime files needed to run the stdlib offline (no micropip/wheels).
const PYODIDE_ASSETS = [
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
  "pyodide.mjs",
];

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: PYODIDE_ASSETS.map((f) => ({
        src: `node_modules/pyodide/${f}`,
        dest: "pyodide",
      })),
    }),
  ],
  // Pyodide ships large prebuilt assets; don't let Vite try to optimize them.
  optimizeDeps: { exclude: ["pyodide"] },
});
