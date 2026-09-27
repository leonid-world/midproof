import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export function createMidnightServerConfig(proofBridgeEnabled) {
  return {
    host: proofBridgeEnabled ? '127.0.0.1' : undefined,
    port: proofBridgeEnabled ? 5173 : undefined,
    strictPort: proofBridgeEnabled,
    proxy: {
      '/midnight-api': {
        target: 'http://127.0.0.1:4100',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/midnight-api/, ''),
      },
      ...(proofBridgeEnabled
        ? {
            '/midnight-proof': {
              target: 'http://127.0.0.1:4200',
              changeOrigin: false,
              rewrite: (path) => path.replace(/^\/midnight-proof/, ''),
            },
          }
        : {}),
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const proofBridgeEnabled =
    env.VITE_MIDNIGHT_DEMO_ENABLED === 'true' ||
    (env.VITE_MIDNIGHT_POC_ENABLED === 'true' && env.VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED === 'true')

  return {
    plugins: [vue(), ...(proofBridgeEnabled ? [] : [vueDevTools()])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: createMidnightServerConfig(proofBridgeEnabled),
  }
})
