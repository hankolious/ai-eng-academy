import type { CardStore } from "../store/cardStore";
import { review, type StoredCard } from "../fsrs/scheduler";
import type { Grade } from "ts-fsrs";

// The review queue: which cards are due "now", and applying a rating that both
// reschedules the card (FSRS) and persists the new offline state.

/** Cards due at or before `nowMs`, soonest first. */
export function getDueCards(store: CardStore, nowMs: number): Promise<StoredCard[]> {
  return store.getDue(nowMs);
}

/** Rate a due card at `whenMs`; persists and returns the rescheduled card. */
export async function rateCard(
  store: CardStore,
  id: string,
  rating: Grade,
  whenMs: number,
): Promise<StoredCard> {
  const card = await store.get(id);
  if (!card) throw new Error(`card not found: ${id}`);
  const next = review(card, rating, whenMs);
  await store.put(next);
  return next;
}
