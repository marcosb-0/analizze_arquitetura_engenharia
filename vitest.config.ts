import { defineConfig } from 'vitest/config';

/**
 * Configuração separada do `vite.config.ts` de propósito: o de build carrega o
 * plugin do React e o do Tailwind, que os testes não usam. Nada aqui monta
 * componente — os testes desta fase cobrem as funções puras de `src/lib`, que
 * são as que o banco também calcula e onde divergir custa dinheiro.
 */
export default defineConfig({
  test: {
    /**
     * Ambiente por arquivo, não global.
     *
     * A suíte de funções puras (`src/lib`, `src/services`) roda em `node` — nenhum
     * teste ali toca DOM, e trazer jsdom custaria segundos de inicialização por
     * nada. Os testes de HOOK precisam de DOM e declaram `@vitest-environment
     * jsdom` no topo do próprio arquivo.
     */
    environment: 'node',
    // `.tsx` entrou junto com os testes de hook, que renderizam componentes.
    include: ['src/**/*.test.{ts,tsx}'],

    /**
     * Credenciais de fachada — hoje uma rede de segurança, não uma necessidade.
     *
     * Até 04/ago/2026 eram obrigatórias: `src/lib/supabaseClient.ts` chama
     * `createClient` no corpo do módulo, e `documentosService.ts` o importava,
     * então testar `proximaVersao` — função pura de `string → string` — exigia um
     * cliente Supabase construído. O preço apareceu no CI: o `RealtimeClient`
     * dentro do cliente exige `WebSocket` global, que só existe a partir do Node
     * 22, e a suíte passava na máquina do desenvolvedor e quebrava no runner.
     *
     * As funções puras foram para `src/services/documentosRegras.ts`, sem I/O, e
     * nenhum teste alcança mais o cliente (o de `DadosContext` o substitui com
     * `vi.mock`). A fachada fica porque o custo é zero e porque o próximo módulo
     * a importar `supabaseClient` daria um erro de variável ausente em vez de um
     * erro sobre o que realmente estaria errado.
     */
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'chave-de-teste-nao-usada',
    },
  },
});
