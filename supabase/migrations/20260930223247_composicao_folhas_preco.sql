-- As folhas da composição passam a trazer o PREÇO VIGENTE de cada uma.
--
-- A divisão do valor da proposta por natureza (mão de obra × material ×
-- terceirizado) precisa saber quanto de cada serviço é cada coisa. A categoria
-- do ITEM não responde: "Emboço" é serviço próprio, mas o dinheiro dele é
-- pedreiro, servente, cimento, areia e cal. A resposta está nas folhas, pesadas
-- pelo custo — coeficiente acumulado × preço.
--
-- O preço é o de `fn_preco_vigente`, o mesmo que o custo da composição no
-- catálogo usa (`catalogo_composicao_agregados`); nenhuma conta paralela.
--
-- A assinatura de retorno muda, então `drop` + `create` (create or replace não
-- acrescenta coluna em RETURNS TABLE).
drop function if exists public.fn_composicao_folhas(uuid[]);

create function public.fn_composicao_folhas(p_ids uuid[])
returns table (
  raiz_id        uuid,
  insumo_id      uuid,
  descricao      text,
  unidade        text,
  categoria      text,
  coef_acumulado numeric,
  preco_unitario numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with recursive arvore as (
    select ci.composicao_id as raiz_id,
           ci.insumo_id,
           ci.coeficiente::numeric as coef,
           array[ci.composicao_id, ci.insumo_id] as caminho,
           1 as nivel
      from public.composicao_itens ci
     where ci.composicao_id = any(p_ids)
    union all
    select a.raiz_id,
           ci.insumo_id,
           a.coef * ci.coeficiente,
           a.caminho || ci.insumo_id,
           a.nivel + 1
      from arvore a
      join public.composicao_itens ci on ci.composicao_id = a.insumo_id
     where a.nivel < 20
       and not ci.insumo_id = any(a.caminho)
  ),
  folhas as (
    select a.raiz_id, a.insumo_id, f.descricao, f.unidade, f.categoria, sum(a.coef) as coef
      from arvore a
      join public.catalogo_insumos f on f.id = a.insumo_id
     where not exists (select 1 from public.composicao_itens x where x.composicao_id = a.insumo_id)
     group by a.raiz_id, a.insumo_id, f.descricao, f.unidade, f.categoria
  ),
  -- Preço uma vez por insumo distinto, não por (raiz, insumo): o cimento que
  -- aparece em dez composições é consultado uma vez.
  precos as (
    select d.insumo_id, v.preco
      from (select distinct insumo_id from folhas) d
      cross join lateral public.fn_preco_vigente(d.insumo_id) v
  )
  select fo.raiz_id, fo.insumo_id, fo.descricao, fo.unidade, fo.categoria, fo.coef, pr.preco
    from folhas fo
    left join precos pr on pr.insumo_id = fo.insumo_id;
$$;

comment on function public.fn_composicao_folhas(uuid[]) is
  'Insumos finais (folhas) das composições dadas, com o coeficiente acumulado pelo caminho e o preço vigente. Alimenta o quantitativo de materiais e a divisão por natureza da proposta.';

revoke all on function public.fn_composicao_folhas(uuid[]) from public, anon;
grant execute on function public.fn_composicao_folhas(uuid[]) to authenticated;
