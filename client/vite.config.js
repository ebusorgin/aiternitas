import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  root: './src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Optimize for low-memory servers
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: './src/index.html',
      output: {
        // Split vendor chunks to reduce memory usage during build
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-zustand': ['zustand'],
          'vendor-socket': ['socket.io-client'],
        },
      },
      // Reduce memory usage
      maxParallelFileOps: 2,
    },
    // Use fewer workers
    reportCompressedSize: false,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path,
        onError: (err, req, res) => {
          console.error('[Vite Proxy] Socket.IO error:', err.message);
        }
      },
    },
  },
  publicDir: '../public',
  // Optimize deps
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'socket.io-client'],
  },
});
