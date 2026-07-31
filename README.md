# Analizze — Gestão de Obras

Sistema de gestão para construtoras: propostas, clientes, fornecedores, projetos/obras, orçamento, cronograma, medições de obra, equipe, documentos e catálogo de insumos (SINAPI). Backend em Supabase (Postgres + Auth + Storage), com um app mobile (React Native/Expo) futuro para medição de obras em campo.

## Rodando localmente

**Pré-requisitos:** Node.js 20+, uma conta/projeto Supabase.

1. Instale as dependências:
   `npm install`
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Supabase Dashboard > Project Settings > API).
3. Rode as migrações e o seed contra o projeto Supabase (`supabase/migrations/`, `supabase/seed.sql`) — veja `supabase/README.md`.
4. Rode o app:
   `npm run dev`

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run verify` — **rode isto antes de um push**: tipos + lint + testes (é o que o CI roda)
- `npm run typecheck` — `tsc --noEmit` com `strict`
- `npm run lint` — ESLint
- `npm run test` — Vitest (`npm run test:watch` para o modo interativo)

> `npm run lint` era `tsc --noEmit` e passou a ser o ESLint de verdade; a checagem
> de tipos virou `npm run typecheck`. As duas rodam juntas em `npm run verify`.

## Testes

`npm run test` cobre as funções puras de `src/lib` — as que o banco também
calcula, e onde divergir custa dinheiro. O caso central é `src/lib/preco.test.ts`,
que compara `precoUnitarioGerado` com valores produzidos pelo **próprio Postgres**
a partir da expressão real da coluna `preco_unitario` (que é `GENERATED` em
`insumos_projeto` e `itens_proposta`). Foi esse teste que revelou que o
arredondamento do cliente divergia do banco em `8.165` — ver
`docs/auditoria-completa.md`.

Permissão por papel tem suíte própria, em SQL, porque depende do banco:

```
psql "$DATABASE_URL" -f supabase/tests/papeis.sql
```

Ela roda numa transação revertida e não grava nada. Rode-a sempre que mexer em RLS
ou em função `SECURITY DEFINER`.
