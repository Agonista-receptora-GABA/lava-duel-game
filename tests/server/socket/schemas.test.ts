import { describe, expect, it } from 'vitest'
import {
  answerSchema,
  joinRoomSchema,
  LIMITS,
  passSchema,
  setCategorySchema,
  startDuelSchema,
} from '../../../server/socket/schemas.ts'

describe('socket/schemas', () => {
  it('accepts the payloads the client really sends', () => {
    expect(joinRoomSchema.safeParse({ roomId: 'pokój 1', name: 'Gracz' }).success).toBe(true)
    expect(joinRoomSchema.safeParse({ roomId: 'pokoj-1' }).success).toBe(true)
    expect(
      setCategorySchema.safeParse({ roomId: 'r', categoryId: 'polish-athletes' }).success,
    ).toBe(true)
    expect(startDuelSchema.safeParse({ roomId: 'r', aId: 'a', bId: 'b' }).success).toBe(true)
    expect(passSchema.safeParse({ roomId: 'r' }).success).toBe(true)
    expect(answerSchema.safeParse({ roomId: 'r', text: '' }).success).toBe(true) // silence from speech recognition
  })

  it('trims the player name and drops unknown keys', () => {
    expect(joinRoomSchema.parse({ roomId: 'r', name: '  Ala  ', admin: true })).toEqual({
      roomId: 'r',
      name: 'Ala',
    })
  })

  it('rejects client-supplied deck data', () => {
    expect(
      setCategorySchema.safeParse({
        roomId: 'r',
        categoryId: 'polish-athletes',
        deck: [{ img: 'x', aliases: ['answer'] }],
      }).success,
    ).toBe(false)
  })

  it.each([undefined, null, 'x', 1, [], {}])(
    'rejects a non-object / empty payload: %j',
    (payload) => {
      for (const schema of [
        joinRoomSchema,
        setCategorySchema,
        startDuelSchema,
        passSchema,
        answerSchema,
      ]) {
        expect(schema.safeParse(payload).success).toBe(false)
      }
    },
  )

  it('enforces the length limits', () => {
    const tooLong = (n: number) => 'x'.repeat(n + 1)

    expect(passSchema.safeParse({ roomId: tooLong(LIMITS.id) }).success).toBe(false)
    expect(answerSchema.safeParse({ roomId: 'r', text: tooLong(LIMITS.answerText) }).success).toBe(
      false,
    )
    expect(
      joinRoomSchema.safeParse({ roomId: 'r', name: tooLong(LIMITS.playerName) }).success,
    ).toBe(false)
    expect(
      setCategorySchema.safeParse({ roomId: 'r', categoryId: tooLong(LIMITS.id) }).success,
    ).toBe(false)
  })
})
