// Docker HEALTHCHECK: exits 0 when GET /health answers 200, 1 otherwise.
// Plain Node on purpose: the production image (node:alpine) has no curl.
const port = process.env.PORT || 3000
const bound = process.env.HOST

// 0.0.0.0 / :: mean "every interface", which includes loopback.
const host = !bound || bound === '0.0.0.0' || bound === '::' ? '127.0.0.1' : bound
const origin = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`

try {
  const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2_000) })

  process.exit(response.ok ? 0 : 1)
} catch {
  process.exit(1)
}
