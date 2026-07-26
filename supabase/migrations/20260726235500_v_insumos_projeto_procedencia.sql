-- A view foi criada com `select ip.*` e por isso CONGELOU a lista de colunas no
-- momento da criação: as três colunas de procedência adicionadas em
-- 20260726234500 não aparecem por ela. É o mesmo defeito que já causou dois
-- bugs silenciosos neste schema (ver a nota em 20260726120000).
--
-- Recriada com COLUNAS EXPLÍCITAS, para a próxima coluna nova falhar de forma
-- visível (erro de coluna inexistente) em vez de sumir em silêncio.
drop view if exists public.v_insumos_projeto;
create view public.v_insumos_projeto
with (security_invoker = true) as
select
  ip.id,
  ip.projeto_id,
  ip.catalogo_insumo_id,
  ip.item_orcamento_id,
  ip.quantidade,
  ip.fornecedor_id,
  ip.etapa_vinculada_id,
  ip.quantidade_executada,
  ip.status,
  ip.observacoes,
  ip.created_at,
  ip.updated_at,
  ip.preco_unitario_base,
  ip.ajuste_tipo,
  ip.ajuste_valor,
  ip.ajuste_motivo,
  ip.preco_unitario,
  -- Procedência congelada no momento do vínculo (20260726234500).
  ip.preco_nivel,
  ip.preco_fonte_efetiva,
  ip.preco_data_origem,
  round(ip.quantidade * ip.preco_unitario, 2)                              as valor_total,
  round(ip.quantidade * ip.preco_unitario_base, 2)                         as valor_total_base,
  round(ip.quantidade * (ip.preco_unitario - ip.preco_unitario_base), 2)   as valor_ajuste,
  case
    when ip.quantidade > 0::numeric
      then least(round(ip.quantidade_executada / ip.quantidade * 100::numeric, 2), 100::numeric)
    else 0::numeric
  end                                                                       as percentual_executado,
  ci.descricao          as insumo_descricao,
  ci.unidade            as insumo_unidade,
  ci.categoria          as insumo_categoria,
  ci.preco_referencia   as insumo_preco_referencia
from public.insumos_projeto ip
join public.catalogo_insumos ci on ci.id = ip.catalogo_insumo_id;

grant select on public.v_insumos_projeto to authenticated;
