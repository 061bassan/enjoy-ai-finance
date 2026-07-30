import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5180,
    open: false,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Bibliotecas pesadas ficam em arquivos próprios.
         *
         * O ganho real não é o tamanho total, é o cache: o código do app muda
         * a cada ajuste, mas React e Recharts não. Separados, uma correção de
         * texto não obriga o usuário a baixar 300 kB de biblioteca de novo.
         */
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          data: ['dexie', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
