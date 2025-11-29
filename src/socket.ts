import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/events'
import { type Socket, io } from 'socket.io-client'
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ autoConnect: true })
