import type { RoomState } from '@shared/types/events.ts'
import type { GameStore } from './gameStore.ts'

// an empty room (e.g. the only player refreshed the page) expires after 10 min - same as in Redis
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000

export class MemoryGameStore implements GameStore {
  private readonly rooms = new Map<string, RoomState>()
  private readonly emptyRoomTimers = new Map<string, NodeJS.Timeout>()
  private readonly roomLocks = new Map<string, Promise<void>>()

  async get(roomId: string): Promise<RoomState | null> {
    return this.rooms.get(roomId) ?? null
  }

  async getActiveDuels() {
    return Array.from(this.rooms, ([roomId, room]) => ({ roomId, room })).filter(
      ({ room }) => room.duel !== null,
    )
  }

  async set(roomId: string, room: RoomState): Promise<void> {
    this.rooms.set(roomId, room)
    this.clearEmptyRoomTimer(roomId)

    if (room.players.size === 0) {
      const timer = setTimeout(() => {
        this.rooms.delete(roomId)
        this.emptyRoomTimers.delete(roomId)
      }, EMPTY_ROOM_TTL_MS)

      timer.unref()
      this.emptyRoomTimers.set(roomId, timer)
    }
  }

  async delete(roomId: string): Promise<void> {
    this.clearEmptyRoomTimer(roomId)
    this.rooms.delete(roomId)
  }

  async withLock<T>(roomId: string, callback: () => Promise<T>): Promise<T> {
    const previous = this.roomLocks.get(roomId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })

    this.roomLocks.set(roomId, current)
    await previous

    try {
      return await callback()
    } finally {
      release()
      if (this.roomLocks.get(roomId) === current) this.roomLocks.delete(roomId)
    }
  }

  async close(): Promise<void> {
    for (const timer of this.emptyRoomTimers.values()) {
      clearTimeout(timer)
    }

    this.emptyRoomTimers.clear()
  }

  private clearEmptyRoomTimer(roomId: string) {
    const timer = this.emptyRoomTimers.get(roomId)

    if (timer) {
      clearTimeout(timer)
      this.emptyRoomTimers.delete(roomId)
    }
  }
}
