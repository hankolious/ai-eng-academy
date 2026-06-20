// Proves the spec's core claim: with the SW cache primed, a SECOND start works
// with the network FULLY disabled (page.setOfflineMode(true)).
import puppeteer from "puppeteer";
const URL = process.env.PREVIEW_URL || "http://localhost:4173/";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
async function waitReady(p) {
  await p.waitForFunction(
    () => document.querySelector('[data-testid="status"]')?.textContent === "ready",
    { timeout: 120000 });
  return p.$eval('[data-testid="output"]', (el) => el.textContent);
}
try {
  const p1 = await browser.newPage();
  await p1.goto(URL, { waitUntil: "load" });
  const out1 = await waitReady(p1);
  await new Promise((r) => setTimeout(r, 3000)); // let SW cache the big assets
  await p1.close();

  const p2 = await browser.newPage();
  await p2.setOfflineMode(true); // network fully off
  await p2.goto(URL, { waitUntil: "load" });
  const out2 = await waitReady(p2);
  await p2.close();
  console.log(JSON.stringify({ online_output: out1, offline_output: out2, offline_ok: out2.includes("hi") }));
} finally { await browser.close(); }
