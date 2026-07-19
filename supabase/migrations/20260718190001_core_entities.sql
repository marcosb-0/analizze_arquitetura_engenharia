-- Core standalone entities: funcionarios, clientes, fornecedores, propostas,
-- contas_financeiras, catalogo de insumos. No dependency on auth/projetos.

create extension if not exists pgcrypto;

-- ============================================================
-- FUNCIONARIOS
-- ============================================================
create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text not null,
  cpf text,
  telefone text,
  email text,
  data_admissao date,
  status text not null default 'Ativo' check (status in ('Ativo','Inativo')),
  observacoes text,
  salario_base numeric(14,2),
  documentos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTES
-- ============================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  email text,
  endereco text,
  responsavel text,
  observacoes text,
  documentos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FORNECEDORES
-- ============================================================
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  cnpj text,
  contato text,
  telefone text,
  email text,
  categoria text not null check (categoria in ('Material','Mão de Obra','Equipamentos','Serviços Terceirizados')),
  avaliacao smallint check (avaliacao between 1 and 5),
  documentos text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOTE: no historico_compras table here on purpose (business-rule fix #2).
-- Purchase history is a view over lancamentos_financeiros — see financeiro migration.

-- ============================================================
-- PROPOSTAS + REVISOES
-- ============================================================
create table public.propostas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  descricao text not null,
  valor_estimado numeric(14,2) not null default 0,
  prazo_execucao text,
  data_validade date,
  status text not null default 'Elaboração' check (status in ('Elaboração','Enviada','Aprovada','Rejeitada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.revisoes_proposta (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  versao int not null,
  data date not null default current_date,
  valor numeric(14,2) not null,
  alteracoes text,
  created_at timestamptz not null default now(),
  unique (proposta_id, versao)
);

-- ============================================================
-- CONTAS FINANCEIRAS
-- ============================================================
create table public.contas_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banco text,
  tipo text not null check (tipo in ('Corrente','Poupança','Caixa Interno')),
  saldo_inicial numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOTE: no saldo_atual column (business-rule fix #3) — see v_contas_financeiras view.

-- ============================================================
-- CATALOGO DE INSUMOS
-- ============================================================
create table public.catalogo_insumos (
  id uuid primary key default gen_random_uuid(),
  codigo_sinapi text,
  descricao text not null,
  unidade text not null,
  preco_referencia numeric(14,2) not null default 0,
  categoria text not null check (categoria in ('Material','Mão de Obra','Equipamento','Serviço','Taxa')),
  tipo text not null check (tipo in ('SINAPI','Proprio')),
  fornecedor_padrao_id uuid references public.fornecedores(id) on delete set null,
  composicao text,
  aplicacao text,
  ativo boolean not null default true,
  data_atualizacao_preco date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalogo_fornecedores_alternativos (
  catalogo_id uuid not null references public.catalogo_insumos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  primary key (catalogo_id, fornecedor_id)
);

-- Insert-only price history (fed by manual entry, SINAPI import, or a bind-price divergence).
create table public.catalogo_historico_precos (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogo_insumos(id) on delete cascade,
  data date not null default current_date,
  preco numeric(14,2) not null,
  fonte text not null check (fonte in ('SINAPI','Fornecedor','Manual')),
  created_at timestamptz not null default now()
);

-- Insert-only supplier quotes (business-rule fix #5 — never overwritten).
create table public.cotacoes_fornecedores (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.catalogo_insumos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  preco_unitario numeric(14,2) not null,
  data_cotacao date not null default current_date,
  prazo_entrega_dias int,
  observacao text,
  created_at timestamptz not null default now()
);

-- "Current" quote per supplier/item = most recent row. Full history stays in the table above.
create view public.v_cotacoes_atuais as
select distinct on (catalogo_id, fornecedor_id) *
from public.cotacoes_fornecedores
order by catalogo_id, fornecedor_id, data_cotacao desc, created_at desc;
