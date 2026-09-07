import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS is on so getUserMedia works on a phone over the LAN.
export default defineConfig({
  plugins: [basicSsl()],
  server: { https: true, host: true, port: 5180 },
  build: { target: 'es2020' },
})
