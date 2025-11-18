import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'

const rootDir = dirname(fileURLToPath(import.meta.url))
const appsDir = resolve(rootDir, 'apps')

function buildInputMap() {
  const inputs: Record<string, string> = {
    main: resolve(rootDir, 'index.html'),
  }

  if (!existsSync(appsDir)) {
    return inputs
  }

  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_')) continue

    const appIndex = resolve(appsDir, entry.name, 'index.html')
    if (existsSync(appIndex)) {
      inputs[entry.name] = appIndex
    }
  }

  return inputs
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: buildInputMap(),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
