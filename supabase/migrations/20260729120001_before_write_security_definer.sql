-- ============================================================
-- fn_catalogo_insumo_before_write passa a ser SECURITY DEFINER
-- ============================================================
-- Por que: desde 20260729120000 esta trigger chama fn_custo_composicao(), que
-- está REVOGADA de `authenticated` (o custo de uma composição não pode variar
-- com quem lê, então a função é SECURITY DEFINER e não deve ser exposta como
-- RPC pelo PostgREST).
--
-- Testado no projeto svgkbqfozxwrbzheshuc com `set local role authenticated`:
--   - chamada direta de fn_custo_composicao → "permission denied for function"
--   - UPDATE em catalogo_insumos que dispara a trigger → funciona
--
-- Ou seja: HOJE funciona. O Postgres não aplica a checagem de EXECUTE para a
-- função chamada de dentro do corpo de uma trigger da mesma forma que numa
-- chamada direta. Só que essa é uma sutileza que não está documentada de forma
-- que eu queira apostar nela: se o comportamento apertar numa versão futura, o
-- sintoma é "gestão não consegue mais editar composição", e a causa raiz estaria
-- a três saltos de distância do erro.
--
-- SECURITY DEFINER remove a dependência: o corpo passa a rodar como o owner, que
-- tem EXECUTE em tudo que a função toca. Não há ganho de privilégio para o
-- chamador — a função é trigger-only e está revogada de anon/authenticated/public,
-- então ninguém consegue invocá-la fora do contexto da trigger. E ela não lê
-- nada além de composicao_itens, cuja RLS já libera as mesmas linhas para quem
-- consegue escrever em catalogo_insumos.
--
-- O corpo é idêntico ao de 20260729120000 — muda só a cláusula.
create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tem_componentes boolean;
begin
  new.busca := public.fn_normaliza_busca(
    coalesce(new.descricao, '') || ' ' ||
    coalesce(new.codigo_sinapi, '') || ' ' ||
    coalesce(new.aplicacao, '') || ' ' ||
    coalesce(new.composicao, '')
  );

  select exists (
    select 1 from public.composicao_itens ci where ci.composicao_id = new.id
  ) into v_tem_componentes;

  if tg_op = 'UPDATE'
     and old.tipo_item = 'Composicao'
     and new.tipo_item <> 'Composicao'
     and v_tem_componentes then
    raise exception 'Esta composição tem componentes. Remova-os antes de convertê-la em insumo simples.';
  end if;

  if new.tipo_item = 'Composicao' and v_tem_componentes then
    new.preco_referencia := public.fn_custo_composicao(new.id);
    new.preco_fonte      := 'Composicao';
  end if;

  if tg_op = 'UPDATE'
     and new.preco_referencia is distinct from old.preco_referencia
     and new.data_atualizacao_preco = old.data_atualizacao_preco then
    new.data_atualizacao_preco := current_date;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_catalogo_insumo_before_write() from anon, authenticated, public;
