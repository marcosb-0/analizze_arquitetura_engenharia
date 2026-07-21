-- Fase 3: financeiro alimentado pela medição.
--
-- Hoje não existe ligação entre a execução da obra (medições) e o caixa: todo
-- lançamento é manual e desconectado. Esta migration liga os dois SEM escrita
-- silenciosa — o financeiro revisa e confirma o faturamento de cada medição.
--
-- 1) Rastreia qual medição originou um lançamento (evita faturar duas vezes e
--    permite a lista "a faturar").
alter table public.lancamentos_financeiros
  add column if not exists medicao_id uuid references public.medicoes_obra(id) on delete set null;

-- Uma medição só pode ter um faturamento (receita "Faturamento Obra").
create unique index if not exists uq_faturamento_por_medicao
  on public.lancamentos_financeiros (medicao_id)
  where medicao_id is not null and categoria = 'Faturamento Obra';

-- 2) O papel 'financeiro' precisa enxergar as medições para montar a lista
--    "a faturar" (read-only, mesmo espírito de financeiro_select_medicao_item_orcamento).
create policy "financeiro_select_medicoes_obra" on public.medicoes_obra
  for select using (public.fn_current_role() = 'financeiro');

-- 3) Gera, sob confirmação, uma receita "Faturamento Obra" a partir de uma
--    medição. O valor é a soma do que a medição executou no orçamento
--    (medicao_item_orcamento.valor_aplicado) — calculado no servidor, não no
--    cliente. pago=false por padrão: entra como "a receber" para revisão.
create or replace function public.fn_gerar_lancamento_medicao(
  p_medicao_id uuid,
  p_conta_id   uuid,
  p_pago       boolean default false
)
returns public.lancamentos_financeiros
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.fn_gerar_lancamento_medicao(uuid, uuid, boolean) from anon;
revoke execute on function public.fn_gerar_lancamento_medicao(uuid, uuid, boolean) from public;
grant  execute on function public.fn_gerar_lancamento_medicao(uuid, uuid, boolean) to authenticated;
