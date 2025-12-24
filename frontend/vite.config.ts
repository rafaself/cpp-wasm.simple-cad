import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const env = loadEnv(mode, '.', '');
    const isTest = mode === 'test';
    const enableCrossOriginIsolation = env.VITE_ENABLE_CROSS_ORIGIN_ISOLATION === '1';
    return {
      ...(isTest ? { esbuild: false, optimizeDeps: { disabled: true } } : {}),
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: enableCrossOriginIsolation ? {
          // Preparação para SharedArrayBuffer/COOP+COEP em builds futuros
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        } : undefined
      },
      plugins: [
        react(),
        {
          name: 'wasm-mime',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url?.endsWith('.wasm')) {
                res.setHeader('Content-Type', 'application/wasm');
              }
              next();
            });
          },
        }
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'zustand'],
              'vendor-pdf': ['pdfjs-dist'],
              'vendor-utils': ['dxf-parser', 'lucide-react'],
            }
          }
        }
      }
    };
});
