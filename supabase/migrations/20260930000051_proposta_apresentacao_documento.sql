-- ============================================================
-- APRESENTAÇÃO DO DOCUMENTO DA PROPOSTA
-- ============================================================
-- O documento impresso tinha um formato só: a planilha item a item com preço
-- unitário, o resumo por categoria e o quantitativo de materiais — sempre os
-- três. A mesma empresa precisa de papéis diferentes para o mesmo orçamento:
-- o cliente particular quer o preço global, a licitação quer a planilha
-- aberta, e quem vai comprar o material quer o quantitativo e a composição de
-- cada serviço.
--
-- A escolha fica por proposta, como `bdi_visivel_pdf` (20260725150000), e não
-- numa configuração global: a empresa alterna de uma proposta para outra, e
-- reabrir a prévia tem de reproduzir o papel que foi entregue.
--
-- jsonb e não uma coluna por opção: são apresentação pura, nenhuma entra em
-- cálculo, e cada opção nova seria mais uma coluna e mais uma recriação desta
-- view. O cliente lê com padrão para chave ausente (`lib/apresentacaoProposta.ts`),
-- então `{}` é o documento de sempre.
--
-- Nenhum valor muda: esconder preço unitário ou detalhamento NÃO omite nada da
-- soma — o total impresso é sempre `valor_calculado`.
alter table public.propostas
  add column if not exists apresentacao_documento jsonb not null default '{}'::jsonb;

alter table public.propostas
  drop constraint if exists propostas_apresentacao_documento_objeto;
alter table public.propostas
  add constraint propostas_apresentacao_documento_objeto
  check (jsonb_typeof(apresentacao_documento) = 'object');

comment on column public.propostas.apresentacao_documento is
  'Como o documento impresso mostra o orçamento (nível de detalhe, preço unitário, composição, materiais, resumo por categoria). Só apresentação — nenhum valor sai daqui. Chave ausente = padrão do cliente.';

-- A view lista as colunas uma a uma (não `p.*`, que congela): a nova entra no
-- FIM, que é o único lugar em que CREATE OR REPLACE aceita coluna nova.
create or replace view public.v_propostas
with (security_invoker = true) as
select
  p.id,
  p.numero,
  p.cliente_id,
  p.descricao,
  p.valor_estimado,
  p.data_validade,
  p.status,
  p.created_at,
  p.updated_at,
  p.bdi_percentual,
  p.valor_manual,
  p.data_envio,
  p.motivo_rejeicao,
  p.bdi_visivel_pdf,
  p.prazo_execucao_dias,
  coalesce(i.qtd_itens, 0::bigint) as qtd_itens,
  coalesce(i.valor_itens, 0::numeric) as valor_itens,
  round(coalesce(i.valor_itens, 0::numeric) * (1::numeric + p.bdi_percentual / 100.0), 2) as valor_calculado,
  coalesce(s.qtd_secoes, 0::bigint) as qtd_secoes,
  p.apresentacao_documento
from public.propostas p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(ip.quantidade * ip.preco_unitario, 2)) as valor_itens
    from public.itens_proposta ip
   where ip.proposta_id = p.id
) i on true
left join lateral (
  select count(*) as qtd_secoes
    from public.proposta_secoes ps
   where ps.proposta_id = p.id and length(btrim(ps.corpo)) > 0
) s on true;
