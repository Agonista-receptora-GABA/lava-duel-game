import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.ts'

// Mimics the production layout: the frontend and the server code are siblings in dist/.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'lava-dist-'))
const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true })
  fs.writeFileSync(path.join(dist, file), content)
}

write('client/index.html', '<!doctype html><title>Lava</title>')
write('client/assets/app.js', 'console.log("client")')
write('server/index.js', 'const SECRET = "server code"')

let server: http.Server
let base: string

beforeAll(async () => {
  server = http.createServer(createApp({ clientDir: path.join(dist, 'client') }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(dist, { recursive: true, force: true })
})

describe('createApp', () => {
  it('serves the built frontend and its assets', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>Lava</title>')
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toContain('client')
  })

  it('falls back to index.html for client-side routes', async () => {
    const response = await fetch(`${base}/room/abc`)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Lava</title>')
  })

  it('answers 404 for a missing file instead of index.html (no 200 with the wrong content)', async () => {
    for (const url of ['/missing.js', '/assets/missing.css', '/favicon.ico']) {
      const response = await fetch(`${base}${url}`)

      expect({ url, status: response.status }).toEqual({ url, status: 404 })
      expect(await response.text()).not.toContain('<title>Lava</title>')
    }
  })

  it('does not expose server code that sits next to the frontend', async () => {
    for (const url of ['/server/index.js', '/client/../server/index.js']) {
      const body = await (await fetch(`${base}${url}`)).text()

      expect(body).not.toContain('SECRET')
    }
  })

  it('answers the health check', async () => {
    const response = await fetch(`${base}/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'OK' })
  })
})
