import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['fflate', 'qrcode'],
        },
      },
    },
  },
  server: {
    strictPort: true,
  },
});
