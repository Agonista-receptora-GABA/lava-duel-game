import { applyPass } from '../../game/duel.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerPassHandler({ io, socket, store }: HandlerContext) {
  socket.on('pass', ({ roomId }) =>
    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      return store.withLock(roomId, async () => {
        const room = await store.get(roomId)

        if (!room) {
          return
        }

        const outcome = applyPass(room, socket.id)

        switch (outcome.type) {
          case 'ignored':
            return

          case 'notYourTurn':
            io.to(socket.id).emit('notYourTurn', true)
            return

          case 'pass':
            await store.set(roomId, room)

            io.to(roomId).emit('currentImage', {
              current: room.current,
            })
            return
        }
      })
    }),
  )
}
