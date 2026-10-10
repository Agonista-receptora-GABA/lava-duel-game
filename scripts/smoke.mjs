// Smoke test of the PRODUCTION build: `npm run build && npm run smoke`.
// Starts dist/server/index.js the way the container does and checks what users and scanners see.
import { spawn } from 'node:child_process'
import net from 'node:net'

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer()

    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()

      probe.close(() => resolve(port))
    })
  })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const port = await freePort()
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['dist/server/index.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let exited = false

server.stdout.on('data', (chunk) => (output += chunk))
server.stderr.on('data', (chunk) => (output += chunk))
server.once('exit', () => (exited = true))

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`)

  if (!ok) failures.push(name)
}

try {
  const deadline = Date.now() + 20_000

  for (;;) {
    if (exited) throw new Error('server exited during startup')

    if (Date.now() > deadline) throw new Error('server did not become healthy in time')

    try {
      if ((await fetch(`${base}/health`)).ok) break
    } catch {
      // not listening yet
    }

    await sleep(100)
  }

  const get = async (path) => {
    const response = await fetch(`${base}${path}`)

    return { status: response.status, type: response.headers.get('content-type') ?? '' }
  }

  const home = await get('/')

  check('GET / serves the frontend', home.status === 200 && home.type.includes('text/html'), JSON.stringify(home))

  const route = await get('/room/abc')

  check('client-side route falls back to index.html', route.status === 200 && route.type.includes('text/html'), JSON.stringify(route))

  for (const path of ['/server/index.js', '/shared/types/events.js', '/package.json', '/missing.js']) {
    const result = await get(path)

    check(`GET ${path} is not served`, result.status === 404, JSON.stringify(result))
  }
} catch (error) {
  check('startup', false, error.message)
} finally {
  // SIGTERM must end in a clean exit (graceful shutdown), not in the safety-net timeout
  const exitCode = await new Promise((resolve) => {
    if (exited) return resolve(server.exitCode)

    server.once('exit', (code) => resolve(code))
    server.kill('SIGTERM')
    setTimeout(() => resolve('timeout'), 15_000).unref()
  })

  check('graceful shutdown on SIGTERM', exitCode === 0, `exit code: ${exitCode}`)
}

if (failures.length) {
  console.error(`\nSmoke test failed: ${failures.join(', ')}\n--- server output ---\n${output}`)
  process.exit(1)
}

console.log('\nSmoke test passed')
process.exit(0)
