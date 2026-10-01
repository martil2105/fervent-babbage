import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/fervent-babbage/', // Critical optimization for GitHub Pages subdirectory hosting
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hypertrophy Log',
        short_name: 'HypLog',
        description: 'Track your hypertrophy training sessions offline.',
        // The light canvas (--canvas in src/theme/tokens.css), same value as
        // the light theme-color meta tag in index.html. Keep them in sync —
        // these drive the PWA splash screen and the browser bar.
        theme_color: '#F1F2F4',
        background_color: '#F1F2F4',
        display: 'standalone',
        orientation: 'portrait',
        // Real PNGs at the sizes they claim. The maskable one keeps the mark
        // inside the central safe zone, so Android's circle/squircle crop
        // never clips it; "any maskable" on one file gets one of the two wrong.
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // woff2: the self-hosted Archivo font, so the app looks right offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
})
