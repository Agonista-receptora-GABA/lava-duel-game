import type { AppSocket } from './types.ts'

/**
 * Guard for events that act on a room: the socket must have joined `roomId` through `joinRoom`.
 * Without it anybody could create rooms in the store, grab their lock or steer someone else's duel
 * just by sending an arbitrary `roomId`.
 *
 * Call it INSIDE the `enqueue` task, never when the event arrives: `joinRoom` is queued as well,
 * so a client firing `joinRoom` + `startDuel` back-to-back is a member only once its join ran.
 */
export function assertInRoom(socket: AppSocket, roomId: string): boolean {
  if (socket.rooms.has(roomId)) return true

  socket.emit('errorMsg', 'Nie jesteś w tym pokoju')

  return false
}
