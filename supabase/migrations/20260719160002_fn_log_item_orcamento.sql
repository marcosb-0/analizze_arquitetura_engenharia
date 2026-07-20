-- Fix: creating a budget item and its "aditivo" log entry were two independent
-- client round trips (ProjetoConsole.handleAddBudgetItem calling
-- onAddOrcamentoItem then onAddAlteracaoOrcamento) — if the second insert
-- failed, the item existed with no audit trail entry, and vice versa if
-- called out of order. Moves the log entry to the DB side, in the same
-- transaction as the item insert itself, so the two can never drift apart.
create or replace function public.fn_log_item_orcamento_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alteracoes_orcamento (projeto_id, item, descricao, tipo, valor)
  values (
    new.projeto_id,
    new.descricao,
    'Inclusão de item de orçamento na categoria ' || new.categoria,
    'Aumento',
    new.valor_orcado
  );
  return new;
end;
$$;

create trigger trg_log_item_orcamento_insert
  after insert on public.itens_orcamento
  for each row execute function public.fn_log_item_orcamento_insert();

revoke execute on function public.fn_log_item_orcamento_insert() from anon, authenticated, public;
