-- ============================================================
-- A SEMEADURA NÃO É ENDPOINT
-- ============================================================
-- `fn_semear_secoes_proposta` (20260810100001) e `fn_semear_clausulas_contrato`
-- (20260811100000) nasceram com `grant execute ... to authenticated`, seguindo
-- por reflexo o padrão das RPCs que a UI chama. As duas são SECURITY DEFINER e
-- NÃO têm guarda de papel — a guarda estava implícita em "só a trigger chama".
--
-- Só que toda função em `public` vira `/rest/v1/rpc/<nome>` (a mesma armadilha
-- de 20260727000500 e do episódio das seis funções de trigger da EAP). Com o
-- grant, qualquer usuário autenticado — inclusive `campo`, que não enxerga
-- proposta nenhuma — podia chamar
--
--   POST /rest/v1/rpc/fn_semear_secoes_proposta {"p_proposta_id": "<uuid>"}
--
-- e injetar as seções padrão em QUALQUER proposta, contornando a RLS pelo
-- próprio `security definer`. Não é vazamento de leitura, mas é escrita
-- arbitrária em documento comercial de outra pessoa.
--
-- O grant nunca foi necessário. As duas são chamadas por gatilhos que já são
-- SECURITY DEFINER: dentro deles `current_user` é o dono, e a checagem de
-- EXECUTE passa pelo dono, não por quem disparou o insert. Detectado pelo
-- linter do Supabase (0029) logo depois de aplicar a Fase 2.
revoke execute on function public.fn_semear_secoes_proposta(uuid) from authenticated;
revoke execute on function public.fn_semear_clausulas_contrato(uuid) from authenticated;

comment on function public.fn_semear_secoes_proposta(uuid) is
  'Copia os modelos padrão para dentro da proposta. Só para gatilhos — sem grant a authenticated, porque não tem guarda de papel própria.';
comment on function public.fn_semear_clausulas_contrato(uuid) is
  'Copia os modelos padrão para dentro do contrato. Só para gatilhos — sem grant a authenticated, porque não tem guarda de papel própria.';
