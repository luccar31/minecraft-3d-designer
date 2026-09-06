import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE permite servir la app desde un subpath (GitHub Pages);
// en S3 + CloudFront queda en la raíz.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    // three.js pesa ~830 kB y es irreducible; el umbral está apenas por encima
    // para que el chunk de la app sí avise si empieza a crecer de más.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // El grueso del peso es three.js y su capa declarativa: sacarlo a un
        // chunk propio deja que el navegador lo cachee entre deploys, porque
        // cambia mucho menos seguido que el código de la app.
        // A propósito grueso: partir fino acá es lo que produce errores de
        // orden de inicialización entre chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](three|@react-three)[\\/]/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
