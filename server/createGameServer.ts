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
import { whenHandlersIdle } from './socket/enqueue.js'
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
  const adapterClients: Redis[] = []

  if (redisUrl) {
    const pubClient = new Redis(redisUrl)
    const subClient = pubClient.duplicate()

    adapterClients.push(pubClient, subClient)
    io.adapter(createAdapter(pubClient, subClient))

    console.log('[redis] enabled')
  } else {
    console.log('[redis] disabled; using in-memory game store')
  }

  registerSocketHandlers(io, store)

  let closing: Promise<void> | undefined

  async function shutdown() {
    // 1. Stop accepting connections and disconnect every client. Socket.IO fires 'disconnecting'
    //    for each socket synchronously, so their cleanup handlers are already queued below.
    const httpClosed = new Promise<void>((resolve) => io.close(() => resolve()))

    // 2. Let those handlers finish (players removed from the room state, other pods notified)
    //    while the Redis connections are still open.
    await whenHandlersIdle()
    await httpClosed

    // 3. Only now release the connections.
    await Promise.allSettled([store.close(), ...adapterClients.map((client) => client.quit())])
  }

  /** Graceful shutdown; safe to call more than once. */
  const close = () => (closing ??= shutdown())

  return { httpServer, io, store, close }
}
