import { drawNextCard } from '../../game/deck.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerPassHandler({ io, socket, store }: HandlerContext) {
  socket.on('pass', ({ roomId }) =>
    enqueue(socket, () =>
      store.withLock(roomId, async () => {
        const room = await store.get(roomId)

        if (!room?.duel) {
          return
        }

        drawNextCard(room)

        await store.set(roomId, room)

        if (room.currentIndex === null) {
          return
        }

        io.to(roomId).emit('currentImage', {
          current: room.current,
        })
      }),
    ),
  )
}
