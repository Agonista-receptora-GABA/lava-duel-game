import type { RoomState } from '@shared/types/events.ts'
import type { GameStore } from './gameStore.ts'

export class MemoryGameStore implements GameStore {
  private readonly rooms = new Map<string, RoomState>()

  async get(roomId: string): Promise<RoomState | null> {
    return this.rooms.get(roomId) ?? null
  }

  async set(roomId: string, room: RoomState): Promise<void> {
    this.rooms.set(roomId, room)
  }

  async delete(roomId: string): Promise<void> {
    this.rooms.delete(roomId)
  }

  async withLock<T>(_roomId: string, callback: () => Promise<T>): Promise<T> {
    return callback()
  }
}
