-- Projetos, equipe de campo, orcamento, cronograma e medicoes.
-- This is the most complex cluster: fixes #1 (medicao->cronograma->orcamento
-- linkage) and #4 (catalogo->orcamento price drift) live here.

create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  proposta_id uuid references public.propostas(id) on delete set null,
  responsavel_interno_id uuid references public.funcionarios(id) on delete set null,
  endereco_obra text,
  data_inicio date,
  data_fim date,
  situacao text not null default 'Planejamento' check (situacao in ('Planejamento','Em Execução','Pausado','Finalizado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which profiles (users) are assigned to which projeto — the basis for the
-- 'campo' role's RLS scoping (mobile users only see their assigned obras).
create table public.projeto_equipe (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  papel text,
  created_at timestamptz not null default now(),
  unique (projeto_id, profile_id)
);

-- true for admin/gestao/financeiro always; for 'campo' only if assigned via projeto_equipe.
create or replace function public.fn_has_projeto_access(p_projeto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.fn_current_role() in ('admin','gestao','financeiro') then true
    when public.fn_current_role() = 'campo' then exists (
      select 1 from public.projeto_equipe pe
      where pe.projeto_id = p_projeto_id and pe.profile_id = auth.uid()
    )
    else false
  end;
$$;

-- ============================================================
-- ORCAMENTO
-- ============================================================
create table public.itens_orcamento (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  categoria text not null check (categoria in ('Materiais','Mão de Obra','Equipamentos','Terceiros','Deslocamentos','Administração','Contingências')),
  descricao text not null,
  valor_orcado numeric(14,2) not null default 0,
  valor_contratado numeric(14,2) not null default 0,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  catalogo_insumo_id uuid references public.catalogo_insumos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOTE: no valor_executado column — derived from medicao_item_orcamento, see v_itens_orcamento.

create table public.alteracoes_orcamento (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  data date not null default current_date,
  item text not null,
  descricao text,
  tipo text not null check (tipo in ('Aumento','Redução')),
  valor numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CRONOGRAMA
-- ============================================================
create table public.etapas_cronograma (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  nome text not null,
  data_inicio date,
  data_fim date,
  responsavel_id uuid references public.funcionarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOTE: no percentual_executado/status columns — both fully derived, see
-- v_etapas_cronograma. There is deliberately no way to edit progress directly:
-- the only path is registering a medicao (business-rule fix #1's behavior change).

-- Explicit, auditable link replacing the old ETAPA_CATEGORIA_MAP name-guessing.
-- An etapa can fund itself from multiple orcamento lines, each with a weight.
create table public.etapa_orcamento_vinculo (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.etapas_cronograma(id) on delete cascade,
  item_orcamento_id uuid not null references public.itens_orcamento(id) on delete cascade,
  peso_percentual numeric(5,2) not null check (peso_percentual > 0 and peso_percentual <= 100),
  created_at timestamptz not null default now(),
  unique (etapa_id, item_orcamento_id)
);

-- ============================================================
-- MEDICOES
-- ============================================================
create table public.medicoes_obra (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  etapa_id uuid not null references public.etapas_cronograma(id) on delete cascade,
  data_medicao date not null default current_date,
  percentual_medido numeric(5,2) not null check (percentual_medido > 0 and percentual_medido <= 100),
  observacoes text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- NOTE: no valor_medido column — the fan-out per orcamento line lives in
-- medicao_item_orcamento, populated automatically by fn_apply_medicao() below.

create table public.medicao_item_orcamento (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes_obra(id) on delete cascade,
  item_orcamento_id uuid not null references public.itens_orcamento(id) on delete cascade,
  valor_aplicado numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- Applies a new medicao across every orcamento line the etapa is linked to,
-- proportionally to each vinculo's peso_percentual. This is the real fix for
-- business-rule defect #1 (no more name-string category guessing / "first
-- matching item" arbitrariness).
create or replace function public.fn_apply_medicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.medicao_item_orcamento (medicao_id, item_orcamento_id, valor_aplicado)
  select
    new.id,
    v.item_orcamento_id,
    (new.percentual_medido / 100.0) * (v.peso_percentual / 100.0) * io.valor_orcado
  from public.etapa_orcamento_vinculo v
  join public.itens_orcamento io on io.id = v.item_orcamento_id
  where v.etapa_id = new.etapa_id;

  return new;
end;
$$;

create trigger trg_apply_medicao
  after insert on public.medicoes_obra
  for each row execute function public.fn_apply_medicao();

-- ============================================================
-- INSUMOS DO PROJETO (revives the dead InsumoProjeto type — fix #4)
-- ============================================================
create table public.insumos_projeto (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  catalogo_insumo_id uuid not null references public.catalogo_insumos(id) on delete restrict,
  item_orcamento_id uuid references public.itens_orcamento(id) on delete set null,
  quantidade numeric(14,3) not null default 0,
  preco_unitario numeric(14,2) not null default 0,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  etapa_vinculada_id uuid references public.etapas_cronograma(id) on delete set null,
  quantidade_executada numeric(14,3) not null default 0,
  status text not null default 'Orçado' check (status in ('Orçado','Contratado','Entregue','Aplicado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- DERIVED VIEWS (fixes #1 correctness + reuses the #3 "view, not stored column" pattern)
-- ============================================================

-- valor_executado is NOT clamped to valor_orcado: overruns must be visible, not hidden.
create view public.v_itens_orcamento as
select
  io.*,
  coalesce((
    select sum(mio.valor_aplicado)
    from public.medicao_item_orcamento mio
    where mio.item_orcamento_id = io.id
  ), 0) as valor_executado
from public.itens_orcamento io;

create view public.v_etapas_cronograma as
select
  e.*,
  least(100, coalesce((
    select sum(m.percentual_medido)
    from public.medicoes_obra m
    where m.etapa_id = e.id
  ), 0)) as percentual_executado,
  case
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id), 0) >= 100
      then 'Concluído'
    when e.data_fim is not null and e.data_fim < current_date
      then 'Atrasado'
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id), 0) > 0
      then 'Em Andamento'
    else 'Não Iniciado'
  end as status
from public.etapas_cronograma e;
