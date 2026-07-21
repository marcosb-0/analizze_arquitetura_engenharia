-- Fase 4: aprovação de medição + trilha de auditoria.
--
-- Hoje a medição é aplicada instantaneamente no insert (trg_apply_medicao): o
-- fan-out para o orçamento e a promoção da obra acontecem sem revisão. Aqui
-- introduzimos o estado Pendente/Aprovada/Rejeitada. O efeito financeiro (fan-out)
-- e a promoção Planejamento->Em Execução passam a ocorrer SÓ na aprovação; campo
-- lança Pendente, admin/gestão aprova. Rejeitar uma medição já aprovada desfaz o
-- fan-out. O acumulado por etapa não pode passar de 100% sem override explícito.

-- 1) Estado + trilha.
alter table public.medicoes_obra
  add column if not exists status text not null default 'Pendente'
    check (status in ('Pendente','Aprovada','Rejeitada')),
  add column if not exists aprovado_por uuid references public.profiles(id) on delete set null,
  add column if not exists aprovado_em timestamptz;

-- Medições pré-existentes já estão aplicadas (têm fan-out e já promoveram a
-- obra) — marque-as Aprovadas para manter a consistência. Feito ANTES de criar
-- o novo trigger, para não recomputar o fan-out em massa.
update public.medicoes_obra set status = 'Aprovada' where status = 'Pendente';

-- 2) Fan-out na transição para 'Aprovada' (não mais no insert).
drop trigger if exists trg_apply_medicao on public.medicoes_obra;
drop trigger if exists trg_auto_ativar_projeto_em_medicao on public.medicoes_obra;
drop function if exists public.fn_apply_medicao();
drop function if exists public.fn_auto_ativar_projeto_em_medicao();

create or replace function public.fn_sync_medicao_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Aprovada'
     and (tg_op = 'INSERT' or old.status is distinct from 'Aprovada') then
    -- (Re)aplica o fan-out por vínculo etapa<->orçamento (idempotente).
    delete from public.medicao_item_orcamento where medicao_id = new.id;
    insert into public.medicao_item_orcamento (medicao_id, item_orcamento_id, valor_aplicado)
    select
      new.id,
      v.item_orcamento_id,
      (new.percentual_medido / 100.0) * (v.peso_percentual / 100.0) * io.valor_orcado
    from public.etapa_orcamento_vinculo v
    join public.itens_orcamento io on io.id = v.item_orcamento_id
    where v.etapa_id = new.etapa_id;

    -- 1ª medição aprovada tira a obra do Planejamento.
    update public.projetos
    set situacao = 'Em Execução'
    where id = new.projeto_id and situacao = 'Planejamento';

  elsif tg_op = 'UPDATE'
        and old.status = 'Aprovada' and new.status is distinct from 'Aprovada' then
    -- Aprovação revogada: desfaz o efeito financeiro.
    delete from public.medicao_item_orcamento where medicao_id = new.id;
  end if;

  return new;
end;
$$;

create trigger trg_sync_medicao_aprovacao
  after insert or update of status on public.medicoes_obra
  for each row execute function public.fn_sync_medicao_aprovacao();

-- 3) Progresso da etapa passa a contar apenas medições Aprovadas.
create or replace view public.v_etapas_cronograma
with (security_invoker = true) as
select
  e.*,
  least(100, coalesce((
    select sum(m.percentual_medido) from public.medicoes_obra m
    where m.etapa_id = e.id and m.status = 'Aprovada'
  ), 0)) as percentual_executado,
  case
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id and m.status = 'Aprovada'), 0) >= 100
      then 'Concluído'
    when e.data_fim is not null and e.data_fim < current_date
      then 'Atrasado'
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id and m.status = 'Aprovada'), 0) > 0
      then 'Em Andamento'
    else 'Não Iniciado'
  end as status
from public.etapas_cronograma e;

-- 4) Aprovar / rejeitar (só admin/gestão). A aprovação valida o acumulado da
--    etapa; passar de 100% exige override. O trigger acima faz/desfaz o fan-out.
create or replace function public.fn_aprovar_medicao(
  p_medicao_id       uuid,
  p_permitir_overrun boolean default false
)
returns public.medicoes_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med public.medicoes_obra;
  v_acc numeric;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Apenas administradores ou gestão podem aprovar medições.';
  end if;

  select * into v_med from public.medicoes_obra where id = p_medicao_id for update;
  if not found then raise exception 'Medição não encontrada.'; end if;
  if v_med.status = 'Aprovada' then raise exception 'Esta medição já está aprovada.'; end if;

  select coalesce(sum(percentual_medido), 0) into v_acc
  from public.medicoes_obra
  where etapa_id = v_med.etapa_id and status = 'Aprovada' and id <> p_medicao_id;

  if (v_acc + v_med.percentual_medido) > 100 and not p_permitir_overrun then
    raise exception 'A aprovação faria o acumulado da etapa ultrapassar 100%% (ficaria em %). Confirme o override para prosseguir.', round(v_acc + v_med.percentual_medido, 2);
  end if;

  update public.medicoes_obra
  set status = 'Aprovada', aprovado_por = auth.uid(), aprovado_em = now()
  where id = p_medicao_id
  returning * into v_med;

  return v_med;
end;
$$;

create or replace function public.fn_rejeitar_medicao(p_medicao_id uuid)
returns public.medicoes_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med public.medicoes_obra;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Apenas administradores ou gestão podem rejeitar medições.';
  end if;

  update public.medicoes_obra
  set status = 'Rejeitada', aprovado_por = auth.uid(), aprovado_em = now()
  where id = p_medicao_id
  returning * into v_med;

  if not found then raise exception 'Medição não encontrada.'; end if;
  return v_med;
end;
$$;

revoke execute on function public.fn_sync_medicao_aprovacao() from anon, authenticated, public;
revoke execute on function public.fn_aprovar_medicao(uuid, boolean) from anon, public;
grant  execute on function public.fn_aprovar_medicao(uuid, boolean) to authenticated;
revoke execute on function public.fn_rejeitar_medicao(uuid) from anon, public;
grant  execute on function public.fn_rejeitar_medicao(uuid) to authenticated;
