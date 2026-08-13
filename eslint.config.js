import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Lint do projeto — introduzido na Fase 1 da auditoria de 29/jul/2026.
 *
 * Antes disto não havia ESLint algum. O detalhe que importa: existiam **30**
 * comentários `// eslint-disable-next-line react-hooks/exhaustive-deps`
 * espalhados pelos hooks, todos inertes — não desabilitavam nada, porque não
 * havia regra nenhuma rodando. Eram documentação involuntária de onde o autor
 * sabia estar contornando algo.
 *
 * Com o lint ligado, esses 30 pontos passam a significar algo de verdade. Vale
 * revisar cada um em vez de mantê-los por inércia: boa parte existe por causa do
 * `FeedbackContext` recriar `toast` em cada render (§4.3 da auditoria) — incluir
 * `toast` nas dependências causaria laço infinito. Ou seja, a supressão é sintoma
 * de um bug de arquitetura, não de uma regra chata. Quando o §4.3 for corrigido
 * (Fase 3), a maioria pode simplesmente sair.
 */
export default tseslint.config(
  // `.claude` e `.github` carregam scripts de tooling de agente (skills, hooks)
  // que não são código da aplicação e têm ambiente próprio (Node puro).
  { ignores: ['dist', 'node_modules', 'supabase/.temp', 'data', '.claude', '.github'] },

  js.configs.recommended,

  // `recommended` e não `recommendedTypeChecked`: a versão com tipos exige um
  // programa TypeScript completo por arquivo e multiplica o tempo de execução.
  // A checagem de tipos já é feita por `tsc --noEmit` em `npm run typecheck`,
  // com `strict` ligado — não há ganho em pagar duas vezes pela mesma análise.
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // `catch (err: any)` é o padrão em ~40 handlers, porque o erro do
      // supabase-js chega como `PostgrestError | Error` e o código lê `.message`
      // e `.code`. Trocar isso por `unknown` + narrowing em todos eles é uma
      // limpeza legítima, mas é tarefa própria — não um efeito colateral de
      // ligar o lint. Fica como aviso para não sumir do radar.
      '@typescript-eslint/no-explicit-any': 'warn',

      // O `tsconfig` já reprova variável não usada com `noUnusedLocals`, que é
      // mais confiável. A regra do ESLint aqui só duplicaria o erro.
      '@typescript-eslint/no-unused-vars': 'off',

      /**
       * `set-state-in-effect` como AVISO, não erro — e isto é uma decisão, não
       * uma conveniência.
       *
       * A regra (nova no eslint-plugin-react-hooks 7, da linhagem do React
       * Compiler) acusa 35 pontos, e os 35 são a mesma coisa: os 20 hooks de
       * dados fazem
       *
       *     useEffect(() => { setLoading(true); service.list().then(setDados) }, [...])
       *
       * que é o padrão de busca de dados em `useEffect` deste app inteiro. A
       * regra está certa no princípio — efeito que chama setState causa um
       * segundo render e, em cascata, os problemas que o §4.3 da auditoria
       * descreve. Só que a correção que ela pede não é local: é adotar uma
       * biblioteca de dados (TanStack Query ou equivalente), que é justamente a
       * recomendação da Fase 3 e resolve de uma vez o cache, a invalidação e o
       * cancelamento (§1.3, §3.7).
       *
       * Deixar como erro tornaria `npm run lint` vermelho por 35 ocorrências de
       * dívida conhecida e já planejada — e um lint que ninguém consegue zerar é
       * um lint que todo mundo aprende a ignorar. Como aviso, ele conta a dívida
       * sem bloquear o CI. Quando a Fase 3 chegar, isto volta a ser 'error'.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // Arquivos de configuração e scripts rodam em Node.
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
