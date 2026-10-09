import { applyAnswer } from '../../game/duel.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerAnswerHandler({ io, socket, store }: HandlerContext) {
  socket.on('answer', ({ roomId, text }) =>
    enqueue(socket, () =>
      store.withLock(roomId, async () => {
        const room = await store.get(roomId)

        if (!room) {
          return
        }

        const outcome = applyAnswer(room, socket.id, text)

        switch (outcome.type) {
          case 'ignored':
            return

          case 'notYourTurn':
            io.to(socket.id).emit('notYourTurn', true)
            return

          case 'wrong':
            io.to(roomId).emit('wrong', {
              by: socket.id,
              guess: outcome.guess,
            })
            return

          case 'pass':
            await store.set(roomId, room)

            io.to(roomId).emit('passed', {
              by: socket.id,
            })

            io.to(roomId).emit('currentImage', {
              current: room.current,
            })
            return

          case 'correct':
            await store.set(roomId, room)

            io.to(roomId).emit('correct', {
              by: socket.id,
              score: outcome.score,
              turnId: outcome.turnId,
            })

            io.to(roomId).emit('currentImage', {
              current: room.current,
            })
            return
        }
      }),
    ),
  )
}
