import type * as z from 'zod'
import type { AppSocket } from './types.ts'

/**
 * Validates a raw event payload. On failure the sender gets an `errorMsg` and `null` is returned,
 * so the handler just bails out. Handlers must take the payload as `unknown`: destructuring it in
 * the parameter list would throw on `socket.emit('answer')` (no payload) and, as an uncaught
 * exception inside a listener, would take the whole Node process down.
 */
export function parsePayload<T>(socket: AppSocket, schema: z.ZodType<T>, payload: unknown): T | null {
  const result = schema.safeParse(payload)

  if (result.success) return result.data

  socket.emit('errorMsg', 'Nieprawidłowe dane')

  return null
}
