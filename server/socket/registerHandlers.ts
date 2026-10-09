import type { GameStore } from '../gameStore.ts'
import { registerAnswerHandler } from './handlers/answer.js'
import { registerDisconnectingHandler } from './handlers/disconnecting.js'
import { registerJoinRoomHandler } from './handlers/joinRoom.js'
import { registerPassHandler } from './handlers/pass.js'
import { registerSetCategoryHandler } from './handlers/setCategory.js'
import { registerStartDuelHandler } from './handlers/startDuel.js'
import type { AppServer } from './types.ts'

export function registerSocketHandlers(io: AppServer, store: GameStore) {
  io.on('connection', (socket) => {
    const context = { io, socket, store }

    registerJoinRoomHandler(context)
    registerSetCategoryHandler(context)
    registerStartDuelHandler(context)
    registerPassHandler(context)
    registerAnswerHandler(context)
    registerDisconnectingHandler(context)
  })
}
