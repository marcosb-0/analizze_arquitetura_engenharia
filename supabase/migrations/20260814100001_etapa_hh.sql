-- ============================================================
-- HH DA ETAPA — o elo que faltava entre catálogo e cronograma
-- ============================================================
-- O caminho de dado já existia inteiro e nunca tinha sido percorrido:
--
--   etapas_cronograma ← etapa_orcamento_vinculo (peso) → itens_orcamento
--                     ← insumos_projeto → catalogo_insumos → composicao_itens
--
-- e o atalho `insumos_projeto.etapa_vinculada_id`. O coeficiente de mão de
-- obra está lá desde a adoção do SINAPI; o prazo da etapa nunca teve relação
-- nenhuma com ele. Quem monta cronograma chuta a duração e depois descobre em
-- obra que a equipe não dá conta.
--
-- ------------------------------------------------------------
-- Dois caminhos, e `origem` diz qual foi usado — isso importa:
-- ------------------------------------------------------------
--
-- DIRETO (`insumos_projeto.etapa_vinculada_id`): preciso. O insumo foi
-- amarrado a esta etapa por alguém, e a quantidade é dela.
--
-- PONDERADO (`etapa_orcamento_vinculo.peso_percentual`): aproximado POR
-- CONSTRUÇÃO, e não por preguiça. O peso reparte VALOR entre etapas, não hora;
-- e `itens_orcamento` não tem coluna de quantidade (conferido no DDL), então
-- não existe caminho do orçamento ao HH que não passe por `insumos_projeto`.
-- Rateamos a quantidade pelo peso do valor, o que só é exato quando o item é
-- homogêneo ao longo da etapa. A tela precisa dizer isso, e `origem` é como
-- ela sabe.
--
-- Os dois não se somam: havendo vínculo direto, o ponderado é ignorado. Somar
-- contaria o mesmo insumo duas vezes, uma por cada caminho.
--
-- `insumos_sem_hh` é o contador que impede o número de parecer completo quando
-- metade da etapa não tem composição estruturada. Com 8 composições no
-- catálogo das quais 1 tem componentes, ele vai dominar a tela no começo — e é
-- bom que domine: é a informação de que o HH ali é parcial.

create or replace function public.etapa_hh(p_etapa_id uuid)
returns table (
  hh_total          numeric,
  custo_mao_de_obra numeric,
  custo_total       numeric,
  origem            text,
  insumos_com_hh    integer,
  insumos_sem_hh    integer,
  hh_por_cargo      jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_projeto uuid;
  v_direto  integer;
begin
  select e.projeto_id into v_projeto
    from public.etapas_cronograma e where e.id = p_etapa_id;
  if v_projeto is null then
    raise exception 'Etapa % não existe.', p_etapa_id;
  end if;

  -- Mesmo guard de `obra_explosao_insumos`, e pelo mesmo motivo: o custo de
  -- mão de obra deriva da folha de pagamento (fonte 'Folha', 20260810122000).
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para calcular o HH desta etapa.';
  end if;

  select count(*) into v_direto
    from public.insumos_projeto ip where ip.etapa_vinculada_id = p_etapa_id;

  return query
  with linhas as (
    select ip.catalogo_insumo_id as insumo_id, ip.quantidade as qtd, 'direto'::text as via
      from public.insumos_projeto ip
     where v_direto > 0 and ip.etapa_vinculada_id = p_etapa_id
    union all
    select ip.catalogo_insumo_id, ip.quantidade * (v.peso_percentual / 100.0), 'ponderado'
      from public.etapa_orcamento_vinculo v
      join public.insumos_projeto ip on ip.item_orcamento_id = v.item_orcamento_id
     where v_direto = 0 and v.etapa_id = p_etapa_id
  ),
  folhas as (
    select l.via, arv.insumo_id, l.qtd * arv.coef_acumulado as qtd
      from linhas l
      cross join lateral public.fn_composicao_arvore(l.insumo_id) arv
     where arv.eh_folha
    union all
    -- Item que já é folha entra por si mesmo; sem este ramo ele sumiria,
    -- porque `fn_composicao_arvore` devolve zero linhas para quem não tem
    -- componentes. É o caso das composições adotadas no modo "custo SINAPI".
    select l.via, l.insumo_id, l.qtd
      from linhas l
     where not exists (
       select 1 from public.composicao_itens ci where ci.composicao_id = l.insumo_id
     )
  ),
  precificado as (
    select f.via, f.insumo_id, sum(f.qtd) as qtd, i.descricao, i.unidade, i.categoria,
           public.fn_unidade_e_hora(i.unidade) as eh_hora, max(pv.preco) as preco
      from folhas f
      join public.catalogo_insumos i on i.id = f.insumo_id
      cross join lateral public.fn_preco_vigente(f.insumo_id) pv
     group by f.via, f.insumo_id, i.descricao, i.unidade, i.categoria,
              public.fn_unidade_e_hora(i.unidade)
  )
  select coalesce(round(sum(p.qtd) filter (where p.categoria = 'Mão de Obra' and p.eh_hora), 4), 0),
         coalesce(round(sum(p.qtd * p.preco) filter (where p.categoria = 'Mão de Obra'), 2), 0),
         coalesce(round(sum(p.qtd * p.preco), 2), 0),
         coalesce(max(p.via), case when v_direto > 0 then 'direto' else 'vazio' end),
         count(*) filter (where p.categoria = 'Mão de Obra' and p.eh_hora)::int,
         count(*) filter (where not (p.categoria = 'Mão de Obra' and p.eh_hora))::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'insumo_id', p.insumo_id, 'descricao', p.descricao,
           'unidade', p.unidade, 'horas', round(p.qtd, 4),
           'custo', round(p.qtd * p.preco, 2)
         ) order by p.qtd desc) filter (where p.categoria = 'Mão de Obra' and p.eh_hora), '[]'::jsonb)
    from precificado p;
end;
$$;

comment on function public.etapa_hh(uuid) is
  'HH previsto de uma etapa. Dois caminhos: DIRETO (insumos_projeto.etapa_vinculada_id, preciso) e PONDERADO (etapa_orcamento_vinculo.peso_percentual, aproximado — o peso reparte valor e não HH). `origem` diz qual foi usado. `insumos_sem_hh` conta o que ficou de fora, para a tela não passar um número incompleto como completo.';

revoke execute on function public.etapa_hh(uuid) from anon, public;
grant execute on function public.etapa_hh(uuid) to authenticated;
