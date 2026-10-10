import type { DuelState, RoomState } from '@shared/types/events.ts'
import { drawNextCard } from './deck.js'

export const PASS_WORD = 'pas'

export function isDuelist(duel: DuelState, playerId: string): boolean {
  return duel.aId === playerId || duel.bId === playerId
}

/** Drops the running duel. Returns true when there was one (so the caller can notify the room). */
export function endDuel(room: RoomState): boolean {
  if (!room.duel) return false

  room.duel = null

  return true
}

/**
 * Starts a duel between two players of the room; `a` (the challenger) moves first.
 * The room has a single duel slot and no end-of-duel logic yet, so a running duel can only be
 * replaced by one of its own duelists (rematch / moving on) - an outsider must not hijack it.
 * Who `a` is has to be checked by the caller: it must be the socket that sent the event.
 */
export function startDuel(room: RoomState, aId: string, bId: string): DuelState | null {
  if (aId === bId) return null

  if (!room.players.has(aId) || !room.players.has(bId)) return null

  if (room.duel && !isDuelist(room.duel, aId)) return null

  room.duel = {
    aId,
    bId,
    turnId: aId,
    score: {
      [aId]: 0,
      [bId]: 0,
    },
  }

  return room.duel
}

/** What happened to a PAS - shared by the `pass` event and the spoken word "pas". */
export type PassOutcome = { type: 'ignored' } | { type: 'notYourTurn' } | { type: 'pass' }

/** What happened to an answer - the socket handler turns this into events. */
export type AnswerOutcome =
  | PassOutcome
  | { type: 'correct'; score: Record<string, number>; turnId: string }
  | { type: 'wrong'; guess: string }

/**
 * PAS skips the current card; only the duelist who is on the move may do it.
 * Mutates the room (next card) - the caller persists it and emits events.
 */
export function applyPass(
  room: RoomState,
  playerId: string,
  random: () => number = Math.random,
): PassOutcome {
  if (!room.duel || room.currentIndex === null) return { type: 'ignored' }

  if (playerId !== room.duel.turnId) return { type: 'notYourTurn' }

  drawNextCard(room, random)

  return { type: 'pass' }
}

/**
 * Applies an answer of `playerId` to the room (mutates it: score, turn, next card).
 * The caller is responsible for persisting the room and for emitting events.
 */
export function applyAnswer(
  room: RoomState,
  playerId: string,
  text: string,
  random: () => number = Math.random,
): AnswerOutcome {
  const duel = room.duel

  if (!duel || room.currentIndex === null) {
    return { type: 'ignored' }
  }

  const normalized = String(text || '')
    .trim()
    .toLowerCase()

  if (normalized === PASS_WORD) return applyPass(room, playerId, random)

  if (playerId !== duel.turnId) {
    return { type: 'notYourTurn' }
  }

  const current = room.deck[room.currentIndex]
  const isCorrect = current?.aliases?.some((alias) => alias.toLowerCase() === normalized)

  if (!isCorrect) {
    return { type: 'wrong', guess: normalized }
  }

  duel.score[playerId] = (duel.score[playerId] || 0) + 1
  duel.turnId = playerId === duel.aId ? duel.bId : duel.aId

  drawNextCard(room, random)

  return { type: 'correct', score: duel.score, turnId: duel.turnId }
}
