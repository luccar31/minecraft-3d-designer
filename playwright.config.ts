import { defineConfig } from '@playwright/test'

/**
 * Un puerto por worktree. Con el puerto fijo y `reuseExistingServer`, dos
 * worktrees se testean contra el `dist` del otro y dan falsos verdes.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173)

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    launchOptions: {
      // CHROMIUM_PATH permite usar un Chromium ya instalado (CI, sandboxes).
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication',
      ],
    },
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
