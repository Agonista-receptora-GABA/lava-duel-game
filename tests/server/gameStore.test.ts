import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Redis } from 'ioredis'
import type { RoomState } from '../../shared/types/events.ts'
import type { GameStore } from '../../server/gameStore.ts'
import { MemoryGameStore } from '../../server/memoryGameStore.ts'
import { RedisGameStore } from '../../server/redisGameStore.ts'
import { roomKey, startRedis } from './helpers/redis.ts'
import { uniqueRoom } from './helpers/servers.ts'

// Tests of the GameStore contract (both implementations) plus implementation-specific
// behaviour (Redis: locking and TTL, memory: expiry of empty rooms).

const redis = await startRedis()

afterAll(() => redis?.stop())

function sampleRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    players: new Map([
      ['p1', { id: 'p1', name: 'Ala' }],
      ['p2', { id: 'p2', name: 'Bob' }],
    ]),
    max: 100,
    categoryId: 'animals',
    deck: [
      { img: 'dog.png', aliases: ['pies', 'dog'] },
      { img: 'cat.png', aliases: ['kot'] },
    ],
    used: new Set([1]),
    currentIndex: 1,
    current: { img: 'cat.png', aliases: ['kot'] },
    duel: { aId: 'p1', bId: 'p2', turnId: 'p2', score: { p1: 2, p2: 1 } },
    ...overrides,
  }
}

const emptyRoom = () => sampleRoom({ players: new Map(), duel: null })

const implementations: Array<{ name: string; needsRedis: boolean; create: () => GameStore }> = [
  { name: 'MemoryGameStore', needsRedis: false, create: () => new MemoryGameStore() },
  { name: 'RedisGameStore', needsRedis: true, create: () => new RedisGameStore(redis!.url) },
]

for (const impl of implementations) {
  const suite = impl.needsRedis && !redis ? describe.skip : describe

  suite(`GameStore contract: ${impl.name}`, () => {
    let store: GameStore

    beforeAll(() => {
      store = impl.create()
    })

    afterAll(() => store.close())

    it('returns null for an unknown room', async () => {
      expect(await store.get(uniqueRoom())).toBeNull()
    })

    it('round-trips the whole room state, including Map and Set fields', async () => {
      const id = uniqueRoom()
      const room = sampleRoom()

      await store.set(id, room)

      expect(await store.get(id)).toEqual(room)
    })

    it('overwrites a previously stored state', async () => {
      const id = uniqueRoom()

      await store.set(id, sampleRoom())
      await store.set(id, sampleRoom({ categoryId: 'cars', duel: null }))

      const loaded = await store.get(id)

      expect(loaded?.categoryId).toBe('cars')
      expect(loaded?.duel).toBeNull()
    })

    it('forgets a deleted room', async () => {
      const id = uniqueRoom()

      await store.set(id, sampleRoom())
      await store.delete(id)

      expect(await store.get(id)).toBeNull()
    })

    it('returns the value of the locked callback', async () => {
      expect(await store.withLock(uniqueRoom(), async () => 42)).toBe(42)
    })

    it('propagates errors from the locked callback and stays usable afterwards', async () => {
      const id = uniqueRoom()

      await expect(
        store.withLock(id, async () => {
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      const startedAt = Date.now()

      expect(await store.withLock(id, async () => 'ok')).toBe('ok')
      expect(Date.now() - startedAt).toBeLessThan(1_000) // the lock was released, no waiting for its TTL
    })
  })
}

const redisSuite = redis ? describe : describe.skip

redisSuite('RedisGameStore specifics', () => {
  const stores: RedisGameStore[] = []
  let raw: Redis

  const newStore = () => {
    const store = new RedisGameStore(redis!.url)

    stores.push(store)
    return store
  }

  beforeAll(() => {
    raw = new Redis(redis!.url)
  })

  afterAll(async () => {
    await Promise.all(stores.map((store) => store.close()))
    await raw.quit()
  })

  it('serializes read-modify-write cycles of independent instances (no lost updates)', async () => {
    const id = uniqueRoom()
    const [first, second] = [newStore(), newStore()] // two "pods"
    const increment = (store: RedisGameStore) =>
      store.withLock(id, async () => {
        const room = (await store.get(id))!

        room.max += 1
        await store.set(id, room)
      })

    await first.set(id, sampleRoom({ max: 0 }))
    await Promise.all(Array.from({ length: 50 }, (_, i) => increment(i % 2 === 0 ? first : second)))

    expect((await first.get(id))?.max).toBe(50)
  })

  it('keeps a room with players for hours', async () => {
    const id = uniqueRoom()

    await newStore().set(id, sampleRoom())

    const ttl = await raw.ttl(roomKey(id))

    expect(ttl).toBeGreaterThan(60 * 60)
    expect(ttl).toBeLessThanOrEqual(6 * 60 * 60)
  })

  it('lets an empty room expire after a few minutes', async () => {
    const id = uniqueRoom()

    await newStore().set(id, emptyRoom())

    const ttl = await raw.ttl(roomKey(id))

    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(10 * 60)
  })

  it('extends the lifetime again when someone joins an empty room', async () => {
    const id = uniqueRoom()
    const store = newStore()

    await store.set(id, emptyRoom())
    await store.set(id, sampleRoom())

    expect(await raw.ttl(roomKey(id))).toBeGreaterThan(60 * 60)
  })
})

describe('MemoryGameStore specifics', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops an empty room after 10 minutes', async () => {
    vi.useFakeTimers()

    const store = new MemoryGameStore()

    await store.set('r', emptyRoom())
    vi.advanceTimersByTime(10 * 60 * 1000 - 1)
    expect(await store.get('r')).not.toBeNull()

    vi.advanceTimersByTime(2)
    expect(await store.get('r')).toBeNull()
  })

  it('keeps a room that has players', async () => {
    vi.useFakeTimers()

    const store = new MemoryGameStore()

    await store.set('r', sampleRoom())
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    expect(await store.get('r')).not.toBeNull()
  })

  it('cancels the expiry when a player joins the empty room', async () => {
    vi.useFakeTimers()

    const store = new MemoryGameStore()

    await store.set('r', emptyRoom())
    await store.set('r', sampleRoom())
    vi.advanceTimersByTime(60 * 60 * 1000)

    expect(await store.get('r')).not.toBeNull()
  })
})
