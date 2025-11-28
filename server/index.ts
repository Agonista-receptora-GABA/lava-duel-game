import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import type {
  ClientToServerEvents,
  JoinRoomPayload,
  RoomState,
  ServerToClientEvents,
} from '@shared/types/events.ts'

const app = express()
app.use(cors())
const server = http.createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { cors: { origin: '*' } })

const rooms = new Map<JoinRoomPayload['roomId'], RoomState>()

function ensureRoom(roomId: JoinRoomPayload['roomId']) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: new Map(),
      max: 100,
      category: null,
      deck: [],
      used: new Set(),
      currentIndex: null,
      current: null,
      duel: null,
    })
  }
  return rooms.get(roomId)!
}

function pickNextIndex(room: RoomState) {
  if (!room.deck.length) return null
  if (room.used.size >= room.deck.length) room.used.clear()
  let idx
  do {
    idx = Math.floor(Math.random() * room.deck.length)
  } while (room.used.has(idx))
  room.used.add(idx)
  room.currentIndex = idx
  return idx
}

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, name }) => {
    const room = ensureRoom(roomId)
    if (room.players.size >= room.max) {
      socket.emit('errorMsg', 'Pokój pełny (100)')
      return
    }
    socket.join(roomId)
    room.players.set(socket.id, { id: socket.id, name: name?.trim() || 'Gracz' })
    io.to(roomId).emit('roomState', {
      players: Array.from(room.players, ([id, p]) => ({ id, name: p.name })),
      category: room.category,
      duel: room.duel
        ? {
            aId: room.duel.aId,
            bId: room.duel.bId,
            turnId: room.duel.turnId,
            score: room.duel.score,
          }
        : null,
      current: room.currentIndex !== null ? room.deck[room.currentIndex] : null,
    })
  })

  socket.on('setCategory', ({ roomId, category, deck }) => {
    const room = ensureRoom(roomId)
    room.category = category
    room.deck = Array.isArray(deck) ? deck : []
    room.used.clear()
    pickNextIndex(room)
    if (!room.currentIndex) {
      return
    }
    io.to(roomId).emit('categorySet', { category: room.category })
    io.to(roomId).emit('currentImage', { current: room.deck[room.currentIndex] || null })
  })

  socket.on('startDuel', ({ roomId, aId, bId }) => {
    const room = ensureRoom(roomId)
    if (!room.players.has(aId) || !room.players.has(bId)) return
    room.duel = { aId, bId, turnId: aId, score: { [aId]: 0, [bId]: 0 } }
    io.to(roomId).emit('duelStarted', {
      aId,
      bId,
      turnId: room.duel.turnId,
      score: room.duel.score,
    })
  })

  socket.on('pass', ({ roomId }) => {
    const room = ensureRoom(roomId)
    if (!room.duel) return
    pickNextIndex(room)
    if (!room.currentIndex) {
      return
    }
    io.to(roomId).emit('currentImage', { current: room.deck[room.currentIndex] || null })
  })

  socket.on('answer', ({ roomId, text }) => {
    const room = ensureRoom(roomId)
    const duel = room.duel
    if (!duel || room.currentIndex === null) return
    const normalized = String(text || '')
      .trim()
      .toLowerCase()
    const current = room.deck[room.currentIndex]
    const isPass = normalized === 'pas'
    const isCorrect = current?.aliases?.some((a) => a.toLowerCase() === normalized)

    if (isPass) {
      pickNextIndex(room)
      io.to(roomId).emit('passed', { by: socket.id })
      io.to(roomId).emit('currentImage', { current: room.deck[room.currentIndex] || null })
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
      io.to(roomId).emit('correct', { by: socket.id, score: duel.score, turnId: duel.turnId })
      io.to(roomId).emit('currentImage', { current: room.deck[room.currentIndex] || null })
    } else {
      io.to(roomId).emit('wrong', { by: socket.id, guess: normalized })
    }
  })

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId)!
        room.players.delete(socket.id)
        if (room.duel && (room.duel.aId === socket.id || room.duel.bId === socket.id)) {
          room.duel = null
          io.to(roomId).emit('duelEnded', 'Gracz rozłączył się')
        }
        io.to(roomId).emit('roomState', {
          players: Array.from(room.players, ([id, p]) => ({ id, name: p.name })),
          category: room.category,
          duel: room.duel,
          current: room.currentIndex !== null ? room.deck[room.currentIndex] : null,
        })
      }
    }
  })
})

server.listen(3001, () => console.log('Socket.IO listening on :3001'))
