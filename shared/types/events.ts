export interface Player {
  id: string
  name: string
  goldenField: boolean
}

export type PublicPlayer = Pick<Player, 'id' | 'name'>

export interface Card {
  img: string
  aliases: string[]
}

export interface PublicCard {
  img: string
}

export interface PublicCategory {
  id: string
  label: string
}

export interface RoomState {
  players: Map<string, Player>
  categoryId: string | null
  duel: DuelState | null
  max: number
  deck: Card[]
  // Note: Current card
  current: Card | null
  // Note: Current card's index in the deck
  currentIndex: number | null
  // Note: Set of already used cards' indexes in the deck
  used: Set<number>
}

export interface DuelState {
  duelId: string
  aId: string
  bId: string
  turnId: string
  score: Record<string, number>
  remainingMs: Record<string, number>
  turnStartedAt: number
  turnVersion: number
  serverNow: number
}

export interface JoinRoomPayload {
  roomId: string
  name?: string
}

export interface SetCategoryPayload {
  roomId: string
  categoryId: string
}

export interface StartDuelPayload {
  roomId: string
  aId: string
  bId: string
}

export interface PassPayload {
  roomId: string
}

export interface AnswerPayload {
  roomId: string
  text: string
}

export interface ClientToServerEvents {
  joinRoom: (payload: JoinRoomPayload) => void
  setCategory: (payload: SetCategoryPayload) => void
  startDuel: (payload: StartDuelPayload) => void
  pass: (payload: PassPayload) => void
  answer: (payload: AnswerPayload) => void
}

export interface RoomStatePayload {
  players: PublicPlayer[]
  categoryId: string | null
  duel: DuelState | null
  current: PublicCard | null
}

export interface CategorySetPayload {
  categoryId: string
}

export interface CurrentImagePayload {
  current: PublicCard | null
}

export interface DuelStartedPayload {
  duelId: string
  aId: string
  bId: string
  turnId: string
  score: Record<string, number>
  remainingMs: Record<string, number>
  turnStartedAt: number
  turnVersion: number
  serverNow: number
}

export interface CorrectPayload {
  by: string
  score: Record<string, number>
  turnId: string
  remainingMs: Record<string, number>
  turnStartedAt: number
  turnVersion: number
  serverNow: number
}

export interface WrongPayload {
  by: string
  guess: string
}

export interface PassedPayload {
  by: string
  turnId: string
  remainingMs: Record<string, number>
  turnStartedAt: number
  turnVersion: number
  serverNow: number
}

export interface DuelEndedPayload {
  reason: 'timeout' | 'disconnect' | 'categoryChanged'
  loserId?: string
  winnerId?: string
}

export interface NotYourTurnPayload {
  value: boolean
}

export interface ServerToClientEvents {
  roomState: (payload: RoomStatePayload) => void
  categorySet: (payload: CategorySetPayload) => void
  currentImage: (payload: CurrentImagePayload) => void
  duelStarted: (payload: DuelStartedPayload) => void
  duelEnded: (payload: DuelEndedPayload) => void
  correct: (payload: CorrectPayload) => void
  wrong: (payload: WrongPayload) => void
  passed: (payload: PassedPayload) => void
  notYourTurn: (value: boolean) => void
  errorMsg: (msg: string) => void
}
