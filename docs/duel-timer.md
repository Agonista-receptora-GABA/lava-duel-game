# Duel Timer

This document describes the duel clock rules and the server/client implementation.
The server is authoritative: the browser displays the clock, but never decides who
has run out of time.

## Rules

- Each duelist has an independent time balance.
- A player starts with 45 seconds, or 50 seconds when their server-side
  `goldenField` flag is enabled.
- The challenger (`aId`) takes the first turn.
- Only the active player's balance decreases.
- A wrong answer does not change the turn or its deadline.
- A correct answer saves the active player's remaining balance and starts the other
  player's turn with their own remaining balance.
- `pass` keeps the same player on turn, draws another card, and subtracts an
  additional 3 seconds.
- The first player whose balance reaches zero loses.

The golden-field flag currently defaults to `false` in `addPlayer`. Its gameplay
assignment is intentionally left for a future change; clients cannot set it.

## State Model

`DuelState` stores:

- `remainingMs`: each player's saved time balance.
- `turnId`: the player whose clock is currently running.
- `turnStartedAt`: server timestamp when the active turn began.
- `turnVersion`: generation number for the current turn timer.
- `duelId`: unique identity for this duel, including across rematches.
- `serverNow`: server timestamp included in state snapshots so clients can estimate
  clock offset when rendering the countdown.

The active player's current balance is derived without writing a tick every second:

```text
current balance = remainingMs[turnId] - (server time now - turnStartedAt)
```

When a turn changes, elapsed time is deducted once and stored in `remainingMs`.
The next turn gets a new `turnStartedAt`. This keeps persistence and Socket.IO
traffic independent of the display refresh rate.

## Server Flow

1. `startDuel` initializes both balances from the players' `goldenField` flags,
   sets the challenger as `turnId`, persists the room, and schedules a timeout.
2. `answer` and `pass` execute under the room store's lock. Before applying a move,
   `server/game/duel.ts` checks whether the active deadline has already elapsed.
3. A correct answer deducts elapsed time, updates the score, changes `turnId`,
   increments `turnVersion`, persists the room, and schedules the new active turn.
4. A pass deducts elapsed time plus the 3-second penalty, keeps the same `turnId`,
   increments `turnVersion`, persists the room, and schedules the new deadline.
5. A timeout job re-reads the room under the same lock and validates both
   `duelId` and `turnVersion` before ending the duel. This makes stale jobs from an
   earlier turn or rematch harmless.

Wrong answers do not alter the deadline, so the existing timeout job remains valid.
The server-side deadline check in action handlers is still required: a timeout job
may be delayed, but a late answer must not be accepted after the deadline.

## Scheduling and Redis

When `REDIS_URL` is configured, `DuelTimeoutScheduler` uses BullMQ's
`lava-duel-timeouts` queue. A delayed job contains the room ID, duel ID, and turn
version. Any application instance can process it; room locking ensures only one
instance applies the result. Failed transient jobs use BullMQ retry/backoff.

On server startup, active duels are read from the store and their deadlines are
scheduled again. BullMQ jobs are also stored in Redis, but restoration from room
state covers a job that was missing when the process stopped. On graceful shutdown,
the scheduler is closed before the room store so an in-flight worker does not use a
closed store connection.

Without Redis, the scheduler uses local `setTimeout` timers. This supports local
single-process development and tests, but in-memory state and timers do not survive
a process restart and are not shared across multiple instances.

## Client Flow

The client receives the duel snapshot in `roomState` and `duelStarted`; turn changes
and passes carry an updated clock snapshot in `correct` and `passed`. The UI refreshes
the displayed value locally and estimates the server clock offset from `serverNow`.
No per-second Socket.IO event is sent. Reconnecting clients can rebuild the display
from `roomState`.

The client countdown is presentation only. The server decides whether a move arrived
before the deadline and emits `duelEnded` with `reason: "timeout"`, `loserId`, and
`winnerId` when time expires.

## Related Code and Tests

- `server/game/duel.ts`: duel state transitions and deadline checks.
- `server/game/duelTimeoutScheduler.ts`: BullMQ and in-memory timeout scheduling.
- `server/gameStore.ts`, `server/memoryGameStore.ts`,
  `server/redisGameStore.ts`: persistence, room locks, and active-duel restoration.
- `server/socket/handlers/`: start, answer, pass, disconnect, and category flows.
- `src/stores/game.ts` and `src/App.vue`: Socket.IO state and displayed clocks.
- `tests/server/game/duel.test.ts`: deterministic clock and turn-rule tests.
- `tests/server/game/duelTimeoutScheduler.test.ts`: in-memory scheduler test.
- `tests/server/gameplay.test.ts`: Socket.IO gameplay and Redis worker timeout test.