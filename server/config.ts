import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ServerConfig {
  port: string | number
  host: string
  /** When set, game state lives in Redis and Socket.IO uses the Redis adapter (multi-instance). */
  redisUrl: string | undefined
  /** Origins allowed by Socket.IO (`true` = reflect any origin, used outside production). */
  corsOrigin: string[] | string | true
  /** Directory with the built frontend (index.html + assets). */
  clientDir: string
}

// Keep this file directly in `server/`: `..` must point at the directory that holds the frontend
// both for `tsx server/index.ts` (repo root) and for `node dist/server/index.js` (dist/).
const here = path.dirname(fileURLToPath(import.meta.url))

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: env.PORT || env.SERVER_PORT || 3000,
    host: env.HOST || '0.0.0.0',
    redisUrl: env.REDIS_URL,
    corsOrigin: env.NODE_ENV === 'production' ? env.CLIENT_ORIGINS?.split(',') || '*' : true,
    clientDir: path.join(here, '../'),
  }
}
