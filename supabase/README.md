# Supabase — ConstruGestão Pro

## Estrutura

- `migrations/` — schema SQL, aplicado em ordem (nome com timestamp).
- `seed.sql` — dados de exemplo (portados de `src/initialData.ts`/`src/initialCatalogo.ts`), roda automaticamente em `db reset` local ou pode ser aplicado manualmente em um projeto cloud.

## Aplicar num projeto Supabase (cloud)

```bash
npx supabase login
npx supabase link --project-ref <seu-project-ref>
npx supabase db push          # aplica as migrations
psql "$(npx supabase status -o env | grep DB_URL)" -f supabase/seed.sql   # ou cole o seed.sql no SQL Editor do Studio
```

## Dev local (requer Docker)

```bash
npx supabase start
npx supabase db reset         # aplica migrations + seed.sql automaticamente
```

## Primeiro usuário admin

Depois que o schema estiver aplicado, crie o primeiro usuário `admin` com a service role key (nunca exposta no frontend):

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
ADMIN_EMAIL=voce@exemplo.com \
ADMIN_PASSWORD=escolha-uma-senha-forte \
npx tsx ../scripts/create-admin.ts
```

Usuários adicionais (gestao/financeiro/campo) podem ser criados pelo próprio app depois que houver um admin logado, ou via convite pelo Supabase Studio — o perfil (`profiles.role`) começa sempre em `campo` (menor privilégio) e precisa ser promovido explicitamente por um admin.

## Perfis de acesso

Ver a matriz completa em `migrations/20260718190006_rls_policies.sql`. Resumo: `admin` (tudo), `gestao` (obras/propostas/orçamento/cronograma, sem financeiro), `financeiro` (contas/lançamentos/fornecedores, leitura de obras), `campo` (só medições/fotos dos projetos vinculados — é o perfil do futuro app mobile).
