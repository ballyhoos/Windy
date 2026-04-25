import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        base: mode === 'gh-pages' ? '/Windy/' : '/',
        plugins: [react()],
        server: {
            proxy: {
                '/bom-proxy': {
                    target: 'https://www.bom.gov.au',
                    changeOrigin: true,
                    rewrite: function (path) { return path.replace(/^\/bom-proxy/, ''); },
                },
                '/bom-api': {
                    target: 'https://api.weather.bom.gov.au',
                    changeOrigin: true,
                    rewrite: function (path) { return path.replace(/^\/bom-api/, ''); },
                },
            },
        },
    });
});
