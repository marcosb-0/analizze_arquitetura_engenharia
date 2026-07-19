-- Documentos, versionamento e fotos de medicao com Storage real (fix #6 —
-- fim dos metadados falsos e da mutacao direta de prop no client).

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('Contrato','Projeto Técnico','ART/RRT','Licença','Foto','Relatório','Nota Fiscal')),
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- NOTE: no versao/tamanho columns on the parent — always derived from the
-- latest row in documento_versoes (see comment below).

create table public.documento_versoes (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos(id) on delete cascade,
  versao text not null,
  storage_path text not null,
  tamanho_bytes bigint,
  descricao text,
  autor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- "Current" version of a documento = the row with max(created_at) for that documento_id.

create table public.medicao_fotos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null references public.medicoes_obra(id) on delete cascade,
  storage_path text not null,
  tirada_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('documentos', 'documentos', false),
  ('medicao-fotos', 'medicao-fotos', false)
on conflict (id) do nothing;

-- ============================================================
-- NOTIFICACOES (schema only — no producer/consumer wired into the app yet,
-- the type existed in the old prototype but was never instantiated)
-- ============================================================
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('Preco','Atraso','Orcamento','Documento','Equipe','Proposta','Sistema')),
  titulo text not null,
  mensagem text,
  prioridade text not null default 'Baixa' check (prioridade in ('Alta','Média','Baixa')),
  lida boolean not null default false,
  resolvida boolean not null default false,
  acao_tipo text,
  acao_destino text,
  acao_modal_id text,
  destinatario_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
