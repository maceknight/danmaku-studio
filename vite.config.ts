import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Pinned to the config's own directory so the dev server can be launched from
// any working directory.
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => ({
  root,
  // GitHub Pages serves this project under /danmaku-studio/; the dev server
  // serves it from the origin root.
  base: command === 'build' ? '/danmaku-studio/' : '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5183 },
  build: { outDir: 'dist', emptyOutDir: true },
}))
