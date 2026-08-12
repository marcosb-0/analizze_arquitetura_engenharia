# Supabase — ConstruGestão Pro

## Estrutura

- `migrations/` — schema SQL, aplicado em ordem (nome com timestamp).
- `seed.sql` — dados de exemplo (portados de `src/initialData.ts`/`src/initialCatalogo.ts`), roda automaticamente em `db reset` local ou pode ser aplicado manualmente em um projeto cloud.

## Depois de aplicar uma migration por MCP: renomeie o arquivo

**Este passo não é opcional, e esquecê-lo já custou uma reconciliação de 70 arquivos.**

`apply_migration` (MCP) carimba a versão **no momento da aplicação**, não a versão que está no
nome do arquivo. Aplicar `20260817100000_indices_fk_filtro.sql` por MCP grava no histórico
algo como `20260811230209` — e a partir daí o arquivo local passa a ser, para o
`supabase db push`, uma migration **nunca aplicada**. Ele a reexecutaria contra a produção.

Foi assim que 70 dos 104 arquivos saíram do lugar (ver o 8º lote em
`docs/auditoria-360.md`). Reconciliado em 12/ago/2026; para não voltar:

```bash
# 1. aplique por MCP como de costume
# 2. veja com que versão o banco registrou
#    (list_migrations, ou:)
#    select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
# 3. renomeie o arquivo local para essa versão
git mv supabase/migrations/20260817100000_indices_fk_filtro.sql \
       supabase/migrations/20260811230209_indices_fk_filtro.sql
```

Passe em `name` só o nome, **sem o timestamp** — três migrations ficaram gravadas com o nome
do arquivo inteiro (`20260817100000_revoke_numeracao_execute`) porque o caminho completo foi
usado ali.

Para conferir a qualquer momento se repo e banco estão casados:

```bash
# lista os arquivos que o `db push` reexecutaria — o certo é vir vazio
comm -23 <(ls supabase/migrations/*.sql | xargs -n1 basename | cut -c1-14 | sort) \
         <(psql "$DB_URL" -Atc "select version from supabase_migrations.schema_migrations" | sort)
```

**Toda migration precisa ser idempotente** (`create table if not exists`, `add column if not
exists`, `drop policy if exists` antes de `create policy`), porque o custo de errar o passo
acima é reexecutar o arquivo — e aí a diferença é entre um no-op e um `db push` que morre no
meio.

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
