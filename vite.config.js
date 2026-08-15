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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: 'Hypertrophy Log',
        short_name: 'HypLog',
        description: 'Track your hypertrophy training sessions offline.',
        // Verdant light theme: --surface-canvas (#F7F8FA), same value as the
        // theme-color meta tag in index.html. Keep the two in sync — these
        // drive the PWA splash screen and the mobile browser status bar.
        theme_color: '#F7F8FA',
        background_color: '#F7F8FA',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
})
