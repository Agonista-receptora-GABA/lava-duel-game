import net from 'node:net'

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()

    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo

      probe.close(() => resolve(port))
    })
  })
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
