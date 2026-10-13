import { beforeEach, describe, expect, it } from 'vitest'
import type { Card, RoomState } from '../../../shared/types/events.ts'
import { applyCategory } from '../../../server/game/deck.ts'
import {
  applyAnswer,
  applyPass,
  endDuel,
  expireDuelTurn,
  isDuelist,
  startDuel,
} from '../../../server/game/duel.ts'
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

      expect(room.duel).toMatchObject({
        aId: 'a',
        bId: 'b',
        turnId: 'a',
        score: { a: 0, b: 0 },
        remainingMs: { a: 45_000, b: 45_000 },
      })
    })

    it('refuses a duel with yourself', () => {
      const room = createRoom()

      addPlayer(room, 'a')

      expect(startDuel(room, 'a', 'a')).toBeNull()
      expect(room.duel).toBeNull()
    })

    it('does not let an outsider replace a running duel', () => {
      const room = duelRoom() // a vs b, c is a bystander

      expect(startDuel(room, 'c', 'a')).toBeNull()
      expect(startDuel(room, 'c', 'b')).toBeNull()
      expect(room.duel).toMatchObject({ aId: 'a', bId: 'b', turnId: 'a', score: { a: 0, b: 0 } })
    })

    it('lets a duelist replace the running duel (rematch, or moving on to somebody else)', () => {
      const room = duelRoom()

      expect(startDuel(room, 'b', 'c')).toMatchObject({ aId: 'b', bId: 'c', turnId: 'b' })
      expect(startDuel(room, 'c', 'a')).toMatchObject({ aId: 'c', bId: 'a' }) // c is a duelist now
    })

    it('refuses a duel with somebody who is not in the room', () => {
      const room = createRoom()

      addPlayer(room, 'a')

      expect(startDuel(room, 'a', 'ghost')).toBeNull()
      expect(room.duel).toBeNull()
    })

    it('gives 50 seconds only to a player with the golden field', () => {
      const room = createRoom()
      addPlayer(room, 'a', 'Ala', true)
      addPlayer(room, 'b', 'Bob')

      startDuel(room, 'a', 'b')

      expect(room.duel?.remainingMs).toEqual({ a: 50_000, b: 45_000 })
    })
  })

  describe('isDuelist / endDuel', () => {
    it('recognises the two duelists and nobody else', () => {
      const room = duelRoom()

      expect(isDuelist(room.duel!, 'a')).toBe(true)
      expect(isDuelist(room.duel!, 'b')).toBe(true)
      expect(isDuelist(room.duel!, 'c')).toBe(false)
    })

    it('ends the duel and reports whether there was one', () => {
      const room = duelRoom()

      expect(endDuel(room)).toBe(true)
      expect(room.duel).toBeNull()
      expect(endDuel(room)).toBe(false)
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
      expect(applyAnswer(room, 'a', 'pies', Math.random, room.duel!.turnStartedAt + 1)).toEqual({
        type: 'ignored',
      })
    })

    it('scores a correct answer ignoring case and whitespace, passes the turn, draws a new card', () => {
      // random = 0.99 -> the cat card is the only one left in this round
      const startedAt = room.duel!.turnStartedAt
      const outcome = applyAnswer(room, 'a', '  DOG ', () => 0.99, startedAt + 5_000)

      expect(outcome).toMatchObject({ type: 'correct', score: { a: 1, b: 0 }, turnId: 'b' })
      expect(room.duel!.turnId).toBe('b')
      expect(room.duel!.remainingMs).toEqual({ a: 40_000, b: 45_000 })
      expect(room.duel!.turnStartedAt).toBe(startedAt + 5_000)
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
      const startedAt = room.duel!.turnStartedAt
      const outcome = applyAnswer(room, 'a', ' Pas ', () => 0.99, startedAt + 5_000)

      expect(outcome).toMatchObject({ type: 'pass' })
      expect(room.current).toEqual(deck[1])
      expect(room.duel!.turnId).toBe('a')
      expect(room.duel!.remainingMs.a).toBe(37_000)
      expect(room.duel!.score).toEqual({ a: 0, b: 0 })
    })

    it('rejects PAS (spoken or not) from a player who is not on the move', () => {
      expect(applyAnswer(room, 'b', 'pas', () => 0.99)).toEqual({ type: 'notYourTurn' })
      expect(applyAnswer(room, 'c', 'pas', () => 0.99)).toEqual({ type: 'notYourTurn' })
      expect(room.current).toEqual(deck[0])
    })
  })

  describe('applyPass', () => {
    it('skips the card for the player on the move, keeping turn and score', () => {
      const room = duelRoom()

      expect(applyPass(room, 'a', () => 0.99)).toEqual({ type: 'pass' })
      expect(room.current).toEqual(deck[1])
      expect(room.duel!.turnId).toBe('a')
      expect(room.duel!.score).toEqual({ a: 0, b: 0 })
    })

    it('does not let the other duelist or a bystander skip the card', () => {
      const room = duelRoom()

      expect(applyPass(room, 'b')).toEqual({ type: 'notYourTurn' })
      expect(applyPass(room, 'c')).toEqual({ type: 'notYourTurn' })
      expect(room.current).toEqual(deck[0])
    })

    it('is ignored without a duel or a card', () => {
      const room = duelRoom()

      room.duel = null
      expect(applyPass(room, 'a')).toEqual({ type: 'ignored' })
    })
  })

  describe('turn timeout', () => {
    it('expires the active player at zero and ignores stale turns', () => {
      const room = duelRoom()
      const duel = room.duel!

      expect(
        expireDuelTurn(room, duel.duelId, duel.turnVersion, duel.turnStartedAt + 44_999),
      ).toEqual({
        type: 'notExpired',
        remainingMs: 1,
      })
      expect(
        expireDuelTurn(room, duel.duelId, duel.turnVersion, duel.turnStartedAt + 45_000),
      ).toEqual({
        type: 'timeout',
        loserId: 'a',
        winnerId: 'b',
      })
      expect(room.duel).toBeNull()
    })

    it("keeps the inactive player's full time and expires them on their later turn", () => {
      const room = duelRoom()
      const duel = room.duel!
      const duelId = duel.duelId
      const firstTurnVersion = duel.turnVersion

      const nextTurnAt = duel.turnStartedAt + 10_000
      applyAnswer(room, 'a', 'pies', () => 0.99, nextTurnAt)

      expect(expireDuelTurn(room, duelId, firstTurnVersion + 1, nextTurnAt + 45_000)).toMatchObject(
        {
          type: 'timeout',
          loserId: 'b',
          winnerId: 'a',
        },
      )
    })
  })
})
