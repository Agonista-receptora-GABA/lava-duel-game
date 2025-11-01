import { defineStore } from 'pinia'
import { socket } from '../socket'

type Player = { id: string; name: string }
type Card = { img: string; aliases: string[] }

export const useGameStore = defineStore('game', {
  state: () => ({
    roomId: '' as string,
    name: '' as string,
    players: [] as Player[],
    category: '' as string,
    current: null as Card | null,
    duel: null as {
      aId: string
      bId: string
      turnId: string
      score: Record<string, number>
    } | null,
    transcript: '' as string,
  }),
  actions: {
    connect(roomId: string, name: string) {
      this.roomId = roomId
      this.name = name
      socket.emit('joinRoom', { roomId, name })
    },
    setCategory(category: string, deck: Card[]) {
      this.category = category
      socket.emit('setCategory', { roomId: this.roomId, category, deck })
    },
    startDuel(aId: string, bId: string) {
      socket.emit('startDuel', { roomId: this.roomId, aId, bId })
    },
    pass() {
      socket.emit('pass', { roomId: this.roomId })
    },
    answer(text: string) {
      this.transcript = text
      socket.emit('answer', { roomId: this.roomId, text })
    },
    bindSocketEvents() {
      socket.on('roomState', (s) => {
        this.players = s.players
        this.category = s.category
        this.duel = s.duel
        this.current = s.current
      })
      socket.on('categorySet', ({ category }) => {
        this.category = category
      })
      socket.on('currentImage', ({ current }) => {
        this.current = current
      })
      socket.on('duelStarted', (d) => {
        this.duel = d
      })
      socket.on('duelEnded', () => {
        this.duel = null
      })
      socket.on('correct', (p) => {
        if (this.duel) {
          this.duel.score = p.score
          this.duel.turnId = p.turnId
        }
      })
      socket.on('wrong', () => {})
      socket.on('passed', () => {})
    },
  },
})
