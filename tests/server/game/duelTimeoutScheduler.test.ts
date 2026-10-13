import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomState } from '../../../shared/types/events.ts'
import { DuelTimeoutScheduler } from '../../../server/game/duelTimeoutScheduler.ts'
import { startDuel } from '../../../server/game/duel.ts'
import { addPlayer, createRoom } from '../../../server/game/room.ts'
import { MemoryGameStore } from '../../../server/memoryGameStore.ts'

function makeRoom(): RoomState {
  const room = createRoom()
  addPlayer(room, 'a', 'Ala')
  addPlayer(room, 'b', 'Bob')
  startDuel(room, 'a', 'b')
  return room
}

describe('DuelTimeoutScheduler', () => {
  afterEach(() => vi.useRealTimers())

  it('ends the duel and announces the player whose active clock reached zero', async () => {
    vi.useFakeTimers()
    const store = new MemoryGameStore()
    const emit = vi.fn()
    const io = { to: vi.fn(() => ({ emit })) }
    const scheduler = new DuelTimeoutScheduler(store, io as never)
    const room = makeRoom()

    room.duel!.remainingMs.a = 100
    await store.set('room', room)
    await scheduler.schedule('room', room.duel!)

    await vi.advanceTimersByTimeAsync(100)

    expect((await store.get('room'))?.duel).toBeNull()
    expect(emit).toHaveBeenCalledWith('duelEnded', {
      reason: 'timeout',
      loserId: 'a',
      winnerId: 'b',
    })

    await scheduler.close()
    await store.close()
  })
})
