-- ============================================================
-- FINANCEIRO — índices, updated_at honesto e formato de competência
-- ============================================================
-- As duas tabelas financeiras nasceram em 20260718190004 e nunca foram
-- revisitadas do ponto de vista de infraestrutura. Três lacunas, todas
-- inofensivas no volume atual (unidades de linhas) e todas caras depois:
--
-- 1. NENHUM ÍNDICE além da PK. As três FKs (conta_id, projeto_id,
--    fornecedor_id) aparecem nos advisors do Supabase como
--    `unindexed_foreign_keys`, e `data` — a coluna pela qual o razão é sempre
--    ordenado — também não tinha. Sem índice em FK, todo `delete` no lado pai
--    varre a tabela filha inteira para checar a restrição.
--
-- 2. `updated_at` MENTIA. As duas tabelas têm a coluna com `default now()` e
--    nenhum gatilho — na prática `updated_at = created_at` para sempre. É o
--    mesmo problema que `fn_set_updated_at()` (20260723120000) resolveu para
--    catalogo_insumos, insumos_projeto, itens_proposta e empresa_config; o
--    financeiro ficou de fora daquela série.
--
-- 3. `competencia char(7)` SEM CHECK. O formato YYYY-MM era garantido só pelo
--    cliente (`trData.slice(0,7)` em EmpresaTab). O banco aceitava 'abcdefg'.
--    A coluna sustenta `uq_salario_competencia` e a checagem de "já pago" da
--    Folha: um valor fora do formato quebra os dois em silêncio.
--
-- Nada aqui altera dado existente. Verificado antes de aplicar: as únicas
-- competências gravadas são NULL (5 linhas) e '2026-07' (1 linha), ambas
-- conformes ao check.

-- ============================================================
-- 1. Índices
-- ============================================================
create index if not exists lancamentos_financeiros_conta_idx
  on public.lancamentos_financeiros (conta_id);

create index if not exists lancamentos_financeiros_projeto_idx
  on public.lancamentos_financeiros (projeto_id);

create index if not exists lancamentos_financeiros_fornecedor_idx
  on public.lancamentos_financeiros (fornecedor_id);

-- `data desc` espelha a ordenação da listagem (financeiroService.listLancamentos
-- ordena por data decrescente); um índice ascendente serviria, mas o descendente
-- evita o passo de sort reverso quando a tabela crescer.
create index if not exists lancamentos_financeiros_data_idx
  on public.lancamentos_financeiros (data desc);

-- ============================================================
-- 2. updated_at deixa de mentir
-- ============================================================
drop trigger if exists trg_lancamentos_financeiros_updated_at on public.lancamentos_financeiros;
create trigger trg_lancamentos_financeiros_updated_at
  before update on public.lancamentos_financeiros
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_contas_financeiras_updated_at on public.contas_financeiras;
create trigger trg_contas_financeiras_updated_at
  before update on public.contas_financeiras
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- 3. Formato da competência
-- ============================================================
-- NULL continua válido: só lançamento de salário tem competência.
alter table public.lancamentos_financeiros
  drop constraint if exists lancamentos_financeiros_competencia_formato;

alter table public.lancamentos_financeiros
  add constraint lancamentos_financeiros_competencia_formato
  check (competencia is null or competencia ~ '^\d{4}-(0[1-9]|1[0-2])$');
