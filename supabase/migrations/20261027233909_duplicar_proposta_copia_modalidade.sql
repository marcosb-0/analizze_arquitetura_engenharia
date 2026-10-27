-- A cópia leva a modalidade (20261027233700). Sem isto, duplicar uma proposta
-- "só mão de obra" copiava o texto do descritivo mas não a coluna, e a cópia
-- nascia com o valor completo, com material.
create or replace function public.fn_duplicar_proposta(p_proposta_id uuid, p_descricao text default null)
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
    (cliente_id, descricao, valor_manual, bdi_percentual, prazo_execucao_dias, data_validade, status, modalidade)
  values
    (v_origem.cliente_id,
     coalesce(nullif(btrim(p_descricao), ''), v_origem.descricao || ' (cópia)'),
     v_origem.valor_manual,
     v_origem.bdi_percentual,
     v_origem.prazo_execucao_dias,
     null,
     'Elaboração',
     v_origem.modalidade)
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

  delete from public.proposta_secoes where proposta_id = v_novo_id;

  insert into public.proposta_secoes
    (proposta_id, titulo, corpo, posicao, ordem, modelo_id)
  select v_novo_id, titulo, corpo, posicao, ordem, modelo_id
    from public.proposta_secoes
   where proposta_id = p_proposta_id;

  return v_novo_id;
end;
$$;
