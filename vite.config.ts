import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Pinned to the config's own directory so the dev server can be launched from
// any working directory.
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: { port: 5183 },
})
