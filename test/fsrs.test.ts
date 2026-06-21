import "fake-indexeddb/auto"; // sets globalThis.indexedDB (no browser needed)
import { describe, it, expect } from "vitest";
import { openCardStore } from "../src/store/cardStore";
import { newCard, review, Rating } from "../src/fsrs/scheduler";
import { getDueCards, rateCard } from "../src/review/queue";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1); // 2026-01-01
const day = (n: number) => EPOCH + n * DAY;

describe("FSRS scheduler", () => {
  it("uses FSRS day intervals, not SM-2: Good → growing intervals", () => {
    let c = newCard("g", day(0));
    const intervals: number[] = [];
    let t = day(0);
    for (let i = 0; i < 4; i++) {
      c = review(c, Rating.Good, t);
      intervals.push(c.scheduled_days);
      t = c.due;
    }
    // Strictly increasing (each Good lengthens the interval).
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
    // SM-2 would start at fixed 1/6 days; FSRS derives from stability.
    expect(intervals[0]).toBeGreaterThanOrEqual(1);
  });

  it("Again from Review records a lapse and shortens the interval", () => {
    let c = newCard("l", day(0));
    c = review(c, Rating.Good, day(0));
    c = review(c, Rating.Good, c.due);
    const before = c.scheduled_days;
    const lapsesBefore = c.lapses;

    c = review(c, Rating.Again, c.due);
    expect(c.lapses).toBe(lapsesBefore + 1);
    expect(c.scheduled_days).toBeLessThan(before);
    // Re-presented in the near future, not dropped.
    expect(c.due).toBeGreaterThan(EPOCH);
  });
});

describe("offline state (IndexedDB) + review queue", () => {
  it("persists across store reopen (durable offline state)", async () => {
    let c = newCard("p1", day(0));
    c = review(c, Rating.Good, day(0));
    c = review(c, Rating.Again, c.due); // produce a lapse to persist

    const s1 = await openCardStore("persist-db");
    await s1.put(c);
    s1.close();

    const s2 = await openCardStore("persist-db");
    const loaded = await s2.get("p1");
    expect(loaded).toBeDefined();
    expect(loaded!.due).toBe(c.due);
    expect(loaded!.lapses).toBe(c.lapses);
    expect(loaded!.scheduled_days).toBe(c.scheduled_days);
    expect(loaded!.stability).toBe(c.stability);
  });

  it("queue surfaces a card only on/after its due day, not before", async () => {
    const store = await openCardStore("due-db");
    await store.put(newCard("c1", day(0)));

    // New card is due immediately.
    expect((await getDueCards(store, day(0))).map((c) => c.id)).toContain("c1");

    // Review Good on day 0 → scheduled into the future.
    const reviewed = await rateCard(store, "c1", Rating.Good, day(0));
    expect(reviewed.scheduled_days).toBeGreaterThanOrEqual(1);

    // Not due the same instant, nor 1ms before its due time...
    expect(await getDueCards(store, day(0))).toHaveLength(0);
    expect(await getDueCards(store, reviewed.due - 1)).toHaveLength(0);
    // ...but due exactly at (and after) its due time.
    expect((await getDueCards(store, reviewed.due)).map((c) => c.id)).toContain("c1");
  });
});

describe("multi-day review simulation", () => {
  it("re-presents each card on the correct simulated days over 60 days", async () => {
    const store = await openCardStore("sim-db");
    const ids = ["a", "b", "c"];
    for (const id of ids) await store.put(newCard(id, day(0)));

    const reviewCount: Record<string, number> = { a: 0, b: 0, c: 0 };
    const reviewDays: Record<string, number[]> = { a: [], b: [], c: [] };

    for (let d = 0; d < 60; d++) {
      const now = day(d) + 1; // shortly after midnight on simulated day d
      const due = await getDueCards(store, now);

      // INVARIANT: nothing surfaces before it is actually due.
      for (const card of due) expect(card.due).toBeLessThanOrEqual(now);

      for (const card of due) {
        const next = await rateCard(store, card.id, Rating.Good, now);
        // INVARIANT: a reviewed card is rescheduled into the future.
        expect(next.due).toBeGreaterThan(now);
        reviewCount[card.id]++;
        reviewDays[card.id].push(d);
      }
    }

    for (const id of ids) {
      // Reviewed several times, but far fewer than 60 — intervals grow, so the
      // card is NOT re-presented every day (that would be SM-2-at-1-day / a bug).
      expect(reviewCount[id]).toBeGreaterThan(2);
      expect(reviewCount[id]).toBeLessThan(20);
      // Review days are strictly increasing and spaced out (gaps grow).
      const days = reviewDays[id];
      for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
      const firstGap = days[1] - days[0];
      const lastGap = days[days.length - 1] - days[days.length - 2];
      expect(lastGap).toBeGreaterThan(firstGap);
    }

    // Final offline state is durable and consistent.
    const all = await store.getAll();
    expect(all).toHaveLength(3);
    for (const card of all) expect(card.reps).toBe(reviewCount[card.id]);
  });
});
