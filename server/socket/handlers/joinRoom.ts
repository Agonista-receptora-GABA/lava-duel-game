import { addPlayer, createRoom, isRoomFull, pruneDisconnectedPlayers } from '../../game/room.js'
import { emitRoomState } from '../emitRoomState.js'
import { enqueue } from '../enqueue.js'
import { parsePayload } from '../parsePayload.js'
import { joinRoomSchema } from '../schemas.js'
import type { HandlerContext } from '../types.ts'

export function registerJoinRoomHandler({ io, socket, store }: HandlerContext) {
  socket.on('joinRoom', (raw) => {
    const payload = parsePayload(socket, joinRoomSchema, raw)

    if (!payload) return

    const { roomId, name } = payload

    enqueue(socket, async () => {
      // Join the Socket.IO room first so this socket is visible in fetchSockets()
      await socket.join(roomId)

      const accepted = await store.withLock(roomId, async () => {
        const room = (await store.get(roomId)) || createRoom()

        // Clean up "ghost" players left by dead pods. The list of live sockets is fetched
        // under the lock - every player stored in the store joined the room earlier,
        // so we won't prune someone who has just joined through another pod.
        const liveIds = new Set((await io.in(roomId).fetchSockets()).map((s) => s.id))
        pruneDisconnectedPlayers(room, liveIds)

        if (isRoomFull(room)) {
          socket.emit('errorMsg', 'Pokój pełny (100)')
          return false
        }

        addPlayer(room, socket.id, name)

        await store.set(roomId, room)
        emitRoomState(io, roomId, room)

        return true
      })

      if (!accepted) await socket.leave(roomId)
    })
  })
}
