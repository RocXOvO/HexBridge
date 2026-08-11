import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: { input: resolve('src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: { entryFileNames: 'index.mjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: { outDir: resolve('dist'), emptyOutDir: true },
    plugins: [vue()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
})
