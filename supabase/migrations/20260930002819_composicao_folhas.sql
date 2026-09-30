-- ============================================================
-- AS FOLHAS DE UMA COMPOSIÇÃO — para o quantitativo de materiais
-- ============================================================
-- O quantitativo de materiais da proposta só enxergava o primeiro nível, e só
-- da cópia da composição feita PARA a proposta. Na base real isso errava de
-- dois jeitos (PROP-2026-001, 30/set/2026):
--
--   1. Nenhum dos 8 itens tinha cópia — só `catalogo_insumo_id`. O cálculo
--      caía no palpite pela categoria do item: a DEMOLIÇÃO (categoria
--      Materiais, composição só de mão de obra) saía como "material" de 52 m²,
--      e alvenaria, chapisco, pintura, calçada e emboço não davam material
--      nenhum.
--   2. Argamassa e concreto são composições dentro da composição. O cimento,
--      a areia e a cal estão no 2º nível, e o cálculo parava no 1º com um
--      "conferir materiais do serviço".
--
-- `fn_composicao_arvore` já faz a recursão, mas devolve a árvore inteira de
-- UMA raiz e é SECURITY DEFINER sem grant. Esta devolve só as folhas de várias
-- raízes de uma vez, com o coeficiente acumulado (produto dos coeficientes do
-- caminho) já somado por folha — é o número que multiplica a quantidade do
-- serviço.
--
-- SECURITY INVOKER de propósito: quem lê proposta (admin/gestão) é quem lê o
-- catálogo, e a RLS de `catalogo_insumos`/`composicao_itens` continua valendo.
-- O `caminho` impede ciclo (A contém B contém A) de girar até o limite.
create or replace function public.fn_composicao_folhas(p_ids uuid[])
returns table (
  raiz_id        uuid,
  insumo_id      uuid,
  descricao      text,
  unidade        text,
  categoria      text,
  coef_acumulado numeric
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
  )
  select a.raiz_id, a.insumo_id, f.descricao, f.unidade, f.categoria, sum(a.coef)
    from arvore a
    join public.catalogo_insumos f on f.id = a.insumo_id
   where not exists (select 1 from public.composicao_itens x where x.composicao_id = a.insumo_id)
   group by a.raiz_id, a.insumo_id, f.descricao, f.unidade, f.categoria;
$$;

comment on function public.fn_composicao_folhas(uuid[]) is
  'Insumos finais (folhas) das composições dadas, com o coeficiente acumulado pelo caminho. Alimenta o quantitativo de materiais da proposta.';

revoke all on function public.fn_composicao_folhas(uuid[]) from public, anon;
grant execute on function public.fn_composicao_folhas(uuid[]) to authenticated;
