import { describe, expect, it } from 'vitest'
import {
  addPlayer,
  createRoom,
  isRoomFull,
  pruneDisconnectedPlayers,
  removePlayer,
  toRoomStatePayload,
} from '../../../server/game/room.ts'

function roomWithDuel() {
  const room = createRoom()

  addPlayer(room, 'a', 'Ala')
  addPlayer(room, 'b', 'Bob')
  addPlayer(room, 'c', 'Cezary')
  room.duel = { aId: 'a', bId: 'b', turnId: 'a', score: { a: 0, b: 0 } }

  return room
}

describe('game/room', () => {
  describe('addPlayer', () => {
    it('trims the name and falls back to a default one', () => {
      const room = createRoom()

      addPlayer(room, 'a', '  Ala  ')
      addPlayer(room, 'b', '   ')
      addPlayer(room, 'c')

      expect([...room.players.values()].map((p) => p.name)).toEqual(['Ala', 'Gracz', 'Gracz'])
    })
  })

  describe('isRoomFull', () => {
    it('is full at exactly `max` players', () => {
      const room = createRoom()

      room.max = 2
      addPlayer(room, 'a')
      expect(isRoomFull(room)).toBe(false)

      addPlayer(room, 'b')
      expect(isRoomFull(room)).toBe(true)
    })
  })

  describe('removePlayer', () => {
    it('ends the duel when a duelist leaves', () => {
      const room = roomWithDuel()

      expect(removePlayer(room, 'b')).toBe(true)
      expect(room.duel).toBeNull()
      expect(room.players.has('b')).toBe(false)
    })

    it('keeps the duel when a bystander leaves', () => {
      const room = roomWithDuel()

      expect(removePlayer(room, 'c')).toBe(false)
      expect(room.duel).not.toBeNull()
      expect([...room.players.keys()]).toEqual(['a', 'b'])
    })
  })

  describe('pruneDisconnectedPlayers', () => {
    it('removes players that are not live any more, together with their duel', () => {
      const room = roomWithDuel()

      pruneDisconnectedPlayers(room, new Set(['a', 'c']))

      expect([...room.players.keys()]).toEqual(['a', 'c'])
      expect(room.duel).toBeNull()
    })

    it('leaves everything alone when everybody is live', () => {
      const room = roomWithDuel()

      pruneDisconnectedPlayers(room, new Set(['a', 'b', 'c']))

      expect(room.players.size).toBe(3)
      expect(room.duel).not.toBeNull()
    })
  })

  describe('toRoomStatePayload', () => {
    it('turns Maps/Sets into a plain, serializable payload', () => {
      const room = roomWithDuel()

      room.categoryId = 'animals'

      expect(toRoomStatePayload(room)).toEqual({
        players: [
          { id: 'a', name: 'Ala' },
          { id: 'b', name: 'Bob' },
          { id: 'c', name: 'Cezary' },
        ],
        categoryId: 'animals',
        duel: { aId: 'a', bId: 'b', turnId: 'a', score: { a: 0, b: 0 } },
        current: null,
      })
    })
  })
})
