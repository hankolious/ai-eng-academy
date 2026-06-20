// Tiny timing helper around performance.now(). Cold-start is the wall-clock
// time from "start loading Pyodide" to "first print() returned".

export interface ColdStart {
  ms: number;
  startedAt: number;
  finishedAt: number;
}

export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; cold: ColdStart }> {
  const startedAt = performance.now();
  const result = await fn();
  const finishedAt = performance.now();
  const ms = finishedAt - startedAt;
  // Log to console so headless measurement can scrape it, and humans can see it.
  console.log(`[metrics] ${label}: ${ms.toFixed(1)} ms`);
  return { result, cold: { ms, startedAt, finishedAt } };
}
