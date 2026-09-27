import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    'import.meta.env.VITE_MIDNIGHT_DEMO_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_MIDNIGHT_POC_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED': JSON.stringify('true'),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    clearMocks: true,
    restoreMocks: true,
  },
})
