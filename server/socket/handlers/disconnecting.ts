import { removePlayer } from '../../game/room.js'
import { emitRoomState } from '../emitRoomState.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerDisconnectingHandler({ io, socket, store }: HandlerContext) {
  socket.on('disconnecting', () => {
    // socket.rooms must be copied synchronously - Socket.IO clears that set right after the event
    // and we await inside the loop. Skip the "private" room named after socket.id.
    const roomIds = [...socket.rooms].filter((id) => id !== socket.id)

    for (const roomId of roomIds) {
      enqueue(socket, () =>
        store.withLock(roomId, async () => {
          const room = await store.get(roomId)

          if (!room) {
            return
          }

          const duelEnded = removePlayer(room, socket.id)

          if (duelEnded) {
            io.to(roomId).emit('duelEnded', 'Gracz rozłączył się')
          }

          // An empty room is kept (category/deck survive a page refresh) but expires:
          // Redis - short TTL, memory - timer in MemoryGameStore.
          await store.set(roomId, room)
          emitRoomState(io, roomId, room)
        }),
      )
    }
  })
}
