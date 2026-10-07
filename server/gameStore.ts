import type { RoomState } from '@shared/types/events.ts'

export interface GameStore {
  get(roomId: string): Promise<RoomState | null>
  set(roomId: string, room: RoomState): Promise<void>
  delete(roomId: string): Promise<void>
  withLock<T>(roomId: string, callback: () => Promise<T>): Promise<T>
}
