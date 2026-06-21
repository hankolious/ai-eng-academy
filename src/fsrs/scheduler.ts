import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

// FSRS scheduler (the DSR model — NOT SM-2). Deterministic for tests:
//   - enable_fuzz:false       → no random interval jitter
//   - enable_short_term:false → skip sub-day learning steps, so reviews land on
//                               day-based intervals (clean multi-day simulation)
const params = generatorParameters({
  enable_fuzz: false,
  enable_short_term: false,
});
const engine = fsrs(params);

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

// A brand-new card is due immediately (due === nowMs).
export function newCard(id: string, nowMs: number): StoredCard {
  return fromFsrs(id, createEmptyCard(new Date(nowMs)));
}

// Apply a rating at time `whenMs`, returning the updated card (new due, interval,
// stability, and — on Again from Review — an incremented lapse count).
export function review(card: StoredCard, rating: Grade, whenMs: number): StoredCard {
  const next = engine.next(toFsrs(card), new Date(whenMs), rating).card;
  return fromFsrs(card.id, next);
}
