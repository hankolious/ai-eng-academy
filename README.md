# Pyodide Offline Spike

Minimal Vite + React + TS shell that loads **locally bundled** Pyodide, runs
`print("hi")` **fully offline** (no backend, no network `fetch`), and uses a
hand-rolled cache-first service worker so the **second start works with the
network disabled**.

Design doc: [`docs/superpowers/specs/2026-06-20-pyodide-offline-spike-design.md`](docs/superpowers/specs/2026-06-20-pyodide-offline-spike-design.md).

## Run

```bash
npm install
npm run build      # tsc + vite build; copies Pyodide assets to dist/pyodide
npm run preview    # serve the build on http://localhost:4173
# in another shell, with preview running:
npm run measure          # headless cold-start (no throttle + 4x CPU throttle)
node scripts/verify-offline.mjs   # proves 2nd start works with network OFF
```

> Pyodide assets are copied from `node_modules/pyodide` into `public/pyodide/`
> at build time, so they are same-origin — the **first** start needs no network
> either. The service worker only adds the offline-after-reload guarantee.

## Results (measured 2026-06-20, this machine)

### Cold-start (load Pyodide → first `print("hi")` returned)

| Condition | Cold-start |
|---|---|
| No throttle (desktop) | **678.8 ms** |
| **4× CPU throttle** (mobile proxy) | **2643.9 ms** |

The desktop number alone is misleading (spec correction #2). No real mobile
device was available, so the second row is a **4× CPU-throttled estimate** via
the Chrome DevTools Protocol (`Emulation.setCPUThrottlingRate`). Real low-end
phones may be slower still — treat ~2.6 s as a floor, not a ceiling.

Both rows are measured from the service-worker cache (the realistic repeat-visit
path); a warm-up load primes the cache first.

### Pyodide asset size (`dist/pyodide`, what ships for offline use)

| File | Size |
|---|---|
| `pyodide.asm.wasm` | 9.62 MiB |
| `python_stdlib.zip` | 2.23 MiB |
| `pyodide.asm.js` | 1.17 MiB |
| `pyodide-lock.json` | 0.10 MiB |
| `pyodide.mjs` | 0.01 MiB |
| **Total Pyodide** | **≈ 13.1 MiB (13.78 MB)** |

App JS bundle (excl. Pyodide): **160.22 kB** (52.70 kB gzip).

### Offline second start

`scripts/verify-offline.mjs` primes the cache, then loads again with the network
fully disabled (`setOfflineMode(true)`):

```json
{"online_output":"hi","offline_output":"hi","offline_ok":true}
```

✅ Second start runs Python with **zero network**.

## How it works

- **`src/usePyodide.ts`** — `loadPyodide({ indexURL: '/pyodide/' })`, redirects
  stdout, runs `print("hi")`, times the whole thing.
- **`src/metrics.ts`** — `performance.now()` wrapper; logs cold-start to console
  and the UI reads it from `[data-testid="coldstart"]`.
- **`public/sw.js`** — cache-first for every same-origin GET. A `CACHE_VERSION`
  constant names the active cache; the `activate` handler deletes every cache
  whose name differs, so stale hashed assets don't accumulate across rebuilds
  (spec correction #1).

## P1 gate (offline green/red proofs per language)

`bash scripts/p1-gate.sh` (build → preview → gate; exit code == gate result)
proves the test harness has **teeth**: one 🟢 green + one 🔴 red case per language,
all **on-device in the browser with the network hard-disabled** (`setOfflineMode`,
`navigator.onLine === false`), plus a self-checking secret scan.

- **Python / JS** run in the offline page (Pyodide from the SW cache; JS native).
- **TypeScript runs fully on-device too** — no `tsc` subprocess, no Node at
  runtime. The standalone `typescript.js` is copied to `/vendor/` and loaded via a
  script tag (SW-cached for offline). Two distinct paths:
  - `window.tsCheck` — the **TypeScript compiler API** (`createProgram` +
    `getSemanticDiagnostics`). This **genuinely catches** type errors.
  - `window.tsRun` — `transpileModule` + execute, to run valid TS.

  **Honest caveat:** transpilers (esbuild, `transpileModule`) only **strip** types —
  they do NOT catch `const n: number = "str"`. That is why the red proof uses the
  separate compiler-API type-check path, not the transpiler. The `tsCheck` path
  runs with `noLib` so it is self-contained on device (intrinsic `number`/`string`
  mismatches still yield TS2322 without shipping `lib.d.ts`); snippets therefore
  avoid lib members like `Array`/`Number` methods.

Latest gate result — `P1 GATE: GREEN`, all 9 proofs PASS:

| Lang | 🟢 green | 🔴 red |
|---|---|---|
| Python | `print(6*7)` → `42` | `print(undefined_var)` → `NameError` caught |
| JS | `[1,2,3].map(x=>x*2)` → `[2,4,6]` | `null.foo` → `TypeError` caught |
| TS | type-checks clean + runs → `42` | `const n: number = "str"` → `TS2322` caught |
| Secret scan | tracked tree clean (exit 0) | injected example key caught (exit 1) |

## Scope

This is a throwaway spike: no tests beyond the measurement scripts, no micropip
/ third-party wheels, no production hardening.
