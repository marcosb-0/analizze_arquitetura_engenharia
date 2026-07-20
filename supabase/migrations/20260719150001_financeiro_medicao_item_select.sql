-- Fix: the 'financeiro' role saw valor_executado = 0 on every orçamento line.
--
-- v_itens_orcamento is security_invoker (see 20260718190007), so its subquery
--   coalesce((select sum(mio.valor_aplicado) from medicao_item_orcamento mio ...), 0)
-- runs as the querying user. 'financeiro' had NO select policy on
-- medicao_item_orcamento (only admin_all + gestao_select existed), so that
-- subquery returned zero rows and the realized-cost column silently collapsed
-- to 0 — directly contradicting the role's stated purpose ("READ-ONLY on
-- itens_orcamento for cost context"). Grant the missing read.
create policy "financeiro_select_medicao_item_orcamento" on public.medicao_item_orcamento
  for select using (public.fn_current_role() = 'financeiro');
