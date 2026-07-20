-- Server-side enforcement to match the client-side check just added in
-- ProjetoConsole: the invariant that matters is the sum of peso_percentual
-- PER ITEM across all etapas that draw from it (not per etapa across its
-- several items — an etapa CAN legitimately claim 100% of several different
-- items at once, see the seed data in fn_criar_projeto_padrao). Without this,
-- fn_apply_medicao would apply more than 100% of an item's valor_orcado once
-- every etapa referencing it reaches full completion — a modeling error, not
-- a legitimate field overrun. Client-side validation alone doesn't protect
-- against direct API writes or a future mobile client.
create or replace function public.fn_check_peso_vinculo_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric;
begin
  select coalesce(sum(peso_percentual), 0) into v_soma
  from public.etapa_orcamento_vinculo
  where item_orcamento_id = new.item_orcamento_id
    and id <> new.id;

  if v_soma + new.peso_percentual > 100 then
    raise exception 'A soma dos pesos vinculados a este item de orçamento não pode ultrapassar 100%% (já alocado: %, tentando adicionar: %).', v_soma, new.peso_percentual;
  end if;

  return new;
end;
$$;

create trigger trg_check_peso_vinculo_item
  before insert or update on public.etapa_orcamento_vinculo
  for each row execute function public.fn_check_peso_vinculo_item();

revoke execute on function public.fn_check_peso_vinculo_item() from anon, authenticated, public;
