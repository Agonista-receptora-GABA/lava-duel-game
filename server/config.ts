import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ServerConfig {
  port: string | number
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: env.PORT || env.SERVER_PORT || 3000,
    host: env.HOST || '0.0.0.0',
    redisUrl: env.REDIS_URL,
    corsOrigin: env.NODE_ENV === 'production' ? env.CLIENT_ORIGINS?.split(',') || '*' : true,
    clientDir: env.CLIENT_DIR ? path.resolve(env.CLIENT_DIR) : path.resolve(here, '../client'),
  }
}
