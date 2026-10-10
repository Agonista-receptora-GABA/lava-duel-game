import { startDuel } from '../../game/duel.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import { parsePayload } from '../parsePayload.js'
import { startDuelSchema } from '../schemas.js'
import type { HandlerContext } from '../types.ts'

export function registerStartDuelHandler({ io, socket, store }: HandlerContext) {
  socket.on('startDuel', (raw) => {
    const payload = parsePayload(socket, startDuelSchema, raw)

    if (!payload) return

    const { roomId, aId, bId } = payload

    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      // `aId` is the challenger - it has to be the sender, or anyone could start duels for others.
      if (aId !== socket.id) {
        socket.emit('errorMsg', 'Pojedynek może wystartować tylko wyzywający')
        return
      }

      return store.withLock(roomId, async () => {
        const room = await store.get(roomId)

        if (!room) {
          return
        }

        const duel = startDuel(room, aId, bId)

        if (!duel) {
          socket.emit('errorMsg', 'Nie można rozpocząć pojedynku')
          return
        }

        await store.set(roomId, room)

        io.to(roomId).emit('duelStarted', {
          aId: duel.aId,
          bId: duel.bId,
          turnId: duel.turnId,
          score: duel.score,
        })
      })
    })
  })
}
