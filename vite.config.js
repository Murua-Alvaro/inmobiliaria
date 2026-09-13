import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@huggingface/transformers': fileURLToPath(new URL('./src/hfTransformersProxy.js', import.meta.url)),
    },
  },
})
