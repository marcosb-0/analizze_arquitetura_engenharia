-- A6 (auditoria-360 §C): fn_gerar_lancamento_medicao protegia o status por
-- efeito colateral (só medição aprovada tinha itens em medicao_item_orcamento,
-- então v_valor<=0 barrava as demais). Se o fan-out da aprovação mudar, essa
-- guarda some em silêncio. Torna explícita: só medição 'Aprovada' fatura.
-- Recria a função idêntica com a checagem logo após a busca da medição.
create or replace function public.fn_gerar_lancamento_medicao(p_medicao_id uuid, p_conta_id uuid, p_pago boolean default false)
returns lancamentos_financeiros
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_medicao      record;
  v_projeto_nome text;
  v_valor        numeric;
  v_lancamento   public.lancamentos_financeiros;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem faturar medições.';
  end if;

  select * into v_medicao from public.medicoes_obra where id = p_medicao_id;
  if not found then
    raise exception 'Medição não encontrada.';
  end if;

  -- Guarda explícita (antes era indireta, via v_valor<=0).
  if v_medicao.status is distinct from 'Aprovada' then
    raise exception 'Só medições aprovadas podem ser faturadas (situação atual: %).', coalesce(v_medicao.status, 'sem status');
  end if;

  if not exists (select 1 from public.contas_financeiras where id = p_conta_id) then
    raise exception 'Conta financeira não encontrada.';
  end if;

  select coalesce(sum(valor_aplicado), 0) into v_valor
  from public.medicao_item_orcamento
  where medicao_id = p_medicao_id;

  if v_valor <= 0 then
    raise exception 'Esta medição não tem valor executado para faturar (sem itens de orçamento vinculados à etapa).';
  end if;

  if exists (
    select 1 from public.lancamentos_financeiros
    where medicao_id = p_medicao_id and categoria = 'Faturamento Obra'
  ) then
    raise exception 'Esta medição já foi faturada.';
  end if;

  select nome into v_projeto_nome from public.projetos where id = v_medicao.projeto_id;

  insert into public.lancamentos_financeiros (
    tipo, descricao, valor, data, categoria, pago, conta_id, projeto_id, medicao_id
  ) values (
    'Receita',
    'Faturamento de medição — ' || coalesce(v_projeto_nome, 'Obra') ||
      ' (' || to_char(v_medicao.data_medicao, 'DD/MM/YYYY') || ')',
    v_valor,
    current_date,
    'Faturamento Obra',
    p_pago,
    p_conta_id,
    v_medicao.projeto_id,
    p_medicao_id
  )
  returning * into v_lancamento;

  return v_lancamento;
end;
$function$;
