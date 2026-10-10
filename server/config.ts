import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ServerConfig {
  port: number
  host: string
  /** When set, game state lives in Redis and Socket.IO uses the Redis adapter (multi-instance). */
  redisUrl: string | undefined
  /** Origins allowed by Socket.IO (`true` = reflect any origin, used outside production). */
  corsOrigin: string[] | string | true
  /**
   * Directory with the built frontend (index.html + assets) - the ONLY thing express.static serves.
   * It must not contain the server code (dist/server/*.js) or shared/.
   */
  clientDir: string
}

// Keep this file directly in `server/`: for `node dist/server/index.js` the default
// `../client` is dist/client (output of `vite build`, see vite.config.ts).
// With `tsx server/index.ts` it points at a directory that does not exist - the dev frontend is
// served by Vite; set CLIENT_DIR=dist/client to serve a production build from tsx.
const here = path.dirname(fileURLToPath(import.meta.url))

/** PORT / SERVER_PORT from the environment; a typo must fail at startup, not as a vague listen() error. */
function parsePort(raw: string | undefined): number {
  if (!raw) return 3000

  const port = Number(raw)

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: "${raw}"`)
  }

  return port
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env.PORT || env.SERVER_PORT),
    host: env.HOST || '0.0.0.0',
    redisUrl: env.REDIS_URL,
    corsOrigin: env.NODE_ENV === 'production' ? env.CLIENT_ORIGINS?.split(',') || '*' : true,
    clientDir: env.CLIENT_DIR ? path.resolve(env.CLIENT_DIR) : path.resolve(here, '../client'),
  }
}
