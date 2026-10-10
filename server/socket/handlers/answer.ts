import { applyAnswer } from '../../game/duel.js'
import { toPublicCard } from '../../game/room.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import { parsePayload } from '../parsePayload.js'
import { answerSchema } from '../schemas.js'
import type { HandlerContext } from '../types.ts'

export function registerAnswerHandler({ io, socket, store }: HandlerContext) {
  socket.on('answer', (raw) => {
    const payload = parsePayload(socket, answerSchema, raw)

    if (!payload) return

    const { roomId, text } = payload

    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      return store.withLock(roomId, async () => {
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
              current: toPublicCard(room.current),
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
              current: toPublicCard(room.current),
            })
            return
        }
      })
    })
  })
}
