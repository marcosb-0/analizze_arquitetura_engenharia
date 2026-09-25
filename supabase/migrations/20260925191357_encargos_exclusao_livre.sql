-- ============================================================
-- ENCARGOS: toda rubrica pode ser excluída por admin/gestão
-- ============================================================
-- 20260925190058 liberou a exclusão da rubrica estrutural, mas barrou os
-- operandos das fórmulas (A1, A8, B4, C1, C2) e o grupo D. O usuário pediu,
-- no mesmo dia, que todas pudessem sair.
--
-- Por que agora é seguro, e antes não era:
--
-- * OPERANDO EXCLUÍDO VALE 0. A mesma migration fez `fn_encargos_totais` tratar
--   operando ausente como 0 (o `coalesce(max(...) filter (...), 0)` não
--   distingue desativado de inexistente). O total não vira nulo e o guarda
--   `fn_valida_encargos_rubrica` não dispara. E é RECUPERÁVEL: rubrica própria
--   com o mesmo código ('A1') é aceita por `encargos_personalizadas_validas`, e
--   as fórmulas leem o operando pelo CÓDIGO — a recriada volta a ser operando.
--
-- * LINHA DO D EXCLUÍDA SOMA 0. `derivadas` sobre `linhas_d` vazia devolve
--   `coalesce(sum(...), 0)` — a mesma conta de desativar o D1/D2. É a única
--   exclusão SEM volta pela tela: rubrica própria não entra no D (`grupo <> 'D'`
--   no mesmo CHECK), porque o D exige fórmula e fórmula é conjunto fechado. A
--   tela diz isso na confirmação.
drop policy if exists "admin_gestao_delete_encargos_rubricas" on public.encargos_rubricas;
create policy "admin_gestao_delete_encargos_rubricas"
  on public.encargos_rubricas for delete to authenticated
  using (coalesce(public.fn_current_role() in ('admin', 'gestao'), false));
