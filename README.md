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

## Scope

This is a throwaway spike: no tests beyond the measurement scripts, no micropip
/ third-party wheels, no production hardening.
