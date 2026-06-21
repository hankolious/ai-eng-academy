# DeltaForge

Offline-first spike: Pyodide (Python) + on-device JS/TS execution in the browser,
with a gated, multi-language offline test harness (see `README.md` → P1 gate).

## Known debt (open P-debts)

> Tracked, not yet paid. Address before the dependent milestone named in each item.

- **[P-DEBT][TS typecheck coverage]** `window.tsCheck` (in `src/gateMain.ts`) runs
  the TypeScript compiler API with **`noLib`**. It therefore catches **intrinsic**
  type errors (e.g. `const n: number = "str"` → TS2322) but **NOT standard-library
  types** — `Array.map`, `Promise`, `JSON`, DOM, etc. are invisible to it, so
  mistakes involving them are silently accepted on device.
  **Before real TS lessons:** load `lib.d.ts` (and the relevant `lib.es*`/`lib.dom`
  files) on-device and verify the type-check against them, then drop `noLib`.
  Until then, P1's TS green/red proofs only exercise intrinsic-type checking.
