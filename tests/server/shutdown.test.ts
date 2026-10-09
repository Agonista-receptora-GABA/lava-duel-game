import { afterAll, describe, expect, it } from 'vitest'
import { startRedis } from './helpers/redis.ts'
import { uniqueRoom, useServers } from './helpers/servers.ts'

// Graceful shutdown (what K8s does to a pod: SIGTERM). The test helper's stop() sends SIGTERM and
// falls back to SIGKILL after 3 s, so "[shutdown] done" in the logs proves the server exited by itself.

const redis = await startRedis()

afterAll(() => redis?.stop())

describe('graceful shutdown: single instance', () => {
  const env = useServers({ pods: 1 })

  it('disconnects clients and exits cleanly on SIGTERM', async () => {
    const client = await env.connect(0)

    await client.join(uniqueRoom(), 'Ala')

    const disconnected = new Promise<void>((resolve) =>
      client.socket.once('disconnect', () => resolve()),
    )

    await env.servers[0]!.stop()
    await disconnected

    expect(env.servers[0]!.logs()).toContain('[shutdown] done')
  })
})

const redisSuite = redis ? describe : describe.skip

redisSuite('graceful shutdown: two instances + Redis', () => {
  const env = useServers({ pods: 2, redisUrl: redis?.url })

  it('removes the players of a stopped instance at once and ends their duel', async () => {
    const room = uniqueRoom()
    const a = await env.connect(0)
    const b = await env.connect(1)

    await a.join(room, 'Ala')
    await b.join(room, 'Bob')
    a.emit('startDuel', { roomId: room, aId: a.id, bId: b.id })
    await a.waitFor('duelStarted')
    a.clear()

    await env.servers[1]!.stop() // SIGTERM: unlike a crash, the instance cleans up after itself

    await a.waitFor('duelEnded')

    const [state] = await a.waitFor('roomState', (s) => s.players.length === 1)

    expect(state.players.map((p) => p.name)).toEqual(['Ala'])
    expect(state.duel).toBeNull()
    expect(env.servers[1]!.logs()).toContain('[shutdown] done')
    expect(env.servers[1]!.logs()).not.toContain('[socket] handler failed')
  })
})
