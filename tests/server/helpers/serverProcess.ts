import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getFreePort, sleep } from './ports.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// The ONLY coupling between the black-box tests and the server's code layout.
// Contract the server must keep: reads PORT / HOST / REDIS_URL from env, serves GET /health,
// speaks the Socket.IO events from shared/types/events.ts.
// If server/index.ts gets moved or renamed during a refactor, change just this constant.
const SERVER_ENTRY = process.env.TEST_SERVER_ENTRY ?? 'server/index.ts'

export interface RunningServer {
  url: string
  logs(): string
  /** Graceful stop (SIGTERM). */
  stop(): Promise<void>
  /** Simulates a crashed pod: SIGKILL, no 'disconnecting' handlers get a chance to run. */
  kill(): Promise<void>
}

export async function startServer(options: { redisUrl?: string } = {}): Promise<RunningServer> {
  const port = await getFreePort()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    TSX_TSCONFIG_PATH: 'tsconfig.server.json',
  }

  // Never inherit REDIS_URL from the developer's shell
  if (options.redisUrl) env.REDIS_URL = options.redisUrl
  else delete env.REDIS_URL

  // `node --import tsx` = a single process (no wrapper), so SIGKILL really kills the server
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER_ENTRY], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  let exited = false

  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  child.once('exit', () => (exited = true))

  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30_000

  for (;;) {
    if (exited) throw new Error(`Server exited during startup:\n${output}`)

    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error(`Server did not become healthy in time:\n${output}`)
    }

    try {
      const response = await fetch(`${url}/health`)

      if (response.ok) break
    } catch {
      // not listening yet
    }

    await sleep(100)
  }

  const terminate = (signal: NodeJS.Signals) =>
    new Promise<void>((resolve) => {
      if (exited) return resolve()

      child.once('exit', () => resolve())
      child.kill(signal)
    })

  return {
    url,
    logs: () => output,
    stop: async () => {
      await Promise.race([terminate('SIGTERM'), sleep(3_000)])
      await terminate('SIGKILL')
    },
    kill: () => terminate('SIGKILL'),
  }
}
