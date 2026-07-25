-- Justificativa da rejeição de medição.
--
-- Hoje fn_rejeitar_medicao só marca o boletim como 'Rejeitada'. Quem lançou (o
-- papel campo, pelo app) vê o selo vermelho e não descobre o motivo — precisa
-- ligar para alguém para saber se faltou foto, se o percentual estava errado ou
-- se a frente nem começou. Aqui o motivo passa a viajar com a medição.
--
-- Sem quebrar o cliente atual: o parâmetro novo tem default null, então a
-- chamada de hoje (`fn_rejeitar_medicao(p_medicao_id)`) continua funcionando
-- depois desta migração — a UI pode passar a enviar o motivo em seguida.

-- 1) A coluna. Nullable de propósito: as rejeições que já existem no banco não
--    têm motivo registrado e não há como inventar um.
alter table public.medicoes_obra
  add column if not exists motivo_rejeicao text;

comment on column public.medicoes_obra.motivo_rejeicao is
  'Por que a medição foi recusada. Preenchido por fn_rejeitar_medicao; limpo na aprovação. Null nas rejeições anteriores a esta migração.';

-- 2) Invariante: motivo só faz sentido em boletim rejeitado. Um "faltou foto"
--    pendurado numa medição aprovada seria dado enganoso — e aprovar uma
--    medição rejeitada é um caminho permitido (fn_aprovar_medicao só recusa a
--    que já está aprovada), então a limpeza no item 4 é o que sustenta isto.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medicoes_obra_motivo_rejeicao_check') then
    alter table public.medicoes_obra
      add constraint medicoes_obra_motivo_rejeicao_check
        check (motivo_rejeicao is null or status = 'Rejeitada');
  end if;
end $$;

-- 3) Rejeitar passa a receber o motivo.
--    O drop é necessário: mudar a lista de argumentos com `create or replace`
--    criaria uma sobrecarga em vez de substituir, e aí a chamada com um único
--    argumento ficaria ambígua entre as duas versões.
drop function if exists public.fn_rejeitar_medicao(uuid);

create or replace function public.fn_rejeitar_medicao(
  p_medicao_id uuid,
  p_motivo     text default null
)
returns public.medicoes_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med    public.medicoes_obra;
  v_motivo text;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Apenas administradores ou gestão podem rejeitar medições.';
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

-- 4) Aprovar limpa o motivo da rejeição anterior. Mesma assinatura de
--    20260720140001 (aqui `create or replace` substitui de fato); a única
--    mudança é o `motivo_rejeicao = null` no update final, que também é o que
--    mantém a constraint do item 2 satisfeita nesse caminho.
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
  set status          = 'Aprovada',
      motivo_rejeicao = null,
      aprovado_por    = auth.uid(),
      aprovado_em     = now()
  where id = p_medicao_id
  returning * into v_med;

  return v_med;
end;
$$;

-- 5) Permissões da nova assinatura (a antiga foi dropada junto com seus grants).
revoke execute on function public.fn_rejeitar_medicao(uuid, text) from anon, public;
grant  execute on function public.fn_rejeitar_medicao(uuid, text) to authenticated;

-- O papel campo já lê medicoes_obra das obras atribuídas a ele
-- (campo_select_medicoes_obra), e o select devolve a linha inteira — o motivo
-- chega ao app sem policy nova.
