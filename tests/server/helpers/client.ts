import { io, type Socket } from 'socket.io-client'
import { expect } from 'vitest'
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types/events.ts'
import { sleep } from './ports.ts'

type ServerEvent = keyof ServerToClientEvents
type EventArgs<K extends ServerEvent> = Parameters<ServerToClientEvents[K]>

/**
 * Socket.IO test client that records every event it receives, so tests can assert on
 * history instead of racing against timing. Call `clear()` before the action under test.
 */
export class TestClient {
  readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>
  private readonly received: Array<{ event: string; args: unknown[] }> = []
  private readonly listeners = new Set<() => void>()

  private constructor(url: string) {
    this.socket = io(url, { transports: ['websocket'], reconnection: false, forceNew: true })
    this.socket.onAny((event: string, ...args: unknown[]) => {
      this.received.push({ event, args })
      this.listeners.forEach((listener) => listener())
    })
  }

  static async connect(url: string): Promise<TestClient> {
    const client = new TestClient(url)

    await new Promise<void>((resolve, reject) => {
      client.socket.once('connect', () => resolve())
      client.socket.once('connect_error', reject)
    })

    return client
  }

  get id(): string {
    return this.socket.id!
  }

  emit<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) {
    ;(this.socket as Socket).emit(event, ...args)
  }

  /** Joins a room and waits until the server confirmed it (own id present in roomState). */
  async join(roomId: string, name?: string, timeoutMs = 3_000) {
    this.emit('joinRoom', { roomId, name })
    await this.waitFor(
      'roomState',
      (state) => state.players.some((p) => p.id === this.id),
      timeoutMs,
    )
  }

  eventsOf<K extends ServerEvent>(event: K): EventArgs<K>[] {
    return this.received.filter((r) => r.event === event).map((r) => r.args as EventArgs<K>)
  }

  lastOf<K extends ServerEvent>(event: K): EventArgs<K> | undefined {
    return this.eventsOf(event).at(-1)
  }

  clear() {
    this.received.length = 0
  }

  /** Resolves with the args of the first recorded event (past or future) matching the predicate. */
  waitFor<K extends ServerEvent>(
    event: K,
    predicate: (...args: EventArgs<K>) => boolean = () => true,
    timeoutMs = 3_000,
  ): Promise<EventArgs<K>> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const hit = this.eventsOf(event).find((args) => predicate(...args))

        if (!hit) return

        cleanup()
        resolve(hit)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timed out waiting for "${event}". Received: ${this.describeHistory()}`))
      }, timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        this.listeners.delete(check)
      }

      this.listeners.add(check)
      check()
    })
  }

  async waitForCount(event: ServerEvent, count: number, timeoutMs = 3_000) {
    const deadline = Date.now() + timeoutMs

    while (this.eventsOf(event).length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} "${event}" events, got ${this.eventsOf(event).length}. ` +
            `Received: ${this.describeHistory()}`,
        )
      }

      await sleep(10)
    }
  }

  async expectNoEvent(event: ServerEvent, waitMs = 300) {
    await sleep(waitMs)
    expect(this.eventsOf(event)).toEqual([])
  }

  disconnect() {
    this.socket.disconnect()
  }

  private describeHistory() {
    return JSON.stringify(this.received.map((r) => r.event))
  }
}
