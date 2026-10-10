import { afterAll, describe, expect, it } from 'vitest'
import type { Card } from '../../shared/types/events.ts'
import { startRedis } from './helpers/redis.ts'
import { uniqueRoom, useServers } from './helpers/servers.ts'

// Black-box behaviour of the game, driven only through Socket.IO events.
// The same scenarios run against a single in-memory instance and against two instances
// sharing Redis (clients `a` and `b` are connected to different instances in the latter).
// Nothing here knows how server/index.ts is organised, so the file should survive refactoring.

const redis = await startRedis()

afterAll(() => redis?.stop())

const modes = [
  { name: 'single instance (in-memory)', pods: 1, useRedis: false },
  { name: 'two instances + Redis', pods: 2, useRedis: true },
]

const dogDeck: Card[] = [{ img: 'dog.png', aliases: ['pies'] }]
const numberedDeck = (size: number): Card[] =>
  Array.from({ length: size }, (_, i) => ({ img: `card-${i}.png`, aliases: [`answer-${i}`] }))

for (const mode of modes) {
  const suite = mode.useRedis && !redis ? describe.skip : describe

  suite(`gameplay: ${mode.name}`, () => {
    const env = useServers({ pods: mode.pods, redisUrl: mode.useRedis ? redis?.url : undefined })

    /** Two players in a room, category set, duel started (a moves first). Event history cleared. */
    async function setupDuel(deck: Card[] = dogDeck) {
      const room = uniqueRoom()
      const a = await env.connect(0)
      const b = await env.connect(1)

      await a.join(room, 'Ala')
      await b.join(room, 'Bob')

      a.emit('setCategory', { roomId: room, category: 'animals', deck })
      await Promise.all([a.waitFor('currentImage'), b.waitFor('currentImage')])

      a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })
      await Promise.all([a.waitFor('duelStarted'), b.waitFor('duelStarted')])

      a.clear()
      b.clear()

      return { room, a, b }
    }

    describe('joining a room', () => {
      it('shows every player the up-to-date list of players', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')

        for (const client of [a, b]) {
          const [state] = await client.waitFor('roomState', (s) => s.players.length === 2)

          expect(state.players.map((p) => p.name).sort()).toEqual(['Ala', 'Bob'])
          expect(state.duel).toBeNull()
        }
      })

      it('falls back to a default name when none is given', async () => {
        const a = await env.connect(0)

        await a.join(uniqueRoom())

        const [state] = a.lastOf('roomState')!

        expect(state.players).toEqual([{ id: a.id, name: 'Gracz' }])
      })

      it('keeps rooms isolated from each other', async () => {
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(uniqueRoom(), 'Ala')
        await b.join(uniqueRoom(), 'Bob')
        b.clear()

        a.emit('setCategory', { roomId: 'whatever', category: 'x', deck: dogDeck })

        await b.expectNoEvent('categorySet')
        await b.expectNoEvent('roomState')
      })

      it('rejects the 101st player', async () => {
        const room = uniqueRoom()
        const players = await Promise.all(Array.from({ length: 100 }, (_, i) => env.connect(i)))

        // joins of one room are serialized by the lock, so give the whole crowd time
        await Promise.all(players.map((p, i) => p.join(room, `P${i}`, 20_000)))

        const extra = await env.connect(0)

        extra.emit('joinRoom', { roomId: room, name: 'Late' })
        await extra.waitFor('errorMsg')

        // the rejected player must not have been counted: after one leaves, 99 remain
        const watcher = players[0]!

        watcher.clear()
        players[99]!.disconnect()

        const [state] = await watcher.waitFor('roomState', (s) => s.players.length < 100)

        expect(state.players).toHaveLength(99)
        expect(state.players.map((p) => p.name)).not.toContain('Late')
      }, 30_000)
    })

    describe('categories and cards', () => {
      it('announces the category and the first card to the whole room', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')

        a.emit('setCategory', { roomId: room, category: 'animals', deck: numberedDeck(3) })

        for (const client of [a, b]) {
          const [category] = await client.waitFor('categorySet')
          const [image] = await client.waitFor('currentImage')

          expect(category).toEqual({ category: 'animals' })
          expect(image.current?.img).toMatch(/^card-\d\.png$/)
        }
      })

      it('lets a late joiner see the current category and card', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)

        await a.join(room, 'Ala')
        a.emit('setCategory', { roomId: room, category: 'animals', deck: dogDeck })
        await a.waitFor('currentImage')

        const b = await env.connect(1)

        await b.join(room, 'Bob')

        const [state] = b.lastOf('roomState')!

        expect(state.category).toBe('animals')
        expect(state.current).toEqual(dogDeck[0])
      })

      it('always announces a new category, whichever card gets picked first', async () => {
        // regression: card index 0 used to be treated as "no card" and nothing was emitted
        const room = uniqueRoom()
        const a = await env.connect(0)

        await a.join(room, 'Ala')

        for (let attempt = 1; attempt <= 25; attempt++) {
          a.emit('setCategory', { roomId: room, category: `cat-${attempt}`, deck: numberedDeck(2) })
          await a.waitFor('categorySet', (c) => c.category === `cat-${attempt}`)
        }
      })

      it('shows every card once before any card repeats', async () => {
        const { room, a, b } = await setupDuel(numberedDeck(4))

        // setupDuel cleared history; restart the deck so the first card is recorded
        a.emit('setCategory', { roomId: room, category: 'again', deck: numberedDeck(4) })
        await a.waitForCount('currentImage', 1)

        // a new category ends the duel, and PAS needs a running one
        a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })
        await a.waitFor('duelStarted')

        for (let i = 2; i <= 4; i++) {
          a.emit('pass', { roomId: room })
          await a.waitForCount('currentImage', i)
        }

        const shown = a.eventsOf('currentImage').map(([image]) => image.current?.img)

        expect(new Set(shown).size).toBe(4)

        a.emit('pass', { roomId: room })
        await a.waitForCount('currentImage', 5)
        expect(shown).toContain(a.lastOf('currentImage')![0].current?.img)
      })

      it('keeps the category when the only player leaves and comes back', async () => {
        const room = uniqueRoom()
        const first = await env.connect(0)

        await first.join(room, 'Ala')
        first.emit('setCategory', { roomId: room, category: 'animals', deck: dogDeck })
        await first.waitFor('categorySet')
        first.disconnect()

        const again = await env.connect(0)

        await again.join(room, 'Ala')

        const [state] = again.lastOf('roomState')!

        expect(state.category).toBe('animals')
        expect(state.current).toEqual(dogDeck[0])
      })
    })

    describe('duel', () => {
      it('starts with the challenger on the move and zero scores', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')

        a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })

        for (const client of [a, b]) {
          const [duel] = await client.waitFor('duelStarted')

          expect(duel).toEqual({
            aId: a.id,
            bId: b.id,
            turnId: a.id,
            score: { [a.id]: 0, [b.id]: 0 },
          })
        }
      })

      it('ignores a duel with a player who is not in the room', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)

        await a.join(room, 'Ala')
        a.emit('startDuel', { roomId: room, aId: a.id, bId: 'nobody' })

        await a.expectNoEvent('duelStarted')
      })

      it('scores a correct answer, hands over the turn and shows the next card', async () => {
        const { room, a, b } = await setupDuel()

        // the answer is trimmed and case-insensitive
        a.emit('answer', { roomId: room, text: '  PIES ' })

        for (const client of [a, b]) {
          const [correct] = await client.waitFor('correct')

          expect(correct).toEqual({
            by: a.id,
            score: { [a.id]: 1, [b.id]: 0 },
            turnId: b.id,
          })
          await client.waitFor('currentImage')
        }
      })

      it('broadcasts a wrong answer and keeps the turn', async () => {
        const { room, a, b } = await setupDuel()

        a.emit('answer', { roomId: room, text: 'kot' })

        for (const client of [a, b]) {
          const [wrong] = await client.waitFor('wrong')

          expect(wrong).toEqual({ by: a.id, guess: 'kot' })
        }

        a.emit('answer', { roomId: room, text: 'pies' })
        const [correct] = await a.waitFor('correct')

        expect(correct.by).toBe(a.id)
      })

      it('tells only the sender that it is not their turn', async () => {
        const { room, a, b } = await setupDuel()

        b.emit('answer', { roomId: room, text: 'pies' })

        const [notYourTurn] = await b.waitFor('notYourTurn')

        expect(notYourTurn).toBe(true)
        await a.expectNoEvent('notYourTurn')
        await a.expectNoEvent('correct')
      })

      it('shows the next card on PAS without handing over the turn', async () => {
        const { room, a, b } = await setupDuel()

        a.emit('answer', { roomId: room, text: 'pas' })

        for (const client of [a, b]) {
          const [passed] = await client.waitFor('passed')

          expect(passed).toEqual({ by: a.id })
          await client.waitFor('currentImage')
        }

        a.emit('answer', { roomId: room, text: 'pies' })
        const [correct] = await a.waitFor('correct')

        expect(correct.by).toBe(a.id)
      })

      it('ignores room events from a socket that has not joined the room', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const outsider = await env.connect(1)

        await a.join(room, 'Ala')
        a.clear()

        outsider.emit('setCategory', { roomId: room, category: 'hijacked', deck: dogDeck })
        await outsider.waitFor('errorMsg')
        await a.expectNoEvent('categorySet')

        // the room still has no category: a late joiner sees nothing hijacked
        const late = await env.connect(0)

        await late.join(room, 'Late')
        expect(late.lastOf('roomState')![0].category).toBeNull()
      })

      it('does not let an outsider steer a running duel', async () => {
        const { room, a, b } = await setupDuel()
        const outsider = await env.connect(0)

        outsider.emit('answer', { roomId: room, text: 'pies' })
        outsider.emit('answer', { roomId: room, text: 'pas' })
        outsider.emit('pass', { roomId: room })
        outsider.emit('startDuel', { roomId: room, aId: outsider.id, bId: a.id })
        await outsider.waitForCount('errorMsg', 4)

        for (const client of [a, b]) {
          await client.expectNoEvent('correct', 100)
          await client.expectNoEvent('passed', 100)
          await client.expectNoEvent('currentImage', 100)
          await client.expectNoEvent('duelStarted', 100)
        }
      })

      it('lets only the player on the move PAS', async () => {
        const { room, a, b } = await setupDuel()

        b.emit('answer', { roomId: room, text: 'pas' })
        b.emit('pass', { roomId: room })
        await b.waitForCount('notYourTurn', 2)

        await a.expectNoEvent('passed', 100)
        await a.expectNoEvent('currentImage', 100)
      })

      it('rejects an empty deck without re-sending the previous card or touching the room', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')
        a.emit('setCategory', { roomId: room, category: 'animals', deck: dogDeck })
        // currentImage is emitted right after categorySet - wait for it, or it lands after clear()
        await Promise.all([a.waitFor('currentImage'), b.waitFor('currentImage')])
        a.clear()
        b.clear()

        a.emit('setCategory', { roomId: room, category: 'nothing', deck: [] })
        await a.waitFor('errorMsg')

        // nobody gets a stale card or a category switch...
        await b.expectNoEvent('categorySet', 100)
        await b.expectNoEvent('currentImage', 100)

        // ...and a late joiner still sees the previous category and card
        const late = await env.connect(0)

        await late.join(room, 'Late')

        const state = late.lastOf('roomState')![0]

        expect(state.category).toBe('animals')
        expect(state.current).toEqual(dogDeck[0])
      })

      it('lets only the challenger start a duel (nobody can send one on behalf of others)', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')
        a.clear()
        b.clear()

        b.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })
        await b.waitFor('errorMsg')

        await a.expectNoEvent('duelStarted', 100)
        await b.expectNoEvent('duelStarted', 100)
      })

      it('does not let a bystander take over a running duel, and lets a duelist rematch', async () => {
        const { room, a, b } = await setupDuel()
        const c = await env.connect(0)

        await c.join(room, 'Cy')
        a.clear()
        b.clear()
        c.clear()

        c.emit('startDuel', { roomId: room, aId: c.id, bId: a.id })
        await c.waitFor('errorMsg')
        await a.expectNoEvent('duelStarted', 100)

        // the duel between a and b is intact: a still scores
        a.emit('answer', { roomId: room, text: 'pies' })
        await b.waitFor('correct')

        // a duelist may start a new one
        a.emit('startDuel', { roomId: room, aId: a.id, bId: c.id })

        const started = await c.waitFor('duelStarted')

        expect(started[0]).toMatchObject({ aId: a.id, bId: c.id, turnId: a.id })
      })

      it('does not let a bystander change the category during a duel', async () => {
        const { room, a, b } = await setupDuel()
        const c = await env.connect(0)

        await c.join(room, 'Cy')
        a.clear()
        b.clear()
        c.clear()

        c.emit('setCategory', { roomId: room, category: 'hijacked', deck: numberedDeck(2) })
        await c.waitFor('errorMsg')
        await a.expectNoEvent('categorySet', 100)
        await b.expectNoEvent('duelEnded', 100)

        a.emit('answer', { roomId: room, text: 'pies' })
        await b.waitFor('correct')
      })

      it('ends the duel when one of its players changes the category', async () => {
        const { room, a, b } = await setupDuel()

        a.emit('setCategory', { roomId: room, category: 'again', deck: numberedDeck(2) })

        await Promise.all([a.waitFor('duelEnded'), b.waitFor('duelEnded')])
        await b.waitFor('categorySet')
        await b.waitFor('currentImage')

        // no duel any more: answers are ignored
        b.clear()
        a.emit('answer', { roomId: room, text: 'answer-0' })
        await b.expectNoEvent('correct', 100)
        await b.expectNoEvent('wrong', 100)
      })

      it('processes events of one client in the order they were sent', async () => {
        const room = uniqueRoom()
        const b = await env.connect(1)

        await b.join(room, 'Bob')

        // a freshly connected client fires joinRoom and startDuel back-to-back,
        // without waiting for the join to be confirmed
        const a = await env.connect(0)

        a.emit('joinRoom', { roomId: room, name: 'Ala' })
        a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })

        const [duel] = await b.waitFor('duelStarted')

        expect(duel.aId).toBe(a.id)
      })
    })

    describe('malformed payloads', () => {
      const garbage: unknown[][] = [
        [], // no payload at all
        [null],
        ['text'],
        [42],
        [{}],
        [{ roomId: 123 }],
        [{ roomId: '' }],
      ]
      const events = ['joinRoom', 'setCategory', 'startDuel', 'pass', 'answer']

      it('answers every event with an error and keeps the server and the socket alive', async () => {
        const room = uniqueRoom()
        const a = await env.connect(0)
        const b = await env.connect(1)

        await a.join(room, 'Ala')
        await b.join(room, 'Bob')
        a.clear()

        let sent = 0

        for (const event of events) {
          for (const args of garbage) {
            a.emitRaw(event, ...args)
            sent++
          }
        }

        await a.waitForCount('errorMsg', sent)

        // the same socket still works - the per-socket queue was not poisoned
        a.emit('setCategory', { roomId: room, category: 'animals', deck: dogDeck })
        await Promise.all([a.waitFor('categorySet'), b.waitFor('categorySet')])
        await b.expectNoEvent('errorMsg', 100)
      })

      it('rejects oversized and ill-shaped fields', async () => {
        const { room, a, b } = await setupDuel()

        const bad: Array<[string, unknown]> = [
          ['answer', { roomId: room, text: 'x'.repeat(201) }],
          ['answer', { roomId: room, text: 42 }],
          ['joinRoom', { roomId: 'r'.repeat(65), name: 'Ala' }],
          ['joinRoom', { roomId: room, name: 'n'.repeat(33) }],
          ['setCategory', { roomId: room, category: 'c', deck: [{ img: 'x.png', aliases: [] }] }],
          ['setCategory', { roomId: room, category: 'c', deck: [{ img: 'x.png' }] }],
          ['setCategory', { roomId: room, category: 'c', deck: numberedDeck(201) }],
          ['setCategory', { roomId: room, category: 'c', deck: 'nope' }],
          ['startDuel', { roomId: room, aId: a.id }],
        ]

        a.clear()

        for (const [event, payload] of bad) a.emitRaw(event, payload)

        await a.waitForCount('errorMsg', bad.length)

        // nothing leaked into the room and the running duel is untouched
        await b.expectNoEvent('categorySet', 100)
        await b.expectNoEvent('duelStarted', 100)

        a.emit('answer', { roomId: room, text: 'pies' })
        await b.waitFor('correct')
      })
    })

    describe('leaving', () => {
      it('ends the duel when one of the duelists disconnects', async () => {
        const { a, b } = await setupDuel()

        b.disconnect()

        const [reason] = await a.waitFor('duelEnded')

        expect(typeof reason).toBe('string')

        const [state] = await a.waitFor('roomState', (s) => s.players.length === 1)

        expect(state.players.map((p) => p.id)).toEqual([a.id])
        expect(state.duel).toBeNull()
      })

      it('keeps the duel running when a bystander disconnects', async () => {
        const { room, a, b } = await setupDuel()
        const bystander = await env.connect(0)

        await bystander.join(room, 'Cezary')
        await a.waitFor('roomState', (s) => s.players.length === 3)
        a.clear()
        b.clear()

        bystander.disconnect()

        const [state] = await a.waitFor('roomState', (s) => s.players.length === 2)

        expect(state.duel).not.toBeNull()
        await a.expectNoEvent('duelEnded')
      })
    })
  })
}
