import { describe, expect, it } from 'vitest'
import {
  answerSchema,
  joinRoomSchema,
  LIMITS,
  MAX_PAYLOAD_BYTES,
  passSchema,
  setCategorySchema,
  startDuelSchema,
} from '../../../server/socket/schemas.ts'

const card = { img: '/img/dog.jpg', aliases: ['pies', 'dog'] }

describe('socket/schemas', () => {
  it('accepts the payloads the client really sends', () => {
    expect(joinRoomSchema.safeParse({ roomId: 'pokój 1', name: 'Gracz' }).success).toBe(true)
    expect(joinRoomSchema.safeParse({ roomId: 'pokoj-1' }).success).toBe(true)
    expect(setCategorySchema.safeParse({ roomId: 'r', category: 'zwierzęta', deck: [card] }).success).toBe(true)
    expect(startDuelSchema.safeParse({ roomId: 'r', aId: 'a', bId: 'b' }).success).toBe(true)
    expect(passSchema.safeParse({ roomId: 'r' }).success).toBe(true)
    expect(answerSchema.safeParse({ roomId: 'r', text: '' }).success).toBe(true) // silence from speech recognition
  })

  it('allows an empty deck (what to do with it is decided by the game logic)', () => {
    expect(setCategorySchema.safeParse({ roomId: 'r', category: 'c', deck: [] }).success).toBe(true)
  })

  it('trims the player name and drops unknown keys', () => {
    expect(joinRoomSchema.parse({ roomId: 'r', name: '  Ala  ', admin: true })).toEqual({
      roomId: 'r',
      name: 'Ala',
    })
  })

  it('keeps aliases exactly as sent (answers are matched against them)', () => {
    const parsed = setCategorySchema.parse({
      roomId: 'r',
      category: 'c',
      deck: [{ img: 'x', aliases: [' Pies '] }],
    })

    expect(parsed.deck[0]!.aliases).toEqual([' Pies '])
  })

  it.each([undefined, null, 'x', 1, [], {}])('rejects a non-object / empty payload: %j', (payload) => {
    for (const schema of [joinRoomSchema, setCategorySchema, startDuelSchema, passSchema, answerSchema]) {
      expect(schema.safeParse(payload).success).toBe(false)
    }
  })

  it('enforces the length limits', () => {
    const tooLong = (n: number) => 'x'.repeat(n + 1)

    expect(passSchema.safeParse({ roomId: tooLong(LIMITS.id) }).success).toBe(false)
    expect(answerSchema.safeParse({ roomId: 'r', text: tooLong(LIMITS.answerText) }).success).toBe(false)
    expect(joinRoomSchema.safeParse({ roomId: 'r', name: tooLong(LIMITS.playerName) }).success).toBe(false)
    expect(
      setCategorySchema.safeParse({ roomId: 'r', category: tooLong(LIMITS.category), deck: [] }).success,
    ).toBe(false)
  })

  it('rejects cards that can never be answered or are oversized', () => {
    const withCard = (c: unknown) =>
      setCategorySchema.safeParse({ roomId: 'r', category: 'c', deck: [c] }).success

    expect(withCard({ img: 'x', aliases: [] })).toBe(false)
    expect(withCard({ img: 'x' })).toBe(false)
    expect(withCard({ img: '', aliases: ['a'] })).toBe(false)
    expect(withCard({ img: 'x'.repeat(LIMITS.cardImg + 1), aliases: ['a'] })).toBe(false)
    expect(withCard({ img: 'x', aliases: Array(LIMITS.aliasesPerCard + 1).fill('a') })).toBe(false)
  })

  it('keeps the largest valid setCategory payload under the Socket.IO buffer limit', () => {
    const worstCard = {
      img: 'x'.repeat(LIMITS.cardImg),
      aliases: Array<string>(LIMITS.aliasesPerCard).fill('x'.repeat(LIMITS.alias)),
    }
    const payload = {
      roomId: 'r'.repeat(LIMITS.id),
      category: 'c'.repeat(LIMITS.category),
      deck: Array(LIMITS.deckSize).fill(worstCard),
    }

    expect(setCategorySchema.safeParse(payload).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(MAX_PAYLOAD_BYTES)
  })
})
