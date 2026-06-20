// Honest cold-start measurement (spec correction #2).
//
// Loads the built+previewed app in headless Chrome and reads the cold-start the
// app itself reports, under two conditions:
//   A) no throttle   (desktop — flattering, can be misleading)
//   B) 4x CPU throttle via CDP Emulation.setCPUThrottlingRate (mobile proxy)
//
// We warm up once so the service worker caches everything, then both measured
// loads are served from cache — i.e. the realistic "second start, offline" path.
//
// Usage: node scripts/measure.mjs   (assumes `npm run preview` is running on 4173)

import puppeteer from "puppeteer";

const URL = process.env.PREVIEW_URL || "http://localhost:4173/";

async function readColdStart(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="status"]')?.textContent === "ready",
    { timeout: 120_000 },
  );
  const text = await page.$eval(
    '[data-testid="coldstart"]',
    (el) => el.textContent,
  );
  const ms = parseFloat(String(text).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(ms)) throw new Error(`could not parse cold-start: ${text}`);
  return ms;
}

async function measure(browser, { throttle }) {
  const page = await browser.newPage();
  if (throttle) {
    const client = await page.target().createCDPSession();
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto(URL, { waitUntil: "load" });
  const ms = await readColdStart(page);
  await page.close();
  return ms;
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox"],
});

try {
  // Warm-up: prime the service-worker cache (registers SW, caches Pyodide).
  const warm = await browser.newPage();
  await warm.goto(URL, { waitUntil: "load" });
  await readColdStart(warm);
  // Give the SW a moment to finish caching the large wasm/stdlib assets.
  await new Promise((r) => setTimeout(r, 3000));
  await warm.close();

  const noThrottle = await measure(browser, { throttle: false });
  const throttled = await measure(browser, { throttle: true });

  console.log("\n=== Cold-start measurement ===");
  console.log(`no throttle (desktop): ${noThrottle.toFixed(1)} ms`);
  console.log(`4x CPU throttle      : ${throttled.toFixed(1)} ms`);
  console.log(JSON.stringify({ noThrottleMs: noThrottle, throttled4xMs: throttled }));
} finally {
  await browser.close();
}
