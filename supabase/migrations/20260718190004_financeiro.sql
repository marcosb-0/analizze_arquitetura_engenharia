-- Financeiro: single ledger for all money movement (fix #2 — Fornecedor purchase
-- history and company transactions are no longer two disconnected tables).

create table public.lancamentos_financeiros (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('Receita','Despesa')),
  descricao text not null,
  valor numeric(14,2) not null,
  data date not null default current_date,
  categoria text not null check (categoria in (
    'Salários','Fornecedores','Aluguel Escritório','Energia/Água/Internet',
    'Marketing/Vendas','Impostos/Taxas','Ferramentas/EPIs','Aporte Capital',
    'Faturamento Obra','Rendimento','Outros'
  )),
  pago boolean not null default false,
  conta_id uuid not null references public.contas_financeiras(id) on delete restrict,
  projeto_id uuid references public.projetos(id) on delete set null,
  funcionario_id uuid references public.funcionarios(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  -- YYYY-MM payroll period. Fix #7: replaces fragile description string-matching
  -- for "already paid this employee this month" checks with a real constraint.
  competencia char(7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One salary payment per employee per competencia — enforced at the DB level.
create unique index uq_salario_competencia
  on public.lancamentos_financeiros (funcionario_id, competencia)
  where categoria = 'Salários' and funcionario_id is not null and competencia is not null;

-- Fix #3: saldo_atual is always computed from saldo_inicial + paid lancamentos,
-- never a stored column the app writes to (which is how it silently drifted before).
create view public.v_contas_financeiras as
select
  c.*,
  c.saldo_inicial + coalesce((
    select sum(case when l.tipo = 'Receita' then l.valor else -l.valor end)
    from public.lancamentos_financeiros l
    where l.conta_id = c.id and l.pago
  ), 0) as saldo_atual
from public.contas_financeiras c;

-- Fix #2: a supplier's purchase history is just their financial entries, not a
-- separate ledger requiring double data entry.
create view public.v_compras_fornecedor as
select
  l.id,
  l.fornecedor_id,
  l.data,
  l.descricao as item,
  l.valor,
  l.pago,
  l.projeto_id,
  l.conta_id
from public.lancamentos_financeiros l
where l.fornecedor_id is not null;
