import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { listPublicCategories } from './game/catalog.js'

export function createApp({ clientDir }: { clientDir: string }) {
  const app = express()

  if (!fs.existsSync(path.join(clientDir, 'index.html'))) {
    console.warn(`[static] no frontend build in ${clientDir} - serving the API only`)
  }

  app.use(cors())
  app.use(express.static(clientDir))

  // Health check (K8s)
  app.get('/health', (_req, res) => res.status(200).json({ status: 'OK' }))
  app.get('/api/categories', (_req, res) => res.status(200).json(listPublicCategories()))

  // Client-side routes get index.html. A path with an extension is a request for a file
  // (script, image, source map) that express.static did not find: answering it with index.html and
  // 200 only hides the problem behind a confusing MIME / parse error in the browser.
  app.get('/{*splat}', (req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send('Not found')
      return
    }

    res.sendFile(path.join(clientDir, 'index.html'))
  })

  return app
}
