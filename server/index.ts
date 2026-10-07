import express from 'express'
import http from 'http'
import { createAdapter } from '@socket.io/redis-adapter'
import { Server } from 'socket.io'
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

io.on('connection', (socket) => {
  socket.on('joinRoom', async ({ roomId, name }) => {
    await gameStore.withLock(roomId, async () => {
      const room = (await gameStore.get(roomId)) || createRoom()

      if (room.players.size >= room.max) {
        socket.emit('errorMsg', 'Pokój pełny (100)')
        return
      }

      socket.join(roomId)

      room.players.set(socket.id, {
        id: socket.id,
        name: name?.trim() || 'Gracz',
      })

      await gameStore.set(roomId, room)
      await emitRoomState(roomId, room)
    })
  })

  socket.on('setCategory', async ({ roomId, category, deck }) => {
    await gameStore.withLock(roomId, async () => {
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
    })
  })

  socket.on('startDuel', async ({ roomId, aId, bId }) => {
    await gameStore.withLock(roomId, async () => {
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
    })
  })

  socket.on('pass', async ({ roomId }) => {
    await gameStore.withLock(roomId, async () => {
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
    })
  })

  socket.on('answer', async ({ roomId, text }) => {
    await gameStore.withLock(roomId, async () => {
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
    })
  })

  socket.on('disconnecting', async () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) {
        continue
      }

      await gameStore.withLock(roomId, async () => {
        const room = await gameStore.get(roomId)

        if (!room) {
          return
        }

        room.players.delete(socket.id)

        if (room.duel && (room.duel.aId === socket.id || room.duel.bId === socket.id)) {
          room.duel = null

          io.to(roomId).emit('duelEnded', 'Gracz rozłączył się')
        }

        if (room.players.size === 0) {
          await gameStore.delete(roomId)
          return
        }

        await gameStore.set(roomId, room)
        await emitRoomState(roomId, room)
      })
    }
  })
})

app.use(express.static(path.join(__dirname, '../')))

// Health check (K8s)
app.get('/health', (_req, res) => res.status(200).json({ status: 'OK' }))

app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '../index.html')))

server.listen(PORT, () => console.log(`Lava Duel Game on ${HOST}:${PORT}`))
