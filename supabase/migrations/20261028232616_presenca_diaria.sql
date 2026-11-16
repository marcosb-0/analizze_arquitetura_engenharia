-- Presença diária da equipe: a chamada que o encarregado fazia em papel e num
-- sistema à parte (28/out/2026).
--
-- Uma linha por pessoa por dia. "Atrasou" e "saiu mais cedo" NÃO são situações
-- próprias: são um `Presente` com hora de chegada ou de saída preenchida. A
-- pessoa que chegou atrasada pode também sair cedo no mesmo dia, e como quatro
-- situações exclusivas isso não teria como ser anotado.
--
-- QUEM ESCREVE O QUÊ
--   admin/gestao -> tudo, qualquer data passada (é o histórico que vai para a
--                   contabilidade, e a gestão corrige o que o campo errou).
--   financeiro   -> só leitura (fecha folha com isso).
--   campo        -> lê e escreve SÓ a semana corrente (segunda até hoje). A
--                   semana fechada vira histórico e só a gestão altera.
--
-- O campo não lê `funcionarios` (salário, CPF e dados bancários estão lá), então
-- a lista da chamada sai de `fn_funcionarios_chamada`, que devolve só id, nome e
-- cargo — mesma solução de `fn_pessoas_atribuiveis` para `profiles`.

-- Hoje no fuso da empresa. `current_date` é o dia do servidor (UTC): das 21h à
-- meia-noite ele já é amanhã, e a chamada da noite cairia no dia seguinte.
create or replace function public.fn_hoje_empresa()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

comment on function public.fn_hoje_empresa() is
  'Data de hoje em America/Sao_Paulo. Usar em vez de current_date (UTC) para qualquer regra de calendário do dia a dia.';

-- O dia está na semana que o campo ainda pode mexer: de segunda até hoje.
-- `date_trunc('week')` é ISO, então a semana começa na segunda.
create or replace function public.fn_presenca_semana_aberta(p_data date)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_data between date_trunc('week', public.fn_hoje_empresa())::date
                    and public.fn_hoje_empresa();
$$;

create table if not exists public.presencas (
  id uuid primary key default gen_random_uuid(),
  -- `restrict`: funcionário não se apaga (soft delete desde 20260724120000), e
  -- se um dia alguém tentar, o histórico da contabilidade é o que segura.
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  data date not null,
  situacao text not null check (situacao in ('Presente','Falta')),
  hora_chegada time,
  hora_saida time,
  motivo_falta text check (motivo_falta in ('Avisou','Atestado','Sem aviso')),
  observacao text,
  lancado_por uuid not null default auth.uid() references public.profiles(id),
  alterado_por uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, data),
  constraint presenca_falta_sem_horario
    check (situacao = 'Presente' or (hora_chegada is null and hora_saida is null)),
  constraint presenca_motivo_so_na_falta
    check (situacao = 'Falta' or motivo_falta is null),
  constraint presenca_saida_depois_da_chegada
    check (hora_chegada is null or hora_saida is null or hora_saida > hora_chegada)
);

comment on table public.presencas is
  'Chamada diária: uma linha por funcionário por dia. Atraso = Presente com hora_chegada; saída antecipada = Presente com hora_saida.';
comment on column public.presencas.data is
  'Coluna `date`. No cliente, exibir com formatarDataBR — new Date(''2026-10-28'') é lido como UTC e mostra 27/10 no Brasil.';
comment on column public.presencas.hora_chegada is
  'Preenchida só quando a pessoa chegou ATRASADA. Nula = chegou no horário.';
comment on column public.presencas.hora_saida is
  'Preenchida só quando a pessoa saiu MAIS CEDO. Nula = cumpriu o horário.';

create index if not exists presencas_data_idx on public.presencas (data);

-- A trava da semana. Trigger, e não só policy, pela mensagem: a recusa da RLS
-- chega como "new row violates row-level security policy", que o encarregado
-- não tem como entender. Não lê tabela nenhuma, então não precisa de SECURITY
-- DEFINER (ver feedback_guard_security_definer) — `fn_current_role` já é.
create or replace function public.fn_presenca_guarda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_campo boolean := coalesce(public.fn_current_role(), '') = 'campo';
begin
  if tg_op in ('INSERT','UPDATE') and new.data > public.fn_hoje_empresa() then
    raise exception 'Não dá para anotar presença de um dia que ainda não chegou.';
  end if;

  if v_campo then
    if tg_op in ('UPDATE','DELETE') and not public.fn_presenca_semana_aberta(old.data) then
      raise exception 'Este dia já fechou. Só a semana atual pode ser alterada — peça à gestão para corrigir.';
    end if;
    if tg_op in ('INSERT','UPDATE') and not public.fn_presenca_semana_aberta(new.data) then
      raise exception 'Só a semana atual pode ser anotada — peça à gestão para corrigir dias anteriores.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_presenca_guarda() from anon, authenticated, public;

drop trigger if exists trg_presenca_guarda on public.presencas;
create trigger trg_presenca_guarda
  before insert or update or delete on public.presencas
  for each row execute function public.fn_presenca_guarda();

-- Carimbo. Prefixo `trg_z_` porque BEFORE dispara em ordem alfabética, e o
-- carimbo não deve rodar antes do guarda.
create or replace function public.fn_presenca_carimbo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.alterado_por := auth.uid();
  if tg_op = 'UPDATE' then
    -- Quem lançou primeiro não muda ao corrigir; o upsert do cliente reenvia a
    -- linha inteira e não deve reescrever a autoria.
    new.lancado_por := old.lancado_por;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_presenca_carimbo() from anon, authenticated, public;

drop trigger if exists trg_z_presenca_carimbo on public.presencas;
create trigger trg_z_presenca_carimbo
  before insert or update on public.presencas
  for each row execute function public.fn_presenca_carimbo();

alter table public.presencas enable row level security;

drop policy if exists "admin_all_presencas" on public.presencas;
create policy "admin_all_presencas" on public.presencas for all
  using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_presencas" on public.presencas;
create policy "gestao_all_presencas" on public.presencas for all
  using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

drop policy if exists "financeiro_select_presencas" on public.presencas;
create policy "financeiro_select_presencas" on public.presencas for select
  using (public.fn_current_role() = 'financeiro');

-- O campo enxerga só a semana aberta: a tela dele não mostra mais que isso, e
-- o histórico (com motivos de falta e atestados) é da gestão.
drop policy if exists "campo_select_presencas" on public.presencas;
create policy "campo_select_presencas" on public.presencas for select
  using (public.fn_current_role() = 'campo' and public.fn_presenca_semana_aberta(data));

drop policy if exists "campo_insert_presencas" on public.presencas;
create policy "campo_insert_presencas" on public.presencas for insert
  with check (public.fn_current_role() = 'campo' and public.fn_presenca_semana_aberta(data));

drop policy if exists "campo_update_presencas" on public.presencas;
create policy "campo_update_presencas" on public.presencas for update
  using (public.fn_current_role() = 'campo' and public.fn_presenca_semana_aberta(data))
  with check (public.fn_current_role() = 'campo' and public.fn_presenca_semana_aberta(data));

drop policy if exists "campo_delete_presencas" on public.presencas;
create policy "campo_delete_presencas" on public.presencas for delete
  using (public.fn_current_role() = 'campo' and public.fn_presenca_semana_aberta(data));

-- A lista da chamada: todos os ativos, só nome e cargo.
create or replace function public.fn_funcionarios_chamada()
returns table (id uuid, nome text, cargo text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.nome, f.cargo
    from public.funcionarios f
   where f.status = 'Ativo'
     -- Sem profile (`fn_current_role` nulo) não recebe ninguém.
     and coalesce(public.fn_current_role(), '') <> ''
   order by f.nome;
$$;

comment on function public.fn_funcionarios_chamada() is
  'Id, nome e cargo dos funcionários ativos, para a chamada do campo. SECURITY DEFINER porque campo não lê funcionarios; devolve só estas 3 colunas para não expor salário, CPF e dados bancários.';

revoke execute on function public.fn_funcionarios_chamada() from anon, public;
grant execute on function public.fn_funcionarios_chamada() to authenticated;
