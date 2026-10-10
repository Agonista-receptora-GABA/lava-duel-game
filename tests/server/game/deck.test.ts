import { describe, expect, it } from 'vitest'
import type { Card } from '../../../shared/types/events.ts'
import { applyCategory, drawNextCard } from '../../../server/game/deck.ts'
import { createRoom } from '../../../server/game/room.ts'

const deckOf = (size: number): Card[] =>
  Array.from({ length: size }, (_, i) => ({ img: `card-${i}.png`, aliases: [`answer-${i}`] }))

/** Deterministic "random": returns the given values one by one. */
const sequence = (...values: number[]) => {
  let i = 0

  return () => values[i++ % values.length]!
}

function roomWithDeck(size: number) {
  const room = createRoom()

  room.deck = deckOf(size)

  return room
}

describe('game/deck', () => {
  describe('drawNextCard', () => {
    it('returns null and changes nothing for an empty deck', () => {
      const room = createRoom()

      expect(drawNextCard(room)).toBeNull()
      expect(room.current).toBeNull()
      expect(room.currentIndex).toBeNull()
    })

    it('stores the drawn card as the current one', () => {
      const room = roomWithDeck(3)

      expect(drawNextCard(room, () => 0.5)).toBe(1)
      expect(room.currentIndex).toBe(1)
      expect(room.current).toEqual(room.deck[1])
      expect(room.used).toEqual(new Set([1]))
    })

    it('skips cards that were already shown', () => {
      const room = roomWithDeck(3)

      // 0 -> card 0; then 0 again (already used, retry) -> 0.4 -> card 1
      expect(drawNextCard(room, sequence(0, 0, 0.4))).toBe(0)
      expect(drawNextCard(room, sequence(0, 0, 0.4))).toBe(1)
    })

    it('shows every card once before any card repeats, then starts a new round', () => {
      const room = roomWithDeck(4)
      const firstRound = Array.from({ length: 4 }, () => drawNextCard(room))

      expect(new Set(firstRound).size).toBe(4)

      drawNextCard(room)
      expect(room.used.size).toBe(1)
    })

    it('keeps drawing the only card of a one-card deck', () => {
      const room = roomWithDeck(1)

      expect(drawNextCard(room)).toBe(0)
      expect(drawNextCard(room)).toBe(0)
    })
  })

  describe('applyCategory', () => {
    it('switches category and deck, forgets used cards and draws the first card', () => {
      const room = roomWithDeck(2)

      room.used = new Set([0, 1])

      const idx = applyCategory(room, 'food', deckOf(3), () => 0.99)

      expect(idx).toBe(2)
      expect(room.category).toBe('food')
      expect(room.deck).toHaveLength(3)
      expect(room.used).toEqual(new Set([2]))
    })

    it('rejects an empty deck and leaves the room exactly as it was', () => {
      const room = roomWithDeck(3)

      applyCategory(room, 'first', room.deck, () => 0)

      const before = structuredClone(room)

      expect(applyCategory(room, 'empty', [])).toBeNull()
      expect(room).toEqual(before)
    })

    it('treats a deck that is not an array as empty', () => {
      const room = createRoom()

      expect(applyCategory(room, 'broken', undefined as unknown as Card[])).toBeNull()
      expect(room.category).toBeNull()
      expect(room.deck).toEqual([])
      expect(room.current).toBeNull()
    })
  })
})
