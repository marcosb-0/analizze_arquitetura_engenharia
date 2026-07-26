-- ============================================================
-- CADEIA DE PREÇO — cotação > praticado > estimado > referência
-- ============================================================
-- `fn_custo_composicao` somava `catalogo_insumos.preco_referencia`, que é o
-- preço SINAPI. As cotações de fornecedor existiam desde 20260723120000, com
-- validade e histórico, e NÃO entravam em conta nenhuma: `melhorPreco()` rodava
-- no cliente (src/lib/preco.ts) só para pintar o card do catálogo.
--
-- O resultado era duas verdades na mesma tela:
--
--     card do cimento ......... "melhor cotação R$ 32,00"
--     composição de alvenaria .. orçada com os R$ 38,00 do SINAPI
--
-- O único jeito de o preço real entrar no orçamento era clicar "adotar preço da
-- cotação" insumo por insumo — 40 cotações, 40 cliques, e nada dizia quais
-- faltavam.
--
-- Aqui o banco passa a ter UMA resolução de preço, em quatro níveis:
--
--   1 Cotação    cotação ativa e dentro da validade. Preço firme, com fornecedor.
--   2 Praticado  o que esta empresa já pagou: cotação vencida ou preço adotado
--                de fornecedor no histórico. Não é firme, mas é real.
--   3 Estimado   preço digitado pela empresa (preco_fonte = 'Manual').
--   4 Referência SINAPI. Preço público — o último recurso, não o seu.
--
-- POR QUE COTAÇÃO VENCIDA NÃO É DESCARTADA: a regra do cliente jogava fora a
-- cotação expirada e caía direto no SINAPI. Uma cotação que venceu mês passado
-- é um fornecedor real dando um preço real para esta empresa — informação muito
-- melhor que a média nacional do IBGE. Ela desce de nível, não some.
--
-- IDADE NÃO REBAIXA NÍVEL: um preço próprio de 4 meses para um fornecedor da
-- sua região costuma valer mais que a referência nacional. `dias_idade` é
-- devolvido para a tela mostrar e o usuário decidir — o banco não adivinha.
--
-- EFEITO DA EXPIRAÇÃO NO PREÇO: quase nenhum, de propósito. Quando a cotação
-- vence ela cai do nível 1 para o 2 — e o nível 2 é a própria cotação vencida.
-- O VALOR continua o mesmo; o que muda é a confiança. É por isso que o custo
-- armazenado de uma composição pode continuar parado quando uma cotação expira
-- sem que nada fique errado: só o rótulo envelhece, e o rótulo é lido na hora.

-- ============================================================
-- 1. A resolução
-- ============================================================
-- SECURITY DEFINER pelo mesmo motivo de fn_custo_composicao (20260729120000):
-- preço não pode variar em função de quem lê. Com security invoker, uma RLS que
-- escondesse uma cotação faria o preço subir SEM ERRO — a classe de bug
-- silencioso que este schema já pagou caro.
create or replace function public.fn_preco_vigente(p_insumo_id uuid)
returns table (
  preco         numeric,
  nivel         smallint,
  fonte         text,
  fornecedor_id uuid,
  data_origem   date,
  dias_idade    int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item   public.catalogo_insumos;
  v_tem_filhos boolean;
begin
  select * into v_item from public.catalogo_insumos where id = p_insumo_id;
  if not found then
    return;
  end if;

  -- --------------------------------------------------------
  -- Composição com componentes: preço é derivado, não escolhido
  -- --------------------------------------------------------
  -- `preco_referencia` de uma composição JÁ é o custo calculado (forçado pela
  -- trigger de 20260729120000), então não há o que resolver aqui. O que
  -- interessa é a CONFIANÇA, e ela é a do pior componente: uma composição em
  -- que um único insumo só tem preço SINAPI não é melhor que esse insumo.
  select exists (select 1 from public.composicao_itens where composicao_id = p_insumo_id)
    into v_tem_filhos;

  if v_tem_filhos then
    return query
    with recursive expandido as (
      select ci.insumo_id as item_id, 1 as nivel_arvore
        from public.composicao_itens ci
       where ci.composicao_id = p_insumo_id
      union all
      select ci.insumo_id, e.nivel_arvore + 1
        from expandido e
        join public.composicao_itens ci on ci.composicao_id = e.item_id
       where e.nivel_arvore < 20
    ),
    folhas as (
      select distinct e.item_id
        from expandido e
       where not exists (
         select 1 from public.composicao_itens f where f.composicao_id = e.item_id
       )
    ),
    niveis as (
      select pv.nivel, pv.data_origem
        from folhas
        cross join lateral public.fn_preco_vigente(folhas.item_id) pv
    )
    select v_item.preco_referencia,
           coalesce(max(n.nivel), 4::smallint),
           case coalesce(max(n.nivel), 4::smallint)
             when 1 then 'Cotação' when 2 then 'Praticado'
             when 3 then 'Estimado' else 'Referência'
           end,
           null::uuid,
           min(n.data_origem),
           (current_date - min(n.data_origem))::int
      from niveis n;
    return;
  end if;

  -- --------------------------------------------------------
  -- Nível 1 — cotação firme
  -- --------------------------------------------------------
  -- Entre as vigentes vale a MAIS BARATA: todas são compráveis hoje, então o
  -- critério é preço.
  return query
  select cf.preco_unitario,
         1::smallint,
         'Cotação'::text,
         cf.fornecedor_id,
         cf.data_cotacao,
         (current_date - cf.data_cotacao)::int
    from public.cotacoes_fornecedores cf
   where cf.catalogo_id = p_insumo_id
     and cf.ativa
     and cf.data_cotacao + cf.validade_dias >= current_date
   order by cf.preco_unitario asc, cf.data_cotacao desc
   limit 1;
  if found then return; end if;

  -- --------------------------------------------------------
  -- Nível 2 — praticado
  -- --------------------------------------------------------
  -- Aqui o critério é o MAIS RECENTE, não o mais barato: a pergunta deixou de
  -- ser "qual o melhor negócio disponível" e passou a ser "quanto isto custou
  -- da última vez". Uma cotação barata de um ano atrás não é obtenível.
  return query
  select p.preco, 2::smallint, 'Praticado'::text, p.fornecedor_id, p.data,
         (current_date - p.data)::int
    from (
      -- Cotação que venceu continua sendo preço real de fornecedor real.
      select cf.preco_unitario as preco, cf.fornecedor_id, cf.data_cotacao as data
        from public.cotacoes_fornecedores cf
       where cf.catalogo_id = p_insumo_id
         and cf.ativa
         and cf.data_cotacao + cf.validade_dias < current_date
      union all
      -- Preço adotado de fornecedor em algum momento (a trigger de
      -- 20260723120000 grava isso sozinha, com a fonte).
      select hp.preco, null::uuid, hp.data
        from public.catalogo_historico_precos hp
       where hp.catalogo_id = p_insumo_id
         and hp.fonte = 'Fornecedor'
    ) p
   order by p.data desc, p.preco asc
   limit 1;
  if found then return; end if;

  -- --------------------------------------------------------
  -- Níveis 3 e 4 — o que está gravado no item
  -- --------------------------------------------------------
  return query
  select v_item.preco_referencia,
         case when v_item.preco_fonte = 'Manual' then 3 else 4 end::smallint,
         case when v_item.preco_fonte = 'Manual' then 'Estimado' else 'Referência' end,
         v_item.fornecedor_padrao_id,
         v_item.data_atualizacao_preco,
         (current_date - v_item.data_atualizacao_preco)::int;
end;
$$;

comment on function public.fn_preco_vigente(uuid) is
  'Preço efetivo de um insumo e a procedência dele: 1 cotação vigente, 2 praticado (cotação vencida/histórico de fornecedor), 3 estimado (manual), 4 referência SINAPI. Composição devolve o custo derivado com o nível do pior componente.';

-- Revoke de PUBLIC primeiro, grant nominal depois: toda função nasce com
-- EXECUTE para PUBLIC, e `anon` herda por aí. Revogar só do papel nominal
-- deixaria a função executável sem login (o linter pega isso como 0028).
revoke execute on function public.fn_preco_vigente(uuid) from public, anon;
grant  execute on function public.fn_preco_vigente(uuid) to authenticated;

-- ============================================================
-- 2. A composição passa a custar o preço da empresa
-- ============================================================
-- Mesma função de 20260729120000 com uma troca: `c.preco_referencia` vira o
-- preço resolvido. Todo o resto é preservado de propósito — CTE recursiva, teto
-- de nível 20, só folhas contribuem preço, arredondamento uma vez no fim.
create or replace function public.fn_custo_composicao(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with recursive expandido as (
    select ci.insumo_id as item_id, ci.coeficiente::numeric as coef, 1 as nivel
      from public.composicao_itens ci
     where ci.composicao_id = p_id
    union all
    select ci.insumo_id, e.coef * ci.coeficiente, e.nivel + 1
      from expandido e
      join public.composicao_itens ci on ci.composicao_id = e.item_id
     where e.nivel < 20
  )
  select coalesce(round(sum(e.coef * pv.preco), 2), 0)
    from expandido e
    cross join lateral public.fn_preco_vigente(e.item_id) pv
   where not exists (
     select 1 from public.composicao_itens f where f.composicao_id = e.item_id
   );
$$;

-- ============================================================
-- 3. Cotação passa a propagar como preço propaga
-- ============================================================
-- Sem isto a troca acima seria meia-verdade: `fn_custo_composicao` leria a
-- cotação, mas o custo ARMAZENADO da composição só era reescrito quando o
-- `preco_referencia` de um componente mudava — e cadastrar cotação não mexe
-- em `preco_referencia`. A composição ficaria parada no preço antigo até
-- alguém editar um componente por acaso.
--
-- Reusa fn_aplica_custo_composicao, que já existe e já alimenta o histórico.
create or replace function public.fn_propaga_custo_cotacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo_id uuid;
  v_pai uuid;
begin
  v_catalogo_id := coalesce(new.catalogo_id, old.catalogo_id);

  for v_pai in
    select distinct ci.composicao_id
      from public.composicao_itens ci
     where ci.insumo_id = v_catalogo_id
  loop
    -- Um UPDATE que muda de fato o preço re-dispara trg_propaga_custo_composicao
    -- para o pai, e a árvore sobe sozinha a partir daqui.
    perform public.fn_aplica_custo_composicao(v_pai);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_propaga_custo_cotacao on public.cotacoes_fornecedores;
create trigger trg_propaga_custo_cotacao
  after insert or update of ativa, preco_unitario, validade_dias, data_cotacao
  on public.cotacoes_fornecedores
  for each row execute function public.fn_propaga_custo_cotacao();

revoke execute on function public.fn_propaga_custo_cotacao() from anon, authenticated, public;

-- ============================================================
-- 4. A procedência chega ao app
-- ============================================================
-- Recriada em vez de `create or replace`: o `c.*` desta view congela a lista de
-- colunas na criação, e colunas novas no meio da lista são recusadas pelo
-- replace. Mesma nota de 20260729120000 — é o terceiro bug desta natureza que
-- este schema evita por recriar a view junto com a mudança.
drop view if exists public.v_catalogo_insumos;
create view public.v_catalogo_insumos
with (security_invoker = true) as
select
  c.*,
  (select count(distinct io.projeto_id)
     from public.itens_orcamento io
    where io.catalogo_insumo_id = c.id)                     as obras_utilizando,
  (select count(*)
     from public.cotacoes_fornecedores cf
    where cf.catalogo_id = c.id and cf.ativa)               as cotacoes_ativas,
  (select count(*)
     from public.catalogo_historico_precos hp
    where hp.catalogo_id = c.id)                            as pontos_historico,
  (select count(*)
     from public.composicao_itens ci
    where ci.composicao_id = c.id)                          as qtd_componentes,
  (select count(*)
     from public.composicao_itens ci
    where ci.insumo_id = c.id)                              as usado_em_composicoes,
  exists (select 1
            from public.composicao_itens ci
            join public.catalogo_insumos f on f.id = ci.insumo_id
           where ci.composicao_id = c.id and not f.ativo)    as tem_componente_inativo,
  -- A cadeia resolvida, para a tela parar de recalcular a regra por conta
  -- própria (src/lib/preco.ts discordava desta aqui).
  pv.preco                                                   as preco_vigente,
  pv.nivel                                                   as preco_nivel,
  pv.fonte                                                   as preco_fonte_efetiva,
  pv.fornecedor_id                                           as preco_fornecedor_id,
  pv.data_origem                                             as preco_data_origem,
  pv.dias_idade                                              as preco_dias_idade
from public.catalogo_insumos c
cross join lateral public.fn_preco_vigente(c.id) pv;

-- ============================================================
-- 5. Backfill: o custo das composições existentes estava com preço SINAPI
-- ============================================================
-- Sem isto a mudança só valeria para composição tocada daqui em diante. O
-- update dispara a trigger de forçamento, que grava o custo novo e registra a
-- linha em catalogo_historico_precos — o registro de que aquele item passou a
-- valer o preço praticado pela empresa.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select distinct composicao_id from public.composicao_itens
  loop
    perform public.fn_aplica_custo_composicao(v_id);
  end loop;
end $$;
