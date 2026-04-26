import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: mode === 'gh-pages' ? '/Windy/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/bom-api': {
        target: 'https://api.weather.bom.gov.au',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bom-api/, ''),
      },
    },
  },
}));
