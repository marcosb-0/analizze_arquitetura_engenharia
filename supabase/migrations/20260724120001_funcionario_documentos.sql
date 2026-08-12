-- Funcionarios: troca o 'documentos' text[] (nomes digitados à mão, sem
-- arquivo por trás) por uma tabela real apoiada em Storage, no mesmo padrão de
-- cliente_documentos (20260722130000_clientes_cpf_cnpj_documentos.sql).
--
-- Diferença em relação a clientes: aqui existe 'validade'. ASO e treinamentos
-- de NR vencem, e obra com documentação vencida é passivo trabalhista — a
-- ficha precisa conseguir avisar.

-- Salvamento best-effort: os nomes legados não têm arquivo correspondente e
-- seriam perdidos no drop; ficam registrados nas observações da ficha.
update public.funcionarios
set observacoes = trim(both e'\n' from
      coalesce(observacoes, '') || e'\n[Documentos declarados antes do upload de arquivos: '
      || array_to_string(documentos, ', ') || ']')
where documentos <> '{}';

alter table public.funcionarios drop column documentos;

-- ============================================================
-- FUNCIONARIO_DOCUMENTOS (arquivos reais em Storage; imagens ou PDFs)
-- ============================================================
create table if not exists public.funcionario_documentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  nome text not null,
  storage_path text not null,
  content_type text not null check (content_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'
  )),
  tamanho_bytes bigint,
  validade date,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists funcionario_documentos_funcionario_idx
  on public.funcionario_documentos (funcionario_id, validade);

comment on column public.funcionario_documentos.validade is
  'Vencimento do documento (ASO, NR). Nulo = documento sem validade, como contrato ou RG.';

alter table public.funcionario_documentos enable row level security;

-- Mesma matriz de funcionarios: admin e gestao administram o RH; financeiro
-- só enxerga funcionarios para contexto de custo e não precisa dos anexos.
drop policy if exists "admin_all_funcionario_documentos" on public.funcionario_documentos;
create policy "admin_all_funcionario_documentos" on public.funcionario_documentos for all
  using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
drop policy if exists "gestao_all_funcionario_documentos" on public.funcionario_documentos;
create policy "gestao_all_funcionario_documentos" on public.funcionario_documentos for all
  using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');

insert into storage.buckets (id, name, public)
values ('funcionario-documentos', 'funcionario-documentos', false)
on conflict (id) do nothing;

-- Convenção de path: '<funcionario_id>/<timestamp>_<filename>'.
drop policy if exists "funcionario_documentos_bucket_admin_gestao" on storage.objects;
create policy "funcionario_documentos_bucket_admin_gestao" on storage.objects for all
  using (bucket_id = 'funcionario-documentos' and public.fn_current_role() in ('admin','gestao'))
  with check (bucket_id = 'funcionario-documentos' and public.fn_current_role() in ('admin','gestao'));
