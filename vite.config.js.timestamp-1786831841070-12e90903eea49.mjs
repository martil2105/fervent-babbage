// vite.config.js
import { defineConfig } from "file:///sessions/rcw-01fw8enphx5apnxytof7umkz/mnt/fervent-babbage/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/rcw-01fw8enphx5apnxytof7umkz/mnt/fervent-babbage/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/rcw-01fw8enphx5apnxytof7umkz/mnt/fervent-babbage/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  base: "/fervent-babbage/",
  // Critical optimization for GitHub Pages subdirectory hosting
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "icons.svg"],
      manifest: {
        name: "Hypertrophy Log",
        short_name: "HypLog",
        description: "Track your hypertrophy training sessions offline.",
        // Verdant light theme: --surface-canvas (#F7F8FA), same value as the
        // theme-color meta tag in index.html. Keep the two in sync — these
        // drive the PWA splash screen and the mobile browser status bar.
        theme_color: "#F7F8FA",
        background_color: "#F7F8FA",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"]
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvcmN3LTAxZnc4ZW5waHg1YXBueHl0b2Y3dW1rei9tbnQvZmVydmVudC1iYWJiYWdlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvcmN3LTAxZnc4ZW5waHg1YXBueHl0b2Y3dW1rei9tbnQvZmVydmVudC1iYWJiYWdlL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9yY3ctMDFmdzhlbnBoeDVhcG54eXRvZjd1bWt6L21udC9mZXJ2ZW50LWJhYmJhZ2Uvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSdcblxuLy8gaHR0cHM6Ly92aXRlLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBiYXNlOiAnL2ZlcnZlbnQtYmFiYmFnZS8nLCAvLyBDcml0aWNhbCBvcHRpbWl6YXRpb24gZm9yIEdpdEh1YiBQYWdlcyBzdWJkaXJlY3RvcnkgaG9zdGluZ1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLnN2ZycsICdhcHBsZS10b3VjaC1pY29uLnBuZycsICdpY29ucy5zdmcnXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdIeXBlcnRyb3BoeSBMb2cnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnSHlwTG9nJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdUcmFjayB5b3VyIGh5cGVydHJvcGh5IHRyYWluaW5nIHNlc3Npb25zIG9mZmxpbmUuJyxcbiAgICAgICAgLy8gVmVyZGFudCBsaWdodCB0aGVtZTogLS1zdXJmYWNlLWNhbnZhcyAoI0Y3RjhGQSksIHNhbWUgdmFsdWUgYXMgdGhlXG4gICAgICAgIC8vIHRoZW1lLWNvbG9yIG1ldGEgdGFnIGluIGluZGV4Lmh0bWwuIEtlZXAgdGhlIHR3byBpbiBzeW5jIFx1MjAxNCB0aGVzZVxuICAgICAgICAvLyBkcml2ZSB0aGUgUFdBIHNwbGFzaCBzY3JlZW4gYW5kIHRoZSBtb2JpbGUgYnJvd3NlciBzdGF0dXMgYmFyLlxuICAgICAgICB0aGVtZV9jb2xvcjogJyNGN0Y4RkEnLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI0Y3RjhGQScsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgb3JpZW50YXRpb246ICdwb3J0cmFpdCcsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnaWNvbi0xOTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnMTkyeDE5MicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnaWNvbi01MTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJyxcbiAgICAgICAgICAgIHB1cnBvc2U6ICdhbnkgbWFza2FibGUnXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxzdmd9J11cbiAgICAgIH1cbiAgICB9KVxuICBdXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFnVyxTQUFTLG9CQUFvQjtBQUM3WCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBR3hCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGVBQWUsd0JBQXdCLFdBQVc7QUFBQSxNQUNsRSxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFJYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsUUFDYixPQUFPO0FBQUEsVUFDTDtBQUFBLFlBQ0UsS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFVBQ1I7QUFBQSxVQUNBO0FBQUEsWUFDRSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDWDtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUCxjQUFjLENBQUMsZ0NBQWdDO0FBQUEsTUFDakQ7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
