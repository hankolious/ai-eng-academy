import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

export { Rating, State };

// Serializable card record persisted in IndexedDB. Dates are epoch-ms numbers so
// the record survives structured-clone storage and reloads without rehydration
// surprises. due / scheduled_days / lapses are the offline state the gate checks.
export interface StoredCard {
  id: string;
  due: number; // epoch ms — when the item is next due
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number; // last computed interval, in days
  reps: number;
  lapses: number; // number of times rated Again from Review
  state: number; // State enum
  last_review: number | null; // epoch ms
}

function toFsrs(c: StoredCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review === null ? undefined : new Date(c.last_review),
  };
}

function fromFsrs(id: string, c: Card): StoredCard {
  return {
    id,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export interface SchedulerOptions {
  /**
   * Desired retention (probability of recall at review time) the scheduler
   * targets. FSRS solves the next interval for THIS probability — higher
   * retention → shorter intervals, lower → longer. Default 0.9.
   */
  requestRetention?: number;
}

export interface Scheduler {
  readonly requestRetention: number;
  newCard(id: string, nowMs: number): StoredCard;
  review(card: StoredCard, rating: Grade, whenMs: number): StoredCard;
}

// FSRS scheduler (the DSR model — NOT SM-2). Deterministic for tests:
//   - enable_fuzz:false       → no random interval jitter
//   - enable_short_term:false → skip sub-day learning steps, so reviews land on
//                               day-based intervals (clean multi-day simulation)
// `requestRetention` is the real FSRS retention target and directly drives the
// interval the model solves for.
export function createScheduler(opts: SchedulerOptions = {}): Scheduler {
  const params = generatorParameters({
    enable_fuzz: false,
    enable_short_term: false,
    request_retention: opts.requestRetention ?? 0.9,
  });
  const engine = fsrs(params);
  return {
    requestRetention: params.request_retention,
    // A brand-new card is due immediately (due === nowMs).
    newCard(id, nowMs) {
      return fromFsrs(id, createEmptyCard(new Date(nowMs)));
    },
    // Apply a rating at `whenMs`: new due, interval, stability, difficulty, and —
    // on Again from Review — an incremented lapse count.
    review(card, rating, whenMs) {
      const next = engine.next(toFsrs(card), new Date(whenMs), rating).card;
      return fromFsrs(card.id, next);
    },
  };
}

const defaultScheduler = createScheduler();

export function newCard(id: string, nowMs: number): StoredCard {
  return defaultScheduler.newCard(id, nowMs);
}

export function review(card: StoredCard, rating: Grade, whenMs: number): StoredCard {
  return defaultScheduler.review(card, rating, whenMs);
}
