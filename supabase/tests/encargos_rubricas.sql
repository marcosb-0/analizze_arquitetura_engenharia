-- ============================================================
-- Encargos por rubrica — teste executável
-- ============================================================
-- Cobre 20260920150000_encargos_rubricas.sql e
-- 20260920150001_custo_hora_por_regime.sql.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/encargos_rubricas.sql
--
-- ou cole no SQL Editor. **Nada é persistido**: o bloco termina num `raise
-- exception` que devolve o relatório e reverte tudo, inclusive a tabela de
-- rubricas preenchida e a chave de modo virada.
--
-- PRÉ-REQUISITOS: um admin ativo, e um insumo de mão de obra no catálogo com
-- pelo menos um funcionário ativo vinculado — o teste cria o funcionário se
-- precisar. Mesma convenção de `centro_custo.sql` e `papeis.sql`.
--
-- O QUE ESTE TESTE PROTEGE, e por quê
--
-- 1. **A garantia de compatibilidade.** Com `encargos_modo = 'Direto'`, o
--    custo/hora tem de ser IDÊNTICO ao de antes das duas migrations. É a
--    afirmação central delas, e é a única coisa aqui que, se quebrar, significa
--    preço de obra em andamento se movendo sozinho.
-- 2. **A propagação.** Mudar uma rubrica precisa mover o `preco_referencia` das
--    composições. Se `trg_propaga_custo_rubricas` sumir, nada quebra
--    visivelmente — o catálogo só passa a servir preço velho, em silêncio. Por
--    isso o teste lê a composição antes e depois, e não só a função.
-- 3. **Nulo não é zero.** Rubrica ativa sem percentual precisa anular o grupo
--    inteiro, e o guarda precisa recusar ligar o modo nesse estado.
-- 4. **Os números do espelho.** As três linhas marcadas [PARIDADE] imprimem o
--    que o banco calcula; são exatamente os valores travados em
--    `src/lib/encargos.test.ts`. Divergiu, a ficha e o orçamento discordaram.

do $$
declare
  v_admin    uuid;
  v_insumo   uuid;
  v_pai      uuid;
  v_func     uuid;
  v_res      text := E'\n';
  v_antes    numeric;
  v_depois   numeric;
  v_hora     numeric;
  v_direto   numeric;
  v_h        numeric;
  v_m        numeric;
  v_ok       boolean;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  if v_admin is null then
    raise exception 'PRÉ-REQUISITO: é necessário um admin ativo.';
  end if;

  if not exists (select 1 from public.encargos_rubricas where codigo = 'A1') then
    raise exception 'PRÉ-REQUISITO: a semente de encargos_rubricas não está aplicada.';
  end if;

  -- Um insumo de mão de obra que seja COMPONENTE de alguma composição: é o que
  -- permite observar a propagação até o pai.
  select ci.insumo_id, ci.composicao_id into v_insumo, v_pai
    from public.composicao_itens ci
    join public.catalogo_insumos i on i.id = ci.insumo_id
   where i.categoria = 'Mão de Obra'
   limit 1;
  if v_insumo is null then
    raise exception 'PRÉ-REQUISITO: é necessário um insumo de Mão de Obra dentro de alguma composição.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ==========================================================
  -- Cenário: uma pessoa na folha, ligada àquele cargo
  -- ==========================================================
  insert into public.funcionarios (nome, cargo, status, salario_base, catalogo_mao_de_obra_id)
  values ('Teste Encargos', 'Pedreiro', 'Ativo', 3000, v_insumo)
  returning id into v_func;

  reset role;
  update public.empresa_config
     set encargos_sociais_percentual = 80, jornada_mensal_horas = 220, encargos_modo = 'Direto'
   where singleton;

  select preco into v_direto from public.fn_custo_hora_folha(v_insumo);
  if v_direto = 24.55 then
    v_res := v_res || '[OK ] Direto: 3000 × 1,80 ÷ 220 = 24,55' || E'\n';
  else
    v_res := v_res || '[FALHA] Direto devolveu ' || coalesce(v_direto::text, 'NULL') || ', esperado 24,55' || E'\n';
  end if;

  -- ==========================================================
  -- 1. Nulo não é zero — e o guarda recusa ligar pela metade
  -- ==========================================================
  select horista into v_h from public.fn_encargos_totais() where grupo = 'TOTAL';
  if v_h is null then
    v_res := v_res || '[OK ] tabela em branco devolve TOTAL nulo, não zero' || E'\n';
  else
    v_res := v_res || '[FALHA] tabela em branco devolveu ' || v_h::text || E'\n';
  end if;

  begin
    update public.empresa_config set encargos_modo = 'Rubricas' where singleton;
    v_res := v_res || '[FALHA] ligou Rubricas com a tabela incompleta' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] guarda recusou Rubricas com a tabela incompleta' || E'\n';
  end;

  -- ==========================================================
  -- 2. Preenche a tabela com os valores publicados (Paraíba 01/2025,
  --    coluna SEM DESONERAÇÃO) e confere os totais
  -- ==========================================================
  update public.encargos_rubricas set percentual_horista = v.h, percentual_mensalista = v.m
    from (values
      ('A1', 20.0, 20.0),   ('A2', 1.5, 1.5),    ('A3', 1.0, 1.0),
      ('A4', 0.2, 0.2),     ('A5', 0.6, 0.6),    ('A6', 2.5, 2.5),
      ('A7', 3.0, 3.0),     ('A8', 8.0, 8.0),    ('A9', 0.0, 0.0),
      ('B1', 18.02, null),  ('B2', 4.31, null),  ('B3', 0.86, 0.65),
      ('B4', 10.96, 8.33),  ('B5', 0.07, 0.05),  ('B6', 0.73, 0.56),
      ('B7', 2.04, null),   ('B8', 0.10, 0.07),  ('B9', 9.76, 7.42),
      ('B10', 0.03, 0.03),
      ('C1', 4.53, 3.45),   ('C2', 0.11, 0.08),  ('C3', 4.29, 3.26),
      ('C4', 2.96, 2.25),   ('C5', 0.38, 0.29)
    ) as v(codigo, h, m)
   where public.encargos_rubricas.codigo = v.codigo;

  select horista, mensalista into v_h, v_m from public.fn_encargos_totais() where grupo = 'A';
  v_res := v_res || '[PARIDADE] grupo A: ' || v_h::text || ' / ' || v_m::text || ' (publicado 36,80 / 36,80)' || E'\n';
  select horista, mensalista into v_h, v_m from public.fn_encargos_totais() where grupo = 'B';
  v_res := v_res || '[PARIDADE] grupo B: ' || v_h::text || ' / ' || v_m::text || ' (publicado 46,88 / 17,11)' || E'\n';
  select horista, mensalista into v_h, v_m from public.fn_encargos_totais() where grupo = 'D';
  v_res := v_res || '[PARIDADE] grupo D: ' || v_h::text || ' / ' || v_m::text || ' (publicado 17,65 / 6,61)' || E'\n';
  select horista, mensalista into v_h, v_m from public.fn_encargos_totais() where grupo = 'TOTAL';
  v_res := v_res || '[PARIDADE] TOTAL   : ' || v_h::text || ' / ' || v_m::text || ' (publicado 113,60 / 69,85)' || E'\n';

  -- Estes dois são a prova da FÓRMULA, conferidos contra a tabela da Caixa.
  -- D1 = A×B = 36,80 × 46,88 ÷ 100 = 17,2518
  -- D2 = A×C2 + A8×C1 = 36,80×0,11 + 8×4,53 ÷ 100 = 0,4029
  select horista into v_h from public.fn_encargos_totais() where grupo = 'D';
  if round(v_h, 2) = 17.65 then
    v_res := v_res || '[OK ] D1+D2 horista fecha em 17,65 como a tabela publicada' || E'\n';
  else
    v_res := v_res || '[FALHA] D horista = ' || v_h::text || ', esperado ~17,65' || E'\n';
  end if;

  -- ==========================================================
  -- 3. A garantia de compatibilidade: 'Direto' ignora tudo isso
  -- ==========================================================
  select preco into v_hora from public.fn_custo_hora_folha(v_insumo);
  if v_hora = v_direto then
    v_res := v_res || '[OK ] tabela cheia NÃO move o preço enquanto o modo é Direto' || E'\n';
  else
    v_res := v_res || '[FALHA] Direto mudou de ' || v_direto::text || ' para ' || v_hora::text || E'\n';
  end if;

  -- ==========================================================
  -- 4. Virar a chave, e a ida e volta
  -- ==========================================================
  select preco_referencia into v_antes from public.catalogo_insumos where id = v_pai;

  update public.empresa_config set encargos_modo = 'Rubricas' where singleton;

  select preco into v_hora from public.fn_custo_hora_folha(v_insumo);
  -- Sem regime na ficha o default é Mensalista: 3000 × 1,698419 ÷ 220 = 23,16
  if v_hora is not null and v_hora <> v_direto then
    v_res := v_res || '[OK ] Rubricas move o custo/hora para ' || v_hora::text || ' (mensalista)' || E'\n';
  else
    v_res := v_res || '[FALHA] Rubricas não mudou o custo/hora: ' || coalesce(v_hora::text, 'NULL') || E'\n';
  end if;

  select preco_referencia into v_depois from public.catalogo_insumos where id = v_pai;
  if v_depois is distinct from v_antes then
    v_res := v_res || '[OK ] trg_propaga_custo_parametros moveu a composição pai' || E'\n';
  else
    v_res := v_res || '[FALHA] composição pai ficou em ' || coalesce(v_antes::text, 'NULL') || ' — propagação não correu' || E'\n';
  end if;

  -- Horista é bem mais caro, e é por isso que o default é Mensalista.
  update public.funcionarios set regime_encargos = 'Horista' where id = v_func;
  select preco into v_h from public.fn_custo_hora_folha(v_insumo);
  if v_h > v_hora then
    v_res := v_res || '[OK ] regime Horista sobe o custo/hora para ' || v_h::text || E'\n';
  else
    v_res := v_res || '[FALHA] Horista (' || coalesce(v_h::text, 'NULL') || ') não superou Mensalista (' || v_hora::text || ')' || E'\n';
  end if;
  update public.funcionarios set regime_encargos = 'Mensalista' where id = v_func;

  -- A volta: 'Direto' restaura o valor exato de antes. É o que torna a chave
  -- segura de oferecer.
  update public.empresa_config set encargos_modo = 'Direto' where singleton;
  select preco into v_hora from public.fn_custo_hora_folha(v_insumo);
  if v_hora = v_direto then
    v_res := v_res || '[OK ] voltar para Direto restaura 24,55 exatamente' || E'\n';
  else
    v_res := v_res || '[FALHA] a volta deu ' || coalesce(v_hora::text, 'NULL') || ', esperado ' || v_direto::text || E'\n';
  end if;

  -- ==========================================================
  -- 5. Propagação ao mexer numa rubrica (com o modo ligado)
  -- ==========================================================
  update public.empresa_config set encargos_modo = 'Rubricas' where singleton;
  select preco_referencia into v_antes from public.catalogo_insumos where id = v_pai;
  update public.encargos_rubricas set percentual_horista = 25, percentual_mensalista = 25 where codigo = 'A1';
  select preco_referencia into v_depois from public.catalogo_insumos where id = v_pai;
  if v_depois is distinct from v_antes then
    v_res := v_res || '[OK ] trg_propaga_custo_rubricas moveu a composição ao mudar o INSS' || E'\n';
  else
    v_res := v_res || '[FALHA] mudar o INSS não moveu a composição — trigger ausente?' || E'\n';
  end if;

  -- O guarda pelo outro lado: com o modo ligado, apagar um percentual é recusado.
  begin
    update public.encargos_rubricas set percentual_horista = null where codigo = 'A1';
    v_res := v_res || '[FALHA] apagou percentual com o modo Rubricas ligado' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] guarda recusou apagar percentual com o modo ligado' || E'\n';
  end;

  update public.empresa_config set encargos_modo = 'Direto' where singleton;

  -- ==========================================================
  -- 6. Constraints da tabela
  -- ==========================================================
  begin
    update public.encargos_rubricas set percentual_horista = 5 where codigo = 'D1';
    v_res := v_res || '[FALHA] grupo D aceitou percentual digitado' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] grupo D recusa percentual digitado' || E'\n';
  end;

  begin
    update public.encargos_rubricas
       set aplica_mensalista = false
     where codigo = 'B3' and percentual_mensalista is not null;
    v_res := v_res || '[FALHA] "não incide" conviveu com percentual preenchido' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] "não incide" exige o percentual vazio' || E'\n';
  end;

  -- ==========================================================
  -- 7. Grants e RLS
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform 1 from public.encargos_rubricas limit 1;
    v_res := v_res || '[OK ] admin lê encargos_rubricas' || E'\n';
  exception when others then
    v_res := v_res || '[FALHA] admin não leu encargos_rubricas' || E'\n';
  end;

  begin
    insert into public.encargos_rubricas (codigo, grupo, descricao, ordem)
    values ('A99', 'A', 'Rubrica inventada', 999);
    v_res := v_res || '[FALHA] admin criou rubrica — INSERT deveria ser negado' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] INSERT negado: rubrica nova só por migration' || E'\n';
  end;

  begin
    delete from public.encargos_rubricas where codigo = 'A9';
    v_res := v_res || '[FALHA] admin excluiu rubrica — DELETE deveria ser negado' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] DELETE negado: desativar é o caminho' || E'\n';
  end;

  begin
    update public.encargos_rubricas set codigo = 'A1x' where codigo = 'A1';
    v_res := v_res || '[FALHA] admin renomeou o código — o grant é por coluna' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] `codigo` fora do grant: as fórmulas de D seguem íntegras' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.encargos_rubricas limit 1;
    v_res := v_res || '[FALHA] anon leu encargos_rubricas' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem acesso a encargos_rubricas' || E'\n';
  end;

  reset role;
  raise exception 'ENCARGOS POR RUBRICA — transacao revertida, nada foi gravado:%', v_res;
end $$;
