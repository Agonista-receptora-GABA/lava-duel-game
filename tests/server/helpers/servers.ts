import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { TestClient } from './client.ts'
import { startServer, type RunningServer } from './serverProcess.ts'

export const uniqueRoom = () => `room-${randomUUID().slice(0, 8)}`

/**
 * Starts `pods` server processes for the surrounding describe block and disconnects
 * every client created via `connect()` after each test.
 * `connect(i)` talks to pod `i % pods`, so the same test code runs against
 * one instance and against a multi-instance setup.
 */
export function useServers(options: { pods: number; redisUrl?: string }) {
  const servers: RunningServer[] = []
  const clients: TestClient[] = []

  beforeAll(async () => {
    servers.push(
      ...(await Promise.all(
        Array.from({ length: options.pods }, () => startServer({ redisUrl: options.redisUrl })),
      )),
    )
  }, 60_000)

  afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect())
  })

  afterAll(async () => {
    await Promise.all(servers.map((server) => server.stop()))
  })

  return {
    servers,
    async connect(pod = 0) {
      const client = await TestClient.connect(servers[pod % servers.length]!.url)

      clients.push(client)
      return client
    },
  }
}
