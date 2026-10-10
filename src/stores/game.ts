import { defineStore } from 'pinia'
import type {
  PublicCategory,
  ServerToClientEvents,
  JoinRoomPayload,
  RoomStatePayload,
} from '@shared/types/events'
import { socket } from '../socket'

type GameState = JoinRoomPayload & RoomStatePayload & { transcript: string }

type CapitalizeFirst<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S

type SocketEventsCallback<T = ServerToClientEvents> = {
  [K in keyof T as `on${CapitalizeFirst<string & K>}`]?: T[K]
}

export const useGameStore = defineStore('game', {
  state: () =>
    ({
      roomId: '',
      name: '',
      players: [],
      categoryId: null,
      current: null,
      duel: null,
      transcript: '',
    }) as GameState,
  actions: {
    connect(roomId: string, name: string) {
      this.roomId = roomId
      this.name = name
      socket.emit('joinRoom', { roomId, name })
    },
    setCategory(categoryId: string) {
      this.categoryId = categoryId
      socket.emit('setCategory', { roomId: this.roomId, categoryId })
    },
    async fetchCategories(): Promise<PublicCategory[]> {
      const response = await fetch('/api/categories')

      if (!response.ok) throw new Error('Nie udało się pobrać kategorii')

      return response.json() as Promise<PublicCategory[]>
    },
    /** Challenges `opponentId`; the server only accepts the sender as the challenger. */
    startDuel(opponentId: string) {
      if (!socket.id) return

      socket.emit('startDuel', { roomId: this.roomId, aId: socket.id, bId: opponentId })
    },
    pass() {
      socket.emit('pass', { roomId: this.roomId })
    },
    answer(text: string) {
      this.transcript = text
      socket.emit('answer', { roomId: this.roomId, text })
    },
    bindSocketEvents({
      onRoomState = () => {},
      onCategorySet = () => {},
      onCurrentImage = () => {},
      onDuelStarted = () => {},
      onDuelEnded = () => {},
      onCorrect = () => {},
      onWrong = () => {},
      onPassed = () => {},
    }: SocketEventsCallback = {}) {
      socket.on('roomState', (s) => {
        this.players = s.players
        this.categoryId = s.categoryId
        this.duel = s.duel
        this.current = s.current
        onRoomState(s)
      })
      socket.on('categorySet', (c) => {
        this.categoryId = c.categoryId
        onCategorySet(c)
      })
      socket.on('currentImage', (c) => {
        this.current = c.current
        onCurrentImage(c)
      })
      socket.on('duelStarted', (d) => {
        this.duel = d
        onDuelStarted(d)
      })
      socket.on('duelEnded', (d) => {
        this.duel = null
        onDuelEnded(d)
      })
      socket.on('correct', (p) => {
        if (this.duel) {
          this.duel.score = p.score
          this.duel.turnId = p.turnId
          onCorrect(p)
        }
      })
      socket.on('wrong', (w) => {
        onWrong(w)
      })
      socket.on('passed', (p) => {
        onPassed(p)
      })
    },
  },
})
