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

/** Switches the room to a new category with its own deck and draws the first card. */
export function applyCategory(
  room: RoomState,
  category: string,
  deck: Card[],
  random: () => number = Math.random,
) {
  room.category = category
  room.deck = Array.isArray(deck) ? deck : []
  room.used.clear()

  return drawNextCard(room, random)
}
