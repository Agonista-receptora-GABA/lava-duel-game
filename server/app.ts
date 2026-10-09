import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'

export function createApp({ clientDir }: { clientDir: string }) {
  const app = express()

  if (!fs.existsSync(path.join(clientDir, 'index.html'))) {
    console.warn(`[static] no frontend build in ${clientDir} - serving the API only`)
  }

  app.use(cors())
  app.use(express.static(clientDir))

  // Health check (K8s)
  app.get('/health', (_req, res) => res.status(200).json({ status: 'OK' }))

  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))

  return app
}
