-- Custom document categories — replaces the closed 7-value CHECK constraint
-- on documentos.tipo with a real table so users can create their own
-- categories instead of being stuck with the hardcoded enum.

create table public.documento_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default 'slate' check (cor in ('rose','orange','amber','emerald','teal','sky','blue','indigo','purple','pink','slate')),
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.documento_categorias (nome, cor) values
  ('Contrato', 'rose'),
  ('Projeto Técnico', 'blue'),
  ('ART/RRT', 'purple'),
  ('Licença', 'emerald'),
  ('Foto', 'sky'),
  ('Relatório', 'slate'),
  ('Nota Fiscal', 'teal');

alter table public.documentos drop constraint documentos_tipo_check;
alter table public.documentos
  add constraint documentos_tipo_fkey foreign key (tipo)
  references public.documento_categorias(nome)
  on update cascade on delete restrict;

alter table public.documento_categorias enable row level security;

-- Same access matrix as documentos itself (see 20260718190006_rls_policies.sql):
-- only admin/gestao touch the Documentos tab.
create policy "admin_all_documento_categorias" on public.documento_categorias for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "gestao_all_documento_categorias" on public.documento_categorias for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
