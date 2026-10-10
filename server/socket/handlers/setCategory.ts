import { applyCategory } from '../../game/deck.js'
import { createRoom } from '../../game/room.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import { parsePayload } from '../parsePayload.js'
import { setCategorySchema } from '../schemas.js'
import type { HandlerContext } from '../types.ts'

export function registerSetCategoryHandler({ io, socket, store }: HandlerContext) {
  socket.on('setCategory', (raw) => {
    const payload = parsePayload(socket, setCategorySchema, raw)

    if (!payload) return

    const { roomId, category, deck } = payload

    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      return store.withLock(roomId, async () => {
        const room = (await store.get(roomId)) || createRoom()

        // The draw result decides, not room.currentIndex: after an earlier category it still holds
        // the previous card, so an empty deck would re-broadcast it.
        if (applyCategory(room, category, deck) === null) {
          socket.emit('errorMsg', 'Talia jest pusta')
          return
        }

        await store.set(roomId, room)

        io.to(roomId).emit('categorySet', {
          category,
        })

        io.to(roomId).emit('currentImage', {
          current: room.current,
        })
      })
    })
  })
}
