import { loadConfig } from './config.js'
import { createGameServer } from './createGameServer.js'

// K8s sends SIGTERM and waits terminationGracePeriodSeconds (30 s by default) before SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 10_000

const config = loadConfig()

console.log(`Starting Lava Duel Game on ${config.host}:${config.port}`)

const { httpServer, close } = createGameServer(config)

httpServer.listen(config.port, () => console.log(`Lava Duel Game on ${config.host}:${config.port}`))

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return

  shuttingDown = true
  console.log(`[shutdown] ${signal} received, closing`)

  // Safety net: if something hangs, don't wait for K8s to SIGKILL us.
  // unref() - the timer alone must not keep the process alive after a clean shutdown.
  setTimeout(() => {
    console.error('[shutdown] timed out, forcing exit')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()

  try {
    await close()
    console.log('[shutdown] done')
  } catch (error) {
    console.error('[shutdown] failed', error)
    process.exitCode = 1
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal))
}
