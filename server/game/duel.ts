import type { DuelState, RoomState } from '@shared/types/events.ts'
import { drawNextCard } from './deck.js'

export const PASS_WORD = 'pas'

/** Starts a duel between two players of the room; `a` (the challenger) moves first. */
export function startDuel(room: RoomState, aId: string, bId: string): DuelState | null {
  if (!room.players.has(aId) || !room.players.has(bId)) return null

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

/** What happened to an answer - the socket handler turns this into events. */
export type AnswerOutcome =
  | { type: 'ignored' }
  | { type: 'pass' }
  | { type: 'notYourTurn' }
  | { type: 'correct'; score: Record<string, number>; turnId: string }
  | { type: 'wrong'; guess: string }

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

  // NOTE: PAS is checked before whose turn it is - any player of the room can currently skip a card.
  if (normalized === PASS_WORD) {
    drawNextCard(room, random)
    return { type: 'pass' }
  }

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
