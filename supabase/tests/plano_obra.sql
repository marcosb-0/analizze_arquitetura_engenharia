-- ============================================================
-- Compromissos de custo e revisões do plano da obra — teste executável
-- ============================================================
-- Cobre 20260920004627_compromissos_e_revisoes_obra.sql.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/plano_obra.sql
--
-- ou cole no SQL Editor. **Nada é persistido**: o bloco termina num `raise
-- exception` que devolve o relatório e reverte tudo, inclusive o rebaixamento
-- temporário de papel usado para encenar cada perfil.
--
-- PRÉ-REQUISITOS: dois admins ativos (o teste rebaixa um) e uma obra com pelo
-- menos uma etapa. Mesma convenção de `papeis.sql`.
--
-- O QUE ESTE TESTE PROTEGE, e por quê
--
-- `fn_aprovar_plano_obra` é SECURITY DEFINER: ela grava numa tabela em que
-- ninguém tem INSERT. A única barreira é o `if` do início. `fn_current_role()` é
-- NULL para quem não tem perfil ativo, e `NULL not in ('admin','gestao')` é NULL,
-- não true — sem `coalesce` o `if` não dispara. O caso que pega isso é o do
-- ADMIN INATIVO (perfil existe, papel efetivo é NULL): validado por mutação em
-- 20/set/2026, sem o `coalesce` ele aprova. "Sem perfil nenhum" não serve de
-- prova, porque a FK de `aprovado_por` barra o insert por outro motivo.
do $$
declare
  v_alvo   uuid;
  v_admin  uuid;
  v_res    text := E'\n';
  v_proj   uuid;
  v_etapa  uuid;
  v_outra_etapa uuid;
  v_comp   uuid;
  v_num    int;
  v_n      int;
  v_linhas int;
  v_rev    record;
  v_soma   numeric;
  v_qtd_itens int;
  v_del    "char";
begin
  select id into v_alvo  from public.profiles where role='admin' and active order by created_at limit 1;
  select id into v_admin from public.profiles where role='admin' and active and id <> v_alvo limit 1;
  if v_admin is null then
    raise exception 'PRÉ-REQUISITO: são necessários 2 admins ativos (o teste rebaixa um temporariamente).';
  end if;
  select e.projeto_id, e.id into v_proj, v_etapa from public.etapas_cronograma e limit 1;
  if v_proj is null then
    raise exception 'PRÉ-REQUISITO: é necessária uma obra com pelo menos uma etapa.';
  end if;
  select id into v_outra_etapa from public.etapas_cronograma where projeto_id <> v_proj limit 1;

  -- ==========================================================
  -- PAPEL: admin (o próprio v_admin, sem rebaixar)
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;

  insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
  values (v_proj, v_etapa, 'Contrato de teste', 1500.00) returning id into v_comp;
  v_res := v_res || '[OK ] admin cria compromisso' || E'\n';

  if v_outra_etapa is not null then
    begin
      insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
      values (v_proj, v_outra_etapa, 'Etapa de outra obra', 10);
      v_res := v_res || '[FALHA] compromisso aceitou etapa de OUTRA obra' || E'\n';
    exception when others then
      v_res := v_res || format('[OK ] etapa de outra obra recusada (%s)%s', sqlerrm, E'\n');
    end;
  else
    v_res := v_res || '[--- ] sem segunda obra no banco: caso "etapa de outra obra" pulado' || E'\n';
  end if;

  begin
    insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
    values (v_proj, v_etapa, 'Valor zero', 0);
    v_res := v_res || '[FALHA] compromisso de valor zero foi aceito' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] valor zero recusado' || E'\n';
  end;

  -- Cancelar exige motivo, e só o cancelamento é permitido como mudança.
  begin
    update public.compromissos_custo
       set situacao='Cancelado', cancelado_por=v_admin, cancelado_em=now(), motivo_cancelamento='  '
     where id = v_comp;
    v_res := v_res || '[FALHA] cancelou sem motivo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] cancelamento sem motivo recusado' || E'\n';
  end;

  begin
    update public.compromissos_custo set valor = 1 where id = v_comp;
    v_res := v_res || '[FALHA] alterou o valor de um compromisso' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] valor de compromisso e imutavel' || E'\n';
  end;

  begin
    update public.compromissos_custo
       set situacao='Cancelado', cancelado_por=gen_random_uuid(), cancelado_em=now(), motivo_cancelamento='x'
     where id = v_comp;
    v_res := v_res || '[FALHA] cancelou em nome de outro usuario' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] cancelado_por precisa ser quem cancela' || E'\n';
  end;

  -- Snapshot: número sequencial, e o conteúdo bate com o que existia.
  select count(*) into v_qtd_itens from public.itens_orcamento where projeto_id = v_proj;
  select coalesce(sum(valor_orcado), 0) into v_soma from public.itens_orcamento where projeto_id = v_proj;
  v_num := public.fn_aprovar_plano_obra(v_proj, '  Primeira aprovacao  ');
  select * into v_rev from public.revisoes_plano_obra where projeto_id = v_proj and numero = v_num;
  v_res := v_res || format('[%s] admin aprova o plano (revisao %s, motivo aparado=%s)%s',
    case when v_num >= 1 and v_rev.motivo = 'Primeira aprovacao' then 'OK ' else 'FALHA' end,
    v_num, v_rev.motivo, E'\n');
  v_res := v_res || format('[%s] foto guarda os itens (%s de %s) e a receita (%s de %s)%s',
    case when jsonb_array_length(v_rev.itens) = v_qtd_itens and v_rev.receita_orcada = v_soma then 'OK ' else 'FALHA' end,
    jsonb_array_length(v_rev.itens), v_qtd_itens, v_rev.receita_orcada, v_soma, E'\n');
  v_res := v_res || format('[%s] aprovar de novo numera a revisao seguinte (%s -> %s)%s',
    case when public.fn_aprovar_plano_obra(v_proj, 'Segunda') = v_num + 1 then 'OK ' else 'FALHA' end,
    v_num, v_num + 1, E'\n');

  begin
    perform public.fn_aprovar_plano_obra(v_proj, '   ');
    v_res := v_res || '[FALHA] aprovou sem motivo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] aprovacao sem motivo recusada' || E'\n';
  end;

  begin
    perform public.fn_aprovar_plano_obra(gen_random_uuid(), 'obra que nao existe');
    v_res := v_res || '[FALHA] aprovou obra inexistente' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] obra inexistente recusada' || E'\n';
  end;

  -- A revisão é imutável para quem usa a API: só existe SELECT.
  begin
    update public.revisoes_plano_obra set motivo = 'reescrita' where projeto_id = v_proj;
    v_res := v_res || '[FALHA] revisao aprovada foi reescrita' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] revisao nao pode ser reescrita (sem UPDATE)' || E'\n';
  end;
  begin
    delete from public.revisoes_plano_obra where projeto_id = v_proj;
    v_res := v_res || '[FALHA] revisao aprovada foi apagada' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] revisao nao pode ser apagada (sem DELETE)' || E'\n';
  end;
  begin
    delete from public.compromissos_custo where id = v_comp;
    v_res := v_res || '[FALHA] compromisso foi apagado (deveria so cancelar)' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] compromisso nao se apaga, so se cancela (sem DELETE)' || E'\n';
  end;

  update public.compromissos_custo
     set situacao='Cancelado', cancelado_por=v_admin, cancelado_em=now(), motivo_cancelamento='Contrato desfeito'
   where id = v_comp;
  get diagnostics v_linhas = row_count;
  v_res := v_res || format('[%s] admin cancela com motivo (linhas=%s)%s',
    case when v_linhas = 1 then 'OK ' else 'FALHA' end, v_linhas, E'\n');
  begin
    update public.compromissos_custo
       set situacao='Cancelado', cancelado_por=v_admin, cancelado_em=now(), motivo_cancelamento='de novo'
     where id = v_comp;
    v_res := v_res || '[FALHA] cancelou um compromisso ja cancelado' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] compromisso cancelado nao muda mais' || E'\n';
  end;

  -- Excluir a OBRA tem de continuar possível: a FK da etapa não pode ser
  -- `restrict`, que é checado na hora e barraria a cascata da obra.
  reset role;
  select confdeltype into v_del from pg_constraint
   where conrelid = 'public.compromissos_custo'::regclass and contype = 'f'
     and confrelid = 'public.etapas_cronograma'::regclass;
  v_res := v_res || format('[%s] FK etapa->compromisso e "no action" (%s), nao "restrict"%s',
    case when v_del = 'a' then 'OK ' else 'FALHA' end, v_del, E'\n');

  -- ==========================================================
  -- PAPEL: gestao
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='gestao' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
  values (v_proj, v_etapa, 'Da gestao', 200) returning id into v_comp;
  v_res := v_res || '[OK ] gestao cria compromisso' || E'\n';
  v_num := public.fn_aprovar_plano_obra(v_proj, 'Aprovado pela gestao');
  v_res := v_res || format('[OK ] gestao aprova o plano (revisao %s)%s', v_num, E'\n');

  -- ==========================================================
  -- PAPEL: financeiro — lê, mas não escreve nem aprova
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role='financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  select count(*) into v_n from public.compromissos_custo where projeto_id = v_proj;
  v_res := v_res || format('[%s] financeiro LE compromissos (%s linhas)%s',
    case when v_n >= 1 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.revisoes_plano_obra where projeto_id = v_proj;
  v_res := v_res || format('[%s] financeiro LE revisoes (%s linhas)%s',
    case when v_n >= 1 then 'OK ' else 'FALHA' end, v_n, E'\n');
  begin
    insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
    values (v_proj, v_etapa, 'Financeiro nao cria', 5);
    v_res := v_res || '[FALHA] financeiro criou compromisso' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] financeiro nao cria compromisso' || E'\n';
  end;
  update public.compromissos_custo
     set situacao='Cancelado', cancelado_por=v_alvo, cancelado_em=now(), motivo_cancelamento='x'
   where id = v_comp;
  get diagnostics v_linhas = row_count;
  v_res := v_res || format('[%s] financeiro nao cancela compromisso (linhas=%s)%s',
    case when v_linhas = 0 then 'OK ' else 'FALHA' end, v_linhas, E'\n');
  begin
    perform public.fn_aprovar_plano_obra(v_proj, 'Financeiro nao aprova');
    v_res := v_res || '[FALHA] financeiro aprovou o plano' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] financeiro barrado em fn_aprovar_plano_obra (%s)%s', sqlerrm, E'\n');
  end;

  -- ==========================================================
  -- PAPEL: campo — não vê nada disto
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role='campo' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  select count(*) into v_n from public.compromissos_custo;
  v_res := v_res || format('[%s] campo nao le compromissos (%s linhas)%s',
    case when v_n = 0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.revisoes_plano_obra;
  v_res := v_res || format('[%s] campo nao le revisoes (%s linhas)%s',
    case when v_n = 0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  begin
    perform public.fn_aprovar_plano_obra(v_proj, 'Campo nao aprova');
    v_res := v_res || '[FALHA] campo aprovou o plano' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] campo barrado em fn_aprovar_plano_obra' || E'\n';
  end;

  -- ==========================================================
  -- PERFIL INATIVO (o que o `coalesce` fecha) e SEM PERFIL (que a FK já barra)
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  begin
    perform public.fn_aprovar_plano_obra(v_proj, 'Usuario sem perfil');
    v_res := v_res || '[FALHA] usuario SEM PERFIL aprovou o plano (fn_current_role() NULL passou pelo if)' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] usuario sem perfil barrado em fn_aprovar_plano_obra (%s)%s', sqlerrm, E'\n');
  end;
  begin
    insert into public.compromissos_custo (projeto_id, etapa_id, descricao, valor)
    values (v_proj, v_etapa, 'Sem perfil', 5);
    v_res := v_res || '[FALHA] usuario sem perfil criou compromisso' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] usuario sem perfil nao cria compromisso' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role='admin', active=false where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  begin
    perform public.fn_aprovar_plano_obra(v_proj, 'Admin inativo');
    v_res := v_res || '[FALHA] admin INATIVO aprovou o plano' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] admin inativo barrado em fn_aprovar_plano_obra' || E'\n';
  end;

  -- ==========================================================
  -- anon: sem EXECUTE e sem tabela
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform public.fn_aprovar_plano_obra(v_proj, 'anon');
    v_res := v_res || '[FALHA] anon executou fn_aprovar_plano_obra' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem EXECUTE em fn_aprovar_plano_obra' || E'\n';
  end;
  begin
    perform 1 from public.compromissos_custo limit 1;
    v_res := v_res || '[FALHA] anon leu compromissos_custo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem acesso a compromissos_custo' || E'\n';
  end;

  reset role;
  raise exception 'PLANO DA OBRA — transacao revertida, nada foi gravado:%', v_res;
end $$;
