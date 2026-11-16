-- ============================================================
-- Presença diária — teste executável
-- ============================================================
-- Cobre 20261028232616_presenca_diaria.sql.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/presenca.sql
--
-- ou cole no SQL Editor. **Nada é persistido**: o bloco termina num `raise
-- exception` que devolve o relatório e reverte tudo.
--
-- PRÉ-REQUISITOS: dois admins ativos (o teste rebaixa um) e um funcionário
-- ativo. Mesma convenção de `papeis.sql` e `centro_custo.sql`.
--
-- O QUE ESTE TESTE PROTEGE
--
-- 1. A trava da semana do `campo`. É a única regra que o encarregado sente, e
--    ela mora em dois lugares (policy e guarda): se a policy afrouxar, o guarda
--    ainda segura; se o guarda sumir, a policy recusa com mensagem ilegível.
--    O teste exige a recusa NOS DOIS sentidos — escrever um dia fechado e mover
--    um dia aberto para um fechado.
-- 2. `fn_funcionarios_chamada` devolve três colunas e só ativos: é a porta que o
--    campo tem para `funcionarios`, onde mora o salário.
-- 3. A segunda gravação do mesmo dia é UPDATE, e a autoria original fica.
do $$
declare
  v_alvo   uuid;
  v_admin  uuid;
  v_func   uuid;
  v_res    text := E'\n';
  v_hoje   date := public.fn_hoje_empresa();
  v_segunda date := date_trunc('week', public.fn_hoje_empresa())::date;
  v_n      int;
  v_autor  uuid;
begin
  select id into v_alvo  from public.profiles where role='admin' and active order by created_at limit 1;
  select id into v_admin from public.profiles where role='admin' and active and id <> v_alvo limit 1;
  if v_admin is null then
    raise exception 'PRÉ-REQUISITO: são necessários 2 admins ativos (o teste rebaixa um temporariamente).';
  end if;
  select id into v_func from public.funcionarios where status = 'Ativo' limit 1;
  if v_func is null then
    raise exception 'PRÉ-REQUISITO: é necessário um funcionário ativo.';
  end if;
  delete from public.presencas where funcionario_id = v_func and data in (v_hoje, v_segunda - 7, v_hoje + 1);

  -- ==========================================================
  -- PAPEL: campo
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role = 'campo' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.funcionarios;
  if v_n = 0 then
    v_res := v_res || '[OK ] campo não lê funcionarios direto' || E'\n';
  else
    v_res := v_res || '[FALHA] campo leu funcionarios (salário exposto)' || E'\n';
  end if;

  select count(*) into v_n from public.fn_funcionarios_chamada() c where c.id = v_func;
  if v_n = 1 then
    v_res := v_res || '[OK ] chamada lista o funcionário ativo' || E'\n';
  else
    v_res := v_res || '[FALHA] chamada não listou o funcionário ativo' || E'\n';
  end if;

  if pg_get_function_result('public.fn_funcionarios_chamada()'::regprocedure) = 'TABLE(id uuid, nome text, cargo text)' then
    v_res := v_res || '[OK ] chamada devolve só id, nome e cargo' || E'\n';
  else
    v_res := v_res || '[FALHA] assinatura da chamada mudou: ' || pg_get_function_result('public.fn_funcionarios_chamada()'::regprocedure) || E'\n';
  end if;

  begin
    insert into public.presencas (funcionario_id, data, situacao, hora_chegada)
    values (v_func, v_hoje, 'Presente', '07:40');
    v_res := v_res || '[OK ] campo anota hoje (atrasado 07:40)' || E'\n';
  exception when others then
    v_res := v_res || format('[FALHA] campo não anotou hoje: %s%s', sqlerrm, E'\n');
  end;

  begin
    insert into public.presencas (funcionario_id, data, situacao)
    values (v_func, v_segunda - 7, 'Presente');
    v_res := v_res || '[FALHA] campo anotou a semana passada' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] semana passada recusada (%s)%s', sqlerrm, E'\n');
  end;

  begin
    insert into public.presencas (funcionario_id, data, situacao)
    values (v_func, v_hoje + 1, 'Presente');
    v_res := v_res || '[FALHA] campo anotou amanhã' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] dia futuro recusado' || E'\n';
  end;

  begin
    update public.presencas set data = v_segunda - 7 where funcionario_id = v_func and data = v_hoje;
    v_res := v_res || '[FALHA] campo moveu o lançamento para a semana passada' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] mover para semana fechada recusado' || E'\n';
  end;

  begin
    update public.presencas set situacao = 'Falta', hora_chegada = '07:40', hora_saida = null
     where funcionario_id = v_func and data = v_hoje;
    v_res := v_res || '[FALHA] aceitou falta com horário de chegada' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] falta com horário recusada' || E'\n';
  end;

  -- Segunda gravação do dia, como o app faz: upsert.
  insert into public.presencas (funcionario_id, data, situacao, motivo_falta)
  values (v_func, v_hoje, 'Falta', 'Atestado')
  on conflict (funcionario_id, data) do update
    set situacao = excluded.situacao, hora_chegada = null, hora_saida = null, motivo_falta = excluded.motivo_falta;
  select count(*), max(lancado_por::text)::uuid into v_n, v_autor
    from public.presencas where funcionario_id = v_func and data = v_hoje;
  if v_n = 1 and v_autor = v_alvo then
    v_res := v_res || '[OK ] regravar o dia atualiza a mesma linha e mantém a autoria' || E'\n';
  else
    v_res := v_res || format('[FALHA] regravar deu %s linha(s), autor %s%s', v_n, v_autor, E'\n');
  end if;

  -- ==========================================================
  -- PAPEL: admin — corrige a semana fechada
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.presencas (funcionario_id, data, situacao, hora_saida)
    values (v_func, v_segunda - 7, 'Presente', '15:00');
    v_res := v_res || '[OK ] admin corrige a semana passada' || E'\n';
  exception when others then
    v_res := v_res || format('[FALHA] admin não corrigiu a semana passada: %s%s', sqlerrm, E'\n');
  end;

  -- O campo não vê o que a gestão gravou na semana fechada.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.presencas where data < v_segunda;
  if v_n = 0 then
    v_res := v_res || '[OK ] campo só enxerga a semana aberta' || E'\n';
  else
    v_res := v_res || format('[FALHA] campo enxergou %s lançamento(s) de semanas fechadas%s', v_n, E'\n');
  end if;
  update public.presencas set situacao = 'Presente' where data = v_segunda - 7 and funcionario_id = v_func;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    v_res := v_res || '[OK ] campo não altera a semana fechada' || E'\n';
  else
    v_res := v_res || '[FALHA] campo alterou a semana fechada' || E'\n';
  end if;

  -- ==========================================================
  -- anon
  -- ==========================================================
  reset role;
  set local role anon;
  begin
    perform public.fn_funcionarios_chamada();
    v_res := v_res || '[FALHA] anon executou fn_funcionarios_chamada' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem EXECUTE em fn_funcionarios_chamada' || E'\n';
  end;

  reset role;
  raise exception 'PRESENÇA — transacao revertida, nada foi gravado:%', v_res;
end $$;
