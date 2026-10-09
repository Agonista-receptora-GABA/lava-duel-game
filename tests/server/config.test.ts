import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../server/config.ts'

const SERVER_DIR = fileURLToPath(new URL('../../server/', import.meta.url))

describe('loadConfig: clientDir', () => {
  it('points at a "client" directory next to the server code, not at a parent of it', () => {
    const { clientDir } = loadConfig({})

    expect(path.basename(clientDir)).toBe('client')
    // express.static(clientDir) must never be able to reach the server code
    expect(path.relative(clientDir, SERVER_DIR).startsWith('..')).toBe(true)
  })

  it('can be overridden with CLIENT_DIR', () => {
    expect(loadConfig({ CLIENT_DIR: 'dist/client' }).clientDir).toBe(path.resolve('dist/client'))
  })
})
