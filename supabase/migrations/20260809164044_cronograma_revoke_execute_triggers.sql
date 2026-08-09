-- ============================================================
-- As funções de trigger da EAP não são API
-- ============================================================
-- Apontado pelo linter do Supabase logo após aplicar a EAP: função de trigger em
-- `public` vira endpoint `/rest/v1/rpc/<nome>` no PostgREST, e as seis novas
-- nasceram executáveis por `anon` e `authenticated`.
--
-- Na prática uma chamada direta falha ("trigger functions can only be called as
-- triggers"), então o risco concreto é baixo. Mas o repositório já decidiu não
-- depender disso: 20260727000500 e 20260731140000 revogam exatamente assim, e é
-- por esse motivo que `fn_apply_medicao` e `fn_set_updated_at` não aparecem no
-- linter. As seis destas destoavam do resto do schema.
--
-- SECURITY DEFINER é MANTIDO nas seis. A razão de serem definer não mudou: elas
-- leem tabelas que o papel que está escrevendo pode não enxergar, e uma guarda
-- que não enxerga a tabela não dispara — em silêncio, deixando passar
-- exatamente o que ela existe para barrar (a lição de 20260804100000).

revoke execute on function public.fn_etapa_ordem_padrao()      from public, anon, authenticated;
revoke execute on function public.fn_etapa_hierarquia()        from public, anon, authenticated;
revoke execute on function public.fn_etapa_pai_sem_execucao()  from public, anon, authenticated;
revoke execute on function public.fn_execucao_so_em_folha()    from public, anon, authenticated;
revoke execute on function public.fn_dependencia_integridade() from public, anon, authenticated;
revoke execute on function public.fn_dependencia_sem_ciclo()   from public, anon, authenticated;

-- As duas RPCs de verdade continuam chamáveis por quem está logado: a guarda de
-- papel mora dentro delas, e são SECURITY INVOKER, então a RLS também vale.
revoke execute on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) from anon, public;
revoke execute on function public.fn_salvar_baseline(uuid) from anon, public;
