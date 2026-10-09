import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/events.ts'
import type { GameStore } from '../gameStore.ts'

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents>
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>

/** Everything a handler needs - passed explicitly instead of living in module-level globals. */
export interface HandlerContext {
  io: AppServer
  socket: AppSocket
  store: GameStore
}
