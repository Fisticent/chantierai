import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl gives the dev server a self-signed HTTPS cert: required for
// navigator.share/canShare, Notifications, MediaRecorder and PWA install
// prompts to work when testing over the LAN IP (only https:// and
// http://localhost count as "secure contexts" for those browser APIs).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
  },
})
