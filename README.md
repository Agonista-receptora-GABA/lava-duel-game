# lava-duel-game

A web-app game inspired by The Floor TV game show.

Uses TS, Node.js, Express, and websockets (socket.io) for game rooms.
The client is written in Vue 3 powered by Vite.

The project is a monorepo:

- backend is placed in `server` directory
- frontend is placed in `src` directory.

The shared TS types are placed in `shared/types` directory.

## Redis + horizontal scaling

This project uses Redis store for managing game rooms. It's required to make the
app work correctly when there's more than one app's instance in k8s.

### Testing locally

#### Prerequisites

You need to have `redis-server` installed on your machine.
Also don't forget hitting `nvm use` on each terminal session to ensure the
correct Node.js version (to avoid potential problems).

#### Simulation of multiple backends & clients

To check if it works locally, you'll need 5 terminals opened. Run:

- redis (`redis-server` in cmd, it'll run as a background process)
- 2 backends (use `npm run dev:server1` & `npm run dev:server2` on separated
  terminals)
- 2 clients (use `npm run dev:fe1` & `npm run dev:fe2` on separated terminals),
  then run them in 2 separate browser tabs
- 1 `redis-cli` in a separated terminal

Then join a common room on both clients, and check if those 2 players can start
a duel.
Then go to the Redis CLI and check that there's just only one common key for the
room, using `KEYS *`.
For example, if you used `pokoj-1` as the common room name, it'll be:
`1) "lava-duel:room:pokoj-1"`.

## Tests

```sh
npm test                 # everything (unit + server), once
npm run test:unit        # frontend unit tests (watch mode)
npm run test:server      # backend tests (watch mode)
npm run type-check:tests # type-check tests/ against the server code
```

The backend tests live in `tests/server` and are **black-box**: they start the real server as
child processes (`node --import tsx server/index.ts`, several of them to simulate pods) and talk to
it only through Socket.IO events and `GET /health`. Because of that they don't depend on how
`server/index.ts` is organised - the only coupling is the `SERVER_ENTRY` constant in
`tests/server/helpers/serverProcess.ts` (or `TEST_SERVER_ENTRY` env) plus the env contract
(`PORT`, `HOST`, `REDIS_URL`).

Redis for the tests comes from `TEST_REDIS_URL` if set (CI), otherwise a throwaway `redis-server`
on a random port is started. Without `redis-server` installed the Redis-dependent suites are
skipped locally (and fail in CI).

Store tests (`tests/server/gameStore.test.ts`) exercise the `GameStore` interface of both
implementations, so any new implementation can be added to the `implementations` list.
