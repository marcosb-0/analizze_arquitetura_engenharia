import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          /**
           * Separa as dependências grandes do código da aplicação.
           *
           * Sem isto tudo virava um chunk só de 1,5 MB. O `recharts` (~500 KB
           * com o d3) é importado por um único arquivo — a aba Financeiro, que
           * dois dos quatro papéis nem enxergam — e ficava no caminho crítico do
           * login. Em chunk próprio, só é buscado por quem abre aquela aba.
           *
           * React e Supabase ficam separados porque mudam de versão em ritmo
           * diferente do app: uma alteração de tela não invalida o cache deles.
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            // Casa por caminho, e não pelo nome do pacote: as importações reais
            // são `react/jsx-runtime` e `react-dom/client`, que a forma de
            // objeto do manualChunks não alcança — o chunk saía vazio.
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            if (id.includes('@supabase')) return 'supabase';
            if (/node_modules\/(recharts|d3-|victory|decimal\.js)/.test(id)) return 'charts';
            if (/node_modules\/(motion|framer-motion)/.test(id)) return 'motion';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
