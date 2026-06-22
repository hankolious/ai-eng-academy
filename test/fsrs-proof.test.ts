import { describe, it, expect } from "vitest";
import {
  newCard,
  review,
  createScheduler,
  Rating,
  type StoredCard,
} from "../src/fsrs/scheduler";

// PROOF that P2 is the real FSRS DSR model — not SM-2 wearing an FSRS label.
// SM-2 state is { easeFactor, interval, repetitions }. FSRS state is
// { stability, difficulty } driving an interval solved for a target retention.

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);
const day = (n: number) => EPOCH + n * DAY;

describe("PROOF 1: each item holds {stability, difficulty} DSR state (no SM-2 ease)", () => {
  it("stability + difficulty evolve per review; Again drops S, raises D, +lapse", () => {
    let c: StoredCard = newCard("x", day(0));
    const trace: Array<Record<string, number>> = [];
    let t = day(0);
    for (const g of [Rating.Good, Rating.Good, Rating.Again, Rating.Good]) {
      c = review(c, g, t);
      trace.push({
        rating: g,
        stability: +c.stability.toFixed(3),
        difficulty: +c.difficulty.toFixed(3),
        interval: c.scheduled_days,
        lapses: c.lapses,
      });
      t = c.due;
    }
    console.log("DSR state trace:\n" + JSON.stringify(trace, null, 2));

    // The record carries DSR fields and NOT an SM-2 ease factor.
    expect(Object.keys(c)).toEqual(
      expect.arrayContaining(["stability", "difficulty"]),
    );
    for (const k of ["ease", "easeFactor", "efactor", "e_factor"]) {
      expect(k in c).toBe(false);
    }

    // Real, bounded DSR values.
    expect(typeof c.stability).toBe("number");
    expect(c.stability).toBeGreaterThan(0);
    expect(c.difficulty).toBeGreaterThanOrEqual(1);
    expect(c.difficulty).toBeLessThanOrEqual(10);

    // They genuinely change (not a constant ease * interval).
    expect(new Set(trace.map((r) => r.stability)).size).toBeGreaterThan(1);
    expect(new Set(trace.map((r) => r.difficulty)).size).toBeGreaterThan(1);

    // Again (index 2) is the DSR signature: stability collapses, difficulty
    // rises, lapse recorded — SM-2 cannot express a difficulty rise like this.
    const beforeAgain = trace[1];
    const onAgain = trace[2];
    expect(onAgain.stability).toBeLessThan(beforeAgain.stability);
    expect(onAgain.difficulty).toBeGreaterThan(beforeAgain.difficulty);
    expect(onAgain.lapses).toBe(beforeAgain.lapses + 1);
  });
});

describe("PROOF 2: desiredRetention is a real parameter that moves intervals", () => {
  it("0.95 vs 0.85 produce measurably different intervals (same Good sequence)", () => {
    const hi = createScheduler({ requestRetention: 0.95 });
    const lo = createScheduler({ requestRetention: 0.85 });
    expect(hi.requestRetention).toBe(0.95);
    expect(lo.requestRetention).toBe(0.85);

    const seq = [Rating.Good, Rating.Good, Rating.Good, Rating.Good];
    const intervalsFor = (s: ReturnType<typeof createScheduler>): number[] => {
      let c = s.newCard("r", day(0));
      let t = day(0);
      const iv: number[] = [];
      for (const g of seq) {
        c = s.review(c, g, t);
        iv.push(c.scheduled_days);
        t = c.due;
      }
      return iv;
    };

    const ivHi = intervalsFor(hi);
    const ivLo = intervalsFor(lo);
    console.log(`intervals @ retention 0.95: ${JSON.stringify(ivHi)}`);
    console.log(`intervals @ retention 0.85: ${JSON.stringify(ivLo)}`);

    // Lower target retention tolerates more forgetting → strictly LONGER
    // intervals at EVERY step. A retention knob that did nothing (i.e. SM-2)
    // would make these identical.
    for (let i = 0; i < seq.length; i++) {
      expect(ivLo[i]).toBeGreaterThan(ivHi[i]);
    }
    // And the effect is material, not a 1-day rounding artifact: by the last
    // step the low-retention interval is multiples of the high-retention one.
    expect(ivLo[seq.length - 1]).toBeGreaterThan(2 * ivHi[seq.length - 1]);
  });
});
