-- ============================================================
-- MEDIÇÃO FATURADA NÃO SAI DE "APROVADA"
-- ============================================================
-- O furo (docs/analise-financeiro.md §2.1): fn_sync_medicao_aprovacao() apaga
-- medicao_item_orcamento em QUALQUER saída de 'Aprovada', mas ninguém olhava
-- para lancamentos_financeiros. A sequência aprovar → faturar → rejeitar
-- deixava a receita "Faturamento Obra" no razão, contando no saldo, sem nenhuma
-- execução de orçamento que a sustentasse — e com uq_faturamento_por_medicao
-- ainda ocupado, de modo que reaprovar e refaturar levantava "já foi faturada".
-- A medição também sumia da lista "Medições a Faturar", porque aquela lista
-- filtra por valor executado > 0. Ou seja: receita órfã, invisível e imutável.
--
-- Das três políticas possíveis (estornar automaticamente, marcar o lançamento
-- como "a revisar", ou bloquear a rejeição), a escolhida foi BLOQUEAR. O
-- faturamento é um ato deliberado do financeiro; desfazê-lo também deve ser.
-- A saída existe e é explícita: excluir o lançamento no módulo Financeiro
-- libera a medição (a unique é parcial em medicao_id), e o diálogo de exclusão
-- de lançamento já avisa exatamente isso.
--
-- ============================================================
-- Por que SECURITY DEFINER (não é detalhe de estilo)
-- ============================================================
-- `gestao` — que é justamente quem rejeita medições — NÃO tem política nenhuma
-- em lancamentos_financeiros. Um guard rodando como invoker enxergaria zero
-- linhas e simplesmente não dispararia, deixando passar o caso que ele existe
-- para impedir. Verificado no projeto svgkbqfozxwrbzheshuc: com jwt sem profile,
-- `select count(*) from lancamentos_financeiros where categoria='Faturamento
-- Obra'` devolve 0 com 3 linhas na tabela.
--
-- É a mesma armadilha de 20260719150001, onde v_itens_orcamento devolvia
-- valor_executado = 0 para o financeiro porque a subquery rodava como ele.
--
-- A função é trigger-only e fica revogada de anon/authenticated/public.

-- `G` e `D` no to_char seguem o lc_numeric do servidor, que no Supabase é 'C' —
-- sairia "R$ 1,250.00" num app em pt-BR. Com `,` e `.` literais o resultado é
-- determinístico, e a troca final põe os separadores na ordem brasileira.
create or replace function public.fn_formata_brl(p_valor numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select 'R$ ' || translate(to_char(coalesce(p_valor, 0), 'FM999,999,990.00'), ',.', '.,');
$$;

revoke execute on function public.fn_formata_brl(numeric) from anon, authenticated, public;

create or replace function public.fn_medicao_bloqueia_alteracao_faturada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
begin
  -- DELETE: medicao_id em lancamentos_financeiros é `on delete set null`, então
  -- apagar a medição desligaria a receita do que a originou E liberaria a
  -- unique, sem deixar rastro. Mesmo estrago da rejeição, por outra porta.
  if tg_op = 'DELETE' then
    select valor into v_valor
    from public.lancamentos_financeiros
    where medicao_id = old.id and categoria = 'Faturamento Obra'
    limit 1;

    if found then
      raise exception
        'Esta medição já foi faturada (receita de %). Exclua o faturamento no módulo Financeiro antes de excluir a medição.',
        public.fn_formata_brl(v_valor);
    end if;
    return old;
  end if;

  -- UPDATE: só interessa a saída de 'Aprovada'. Editar observação, foto ou
  -- qualquer outro campo de uma medição faturada segue permitido.
  if old.status = 'Aprovada' and new.status is distinct from 'Aprovada' then
    select valor into v_valor
    from public.lancamentos_financeiros
    where medicao_id = new.id and categoria = 'Faturamento Obra'
    limit 1;

    if found then
      raise exception
        'Esta medição já foi faturada (receita de %). Exclua o faturamento no módulo Financeiro antes de alterar a aprovação.',
        public.fn_formata_brl(v_valor);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_medicao_bloqueia_alteracao_faturada() from anon, authenticated, public;

-- BEFORE, para abortar antes de trg_sync_medicao_aprovacao (AFTER) apagar o
-- fan-out. Cobre a RPC, um UPDATE direto via PostgREST (admin/gestao têm
-- `for all` na tabela) e qualquer caminho futuro.
drop trigger if exists trg_medicao_bloqueia_alteracao_faturada on public.medicoes_obra;
create trigger trg_medicao_bloqueia_alteracao_faturada
  before update or delete on public.medicoes_obra
  for each row execute function public.fn_medicao_bloqueia_alteracao_faturada();

-- ============================================================
-- Mensagem amigável no caminho normal
-- ============================================================
-- A trigger é a garantia; esta checagem é só para o usuário receber o motivo
-- antes de a transação morrer. Corpo idêntico ao de 20260728120000 fora o
-- bloco novo.
create or replace function public.fn_rejeitar_medicao(p_medicao_id uuid, p_motivo text default null)
returns public.medicoes_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med    public.medicoes_obra;
  v_motivo text;
  v_valor  numeric;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Apenas administradores ou gestão podem rejeitar medições.';
  end if;

  select valor into v_valor
  from public.lancamentos_financeiros
  where medicao_id = p_medicao_id and categoria = 'Faturamento Obra'
  limit 1;

  if found then
    raise exception
      'Esta medição já foi faturada (receita de %) e não pode ser rejeitada. Exclua o faturamento no módulo Financeiro primeiro — isso libera a medição.',
      public.fn_formata_brl(v_valor);
  end if;

  -- Espaço em branco não é justificativa: normaliza para null em vez de gravar
  -- string vazia, senão a tela teria que tratar os dois casos.
  v_motivo := nullif(btrim(p_motivo), '');

  update public.medicoes_obra
  set status          = 'Rejeitada',
      motivo_rejeicao = v_motivo,
      aprovado_por    = auth.uid(),
      aprovado_em     = now()
  where id = p_medicao_id
  returning * into v_med;

  if not found then raise exception 'Medição não encontrada.'; end if;
  return v_med;
end;
$$;

revoke execute on function public.fn_rejeitar_medicao(uuid, text) from anon, public;
grant execute on function public.fn_rejeitar_medicao(uuid, text) to authenticated;
