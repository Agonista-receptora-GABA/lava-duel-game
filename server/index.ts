import express from 'express'
import http from 'http'
import { createAdapter } from '@socket.io/redis-adapter'
import { Server, type Socket } from 'socket.io'
import cors from 'cors'
import { Redis } from 'ioredis'
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from '@shared/types/events.ts'
import path from 'path'
import { fileURLToPath } from 'url'
import type { GameStore } from './gameStore.ts'
import { MemoryGameStore } from './memoryGameStore.js'
import { RedisGameStore } from './redisGameStore.js'

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'
const redisUrl = process.env.REDIS_URL

console.log(`Starting Lava Duel Game on ${HOST}:${PORT}`)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())

const server = http.createServer(app)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? process.env.CLIENT_ORIGINS?.split(',') || '*' : true,
  },
})

const gameStore: GameStore = redisUrl ? new RedisGameStore(redisUrl) : new MemoryGameStore()

if (redisUrl) {
  const pubClient = new Redis(redisUrl)
  const subClient = pubClient.duplicate()

  io.adapter(createAdapter(pubClient, subClient))

  console.log('[redis] enabled')
} else {
  console.log('[redis] disabled; using in-memory game store')
}

function createRoom(): RoomState {
  return {
    players: new Map(),
    max: 100,
    category: null,
    deck: [],
    used: new Set(),
    currentIndex: null,
    current: null,
    duel: null,
  }
}

function pickNextIndex(room: RoomState) {
  if (!room.deck.length) return null

  if (room.used.size >= room.deck.length) {
    room.used.clear()
  }

  let idx: number

  do {
    idx = Math.floor(Math.random() * room.deck.length)
  } while (room.used.has(idx))

  room.used.add(idx)
  room.currentIndex = idx
  room.current = room.deck[idx] || null

  return idx
}

async function emitRoomState(roomId: string, room: RoomState) {
  io.to(roomId).emit('roomState', {
    players: Array.from(room.players, ([id, player]) => ({
      id,
      name: player.name,
    })),
    category: room.category,
    duel: room.duel
      ? {
          aId: room.duel.aId,
          bId: room.duel.bId,
          turnId: room.duel.turnId,
          score: room.duel.score,
        }
      : null,
    current: room.current,
  })
}

// Handlers are async (Redis), so:
// 1) events from a single socket run sequentially - otherwise e.g. setCategory
//    could overtake joinRoom (each event waits for its own lock),
// 2) errors are caught here - an unhandled promise rejection kills the Node process,
//    so a transient Redis problem would restart the whole pod.
const socketQueues = new WeakMap<Socket, Promise<void>>()

function run(socket: Socket, task: () => Promise<unknown>) {
  const next = (socketQueues.get(socket) ?? Promise.resolve())
    .then(task)
    .then(() => undefined)
    .catch((error) => {
      console.error('[socket] handler failed', error)
      socket.emit('errorMsg', 'Błąd serwera')
    })

  socketQueues.set(socket, next)
}

/**
 * Removes players whose socket no longer exists (e.g. the pod died without 'disconnecting').
 * `liveIds` = sockets actually connected to the room, across all pods.
 */
function pruneDisconnectedPlayers(room: RoomState, liveIds: Set<string>) {
  for (const id of [...room.players.keys()]) {
    if (liveIds.has(id)) continue

    room.players.delete(id)

    if (room.duel && (room.duel.aId === id || room.duel.bId === id)) {
      room.duel = null
    }
  }
}

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, name }) =>
    run(socket, async () => {
      // Join the Socket.IO room first so this socket is visible in fetchSockets()
      await socket.join(roomId)

      const accepted = await gameStore.withLock(roomId, async () => {
        const room = (await gameStore.get(roomId)) || createRoom()

        // Clean up "ghost" players left by dead pods. The list of live sockets is fetched
        // under the lock - every player stored in the store joined the room earlier,
        // so we won't prune someone who has just joined through another pod.
        const liveIds = new Set((await io.in(roomId).fetchSockets()).map((s) => s.id))
        pruneDisconnectedPlayers(room, liveIds)

        if (room.players.size >= room.max) {
          socket.emit('errorMsg', 'Pokój pełny (100)')
          return false
        }

        room.players.set(socket.id, {
          id: socket.id,
          name: name?.trim() || 'Gracz',
        })

        await gameStore.set(roomId, room)
        await emitRoomState(roomId, room)

        return true
      })

      if (!accepted) await socket.leave(roomId)
    }),
  )

  socket.on('setCategory', ({ roomId, category, deck }) =>
    run(socket, () =>
      gameStore.withLock(roomId, async () => {
        const room = (await gameStore.get(roomId)) || createRoom()

        room.category = category
        room.deck = Array.isArray(deck) ? deck : []
        room.used.clear()

        pickNextIndex(room)

        await gameStore.set(roomId, room)

        if (room.currentIndex === null) {
          return
        }

        io.to(roomId).emit('categorySet', {
          category: room.category,
        })

        io.to(roomId).emit('currentImage', {
          current: room.current,
        })
      }),
    ),
  )

  socket.on('startDuel', ({ roomId, aId, bId }) =>
    run(socket, () =>
      gameStore.withLock(roomId, async () => {
        const room = await gameStore.get(roomId)

        if (!room || !room.players.has(aId) || !room.players.has(bId)) {
          return
        }

        room.duel = {
          aId,
          bId,
          turnId: aId,
          score: {
            [aId]: 0,
            [bId]: 0,
          },
        }

        await gameStore.set(roomId, room)

        io.to(roomId).emit('duelStarted', {
          aId,
          bId,
          turnId: room.duel.turnId,
          score: room.duel.score,
        })
      }),
    ),
  )

  socket.on('pass', ({ roomId }) =>
    run(socket, () =>
      gameStore.withLock(roomId, async () => {
        const room = await gameStore.get(roomId)

        if (!room?.duel) {
          return
        }

        pickNextIndex(room)

        await gameStore.set(roomId, room)

        if (room.currentIndex === null) {
          return
        }

        io.to(roomId).emit('currentImage', {
          current: room.current,
        })
      }),
    ),
  )

  socket.on('answer', ({ roomId, text }) =>
    run(socket, () =>
      gameStore.withLock(roomId, async () => {
        const room = await gameStore.get(roomId)
        const duel = room?.duel

        if (!room || !duel || room.currentIndex === null) {
          return
        }

        const normalized = String(text || '')
          .trim()
          .toLowerCase()

        const current = room.deck[room.currentIndex]

        const isPass = normalized === 'pas'

        const isCorrect = current?.aliases?.some((alias) => alias.toLowerCase() === normalized)

        if (isPass) {
          pickNextIndex(room)

          await gameStore.set(roomId, room)

          io.to(roomId).emit('passed', {
            by: socket.id,
          })

          io.to(roomId).emit('currentImage', {
            current: room.current,
          })

          return
        }

        if (socket.id !== duel.turnId) {
          io.to(socket.id).emit('notYourTurn', true)
          return
        }

        if (isCorrect) {
          duel.score[socket.id] = (duel.score[socket.id] || 0) + 1

          duel.turnId = socket.id === duel.aId ? duel.bId : duel.aId

          pickNextIndex(room)

          await gameStore.set(roomId, room)

          io.to(roomId).emit('correct', {
            by: socket.id,
            score: duel.score,
            turnId: duel.turnId,
          })

          io.to(roomId).emit('currentImage', {
            current: room.current,
          })
        } else {
          io.to(roomId).emit('wrong', {
            by: socket.id,
            guess: normalized,
          })
        }
      }),
    ),
  )

  socket.on('disconnecting', () => {
    // socket.rooms must be copied synchronously - Socket.IO clears that set right after the event
    // and we await inside the loop. Skip the "private" room named after socket.id.
    const roomIds = [...socket.rooms].filter((id) => id !== socket.id)

    for (const roomId of roomIds) {
      run(socket, () =>
        gameStore.withLock(roomId, async () => {
          const room = await gameStore.get(roomId)

          if (!room) {
            return
          }

          room.players.delete(socket.id)

          if (room.duel && (room.duel.aId === socket.id || room.duel.bId === socket.id)) {
            room.duel = null

            io.to(roomId).emit('duelEnded', 'Gracz rozłączył się')
          }

          // An empty room is kept (category/deck survive a page refresh) but expires:
          // Redis - short TTL, memory - timer in MemoryGameStore.
          await gameStore.set(roomId, room)
          await emitRoomState(roomId, room)
        }),
      )
    }
  })
})

app.use(express.static(path.join(__dirname, '../')))

// Health check (K8s)
app.get('/health', (_req, res) => res.status(200).json({ status: 'OK' }))

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '../index.html')))

server.listen(PORT, () => console.log(`Lava Duel Game on ${HOST}:${PORT}`))
