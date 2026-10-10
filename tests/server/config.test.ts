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

describe('loadConfig: port and host', () => {
  it('uses 3000 and 0.0.0.0 by default - an empty value (Docker ARG without default) counts as unset', () => {
    expect(loadConfig({})).toMatchObject({ port: 3000, host: '0.0.0.0' })
    expect(loadConfig({ PORT: '', HOST: '' })).toMatchObject({ port: 3000, host: '0.0.0.0' })
  })

  it('reads PORT (falling back to SERVER_PORT) as a number, and HOST', () => {
    expect(loadConfig({ PORT: '8080', HOST: '127.0.0.1' })).toMatchObject({
      port: 8080,
      host: '127.0.0.1',
    })
    expect(loadConfig({ SERVER_PORT: '3001' }).port).toBe(3001)
  })

  it.each(['abc', '-1', '70000', '3000.5'])('rejects an invalid port: %s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('Invalid port')
  })
})
