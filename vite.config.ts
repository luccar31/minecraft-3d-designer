import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE permite servir la app desde un subpath (GitHub Pages);
// en S3 + CloudFront queda en la raíz.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1400 },
})
