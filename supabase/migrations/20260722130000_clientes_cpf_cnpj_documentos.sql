-- Clientes: split the single cpf_cnpj column into dedicated cpf/cnpj columns,
-- and drop the legacy composed 'endereco' text column now that
-- logradouro/numero/bairro/cidade/cep fully replace it (the display string is
-- composed app-side, see composeEndereco()).
--
-- Also replaces the fake typed-in-by-hand 'documentos' text[] with a real
-- Storage-backed table, matching the pattern already used for obra documentos
-- (documentos/documento_versoes in 20260718190005_documentos_storage.sql).

alter table public.clientes
  add column if not exists cpf text,
  add column if not exists cnpj text;

update public.clientes
set
  cpf = case when tipo_pessoa = 'CPF' then cpf_cnpj else null end,
  cnpj = case when tipo_pessoa = 'CNPJ' then cpf_cnpj else null end;

-- Best-effort salvage of legacy free-text addresses that never got split into
-- structured parts: dump the whole string into logradouro rather than
-- silently losing it when the column is dropped below.
update public.clientes
set logradouro = endereco
where endereco is not null
  and logradouro is null and numero is null and bairro is null and cidade is null and cep is null;

alter table public.clientes
  drop column cpf_cnpj,
  drop column endereco,
  drop column documentos;

-- ============================================================
-- CLIENTE_DOCUMENTOS (real files in Supabase Storage; images or PDFs only)
-- ============================================================
create table public.cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  storage_path text not null,
  content_type text not null check (content_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'
  )),
  tamanho_bytes bigint,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cliente_documentos enable row level security;

create policy "admin_all_cliente_documentos" on public.cliente_documentos for all
  using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "gestao_all_cliente_documentos" on public.cliente_documentos for all
  using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');

insert into storage.buckets (id, name, public)
values ('cliente-documentos', 'cliente-documentos', false)
on conflict (id) do nothing;

-- Path convention: '<cliente_id>/<filename>', same as the documentos bucket.
create policy "cliente_documentos_bucket_admin_gestao" on storage.objects for all
  using (bucket_id = 'cliente-documentos' and public.fn_current_role() in ('admin','gestao'))
  with check (bucket_id = 'cliente-documentos' and public.fn_current_role() in ('admin','gestao'));
