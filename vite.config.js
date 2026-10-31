import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localApiPlugin } from './scripts/vite-api.mjs'

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private-reports/**', '**/.local/**'] },
  },
})
