import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import type { DuelState } from '@shared/types/events.ts'
import type { GameStore } from '../gameStore.ts'
import { expireDuelTurn } from './duel.js'
import type { AppServer } from '../socket/types.ts'
import { emitRoomState } from '../socket/emitRoomState.js'

const QUEUE_NAME = 'lava-duel-timeouts'
const JOB_NAME = 'expire-duel-turn'

interface DuelTimeoutJob {
  roomId: string
  duelId: string
  turnVersion: number
  retry: number
}

export class DuelTimeoutScheduler {
  private readonly localTimers = new Map<string, NodeJS.Timeout>()
  private readonly queue?: Queue<DuelTimeoutJob>
  private readonly worker?: Worker<DuelTimeoutJob>

  constructor(
    private readonly store: GameStore,
    private readonly io: AppServer,
    redisUrl?: string,
  ) {
    if (redisUrl) {
      const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null })
      const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null })

      this.queue = new Queue<DuelTimeoutJob>(QUEUE_NAME, { connection: queueConnection })
      this.worker = new Worker<DuelTimeoutJob>(QUEUE_NAME, async ({ data }) => this.process(data), {
        connection: workerConnection,
      })
      this.worker.on('error', (error) => console.error('[duel-timeout] worker error', error))
    }
  }

  async schedule(roomId: string, duel: DuelState, retry = 0): Promise<void> {
    const delay = Math.max(0, duel.turnStartedAt + duel.remainingMs[duel.turnId]! - Date.now())
    const data = { roomId, duelId: duel.duelId, turnVersion: duel.turnVersion, retry }

    if (this.queue) {
      await this.queue.add(JOB_NAME, data, {
        delay,
        jobId: `${encodeURIComponent(roomId)}-${duel.duelId}-${duel.turnVersion}-${retry}`,
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
      })
      return
    }

    this.clearLocal(roomId)
    const timer = setTimeout(() => void this.process(data), delay)
    timer.unref()
    this.localTimers.set(roomId, timer)
  }

  async restore(): Promise<void> {
    const activeDuels = await this.store.getActiveDuels()

    for (const { roomId, room } of activeDuels) {
      if (room.duel) await this.schedule(roomId, room.duel)
    }
  }

  async cancel(roomId: string): Promise<void> {
    this.clearLocal(roomId)
  }

  async close(): Promise<void> {
    for (const timer of this.localTimers.values()) clearTimeout(timer)
    this.localTimers.clear()

    await Promise.allSettled([this.worker?.close(), this.queue?.close()])
  }

  private clearLocal(roomId: string): void {
    const timer = this.localTimers.get(roomId)
    if (timer) clearTimeout(timer)
    this.localTimers.delete(roomId)
  }

  private async process({ roomId, duelId, turnVersion, retry }: DuelTimeoutJob): Promise<void> {
    this.clearLocal(roomId)

    await this.store.withLock(roomId, async () => {
      const room = await this.store.get(roomId)
      if (!room) return

      const outcome = expireDuelTurn(room, duelId, turnVersion)
      if (outcome.type === 'notExpired') {
        if (room.duel) await this.schedule(roomId, room.duel, retry + 1)
        return
      }
      if (outcome.type === 'ignored') return

      await this.store.set(roomId, room)
      await this.cancel(roomId)
      this.io.to(roomId).emit('duelEnded', {
        reason: 'timeout',
        loserId: outcome.loserId,
        winnerId: outcome.winnerId,
      })
      emitRoomState(this.io, roomId, room)
    })
  }
}
