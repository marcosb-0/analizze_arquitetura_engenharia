-- Row Level Security. Every table gets RLS enabled, no exceptions.
-- Single-tenant (no org_id) — policies key purely off fn_current_role() / fn_has_projeto_access().
--
-- Access matrix:
--   admin      -> full CRUD everywhere.
--   gestao     -> full CRUD on clientes/propostas/fornecedores/projetos/orcamento/
--                 cronograma/medicoes/documentos/catalogo/funcionarios.
--                 ZERO access (not even read) to contas_financeiras/lancamentos_financeiros.
--   financeiro -> full CRUD on contas_financeiras/lancamentos_financeiros/fornecedores.
--                 READ-ONLY on projetos/itens_orcamento/funcionarios (cost context).
--   campo      -> read projetos/etapas/orcamento only for assigned projects
--                 (via projeto_equipe). Can INSERT (not update/delete) medicoes_obra
--                 and medicao_fotos for those projects. No access to clientes/
--                 propostas/fornecedores/financeiro/catalogo/funcionarios.

alter table public.profiles enable row level security;
alter table public.funcionarios enable row level security;
alter table public.clientes enable row level security;
alter table public.fornecedores enable row level security;
alter table public.propostas enable row level security;
alter table public.revisoes_proposta enable row level security;
alter table public.contas_financeiras enable row level security;
alter table public.lancamentos_financeiros enable row level security;
alter table public.catalogo_insumos enable row level security;
alter table public.catalogo_fornecedores_alternativos enable row level security;
alter table public.catalogo_historico_precos enable row level security;
alter table public.cotacoes_fornecedores enable row level security;
alter table public.projetos enable row level security;
alter table public.projeto_equipe enable row level security;
alter table public.itens_orcamento enable row level security;
alter table public.alteracoes_orcamento enable row level security;
alter table public.etapas_cronograma enable row level security;
alter table public.etapa_orcamento_vinculo enable row level security;
alter table public.medicoes_obra enable row level security;
alter table public.medicao_item_orcamento enable row level security;
alter table public.insumos_projeto enable row level security;
alter table public.documentos enable row level security;
alter table public.documento_versoes enable row level security;
alter table public.medicao_fotos enable row level security;
alter table public.notificacoes enable row level security;

-- ============================================================
-- PROFILES
-- ============================================================
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.fn_current_role() = 'admin');
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_write" on public.profiles
  for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');

-- ============================================================
-- ADMIN BLANKET POLICY (helper macro, repeated per table)
-- Every table below also gets this same "admin can do anything" policy.
-- ============================================================
create policy "admin_all_funcionarios" on public.funcionarios for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_clientes" on public.clientes for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_fornecedores" on public.fornecedores for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_propostas" on public.propostas for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_revisoes_proposta" on public.revisoes_proposta for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_contas_financeiras" on public.contas_financeiras for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_lancamentos_financeiros" on public.lancamentos_financeiros for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_catalogo_insumos" on public.catalogo_insumos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_catalogo_fornecedores_alternativos" on public.catalogo_fornecedores_alternativos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_catalogo_historico_precos" on public.catalogo_historico_precos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_cotacoes_fornecedores" on public.cotacoes_fornecedores for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_projetos" on public.projetos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_projeto_equipe" on public.projeto_equipe for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_itens_orcamento" on public.itens_orcamento for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_alteracoes_orcamento" on public.alteracoes_orcamento for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_etapas_cronograma" on public.etapas_cronograma for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_etapa_orcamento_vinculo" on public.etapa_orcamento_vinculo for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_medicoes_obra" on public.medicoes_obra for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_medicao_item_orcamento" on public.medicao_item_orcamento for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_insumos_projeto" on public.insumos_projeto for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_documentos" on public.documentos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_documento_versoes" on public.documento_versoes for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_medicao_fotos" on public.medicao_fotos for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');
create policy "admin_all_notificacoes" on public.notificacoes for all using (public.fn_current_role() = 'admin') with check (public.fn_current_role() = 'admin');

-- ============================================================
-- GESTAO — obras/propostas/orcamento/cronograma/catalogo/funcionarios/documentos.
-- No policy on contas_financeiras/lancamentos_financeiros for 'gestao' at all
-- (absence of a policy = no access, by design).
-- ============================================================
create policy "gestao_all_funcionarios" on public.funcionarios for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_clientes" on public.clientes for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_fornecedores" on public.fornecedores for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_propostas" on public.propostas for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_revisoes_proposta" on public.revisoes_proposta for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_catalogo_insumos" on public.catalogo_insumos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_catalogo_fornecedores_alternativos" on public.catalogo_fornecedores_alternativos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_catalogo_historico_precos" on public.catalogo_historico_precos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_cotacoes_fornecedores" on public.cotacoes_fornecedores for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_projetos" on public.projetos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_projeto_equipe" on public.projeto_equipe for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_itens_orcamento" on public.itens_orcamento for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_alteracoes_orcamento" on public.alteracoes_orcamento for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_etapas_cronograma" on public.etapas_cronograma for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_etapa_orcamento_vinculo" on public.etapa_orcamento_vinculo for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_medicoes_obra" on public.medicoes_obra for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_select_medicao_item_orcamento" on public.medicao_item_orcamento for select using (public.fn_current_role() = 'gestao');
create policy "gestao_all_insumos_projeto" on public.insumos_projeto for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_documentos" on public.documentos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_documento_versoes" on public.documento_versoes for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_medicao_fotos" on public.medicao_fotos for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');
create policy "gestao_all_notificacoes" on public.notificacoes for all using (public.fn_current_role() = 'gestao') with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- FINANCEIRO — full CRUD on money/fornecedores, read-only on projetos context.
-- No policy at all on cronograma/etapas/medicoes/catalogo/documentos for 'financeiro'.
-- ============================================================
create policy "financeiro_all_contas_financeiras" on public.contas_financeiras for all using (public.fn_current_role() = 'financeiro') with check (public.fn_current_role() = 'financeiro');
create policy "financeiro_all_lancamentos_financeiros" on public.lancamentos_financeiros for all using (public.fn_current_role() = 'financeiro') with check (public.fn_current_role() = 'financeiro');
create policy "financeiro_all_fornecedores" on public.fornecedores for all using (public.fn_current_role() = 'financeiro') with check (public.fn_current_role() = 'financeiro');
create policy "financeiro_select_funcionarios" on public.funcionarios for select using (public.fn_current_role() = 'financeiro');
create policy "financeiro_select_projetos" on public.projetos for select using (public.fn_current_role() = 'financeiro');
create policy "financeiro_select_itens_orcamento" on public.itens_orcamento for select using (public.fn_current_role() = 'financeiro');

-- ============================================================
-- CAMPO — read assigned projetos/etapas/orcamento; insert-only medicoes/fotos.
-- ============================================================
create policy "campo_select_projetos" on public.projetos for select using (public.fn_has_projeto_access(id));
create policy "campo_select_etapas_cronograma" on public.etapas_cronograma for select using (public.fn_has_projeto_access(projeto_id));
create policy "campo_select_itens_orcamento" on public.itens_orcamento for select using (public.fn_current_role() = 'campo' and public.fn_has_projeto_access(projeto_id));
create policy "campo_select_projeto_equipe" on public.projeto_equipe for select using (profile_id = auth.uid());

create policy "campo_insert_medicoes_obra" on public.medicoes_obra for insert
  with check (public.fn_current_role() = 'campo' and public.fn_has_projeto_access(projeto_id) and criado_por = auth.uid());
create policy "campo_select_medicoes_obra" on public.medicoes_obra for select
  using (public.fn_has_projeto_access(projeto_id));

create policy "campo_insert_medicao_fotos" on public.medicao_fotos for insert
  with check (
    public.fn_current_role() = 'campo'
    and tirada_por = auth.uid()
    and exists (
      select 1 from public.medicoes_obra m
      where m.id = medicao_id and public.fn_has_projeto_access(m.projeto_id)
    )
  );
create policy "campo_select_medicao_fotos" on public.medicao_fotos for select
  using (exists (
    select 1 from public.medicoes_obra m
    where m.id = medicao_id and public.fn_has_projeto_access(m.projeto_id)
  ));

-- ============================================================
-- STORAGE POLICIES
-- Path convention: '<projeto_id>/<filename>' for both buckets, so access
-- checks can walk from the storage object back to a projeto via fn_has_projeto_access.
-- ============================================================
create policy "documentos_bucket_admin_gestao" on storage.objects for all
  using (bucket_id = 'documentos' and public.fn_current_role() in ('admin','gestao'))
  with check (bucket_id = 'documentos' and public.fn_current_role() in ('admin','gestao'));

create policy "medicao_fotos_bucket_read" on storage.objects for select
  using (bucket_id = 'medicao-fotos' and public.fn_has_projeto_access(((storage.foldername(name))[1])::uuid));
create policy "medicao_fotos_bucket_insert_campo" on storage.objects for insert
  with check (
    bucket_id = 'medicao-fotos'
    and public.fn_current_role() = 'campo'
    and public.fn_has_projeto_access(((storage.foldername(name))[1])::uuid)
  );
create policy "medicao_fotos_bucket_admin_gestao" on storage.objects for all
  using (bucket_id = 'medicao-fotos' and public.fn_current_role() in ('admin','gestao'))
  with check (bucket_id = 'medicao-fotos' and public.fn_current_role() in ('admin','gestao'));
