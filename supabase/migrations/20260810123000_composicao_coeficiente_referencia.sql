-- ============================================================
-- O índice do SINAPI vira ponto de partida, não sentença
-- ============================================================
-- O SINAPI publica índices de produtividade médios nacionais: 1,939 h de
-- pedreiro por m² de alvenaria. Uma equipe própria, conhecida e medida, rende
-- diferente disso — para mais ou para menos — e quem orça precisa poder dizer
-- o número da SUA obra sem perder de vista o de referência.
--
-- Hoje editar o coeficiente sobrescreve e pronto: some a informação de que
-- aquilo veio do SINAPI e de quanto se afastou. Depois de dois ajustes
-- ninguém sabe mais o que era publicado e o que foi decisão de alguém.
--
-- A solução é a mesma que o app já usa para PREÇO em `insumos_projeto`
-- (`preco_unitario_base` + `ajuste_*`): guardar a base e o efetivo lado a
-- lado. Aqui a base é `coeficiente_referencia` e o efetivo continua sendo
-- `coeficiente` — nenhum cálculo muda, `fn_custo_composicao` segue lendo só o
-- efetivo.
--
-- O MOTIVO do ajuste não ganha coluna nova: `observacao` já existe nesta
-- tabela e nunca teve uso na tela. Ela passa a ser o campo "por que este
-- índice é diferente do publicado", que é exatamente o papel de
-- `ajuste_motivo` do lado do preço.
--
-- A ORIGEM do coeficiente é DERIVADA, nunca armazenada:
--
--     referencia is null            → índice próprio (nunca veio do SINAPI)
--     referencia  = coeficiente     → índice do SINAPI, intacto
--     referencia <> coeficiente     → ajustado pela produtividade da equipe
--
-- Uma terceira coluna de classificação seria repetir o §3.5 do diagnóstico do
-- catálogo — `tipo` × `preco_fonte` × campos SINAPI, três colunas que podem se
-- contradizer e já deixam entrar item que se diz SINAPI sem identidade.

alter table public.composicao_itens
  add column if not exists coeficiente_referencia numeric(15,7)
    check (coeficiente_referencia is null or coeficiente_referencia > 0);

comment on column public.composicao_itens.coeficiente_referencia is
  'Coeficiente publicado pelo SINAPI na adoção. NULO = índice próprio. Diferente de `coeficiente` = ajustado pela produtividade da equipe; o motivo fica em `observacao`. Não entra em nenhum cálculo — existe para a tela mostrar a distância e oferecer o retorno ao publicado.';

comment on column public.composicao_itens.observacao is
  'Por que este índice difere do publicado. Mesmo papel de insumos_projeto.ajuste_motivo do lado do preço.';

-- ============================================================
-- Backfill: o que já está lá veio do SINAPI intacto
-- ============================================================
-- Só para componentes de composição adotada do SINAPI. Composição própria
-- montada à mão não tem referência publicada, e marcar uma seria inventar
-- procedência — exatamente o que esta coluna existe para evitar.
update public.composicao_itens ci
   set coeficiente_referencia = ci.coeficiente
  from public.catalogo_insumos pai
 where pai.id = ci.composicao_id
   and pai.tipo = 'SINAPI'
   and pai.codigo_sinapi is not null
   and ci.coeficiente_referencia is null;

-- ============================================================
-- A view precisa expor a coluna nova
-- ============================================================
-- `v_composicao_itens` lista as colunas uma a uma, então coluna nova em
-- `composicao_itens` não aparece sozinha — a mesma armadilha que já custou
-- dois bugs silenciosos em propostas, aqui na versão explícita: sem recriar,
-- o PostgREST simplesmente não devolve `coeficiente_referencia` e a tela não
-- teria como mostrar o índice publicado ao lado do ajustado.
drop view if exists public.v_composicao_itens;

create view public.v_composicao_itens
with (security_invoker = true) as
select
  ci.id,
  ci.composicao_id,
  ci.insumo_id,
  ci.coeficiente,
  ci.coeficiente_referencia,
  ci.observacao,
  ci.created_at,
  ci.updated_at,
  c.descricao                                  as insumo_descricao,
  c.unidade                                    as insumo_unidade,
  c.categoria                                  as insumo_categoria,
  c.tipo_item                                  as insumo_tipo_item,
  c.codigo_sinapi                              as insumo_codigo_sinapi,
  c.preco_referencia                           as insumo_preco_referencia,
  c.ativo                                      as insumo_ativo,
  pv.preco                                     as insumo_preco_vigente,
  pv.nivel                                     as insumo_preco_nivel,
  pv.fonte                                     as insumo_preco_fonte,
  round(ci.coeficiente * pv.preco, 2)          as custo_total
from public.composicao_itens ci
join public.catalogo_insumos c on c.id = ci.insumo_id
cross join lateral public.fn_preco_vigente(ci.insumo_id) pv;

comment on view public.v_composicao_itens is
  'Componentes de uma composição com o preço VIGENTE do filho (fn_preco_vigente), que é a mesma base usada por fn_custo_composicao. Não usar preco_referencia para custo: para insumo folha ele é apenas o nível 3/4 da cadeia.';

grant select on public.v_composicao_itens to authenticated;
