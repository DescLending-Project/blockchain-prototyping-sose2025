import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import comlink from 'vite-plugin-comlink';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    comlink(),
    viteStaticCopy({
      targets: [
        {
          src: [
            'node_modules/tlsn-js/build/tlsn_wasm_bg.wasm',
            'node_modules/tlsn-js/build/b4ada544dc99416bb598.wasm',
          ],
          dest: 'tlsn',
        },
      ],
    }),

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
    },
  ],
  server: {
    port: 8080,
    host: 'localhost',
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    port: 8080,
    host: 'localhost',
  },
});
