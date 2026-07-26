-- ============================================================================
-- Correções medidas depois de importar a publicação 06/2026
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. O coeficiente do catálogo próprio truncava o sétimo decimal
-- ---------------------------------------------------------------------------
-- `public.composicao_itens.coeficiente` nasceu `numeric(14,6)` em 20260729120000
-- com a justificativa de que "o SINAPI publica coeficientes como 0,000175".
-- A planilha real de 06/2026 mostra que a precisão publicada é de SETE casas:
-- 0,6650246 e 0,0044079 aparecem 7.478 vezes.
--
-- Com 6 casas, adotar uma composição do SINAPI truncaria o sétimo dígito em
-- silêncio. O erro é pequeno em dinheiro, mas é o tipo de diferença que ninguém
-- consegue explicar depois, num orçamento que precisa bater com o oficial.
--
-- Alargar é seguro: numeric(15,7) contém todo valor de numeric(14,6) (mesmos 8
-- dígitos inteiros), então nenhuma linha existente muda. É o alargamento que
-- teria de ser feito ANTES da primeira adoção, não depois.
--
-- A view tem de sair antes: `alter column type` é recusado enquanto uma view
-- depende da coluna ("cannot alter type of a column used by a view or rule").
-- Recriada logo abaixo, com a MESMA lista explícita de colunas — de novo, nunca
-- `select ci.*`, que congela as colunas na criação.
drop view if exists public.v_composicao_itens;

alter table public.composicao_itens
  alter column coeficiente type numeric(15,7);

create view public.v_composicao_itens
with (security_invoker = true) as
  select ci.id,
         ci.composicao_id,
         ci.insumo_id,
         ci.coeficiente,
         ci.observacao,
         ci.created_at,
         ci.updated_at,
         c.descricao        as insumo_descricao,
         c.unidade          as insumo_unidade,
         c.categoria        as insumo_categoria,
         c.tipo_item        as insumo_tipo_item,
         c.codigo_sinapi    as insumo_codigo_sinapi,
         c.preco_referencia as insumo_preco_referencia,
         c.ativo            as insumo_ativo,
         -- `round` e não `trunc`: esta é a convenção do catálogo próprio, a
         -- mesma de `fn_custo_composicao`. O SINAPI trunca; a diferença é
         -- deliberada e está explicada em 20260730100000.
         round(ci.coeficiente * c.preco_referencia, 2) as custo_total
    from public.composicao_itens ci
    join public.catalogo_insumos c on c.id = ci.insumo_id;

-- A view é de leitura. O default do Supabase concede INSERT/UPDATE/DELETE em
-- objeto novo de `public` para anon e authenticated; num `security_invoker` isso
-- viraria um segundo caminho de escrita para `composicao_itens`, contornando
-- qualquer regra que a gente venha a pendurar na tabela.
revoke all on public.v_composicao_itens from anon, authenticated;
grant select on public.v_composicao_itens to authenticated;

comment on column public.composicao_itens.coeficiente is
  'Quantidade do insumo por unidade da composição. 7 casas decimais porque é a '
  'precisão que o SINAPI publica (0,6650246) — com 6 o último dígito se perdia '
  'na adoção. Sempre > 0: componente de coeficiente zero não é adotado.';


-- ---------------------------------------------------------------------------
-- 2. A convenção de custo do SINAPI, medida contra a base já importada
-- ---------------------------------------------------------------------------
-- Este comentário corrige o que a migration 20260730100000 afirmava. Lá estava
-- escrito que nem truncando dá 100% de reprodução do custo publicado; o número
-- citado (92,8%) veio de um método que RECALCULAVA cada subcomposição desde as
-- folhas e acumulava erro de arredondamento no caminho.
--
-- Medido agora sobre a base importada (publicação 06/2026, MG, regime SD),
-- somando apenas os FILHOS DIRETOS e usando o CUSTO PUBLICADO de cada filho:
--
--     composições comparadas ... 7.506   (as que têm preço para todos os filhos)
--     reproduzidas exatas ...... 7.506   = 100,00%
--     fora por 1 centavo .......     0
--     pior divergência .........  R$ 0,00
--
-- Ou seja: custo_publicado(pai) = Σ trunc(coeficiente × custo_publicado(filho), 2)
-- é uma identidade exata nesta base. Duas consequências práticas:
--
--   * `sinapi_custo_expandido` em `nivel = 1` É o detalhamento oficial, e soma
--     exatamente o custo publicado. Os níveis abaixo servem para explicar de
--     onde vem o custo de cada subcomposição, e NÃO devem ser somados junto —
--     somar níveis diferentes conta o mesmo custo duas vezes.
--   * A divergência que sobra é contra a convenção do NOSSO catálogo
--     (`public.fn_custo_composicao`: expande até a folha, arredonda half-up).
--     Por isso adotar uma composição do SINAPI deve trazer o custo publicado,
--     não um recalculado.
comment on function public.sinapi_custo_expandido(integer, integer, char, char) is
  'Abre uma composição do SINAPI item por item. Filtre nivel = 1 para o '
  'detalhamento oficial: a soma de trunc(coeficiente x custo publicado) nesse '
  'nivel reproduz o custo publicado da composição — exato em 7.506/7.506 '
  'composições de MG/SD em 06/2026. Níveis maiores explicam as subcomposições e '
  'não devem ser somados junto. O SINAPI TRUNCA em centavos, não arredonda.';

comment on function public.sinapi_buscar(text, char, char, text, integer, integer, integer) is
  'Busca na base de referência SINAPI com preço resolvido para (publicação, UF, '
  'regime). Item sem preço publicado vem com preco nulo em vez de desaparecer, e '
  'ordena depois de quem tem preço.';
