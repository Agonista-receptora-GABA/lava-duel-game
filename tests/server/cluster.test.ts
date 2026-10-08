import { afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'
import { sleep } from './helpers/ports.ts'
import { roomKey, startRedis } from './helpers/redis.ts'
import { uniqueRoom, useServers } from './helpers/servers.ts'

// Behaviour that only exists when several instances share Redis.
// Black-box again: the server is started as a real process, an instance "crashes" via SIGKILL.

const redis = await startRedis()

afterAll(() => redis?.stop())

const suite = redis ? describe : describe.skip

suite('cluster: two instances + Redis', () => {
  describe('concurrent joins', () => {
    const env = useServers({ pods: 2, redisUrl: redis?.url })

    it('does not lose players when many join the same room through different instances', async () => {
      const room = uniqueRoom()
      const players = await Promise.all(Array.from({ length: 30 }, (_, i) => env.connect(i)))

      await Promise.all(players.map((p, i) => p.join(room, `P${i}`, 20_000)))

      const observer = await env.connect(0)

      await observer.join(room, 'Observer')

      const [state] = observer.lastOf('roomState')!

      expect(state.players).toHaveLength(31)
    }, 30_000)
  })

  describe('instance crash', () => {
    const env = useServers({ pods: 2, redisUrl: redis?.url })

    it('removes players of a killed instance (and their duel) when the next player joins', async () => {
      const room = uniqueRoom()
      const a = await env.connect(0)
      const b = await env.connect(1)

      await a.join(room, 'Ala')
      await b.join(room, 'Bob')
      a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })
      await a.waitFor('duelStarted')

      await env.servers[1]!.kill() // no 'disconnecting' handlers run for Bob
      await sleep(500)

      const c = await env.connect(0)

      await c.join(room, 'Cezary')

      const [state] = c.lastOf('roomState')!

      expect(state.players.map((p) => p.name).sort()).toEqual(['Ala', 'Cezary'])
      expect(state.duel).toBeNull()
    }, 20_000)
  })

  describe('failing handlers', () => {
    const env = useServers({ pods: 1, redisUrl: redis?.url })

    it('reports an error to the client and keeps the instance alive', async () => {
      const raw = new Redis(redis!.url)
      const brokenRoom = uniqueRoom()

      try {
        await raw.set(roomKey(brokenRoom), '{ this is not json')

        const victim = await env.connect(0)

        victim.emit('joinRoom', { roomId: brokenRoom, name: 'Victim' })
        await victim.waitFor('errorMsg')

        const health = await fetch(`${env.servers[0]!.url}/health`)

        expect(health.status).toBe(200)

        const other = await env.connect(0)

        await other.join(uniqueRoom(), 'Healthy')
        expect(other.lastOf('roomState')![0].players).toHaveLength(1)
      } finally {
        await raw.quit()
      }
    })
  })
})
