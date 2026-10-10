import * as z from 'zod'
import type {
  AnswerPayload,
  JoinRoomPayload,
  PassPayload,
  SetCategoryPayload,
  StartDuelPayload,
} from '@shared/types/events.ts'

// Everything a client sends is untrusted: it is stored in Redis and broadcast to up to 100 players.
// These limits are generous for real use (a deck is a few dozen cards) but cap what one socket can do.
export const LIMITS = {
  id: 64,
  playerName: 32,
  answerText: 200,
} as const

/** Passed to Socket.IO as maxHttpBufferSize. */
export const MAX_PAYLOAD_BYTES = 256 * 1024

const roomId = z.string().min(1).max(LIMITS.id)
const playerId = z.string().min(1).max(LIMITS.id)

// `satisfies` keeps each schema in sync with the hand-written types in shared/types/events.ts.
// Unknown keys are stripped (zod default), so handlers only ever see the declared fields.
export const joinRoomSchema = z.object({
  roomId,
  name: z.string().trim().max(LIMITS.playerName).optional(),
}) satisfies z.ZodType<JoinRoomPayload>

export const setCategorySchema = z
  .object({
    roomId,
    categoryId: z.string().min(1).max(LIMITS.id),
  })
  .strict() satisfies z.ZodType<SetCategoryPayload>

export const startDuelSchema = z.object({
  roomId,
  aId: playerId,
  bId: playerId,
}) satisfies z.ZodType<StartDuelPayload>

export const passSchema = z.object({ roomId }) satisfies z.ZodType<PassPayload>

export const answerSchema = z.object({
  roomId,
  text: z.string().max(LIMITS.answerText),
}) satisfies z.ZodType<AnswerPayload>
