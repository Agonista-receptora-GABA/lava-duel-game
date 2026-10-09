import { beforeEach, describe, expect, it } from 'vitest'
import type { Card, RoomState } from '../../../shared/types/events.ts'
import { applyCategory } from '../../../server/game/deck.ts'
import { applyAnswer, startDuel } from '../../../server/game/duel.ts'
import { addPlayer, createRoom } from '../../../server/game/room.ts'

const deck: Card[] = [
  { img: 'dog.png', aliases: ['pies', 'Dog'] },
  { img: 'cat.png', aliases: ['kot'] },
]

/** Room with players a, b, c; a duel a vs b (a moves first) and the dog card on the table. */
function duelRoom(): RoomState {
  const room = createRoom()

  for (const id of ['a', 'b', 'c']) addPlayer(room, id, id.toUpperCase())

  applyCategory(room, 'animals', deck, () => 0) // first card = dog
  startDuel(room, 'a', 'b')

  return room
}

describe('game/duel', () => {
  describe('startDuel', () => {
    it('lets the challenger move first, with zero scores', () => {
      const room = duelRoom()

      expect(room.duel).toEqual({ aId: 'a', bId: 'b', turnId: 'a', score: { a: 0, b: 0 } })
    })

    it('refuses a duel with somebody who is not in the room', () => {
      const room = createRoom()

      addPlayer(room, 'a')

      expect(startDuel(room, 'a', 'ghost')).toBeNull()
      expect(room.duel).toBeNull()
    })
  })

  describe('applyAnswer', () => {
    let room: RoomState

    beforeEach(() => {
      room = duelRoom()
    })

    it('ignores answers when there is no duel or no card', () => {
      room.duel = null
      expect(applyAnswer(room, 'a', 'pies')).toEqual({ type: 'ignored' })

      room = duelRoom()
      room.currentIndex = null
      expect(applyAnswer(room, 'a', 'pies')).toEqual({ type: 'ignored' })
    })

    it('scores a correct answer ignoring case and whitespace, passes the turn, draws a new card', () => {
      // random = 0.99 -> the cat card is the only one left in this round
      const outcome = applyAnswer(room, 'a', '  DOG ', () => 0.99)

      expect(outcome).toEqual({ type: 'correct', score: { a: 1, b: 0 }, turnId: 'b' })
      expect(room.duel!.turnId).toBe('b')
      expect(room.current).toEqual(deck[1])
    })

    it('hands the turn back after the other duelist scores', () => {
      applyAnswer(room, 'a', 'pies', () => 0.99) // cat is shown now
      const outcome = applyAnswer(room, 'b', 'kot')

      expect(outcome).toMatchObject({ type: 'correct', turnId: 'a' })
      expect(room.duel!.score).toEqual({ a: 1, b: 1 })
    })

    it('reports a wrong answer (normalized) without touching the state', () => {
      const outcome = applyAnswer(room, 'a', ' KOT ')

      expect(outcome).toEqual({ type: 'wrong', guess: 'kot' })
      expect(room.duel!.turnId).toBe('a')
      expect(room.duel!.score).toEqual({ a: 0, b: 0 })
      expect(room.current).toEqual(deck[0])
    })

    it('rejects an answer from the player who is not on the move', () => {
      expect(applyAnswer(room, 'b', 'pies')).toEqual({ type: 'notYourTurn' })
      expect(applyAnswer(room, 'c', 'pies')).toEqual({ type: 'notYourTurn' })
      expect(room.duel!.score).toEqual({ a: 0, b: 0 })
    })

    it('draws a new card on PAS without changing the turn or the score', () => {
      const outcome = applyAnswer(room, 'a', ' Pas ', () => 0.99)

      expect(outcome).toEqual({ type: 'pass' })
      expect(room.current).toEqual(deck[1])
      expect(room.duel!.turnId).toBe('a')
      expect(room.duel!.score).toEqual({ a: 0, b: 0 })
    })

    // Documents the current behaviour (see the NOTE in duel.ts) - flip this test when PAS gets
    // restricted to the player who is on the move.
    it('currently lets anybody in the room skip a card with PAS', () => {
      expect(applyAnswer(room, 'c', 'pas', () => 0.99)).toEqual({ type: 'pass' })
    })
  })
})
