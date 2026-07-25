-- ============================================================
-- CICLO COMERCIAL DA PROPOSTA: ENVIO, REJEIÇÃO E DUPLICAÇÃO
-- ============================================================
-- Três lacunas do acompanhamento comercial:
--
--   1. O status "Enviada" não guardava QUANDO foi enviada, então não havia
--      como saber há quanto tempo uma proposta espera resposta.
--   2. "Rejeitada" não guardava POR QUÊ. A informação mais valiosa do ciclo
--      — preço, prazo, escopo, concorrente — se perdia no clique.
--   3. Não havia como partir de uma proposta existente. Orçar duas obras
--      parecidas obrigava a remontar o orçamento item a item.

-- ============================================================
-- 1. Marcos do ciclo
-- ============================================================
alter table public.propostas
  add column if not exists data_envio     date,
  add column if not exists motivo_rejeicao text;

comment on column public.propostas.data_envio is
  'Dia em que a proposta foi enviada ao cliente. Preenchido na transição para Enviada.';
comment on column public.propostas.motivo_rejeicao is
  'Por que o cliente recusou. Preenchido na transição para Rejeitada.';

-- ============================================================
-- 2. Duplicar proposta
-- ============================================================
-- Uma RPC e não uma sequência de inserts do cliente: se a cópia dos itens
-- falhasse no meio, sobraria uma proposta pela metade, e o usuário só
-- descobriria ao abrir o orçamento.
--
-- O que NÃO se herda, de propósito:
--   status    -> a cópia nasce em Elaboração
--   numero    -> atribuído pelo trigger, é a identidade do documento
--   revisoes  -> histórico pertence à proposta que o viveu
--   validade  -> copiar um prazo vencido faria a cópia nascer vencida
--
-- Os preços vêm congelados da origem, não relidos do catálogo: duplicar é
-- copiar o que foi orçado. Para atualizar preços, o caminho é o ajuste por
-- item, que registra a procedência.
create or replace function public.fn_duplicar_proposta(
  p_proposta_id uuid,
  p_descricao   text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_origem  record;
  v_novo_id uuid;
begin
  select * into v_origem from public.propostas where id = p_proposta_id;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  insert into public.propostas
    (cliente_id, descricao, valor_manual, bdi_percentual, prazo_execucao, data_validade, status)
  values
    (v_origem.cliente_id,
     coalesce(nullif(btrim(p_descricao), ''), v_origem.descricao || ' (cópia)'),
     v_origem.valor_manual,
     v_origem.bdi_percentual,
     v_origem.prazo_execucao,
     null,
     'Elaboração')
  returning id into v_novo_id;

  insert into public.itens_proposta
    (proposta_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade,
     preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
     fornecedor_id, observacoes, ordem)
  select
     v_novo_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade,
     preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
     fornecedor_id, observacoes, ordem
  from public.itens_proposta
  where proposta_id = p_proposta_id;

  return v_novo_id;
end;
$$;

comment on function public.fn_duplicar_proposta(uuid, text) is
  'Cria uma proposta em Elaboração a partir de outra, copiando o orçamento item a item.';

revoke execute on function public.fn_duplicar_proposta(uuid, text) from anon, public;
grant  execute on function public.fn_duplicar_proposta(uuid, text) to authenticated;
