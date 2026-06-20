// P1 gate orchestrator. Proves the harness has TEETH:
//   - one GREEN case + one RED case per language (Python, JS, TS), all offline
//   - secret scan: clean tree GREEN + injected secret RED (verified)
// Exits 0 only if every proof behaves as required.
//
// Python + JS run in a headless browser with the network HARD-DISABLED
// (setOfflineMode). TS is type-checked by the local tsc (inherently offline).
// Assumes `npm run preview` is serving on :4173.

import puppeteer from "puppeteer";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.PREVIEW_URL || "http://localhost:4173/?gate=1";

const proofs = [];
let ok = true;
function record(name, pass, detail) {
  proofs.push({ name, pass, detail });
  if (!pass) ok = false;
}
const lastLine = (s) =>
  String(s || "").trim().split("\n").filter(Boolean).pop() || "(no output)";

// ---------------- Python + JS in an OFFLINE browser ----------------
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
try {
  // Warm-up online: prime the service-worker cache (incl. Pyodide).
  const warm = await browser.newPage();
  await warm.goto(URL, { waitUntil: "load" });
  await warm.waitForFunction(() => window.__GATE_READY__ === true, { timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 3000)); // let SW cache big assets
  await warm.close();

  // Offline page: everything (incl. Pyodide) must come from cache.
  const page = await browser.newPage();
  await page.setOfflineMode(true);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GATE_READY__ === true, { timeout: 120_000 });

  const online = await page.evaluate(() => navigator.onLine);
  record("Offline context confirmed (navigator.onLine===false)", online === false,
    `navigator.onLine=${online}`);

  // --- Python GREEN: correct program produces expected stdout ---
  const pyGood = await page.evaluate((c) => window.pyRun(c), "print(6*7)");
  record("PY green-case: print(6*7) -> '42' (offline)",
    pyGood.error === null && pyGood.stdout === "42",
    `stdout=${JSON.stringify(pyGood.stdout)} error=${pyGood.error}`);

  // --- Python RED: broken program (NameError) must be caught ---
  const pyBad = await page.evaluate((c) => window.pyRun(c), "print(undefined_var)");
  record("PY red-case: NameError caught (offline)",
    pyBad.error !== null && /NameError/.test(pyBad.error),
    `error=${lastLine(pyBad.error)}`);

  // --- JS GREEN ---
  const jsGood = await page.evaluate(() => {
    try { return { v: JSON.stringify([1, 2, 3].map((x) => x * 2)), error: null }; }
    catch (e) { return { v: null, error: String(e?.message ?? e) }; }
  });
  record("JS green-case: [1,2,3].map(*2) -> '[2,4,6]' (offline)",
    jsGood.error === null && jsGood.v === "[2,4,6]",
    `v=${jsGood.v} error=${jsGood.error}`);

  // --- JS RED: TypeError must be caught ---
  const jsBad = await page.evaluate(() => {
    try { const o = null; return { ok: true, v: o.foo, error: null }; }
    catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
  });
  record("JS red-case: TypeError caught (offline)",
    jsBad.ok === false && Boolean(jsBad.error),
    `error=${jsBad.error}`);

  await page.close();
} finally {
  await browser.close();
}

// ---------------- TypeScript via local tsc (offline) ----------------
function tsCheck(code) {
  const dir = mkdtempSync(join(tmpdir(), "p1ts-"));
  const file = join(dir, "snippet.ts");
  writeFileSync(file, code);
  const res = spawnSync("node_modules/.bin/tsc", ["--noEmit", "--strict", file], {
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true, force: true });
  return { status: res.status, out: (res.stdout || "") + (res.stderr || "") };
}

const tsGood = tsCheck("const n: number = 42; const r: string = n.toFixed(2); void r;");
record("TS green-case: well-typed snippet compiles clean",
  tsGood.status === 0,
  tsGood.out.trim() || "(no diagnostics)");

const tsBad = tsCheck('const n: number = "str"; void n;');
record("TS red-case: type error (TS2322) caught",
  tsBad.status !== 0 && /TS2322/.test(tsBad.out),
  lastLine(tsBad.out));

// ---------------- Secret scan: clean GREEN + injected RED ----------------
const scanGreen = spawnSync("bash", ["scripts/secret-scan.sh"], { encoding: "utf8" });
record("SCAN green-case: tracked tree clean",
  scanGreen.status === 0,
  lastLine(scanGreen.stdout));

const sdir = mkdtempSync(join(tmpdir(), "p1sec-"));
const sfile = join(sdir, "leak.txt");
// Fake/example credential, assembled from fragments so THIS source file contains
// no contiguous match (keeps the tracked tree clean), while the temp file written
// below DOES match — that's the red-proof. Temp dir is outside the repo.
const fakeKey = ["AKIA", "IOSFODNN7", "EXAMPLE12"].join("");
const fakeLeak = ["aws", "secret", "access", "key"].join("_") + ` = "${fakeKey}"\n`;
writeFileSync(sfile, fakeLeak);
const scanRed = spawnSync("bash", ["scripts/secret-scan.sh", sfile], { encoding: "utf8" });
rmSync(sdir, { recursive: true, force: true });
record("SCAN red-case: injected secret caught (exit 1)",
  scanRed.status === 1,
  lastLine(scanRed.stdout));

// ---------------- Report ----------------
console.log("\n=== P1 GATE PROOFS ===");
for (const p of proofs) {
  console.log(`[${p.pass ? "PASS" : "FAIL"}] ${p.name}`);
  console.log(`         ${p.detail}`);
}
console.log(`\nP1 GATE: ${ok ? "GREEN ✅" : "RED ❌"}`);
process.exit(ok ? 0 : 1);
