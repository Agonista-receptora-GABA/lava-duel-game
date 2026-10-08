import { Redis } from 'ioredis'
import type { RoomState } from '@shared/types/events.ts'
import type { GameStore } from './gameStore.ts'

// a room with players lives 6 h after the last action, an empty one (e.g. page refresh) - 10 min
const ROOM_TTL_SECONDS = 6 * 60 * 60
const EMPTY_ROOM_TTL_SECONDS = 10 * 60
const LOCK_TTL_MS = 10_000
const LOCK_RETRIES = 100
const LOCK_RETRY_DELAY_MS = 50

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`

function serializeRoom(room: RoomState) {
  return JSON.stringify({
    ...room,
    players: Array.from(room.players.entries()),
    used: Array.from(room.used.values()),
  })
}

function deserializeRoom(value: string): RoomState {
  const parsed = JSON.parse(value)

  return {
    ...parsed,
    players: new Map(parsed.players),
    used: new Set(parsed.used),
  }
}

export class RedisGameStore implements GameStore {
  private readonly redis: Redis

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    })

    this.redis.on('error', (error) => {
      console.error('[redis] connection error', error)
    })
  }

  private roomKey(roomId: string) {
    return `lava-duel:room:${roomId}`
  }

  private lockKey(roomId: string) {
    return `lava-duel:lock:${roomId}`
  }

  async get(roomId: string): Promise<RoomState | null> {
    const value = await this.redis.get(this.roomKey(roomId))
    return value ? deserializeRoom(value) : null
  }

  async set(roomId: string, room: RoomState): Promise<void> {
    await this.redis.set(
      this.roomKey(roomId),
      serializeRoom(room),
      'EX',
      room.players.size > 0 ? ROOM_TTL_SECONDS : EMPTY_ROOM_TTL_SECONDS,
    )
  }

  async delete(roomId: string): Promise<void> {
    await this.redis.del(this.roomKey(roomId))
  }

  async withLock<T>(roomId: string, callback: () => Promise<T>): Promise<T> {
    const key = this.lockKey(roomId)
    const token = `${process.pid}:${Math.random().toString(36).slice(2)}`

    for (let attempt = 0; attempt < LOCK_RETRIES; attempt++) {
      const acquired = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')

      if (acquired === 'OK') {
        try {
          return await callback()
        } finally {
          await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS))
    }

    throw new Error(`Could not acquire Redis lock for room "${roomId}"`)
  }
}
