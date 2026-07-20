-- Server-side lifecycle rules, mirroring the client-side guards just added in
-- ProjetoConsole. Client-only enforcement doesn't cover direct API writes or
-- the 'campo' role's separate mobile app (not in this repo) — the DB is the
-- only place that sees every write path.

-- 1) Can't measure a paused/finished obra. Runs BEFORE INSERT so it can
--    reject the row outright.
create or replace function public.fn_check_projeto_ativo_para_medicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_situacao text;
begin
  select situacao into v_situacao from public.projetos where id = new.projeto_id;
  if v_situacao in ('Pausado', 'Finalizado') then
    raise exception 'Não é possível lançar medições em uma obra com situação "%".', v_situacao;
  end if;
  return new;
end;
$$;

create trigger trg_check_projeto_ativo_para_medicao
  before insert on public.medicoes_obra
  for each row execute function public.fn_check_projeto_ativo_para_medicao();

-- 2) A obra's first medição is the real signal that execution started —
--    auto-promote out of 'Planejamento'. Runs AFTER INSERT, so by the time it
--    fires the guard above has already ruled out Pausado/Finalizado; this only
--    ever transitions Planejamento -> Em Execução, never touches other states.
create or replace function public.fn_auto_ativar_projeto_em_medicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projetos
  set situacao = 'Em Execução'
  where id = new.projeto_id and situacao = 'Planejamento';
  return new;
end;
$$;

create trigger trg_auto_ativar_projeto_em_medicao
  after insert on public.medicoes_obra
  for each row execute function public.fn_auto_ativar_projeto_em_medicao();

revoke execute on function public.fn_check_projeto_ativo_para_medicao() from anon, authenticated, public;
revoke execute on function public.fn_auto_ativar_projeto_em_medicao() from anon, authenticated, public;
