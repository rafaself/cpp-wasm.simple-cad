import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          // Preparação para SharedArrayBuffer/COOP+COEP em builds futuros
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        }
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
      }
    };
});
