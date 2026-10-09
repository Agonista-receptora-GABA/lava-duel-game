import http from 'node:http'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/events.ts'
import { createApp } from './app.js'
import type { ServerConfig } from './config.js'
import type { GameStore } from './gameStore.ts'
import { MemoryGameStore } from './memoryGameStore.js'
import { RedisGameStore } from './redisGameStore.js'
import { registerSocketHandlers } from './socket/registerHandlers.js'

/**
 * Wires everything together (Express, Socket.IO, game store) but does not listen -
 * starting the HTTP server is the caller's job (see index.ts).
 */
export function createGameServer(config: ServerConfig) {
  const httpServer = http.createServer(createApp({ clientDir: config.clientDir }))

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.corsOrigin },
  })

  const { redisUrl } = config
  const store: GameStore = redisUrl ? new RedisGameStore(redisUrl) : new MemoryGameStore()

  if (redisUrl) {
    const pubClient = new Redis(redisUrl)
    const subClient = pubClient.duplicate()

    io.adapter(createAdapter(pubClient, subClient))

    console.log('[redis] enabled')
  } else {
    console.log('[redis] disabled; using in-memory game store')
  }

  registerSocketHandlers(io, store)

  return { httpServer, io, store }
}
