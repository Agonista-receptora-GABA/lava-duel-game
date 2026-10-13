import { randomUUID } from 'node:crypto'
import type { DuelState, RoomState } from '@shared/types/events.ts'
import { drawNextCard } from './deck.js'

export const PASS_WORD = 'pas'
export const BASE_DUEL_TIME_MS = 45_000
export const GOLDEN_FIELD_TIME_MS = 50_000
export const PASS_PENALTY_MS = 3_000

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
 * The room has a single duel slot, so only one of its duelists may replace a running duel;
 * an outsider must not hijack it.
 * Who `a` is has to be checked by the caller: it must be the socket that sent the event.
 */
export function startDuel(
  room: RoomState,
  aId: string,
  bId: string,
  now = Date.now(),
): DuelState | null {
  if (aId === bId) return null

  if (!room.players.has(aId) || !room.players.has(bId)) return null

  if (room.duel && !isDuelist(room.duel, aId)) return null

  room.duel = {
    duelId: randomUUID(),
    aId,
    bId,
    turnId: aId,
    score: {
      [aId]: 0,
      [bId]: 0,
    },
    remainingMs: {
      [aId]: room.players.get(aId)?.goldenField ? GOLDEN_FIELD_TIME_MS : BASE_DUEL_TIME_MS,
      [bId]: room.players.get(bId)?.goldenField ? GOLDEN_FIELD_TIME_MS : BASE_DUEL_TIME_MS,
    },
    turnStartedAt: now,
    turnVersion: 0,
    serverNow: now,
  }

  return room.duel
}

/** What happened to a PAS - shared by the `pass` event and the spoken word "pas". */
export type DuelTimeoutOutcome = { type: 'timeout'; loserId: string; winnerId: string }

export type PassOutcome =
  | { type: 'ignored' }
  | { type: 'notYourTurn' }
  | { type: 'pass' }
  | DuelTimeoutOutcome

/** What happened to an answer - the socket handler turns this into events. */
export type AnswerOutcome =
  | PassOutcome
  | { type: 'correct'; score: Record<string, number>; turnId: string }
  | { type: 'wrong'; guess: string }

function finishOnTimeout(room: RoomState, now: number): DuelTimeoutOutcome | null {
  const duel = room.duel

  if (!duel) return null

  const elapsed = Math.max(0, now - duel.turnStartedAt)
  if (elapsed < duel.remainingMs[duel.turnId]!) return null

  const loserId = duel.turnId
  const winnerId = loserId === duel.aId ? duel.bId : duel.aId
  room.duel = null

  return { type: 'timeout', loserId, winnerId }
}

export function expireDuelTurn(
  room: RoomState,
  duelId: string,
  turnVersion: number,
  now = Date.now(),
): DuelTimeoutOutcome | { type: 'ignored' } | { type: 'notExpired'; remainingMs: number } {
  const duel = room.duel

  if (!duel || duel.duelId !== duelId || duel.turnVersion !== turnVersion) {
    return { type: 'ignored' }
  }

  const timeout = finishOnTimeout(room, now)
  if (timeout) return timeout

  return {
    type: 'notExpired',
    remainingMs: duel.remainingMs[duel.turnId]! - Math.max(0, now - duel.turnStartedAt),
  }
}

/**
 * PAS skips the current card; only the duelist who is on the move may do it.
 * Mutates the room (next card) - the caller persists it and emits events.
 */
export function applyPass(
  room: RoomState,
  playerId: string,
  random: () => number = Math.random,
  now = Date.now(),
): PassOutcome {
  if (!room.duel) return { type: 'ignored' }

  const timeout = finishOnTimeout(room, now)
  if (timeout) return timeout

  if (room.currentIndex === null) return { type: 'ignored' }

  if (playerId !== room.duel.turnId) return { type: 'notYourTurn' }

  const duel = room.duel
  const elapsed = Math.max(0, now - duel.turnStartedAt)
  duel.remainingMs[playerId] = Math.max(0, duel.remainingMs[playerId]! - elapsed - PASS_PENALTY_MS)
  if (duel.remainingMs[playerId] === 0) {
    const winnerId = playerId === duel.aId ? duel.bId : duel.aId
    room.duel = null
    return { type: 'timeout', loserId: playerId, winnerId }
  }

  duel.turnStartedAt = now
  duel.turnVersion++
  duel.serverNow = now

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
  now = Date.now(),
): AnswerOutcome {
  const duel = room.duel

  if (!duel) return { type: 'ignored' }

  const timeout = finishOnTimeout(room, now)
  if (timeout) return timeout

  if (room.currentIndex === null) return { type: 'ignored' }

  const normalized = String(text || '')
    .trim()
    .toLowerCase()

  if (normalized === PASS_WORD) return applyPass(room, playerId, random, now)

  if (playerId !== duel.turnId) {
    return { type: 'notYourTurn' }
  }

  const current = room.deck[room.currentIndex]
  const isCorrect = current?.aliases?.some((alias) => alias.toLowerCase() === normalized)

  if (!isCorrect) {
    return { type: 'wrong', guess: normalized }
  }

  const elapsed = Math.max(0, now - duel.turnStartedAt)
  duel.remainingMs[playerId] = Math.max(0, duel.remainingMs[playerId]! - elapsed)
  duel.score[playerId] = (duel.score[playerId] || 0) + 1
  duel.turnId = playerId === duel.aId ? duel.bId : duel.aId
  duel.turnStartedAt = now
  duel.turnVersion++
  duel.serverNow = now

  drawNextCard(room, random)

  return { type: 'correct', score: duel.score, turnId: duel.turnId }
}
