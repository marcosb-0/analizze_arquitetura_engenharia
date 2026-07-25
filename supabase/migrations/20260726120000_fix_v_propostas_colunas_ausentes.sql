-- ============================================================
-- v_propostas VOLTA A EXPOR TODAS AS COLUNAS DA TABELA
-- ============================================================
-- A view foi criada em 20260723120002 como `select p.*, ...`. O Postgres
-- expande o `*` NO MOMENTO DA CRIAÇÃO e congela a lista de colunas. Quatro
-- colunas nasceram depois disso e nunca chegaram à view:
--
--   valor_manual     (20260725130000)
--   data_envio       (20260725140000)
--   motivo_rejeicao  (20260725140000)
--   bdi_visivel_pdf  (20260725150000)
--
-- Como o cliente lê a proposta pela view, o estrago foi silencioso e amplo:
--
--   1. propostasService.refreshTotais pede valor_manual explicitamente e
--      recebia 42703 (column does not exist) em TODA chamada. Quem chama é
--      sincronizarTotais — que engole o erro de propósito — então mexer em
--      item ou BDI nunca atualizava o total no painel nem no PDF; só
--      recarregar a página resolvia.
--   2. O mesmo 42703 derrubava o Promise.all de handleAddRevision DEPOIS de a
--      RPC já ter gravado a revisão: a revisão entrava no banco e a tela
--      anunciava "Falha ao registrar revisão". Tentar de novo criava uma
--      segunda versão idêntica.
--   3. list() faz `select *`: sem erro, mas data_envio, motivo_rejeicao e
--      bdi_visivel_pdf chegavam undefined. O marco "enviada em", o motivo da
--      recusa e a preferência de BDI no PDF simplesmente não apareciam.
--
-- CREATE OR REPLACE não resolve: as colunas novas entrariam no meio da lista,
-- antes de qtd_itens, e o replace exige que as existentes mantenham posição.
-- Daí o drop.
--
-- ATENÇÃO PARA O FUTURO: toda coluna nova em `propostas` exige recriar esta
-- view. O `p.*` não acompanha sozinho.
drop view if exists public.v_propostas;

create view public.v_propostas
with (security_invoker = true) as
select
  p.*,
  coalesce(i.qtd_itens, 0)   as qtd_itens,
  coalesce(i.valor_itens, 0) as valor_itens,
  round(coalesce(i.valor_itens, 0) * (1 + p.bdi_percentual / 100.0), 2) as valor_calculado
from public.propostas p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(quantidade * preco_unitario, 2)) as valor_itens
    from public.itens_proposta ip
   where ip.proposta_id = p.id
) i on true;

comment on view public.v_propostas is
  'Proposta + contagem/soma dos itens. Recriar sempre que propostas ganhar coluna: o p.* é expandido na criação.';
