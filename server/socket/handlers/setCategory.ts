import { applyCategory } from '../../game/deck.js'
import { createRoom } from '../../game/room.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import type { HandlerContext } from '../types.ts'

export function registerSetCategoryHandler({ io, socket, store }: HandlerContext) {
  socket.on('setCategory', ({ roomId, category, deck }) =>
    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      return store.withLock(roomId, async () => {
        const room = (await store.get(roomId)) || createRoom()

        applyCategory(room, category, deck)

        await store.set(roomId, room)

        if (room.currentIndex === null) {
          return
        }

        io.to(roomId).emit('categorySet', {
          category,
        })

        io.to(roomId).emit('currentImage', {
          current: room.current,
        })
      })
    }),
  )
}
