-- ============================================================
-- A COMPRA DE FORNECEDOR TAMBÉM TEM CENTRO
-- ============================================================
--
-- `v_compras_fornecedor` (20260718190004) é um recorte do razão com COLUNAS
-- EXPLÍCITAS — o que é a decisão certa (view com `l.*` congela o formato e passa
-- a ignorar coluna nova em silêncio), mas cobra o preço combinado: coluna nova
-- no razão exige recriar a view. É a terceira vez que isso acontece no projeto.
--
-- Sem isto, a agenda do fornecedor leria a compra sem o centro de custo que ela
-- acabou de gravar, e o tipo `CompraFornecedor` estaria mentindo na leitura.
drop view if exists public.v_compras_fornecedor;
create view public.v_compras_fornecedor with (security_invoker = true) as
select
  id,
  fornecedor_id,
  data,
  descricao as item,
  valor,
  pago,
  projeto_id,
  conta_id,
  centro_custo_id
from public.lancamentos_financeiros
where fornecedor_id is not null;

comment on view public.v_compras_fornecedor is
  'Histórico de compras por fornecedor: projeção do razão onde fornecedor_id não é nulo. Colunas explícitas de propósito — recriar a cada coluna nova em lancamentos_financeiros.';

grant select on public.v_compras_fornecedor to authenticated;
