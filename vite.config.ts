import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), vueDevTools()],
    build: {
      // Keep in sync with `clientDir` in server/config.ts. The frontend must live in its own
      // directory: `tsc` writes the server to dist/server, and express.static serves clientDir.
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_SOCKET_URL ?? 'http://localhost:3000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: env.VITE_SOCKET_URL ?? 'http://localhost:3000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
