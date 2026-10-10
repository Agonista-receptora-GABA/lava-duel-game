import { describe, expect, it } from 'vitest'
import { startServer } from './helpers/serverProcess.ts'

// The whole 127.0.0.0/8 range is loopback on Linux, so 127.0.0.2 and 127.0.0.1 are two different
// addresses of the same machine - a server bound to one must not answer on the other.
// (macOS only configures 127.0.0.1 by default.)
describe.skipIf(process.platform === 'darwin')('HOST', () => {
  it('makes the server listen on that address only', async () => {
    const server = await startServer({ host: '127.0.0.2' })

    try {
      const { port } = new URL(server.url)

      expect((await fetch(`http://127.0.0.2:${port}/health`)).ok).toBe(true)
      await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow()
    } finally {
      await server.stop()
    }
  })
})
