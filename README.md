# ConstruGestão Pro

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
- `npm run lint` — checagem de tipos (`tsc --noEmit`)
