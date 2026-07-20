-- Enables the "Equipe da Obra" UI (assigning profiles to projeto_equipe, the
-- basis for the 'campo' role's RLS scoping — see fn_has_projeto_access).
--
-- 'gestao' already had full CRUD on projeto_equipe (gestao_all_projeto_equipe,
-- 20260718190006) but ZERO read access to `profiles` itself — there was no
-- policy at all for 'gestao' on that table, only admin/self. That made the
-- assignment feature unbuildable for 'gestao': they could write rows into
-- projeto_equipe but never see which profiles exist to pick from, nor resolve
-- profile_id -> name/email for already-assigned rows. Read-only, scoped to the
-- same role already trusted with full obra/cronograma/orçamento management.
create policy "gestao_select_profiles" on public.profiles
  for select using (public.fn_current_role() = 'gestao');
