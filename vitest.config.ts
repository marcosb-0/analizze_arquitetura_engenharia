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
     * Credenciais de fachada, e a razão é um acoplamento que vale registrar.
     *
     * `src/lib/supabaseClient.ts` chama `createClient` no corpo do módulo e
     * **lança** se as variáveis não existirem. Como `documentosService.ts`
     * importa esse módulo, testar `proximaVersao` — uma função pura de
     * `string → string`, que não toca rede nenhuma — exige um cliente Supabase
     * construído. Nenhuma requisição é feita: o cliente é criado e ignorado.
     *
     * O certo seria as funções puras (`proximaVersao`, `formatBytes`,
     * `recusaDoArquivo`) morarem num módulo sem I/O, e o service importar dali.
     * É refatoração de arquitetura, não de teste — fica para a Fase 3, junto com
     * a extração dos hooks. Enquanto isso, a fachada deixa o teste rodar sem
     * depender de `.env.local` nem da rede.
     */
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'chave-de-teste-nao-usada',
    },
  },
});
