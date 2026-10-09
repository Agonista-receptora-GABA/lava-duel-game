import type { RoomState } from '@shared/types/events.ts'
import { toRoomStatePayload } from '../game/room.js'
import type { AppServer } from './types.ts'

export function emitRoomState(io: AppServer, roomId: string, room: RoomState) {
  io.to(roomId).emit('roomState', toRoomStatePayload(room))
}
