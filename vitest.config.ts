import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

const root = fileURLToPath(new URL('./', import.meta.url))

// vite.config.ts exports a function (it loads env), so it has to be called before merging.
export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        root,
        projects: [
          {
            // Vue components / frontend unit tests
            extends: true,
            test: {
              name: 'unit',
              environment: 'jsdom',
              include: ['src/**/*.{test,spec}.ts'],
              exclude: [...configDefaults.exclude, 'e2e/**'],
            },
          },
          {
            // Backend tests: run the real server as child processes (+ throwaway Redis)
            test: {
              name: 'server',
              root,
              environment: 'node',
              include: ['tests/server/**/*.test.ts'],
              testTimeout: 20_000,
              hookTimeout: 60_000,
            },
          },
        ],
      },
    }),
  ),
)
