import { loadPyodide, type PyodideInterface } from "pyodide";
// Type-only import: erased at build, so Rollup never bundles the (huge) compiler.
// The runtime `ts` comes from the standalone typescript.js loaded via a script
// tag below — keeps the build fast and the compiler on-device + SW-cacheable.
import type * as TS from "typescript";

// Gate mode (URL ?gate=1): load Pyodide + the TypeScript compiler once, then
// expose runners on window so the puppeteer harness drives cases from an OFFLINE
// page. Everything runs IN THE BROWSER — no Node, no tsc subprocess:
//   window.pyRun   — Python via Pyodide
//   window.tsCheck — TS *type-check* via the TypeScript compiler API (genuinely
//                    catches type errors; does NOT merely strip them)
//   window.tsRun   — TS transpile (types stripped) + execute, to run valid TS
type TsDiag = { code: number; message: string };

let tsCache: typeof TS | null = null;
function loadTypeScript(): Promise<typeof TS> {
  if (tsCache) return Promise.resolve(tsCache);
  const w = window as unknown as { ts?: typeof TS };
  if (w.ts) return Promise.resolve((tsCache = w.ts));
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/typescript.js"; // copied from node_modules at build time
    s.onload = () => {
      if (!w.ts) return reject(new Error("typescript global missing after load"));
      resolve((tsCache = w.ts));
    };
    s.onerror = () => reject(new Error("failed to load /vendor/typescript.js"));
    document.head.appendChild(s);
  });
}

// In-browser TS type-check. noLib keeps it self-contained: intrinsic types
// (number/string/...) are built into the checker, so an annotation mismatch like
// `const n: number = "str"` still yields TS2322 without any lib.d.ts on device.
// Snippets must therefore avoid lib members (e.g. Array/Number methods).
function tsCheck(ts: typeof TS, code: string): TsDiag[] {
  const fileName = "snippet.ts";
  const options: TS.CompilerOptions = {
    noLib: true,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
  };
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ES2020, true);
  const host: TS.CompilerHost = {
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    writeFile: () => undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? code : undefined),
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    getDirectories: () => [],
  };
  const program = ts.createProgram([fileName], options, host);
  const diags = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];
  return diags.map((d) => ({
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  }));
}

// Transpile valid TS to JS (types stripped) and execute it in-browser, returning
// the value of `resultExpr` evaluated after the snippet runs.
function tsRun(
  ts: typeof TS,
  code: string,
  resultExpr: string,
): { value: unknown; error: string | null } {
  try {
    const js = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    }).outputText;
    const fn = new Function(`${js}\n;return (${resultExpr});`);
    return { value: fn(), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function startGate(): Promise<void> {
  const root = document.getElementById("root")!;
  root.innerHTML = '<p data-testid="gate-status">loading</p>';

  const [pyodide, ts] = await Promise.all([
    loadPyodide({ indexURL: "/pyodide/" }) as Promise<PyodideInterface>,
    loadTypeScript(),
  ]);

  const w = window as unknown as Record<string, unknown>;

  w.pyRun = (code: string) => {
    let out = "";
    pyodide.setStdout({ batched: (s: string) => (out += s + "\n") });
    try {
      pyodide.runPython(code);
      return { stdout: out.replace(/\n$/, ""), error: null };
    } catch (e) {
      return { stdout: out, error: e instanceof Error ? e.message : String(e) };
    }
  };
  w.tsCheck = (code: string) => tsCheck(ts, code);
  w.tsRun = (code: string, resultExpr: string) => tsRun(ts, code, resultExpr);

  w.__GATE_READY__ = true;
  root.innerHTML = '<p data-testid="gate-status">ready</p>';
}
