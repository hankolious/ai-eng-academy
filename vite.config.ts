import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Prebuilt assets copied verbatim into the build output (and SW-cached for
// offline). These are NOT bundled by Rollup: Pyodide ships large wasm/zip blobs,
// and the standalone TypeScript compiler is ~9 MB — Rollup-bundling it stalls the
// build, so we load typescript.js at runtime via a <script> tag instead.
const COPIES: Array<{ from: string; to: string }> = [
  ...[
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
    "pyodide.mjs",
  ].map((f) => ({ from: `node_modules/pyodide/${f}`, to: `pyodide/${f}` })),
  { from: "node_modules/typescript/lib/typescript.js", to: "vendor/typescript.js" },
];

// A few lines of fs beat vite-plugin-static-copy here — no fast-glob, nothing to
// drift.
function copyVendor(): Plugin {
  return {
    name: "copy-vendor",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir ?? resolve(here, "dist");
      for (const { from, to } of COPIES) {
        const dest = resolve(outDir, to);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(resolve(here, from), dest);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyVendor()],
  // Pyodide ships large prebuilt assets; don't let Vite try to optimize them.
  optimizeDeps: { exclude: ["pyodide"] },
});
