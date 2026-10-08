import { spawn } from 'node:child_process'
import { Redis } from 'ioredis'
import { getFreePort, sleep } from './ports.ts'

// Key layout of RedisGameStore. Used only by tests that need to peek into / tamper with Redis.
// If the store changes its keys, this is the single place to update.
export const roomKey = (roomId: string) => `lava-duel:room:${roomId}`

export interface TestRedis {
  url: string
  stop(): Promise<void>
}

async function waitForPing(url: string, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const client = new Redis(url, { lazyConnect: true, retryStrategy: () => null })

    client.on('error', () => {})

    try {
      await client.connect()
      await client.ping()
      await client.quit()
      return true
    } catch {
      client.disconnect()
      await sleep(50)
    }
  }

  return false
}

/**
 * Redis for tests:
 *  1. TEST_REDIS_URL, if set (CI uses a service container),
 *  2. otherwise a throwaway `redis-server` on a random port,
 *  3. otherwise null -> Redis-dependent suites are skipped locally (and fail in CI).
 */
export async function startRedis(): Promise<TestRedis | null> {
  const externalUrl = process.env.TEST_REDIS_URL

  if (externalUrl) {
    if (!(await waitForPing(externalUrl))) {
      throw new Error(`TEST_REDIS_URL is set but Redis is not reachable: ${externalUrl}`)
    }

    return { url: externalUrl, stop: async () => {} }
  }

  const port = await getFreePort()
  const child = spawn(
    'redis-server',
    ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  )

  const spawnFailed = new Promise<false>((resolve) => child.once('error', () => resolve(false)))
  const url = `redis://127.0.0.1:${port}`
  const ready = await Promise.race([waitForPing(url), spawnFailed])

  if (!ready) {
    child.kill()

    if (process.env.CI) {
      throw new Error('Redis is required in CI: set TEST_REDIS_URL or install redis-server')
    }

    console.warn('[tests] redis-server not found - skipping Redis-dependent suites')
    return null
  }

  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve())
        child.kill('SIGTERM')
      }),
  }
}
