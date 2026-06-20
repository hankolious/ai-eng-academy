# Pyodide Offline Spike — Design

**Date:** 2026-06-20
**Status:** Approved
**Type:** Spike (throwaway-quality, learning-focused)

## Goal

Prove that Pyodide can run Python **fully offline** in a Vite + React + TS shell:
execute `print("hi")` with no backend and no network `fetch`, measure cold-start
time and bundle size, and use a Service Worker so the **second** start works with
the network fully disabled.

## Non-Goals (YAGNI)

- No backend, no API calls, no `fetch` of remote resources.
- No micropip / third-party Python wheels — only the stdlib `print`.
- No production hardening, no tests beyond the measurement script.

## Stack

- Vite + React + TypeScript.
- `pyodide` as an **npm dependency** (locally bundled — first start needs no network).
- `vite-plugin-static-copy` to copy Pyodide runtime assets into `public/pyodide/`.

## Architecture (4 units)

1. **App shell** (`src/App.tsx`) — "Run" button, output area, metrics panel.
   Pure UI; no network access.
2. **Pyodide loader** (`src/usePyodide.ts`) — React hook. Calls
   `loadPyodide({ indexURL: '/pyodide/' })`, redirects stdout, runs `print("hi")`.
   Assets are same-origin (copied from `node_modules/pyodide`), so no network is needed.
3. **Metrics** (`src/metrics.ts`) — wraps `performance.now()` around load + first
   exec → cold-start ms. Logged to console **and** rendered in the UI.
4. **Service worker** (`public/sw.js`) — hand-rolled, cache-first for all same-origin
   GET requests (app shell + `/pyodide/*`). Registered in `src/main.tsx`.

### Service worker cache hygiene (correction #1)

- A `CACHE_VERSION` constant names the active cache.
- The `activate` event deletes **every** cache whose name !== `CACHE_VERSION`.
- Rationale: without this, each rebuild's hashed assets accumulate as stale caches.

## Flow

```
page load → register SW → init Pyodide (timed) → run print("hi")
          → display "hi" + cold-start ms
2nd load (network off) → SW serves app shell + Pyodide from cache → still works
```

## Measurement methodology

- **Cold-start:** `performance.now()` delta from before `loadPyodide` to after the
  first `runPython('print("hi")')`. Shown in UI + logged.
- **Honest measurement (correction #2):** desktop numbers alone are misleading.
  Measure **both**: (a) desktop / no throttle, and (b) **4× CPU throttle** via the
  Chrome DevTools Protocol (`Emulation.setCPUThrottlingRate`) as a mobile proxy when
  no real device is available. The report records both and explicitly labels the
  throttled run as a CPU-throttled estimate.
- **Bundle / asset size:** captured from `vite build` output plus `du -sh` of
  `dist/pyodide` (the dominant cost). Recorded in the report in MB.

## Closeout

- `git init` → single commit of the spike.
- Secret scan (`gitleaks` if available, else a regex grep for keys/tokens).
- **No push.**

## Deliverables

- Cold-start in ms, **with and without** 4× CPU throttle.
- Pyodide asset size in MB.
