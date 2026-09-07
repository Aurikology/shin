import { defineConfig } from 'vite'

// Plain HTTP for laptop testing. localhost counts as a secure context, so the camera still
// works there. Phones need the HTTPS config (npm run dev).
export default defineConfig({
  server: { host: true, port: 5181 },
  build: { target: 'es2020' },
})
