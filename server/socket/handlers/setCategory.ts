import { applyCategory } from '../../game/deck.js'
import { endDuel, isDuelist } from '../../game/duel.js'
import { findCategory } from '../../game/catalog.js'
import { createRoom } from '../../game/room.js'
import { toPublicCard } from '../../game/room.js'
import { assertInRoom } from '../assertInRoom.js'
import { enqueue } from '../enqueue.js'
import { parsePayload } from '../parsePayload.js'
import { setCategorySchema } from '../schemas.js'
import type { HandlerContext } from '../types.ts'

export function registerSetCategoryHandler({ io, socket, store }: HandlerContext) {
  socket.on('setCategory', (raw) => {
    const payload = parsePayload(socket, setCategorySchema, raw)

    if (!payload) return

    const { roomId, categoryId } = payload

    enqueue(socket, async () => {
      if (!assertInRoom(socket, roomId)) return

      return store.withLock(roomId, async () => {
        const room = (await store.get(roomId)) || createRoom()
        const category = findCategory(categoryId)

        // The deck is the duelists' card source: only they may swap it while a duel runs.
        if (room.duel && !isDuelist(room.duel, socket.id)) {
          socket.emit('errorMsg', 'Trwa pojedynek - kategorię może zmienić tylko jego uczestnik')
          return
        }

        if (!category) {
          socket.emit('errorMsg', 'Nieznana kategoria')
          return
        }

        if (applyCategory(room, categoryId, category.deck) === null) {
          socket.emit('errorMsg', 'Talia jest pusta')
          return
        }

        // The duel was played on the old deck - a new category starts from scratch.
        const duelEnded = endDuel(room)

        await store.set(roomId, room)

        if (duelEnded) {
          io.to(roomId).emit('duelEnded', 'Zmieniono kategorię')
        }

        io.to(roomId).emit('categorySet', {
          categoryId,
        })

        io.to(roomId).emit('currentImage', {
          current: toPublicCard(room.current),
        })
      })
    })
  })
}
