import { startDuel } from '../../game/duel.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerStartDuelHandler({ io, socket, store }: HandlerContext) {
  socket.on('startDuel', ({ roomId, aId, bId }) =>
    enqueue(socket, () =>
      store.withLock(roomId, async () => {
        const room = await store.get(roomId)

        if (!room) {
          return
        }

        const duel = startDuel(room, aId, bId)

        if (!duel) {
          return
        }

        await store.set(roomId, room)

        io.to(roomId).emit('duelStarted', {
          aId: duel.aId,
          bId: duel.bId,
          turnId: duel.turnId,
          score: duel.score,
        })
      }),
    ),
  )
}
