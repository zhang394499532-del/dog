import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.THIRD_PARTY_API_KEY': JSON.stringify(env.THIRD_PARTY_API_KEY || 'sk-QSAF0CDwfedw1CqbiO3Aqfih22K6zYfmvlPVv3ohuYbIDqNm'),
      'process.env.THIRD_PARTY_API_URL': JSON.stringify(env.THIRD_PARTY_API_URL || 'https://api.ricoxueai.cn'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
    },
  };
});
