-- Views created via migration run as the migration role (which bypasses RLS),
-- so by default they'd leak all rows regardless of the querying user's RLS
-- policies. Force each view to evaluate RLS as the querying user instead.
-- (Caught by Supabase's security advisor as ERROR-level security_definer_view.)
alter view public.v_cotacoes_atuais set (security_invoker = true);
alter view public.v_contas_financeiras set (security_invoker = true);
alter view public.v_compras_fornecedor set (security_invoker = true);
alter view public.v_itens_orcamento set (security_invoker = true);
alter view public.v_etapas_cronograma set (security_invoker = true);

-- fn_apply_medicao/handle_new_user are trigger functions only, never meant to
-- be invoked directly via the REST RPC surface.
revoke execute on function public.fn_apply_medicao() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
