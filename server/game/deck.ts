import type { Card, RoomState } from '@shared/types/events.ts'

/**
 * Picks a random card that was not shown yet (every card is shown once before any repeats)
 * and stores it as the room's current card. Returns its index, or null for an empty deck.
 * `random` is injectable so tests can make the draw deterministic.
 */
export function drawNextCard(room: RoomState, random: () => number = Math.random): number | null {
  if (!room.deck.length) return null

  if (room.used.size >= room.deck.length) {
    room.used.clear()
  }

  let idx: number

  do {
    idx = Math.floor(random() * room.deck.length)
  } while (room.used.has(idx))

  room.used.add(idx)
  room.currentIndex = idx
  room.current = room.deck[idx] || null

  return idx
}

/**
 * Switches the room to a new category with its own deck and draws the first card.
 * Returns the index of that card, or null when the deck is empty (or not an array) - in that case
 * the room is left untouched, so the previous category, deck and card stay valid. The caller must
 * use the return value to decide whether anything changed (`room.currentIndex` would still hold
 * the previous card).
 */
export function applyCategory(
  room: RoomState,
  categoryId: string,
  deck: Card[],
  random: () => number = Math.random,
): number | null {
  if (!Array.isArray(deck) || deck.length === 0) return null

  room.categoryId = categoryId
  room.deck = deck
  room.used.clear()

  return drawNextCard(room, random)
}
