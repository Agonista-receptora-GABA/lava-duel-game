import type { AppSocket } from './types.ts'

// Handlers are async (Redis), so:
// 1) events from a single socket run sequentially - otherwise e.g. setCategory
//    could overtake joinRoom (each event waits for its own lock),
// 2) errors are caught here - an unhandled promise rejection kills the Node process,
//    so a transient Redis problem would restart the whole pod.
const socketQueues = new WeakMap<AppSocket, Promise<void>>()

export function enqueue(socket: AppSocket, task: () => Promise<unknown>) {
  const next = (socketQueues.get(socket) ?? Promise.resolve())
    .then(task)
    .then(() => undefined)
    .catch((error) => {
      console.error('[socket] handler failed', error)
      socket.emit('errorMsg', 'Błąd serwera')
    })

  socketQueues.set(socket, next)
}
