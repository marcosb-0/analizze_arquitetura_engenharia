-- ============================================================
-- EXPLOSÃO DE INSUMOS DA OBRA — "quanto de cimento esta obra consome"
-- ============================================================
-- A curva ABC de `InsumosObra.tsx` roda sobre `insumos_projeto`, que é a lista
-- do que foi CONTRATADO. Para uma composição isso é UMA linha: "alvenaria,
-- 300 m², R$ 48.276". A pergunta de compras — quantos tijolos, quantos sacos
-- de cimento, quantas horas de pedreiro — não tinha resposta, apesar de o dado
-- estar todo lá: quantidade × coeficiente acumulado, expandido até as folhas.
--
-- Esta função responde. Reusa `fn_composicao_arvore` em vez de repetir a CTE
-- recursiva: duas cópias da mesma recursão divergiriam na primeira manutenção,
-- e a diferença apareceria como "a lista de compras não bate com o orçamento".
--
-- ------------------------------------------------------------
-- Duas decisões que precisam estar escritas:
-- ------------------------------------------------------------
--
-- 1. PRECIFICA A PREÇO DE HOJE (`fn_preco_vigente`), não com o
--    `preco_unitario_base` congelado em `insumos_projeto`. São perguntas
--    diferentes: "quanto vou gastar para comprar isto" × "com que preço isto
--    foi orçado". Misturá-las produziria um terceiro número que não responde
--    nenhuma das duas. A QUANTIDADE, essa sim, é estrutural e não depende de
--    preço nenhum.
--
-- 2. TRAVADA EM admin+gestão, e não em `fn_has_projeto_access`.
--    `fn_has_projeto_access` seria o guard natural — é o das policies de
--    `insumos_projeto` — mas ele alcança `campo`, e esta função é DEFINER.
--    Com a fonte de preço 'Folha' (20260810122000), o preço de mão de obra é
--    derivado do maior salário ativo: liberar aqui exporia folha de pagamento
--    a quem só deveria ver a obra. Lista de material para o campo é uma frente
--    própria, com os preços suprimidos — não um efeito colateral desta.

create or replace function public.obra_explosao_insumos(p_projeto_id uuid)
returns table (
  insumo_id       uuid,
  descricao       text,
  unidade         text,
  categoria       text,
  quantidade      numeric,
  preco_unitario  numeric,
  preco_fonte     text,
  custo           numeric,
  hh              numeric,
  participacao    numeric,
  custo_acumulado numeric,
  classe_abc      text,
  origens         integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para abrir a lista de insumos desta obra.';
  end if;

  return query
  with consumo as (
    -- Linhas cujo item é composição POVOADA: explodem até as folhas.
    select arv.insumo_id, ip.quantidade * arv.coef_acumulado as qtd, ip.id as origem
      from public.insumos_projeto ip
      cross join lateral public.fn_composicao_arvore(ip.catalogo_insumo_id) arv
     where ip.projeto_id = p_projeto_id
       and arv.eh_folha
    union all
    -- Linhas cujo item já é folha (insumo simples, ou composição adotada no
    -- modo "custo SINAPI", sem estrutura aberta): entram por si mesmas. Sem
    -- este ramo elas sumiriam da lista — `fn_composicao_arvore` devolve zero
    -- linhas para quem não tem componentes.
    select ip.catalogo_insumo_id, ip.quantidade, ip.id
      from public.insumos_projeto ip
     where ip.projeto_id = p_projeto_id
       and not exists (
         select 1 from public.composicao_itens ci where ci.composicao_id = ip.catalogo_insumo_id
       )
  ),
  agrupado as (
    select c.insumo_id,
           sum(c.qtd) as qtd,
           count(distinct c.origem)::int as origens
      from consumo c
     group by c.insumo_id
  ),
  precificado as (
    select a.insumo_id, a.qtd, a.origens,
           i.descricao, i.unidade, i.categoria,
           pv.preco, pv.fonte,
           round(a.qtd * pv.preco, 2) as custo,
           case when i.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(i.unidade)
                then a.qtd else 0 end as hh
      from agrupado a
      join public.catalogo_insumos i on i.id = a.insumo_id
      cross join lateral public.fn_preco_vigente(a.insumo_id) pv
  ),
  total as (
    select nullif(sum(p.custo), 0) as geral from precificado p
  ),
  acumulado as (
    select p.*, t.geral,
           sum(p.custo) over (order by p.custo desc, p.descricao
                              rows between unbounded preceding and current row) as ate_aqui,
           -- Acumulado ANTES desta linha. A classe sai daqui, e não do
           -- acumulado depois: o item que CRUZA os 80% ainda é classe A — é a
           -- leitura de "quais itens somam 80% do custo", e a mesma convenção
           -- do `findIndex(acumulado >= 80)` que `InsumosObra.tsx` já usa.
           -- Pela outra leitura, um insumo sozinho com 46% do custo cairia em
           -- C só por vir depois de um de 54%. Foi o que aconteceu no primeiro
           -- teste com dado real.
           coalesce(sum(p.custo) over (order by p.custo desc, p.descricao
                                       rows between unbounded preceding and 1 preceding), 0) as antes
      from precificado p cross join total t
  )
  select a.insumo_id, a.descricao, a.unidade, a.categoria,
         round(a.qtd, 4), a.preco, a.fonte, a.custo, round(a.hh, 4),
         round(100.0 * a.custo / coalesce(a.geral, 1), 2),
         round(a.ate_aqui, 2),
         case
           when 100.0 * a.antes / coalesce(a.geral, 1) < 80 then 'A'
           when 100.0 * a.antes / coalesce(a.geral, 1) < 95 then 'B'
           else 'C'
         end,
         a.origens
    from acumulado a
   order by a.custo desc, a.descricao;
end;
$$;

comment on function public.obra_explosao_insumos(uuid) is
  'Consumo real de insumos de uma obra: cada linha de insumos_projeto expandida até as folhas (quantidade × coeficiente acumulado) e agregada por insumo. Precifica a PREÇO DE HOJE (fn_preco_vigente), não com o preço congelado no orçamento — são perguntas diferentes. Travada em admin+gestão porque o preço de mão de obra deriva da folha de pagamento.';

revoke execute on function public.obra_explosao_insumos(uuid) from anon, public;
grant execute on function public.obra_explosao_insumos(uuid) to authenticated;
