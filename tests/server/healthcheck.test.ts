import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getFreePort } from './helpers/ports.ts'
import { startServer } from './helpers/serverProcess.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/healthcheck.mjs', import.meta.url))

/** Runs the Docker HEALTHCHECK script the way the container would: with PORT / HOST in the env. */
const healthcheck = (env: Record<string, string>) =>
  spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, timeout: 10_000 }).status

describe('scripts/healthcheck.mjs', () => {
  it('exits 0 for a healthy server, whether HOST is its address or 0.0.0.0', async () => {
    const server = await startServer()

    try {
      const PORT = new URL(server.url).port

      expect(healthcheck({ PORT, HOST: '127.0.0.1' })).toBe(0)
      // the server listens on 127.0.0.1 here, but a container with HOST=0.0.0.0 probes loopback
      expect(healthcheck({ PORT, HOST: '0.0.0.0' })).toBe(0)
      expect(healthcheck({ PORT, HOST: '' })).toBe(0)
    } finally {
      await server.stop()
    }
  })

  it('exits 1 when nothing answers', async () => {
    const PORT = String(await getFreePort())

    expect(healthcheck({ PORT, HOST: '127.0.0.1' })).toBe(1)
  })
})
