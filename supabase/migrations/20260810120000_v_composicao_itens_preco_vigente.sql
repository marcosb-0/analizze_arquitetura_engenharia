-- ============================================================
-- v_composicao_itens: a linha passa a usar o MESMO preço do total
-- ============================================================
-- Bug silencioso, encontrado em 10/ago/2026 lendo a definição viva do banco.
--
-- `fn_custo_composicao` foi reescrita em 20260726230000_preco_vigente_cadeia
-- e desde então soma `fn_preco_vigente(folha).preco` — a cadeia de 4 níveis
-- (Cotação → Praticado → Estimado → Referência). Mas esta view continuou
-- calculando `round(coeficiente × c.preco_referencia, 2)`, que era o certo
-- ANTES daquela migration.
--
-- Resultado: as linhas do painel de composição e o total da composição usam
-- preços diferentes. Um insumo com cotação ativa mais barata que o preço de
-- referência aparece na linha pelo valor caro e entra no total pelo barato.
--
-- Pior: a tela já mostra um aviso quando `soma das linhas <> total`
-- (PainelComposicao.tsx:334-344) explicando a diferença como acúmulo de
-- arredondamento entre composições auxiliares. Essa explicação está certa
-- para centavos e ERRADA para o caso acima — ela dá uma razão inocente para
-- uma divergência que pode ser de reais. É o tipo de aviso que ensina o
-- usuário a ignorar o número.
--
-- O comentário original da view registrava a premissa que caducou:
--   "Se o filho for composição, seu preco_referencia já é o custo derivado
--    (forçado na escrita), então esta multiplicação vale em qualquer nível."
-- Vale para o filho COMPOSIÇÃO (a trigger BEFORE força o derivado). Não vale
-- para o filho FOLHA, onde `preco_referencia` é só o nível 3/4 da cadeia e
-- qualquer cotação vigente passa na frente dele.
--
-- `drop` + `create`, não `create or replace`: a view ganha colunas no meio da
-- lista (`insumo_preco_nivel`, `insumo_preco_fonte` entram antes de
-- `custo_total`) e o `replace` recusa isso.

drop view if exists public.v_composicao_itens;

create view public.v_composicao_itens
with (security_invoker = true) as
select
  ci.id,
  ci.composicao_id,
  ci.insumo_id,
  ci.coeficiente,
  ci.observacao,
  ci.created_at,
  ci.updated_at,
  c.descricao                                  as insumo_descricao,
  c.unidade                                    as insumo_unidade,
  c.categoria                                  as insumo_categoria,
  c.tipo_item                                  as insumo_tipo_item,
  c.codigo_sinapi                              as insumo_codigo_sinapi,
  -- Mantida: é o preço ARMAZENADO, e a tela usa para mostrar a distância
  -- entre o que está no cadastro e o que a cadeia resolveu.
  c.preco_referencia                           as insumo_preco_referencia,
  c.ativo                                      as insumo_ativo,
  -- Novas: o preço que de fato entra na conta, e de onde ele veio.
  pv.preco                                     as insumo_preco_vigente,
  pv.nivel                                     as insumo_preco_nivel,
  pv.fonte                                     as insumo_preco_fonte,
  -- Agora sim a mesma base do total. Continua havendo diferença de centavos
  -- entre Σ(linhas) e o total quando existe composição auxiliar: a linha
  -- arredonda o filho e o total expande até as folhas arredondando uma vez
  -- só. Essa diferença é a que o aviso da tela descreve — e só ela.
  round(ci.coeficiente * pv.preco, 2)          as custo_total
from public.composicao_itens ci
join public.catalogo_insumos c on c.id = ci.insumo_id
-- `fn_preco_vigente` é SECURITY DEFINER e resolve composição recursivamente.
-- O lateral roda uma vez por linha da composição aberta — dezenas, não
-- milhares: esta view é sempre consultada com `composicao_id = ?`.
cross join lateral public.fn_preco_vigente(ci.insumo_id) pv;

comment on view public.v_composicao_itens is
  'Componentes de uma composição com o preço VIGENTE do filho (fn_preco_vigente), que é a mesma base usada por fn_custo_composicao. Não usar preco_referencia para custo: para insumo folha ele é apenas o nível 3/4 da cadeia.';

-- A view não herda grants do original; sem isto o PostgREST devolve
-- "permission denied for view" para authenticated. anon fica de fora.
grant select on public.v_composicao_itens to authenticated;
