import { loadConfig } from './config.js'
import { createGameServer } from './createGameServer.js'

const config = loadConfig()

console.log(`Starting Lava Duel Game on ${config.host}:${config.port}`)

const { httpServer } = createGameServer(config)

httpServer.listen(config.port, () => console.log(`Lava Duel Game on ${config.host}:${config.port}`))
