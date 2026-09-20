-- ============================================================
-- Centro de custo — teste executável
-- ============================================================
-- Cobre 20260920015643_centro_de_custo.sql.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/centro_custo.sql
--
-- ou cole no SQL Editor. **Nada é persistido**: o bloco termina num `raise
-- exception` que devolve o relatório e reverte tudo, inclusive o rebaixamento
-- temporário de papel usado para encenar cada perfil.
--
-- PRÉ-REQUISITOS: dois admins ativos (o teste rebaixa um), um cliente e uma
-- conta financeira. Mesma convenção de `papeis.sql` e `plano_obra.sql`.
--
-- O QUE ESTE TESTE PROTEGE, e por quê
--
-- 1. `projeto_id` do razão deixou de ser digitado: ele é DERIVADO do centro por
--    `trg_z_lancamento_deriva_projeto`. Se essa derivação parar de correr,
--    nada quebra visivelmente — `fn_resultado_obra` só passa a somar menos, em
--    silêncio, que é exatamente o modo de falha que a auditoria registrou como
--    "ausência de policy corrompe cálculo". Por isso o teste manda um
--    `projeto_id` MENTIROSO e exige que o banco o ignore.
-- 2. O prefixo `trg_z_` não é estético: trigger BEFORE dispara em ordem
--    ALFABÉTICA, e a derivação precisa correr DEPOIS de
--    `trg_lancamento_protege_faturamento`, senão rouba a mensagem dele.
-- 3. `fn_custo_por_centro` é SECURITY DEFINER porque `gestao` não tem policy em
--    `lancamentos_financeiros` — uma view invoker devolveria ZERO para ela em
--    vez de recusar. O teste exige o ERRO, não a lista vazia.
do $$
declare
  v_alvo    uuid;
  v_admin   uuid;
  v_res     text := E'\n';
  v_cliente uuid;
  v_conta   uuid;
  v_proj    uuid;
  v_outro   uuid;
  v_centro  uuid;
  v_escrit  uuid;
  v_sint    uuid;
  v_raiz    uuid;
  v_lanc    uuid;
  v_derivado uuid;
  v_codigo  text;
  v_nome    text;
  v_soma    numeric;
  v_arvore  numeric;
  v_n       int;
  v_etapa   uuid;
  v_med     uuid;
begin
  select id into v_alvo  from public.profiles where role='admin' and active order by created_at limit 1;
  select id into v_admin from public.profiles where role='admin' and active and id <> v_alvo limit 1;
  if v_admin is null then
    raise exception 'PRÉ-REQUISITO: são necessários 2 admins ativos (o teste rebaixa um temporariamente).';
  end if;
  select id into v_cliente from public.clientes limit 1;
  select id into v_conta from public.contas_financeiras limit 1;
  if v_cliente is null or v_conta is null then
    raise exception 'PRÉ-REQUISITO: é necessário um cliente e uma conta financeira.';
  end if;

  select id into v_escrit from public.centros_custo where codigo = '1110';
  select id into v_sint   from public.centros_custo where codigo = '1100';
  select id into v_raiz   from public.centros_custo where codigo = '1000';
  if v_escrit is null or v_sint is null then
    raise exception 'PRÉ-REQUISITO: a semente de centros de custo não está aplicada.';
  end if;

  -- ==========================================================
  -- PAPEL: admin
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;

  -- A obra nasce com centro, sem ninguém pedir.
  insert into public.projetos (nome, cliente_id) values ('Obra do teste de centro', v_cliente)
  returning id into v_proj;
  select id, codigo into v_centro, v_codigo from public.centros_custo where projeto_id = v_proj;
  if v_centro is null then
    v_res := v_res || '[FALHA] a obra nasceu SEM centro de custo' || E'\n';
  else
    v_res := v_res || format('[OK ] obra nasce com centro %s%s', v_codigo, E'\n');
  end if;

  -- E o centro segue o nome dela.
  update public.projetos set nome = 'Obra renomeada' where id = v_proj;
  select nome into v_nome from public.centros_custo where id = v_centro;
  if v_nome = 'Obra renomeada' then
    v_res := v_res || '[OK ] renomear a obra renomeia o centro' || E'\n';
  else
    v_res := v_res || format('[FALHA] centro ficou com o nome "%s"%s', v_nome, E'\n');
  end if;

  -- Lançamento SEM centro é recusado (not null).
  begin
    insert into public.lancamentos_financeiros (tipo, descricao, valor, categoria, conta_id)
    values ('Despesa', 'Sem centro', 100, 'Outros', v_conta);
    v_res := v_res || '[FALHA] aceitou lançamento sem centro de custo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] lançamento sem centro recusado' || E'\n';
  end;

  -- Lançamento num SINTÉTICO é recusado: agrupador não recebe posting.
  begin
    insert into public.lancamentos_financeiros (tipo, descricao, valor, categoria, conta_id, centro_custo_id)
    values ('Despesa', 'No agrupador', 100, 'Outros', v_conta, v_sint);
    v_res := v_res || '[FALHA] aceitou lançamento em centro sintético' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] centro sintético recusado (%s)%s', sqlerrm, E'\n');
  end;

  -- O CORAÇÃO: projeto_id é derivado, e um projeto_id mentiroso é ignorado.
  select id into v_outro from public.projetos where id <> v_proj limit 1;
  insert into public.lancamentos_financeiros
    (tipo, descricao, valor, categoria, conta_id, centro_custo_id, projeto_id)
  values ('Despesa', 'Derivação', 250, 'Fornecedores', v_conta, v_centro, v_outro)
  returning id, projeto_id into v_lanc, v_derivado;
  if v_derivado is not distinct from v_proj then
    v_res := v_res || '[OK ] projeto_id derivado do centro (projeto_id enviado foi ignorado)' || E'\n';
  else
    v_res := v_res || '[FALHA] projeto_id NÃO foi derivado do centro' || E'\n';
  end if;

  -- Despesa administrativa: centro sem obra deixa projeto_id nulo.
  insert into public.lancamentos_financeiros
    (tipo, descricao, valor, categoria, conta_id, centro_custo_id)
  values ('Despesa', 'Aluguel', 400, 'Aluguel Escritório', v_conta, v_escrit)
  returning projeto_id into v_derivado;
  if v_derivado is null then
    v_res := v_res || '[OK ] centro administrativo deixa a obra nula' || E'\n';
  else
    v_res := v_res || '[FALHA] centro administrativo atribuiu obra' || E'\n';
  end if;

  -- Trocar o centro do lançamento re-deriva a obra.
  update public.lancamentos_financeiros set centro_custo_id = v_escrit where id = v_lanc;
  select projeto_id into v_derivado from public.lancamentos_financeiros where id = v_lanc;
  if v_derivado is null then
    v_res := v_res || '[OK ] trocar o centro re-derivou a obra' || E'\n';
  else
    v_res := v_res || '[FALHA] trocar o centro não re-derivou a obra' || E'\n';
  end if;
  update public.lancamentos_financeiros set centro_custo_id = v_centro where id = v_lanc;

  -- O rollup do sintético é a soma da subárvore.
  select despesa_lancada_arvore into v_arvore
  from public.fn_custo_por_centro() where centro_id = v_raiz;
  select coalesce(sum(despesa_lancada), 0) into v_soma
  from public.fn_custo_por_centro() where tipo = 'Analitico';
  if v_arvore = v_soma then
    v_res := v_res || format('[OK ] rollup da raiz (%s) = soma dos analíticos%s', v_arvore, E'\n');
  else
    v_res := v_res || format('[FALHA] rollup %s <> soma dos analíticos %s%s', v_arvore, v_soma, E'\n');
  end if;

  -- O centro da obra é estrutura gerada, não cadastro.
  begin
    update public.centros_custo set codigo = '9999' where id = v_centro;
    v_res := v_res || '[FALHA] deixou renumerar o centro de uma obra' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] código do centro de obra é imutável' || E'\n';
  end;

  -- Ciclo na árvore.
  begin
    update public.centros_custo set pai_id = v_sint where id = v_raiz;
    v_res := v_res || '[FALHA] criou ciclo na árvore' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] ciclo na árvore recusado' || E'\n';
  end;

  -- Agrupador com filhos não vira postável.
  begin
    update public.centros_custo set tipo = 'Analitico' where id = v_sint;
    v_res := v_res || '[FALHA] sintético com filhos virou analítico' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] sintético com filhos não vira analítico' || E'\n';
  end;

  -- Centro com lançamento não vira agrupador.
  begin
    update public.centros_custo set tipo = 'Sintetico' where id = v_escrit;
    v_res := v_res || '[FALHA] centro com lançamento virou sintético' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] centro com lançamento não vira sintético' || E'\n';
  end;

  -- Centro inativo sai das escolhas.
  update public.centros_custo set ativo = false where id = v_escrit;
  begin
    insert into public.lancamentos_financeiros
      (tipo, descricao, valor, categoria, conta_id, centro_custo_id)
    values ('Despesa', 'Em centro inativo', 10, 'Outros', v_conta, v_escrit);
    v_res := v_res || '[FALHA] aceitou lançamento em centro inativo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] centro inativo não recebe lançamento' || E'\n';
  end;
  -- ...mas o lançamento antigo dele continua editável.
  begin
    update public.lancamentos_financeiros set pago = true
    where centro_custo_id = v_escrit and descricao = 'Aluguel';
    v_res := v_res || '[OK ] lançamento antigo de centro inativo segue editável' || E'\n';
  exception when others then
    v_res := v_res || format('[FALHA] centro inativo travou edição de histórico (%s)%s', sqlerrm, E'\n');
  end;
  update public.centros_custo set ativo = true where id = v_escrit;

  -- Apagar a obra preserva o centro e o histórico.
  delete from public.lancamentos_financeiros where centro_custo_id = v_centro;
  delete from public.projetos where id = v_proj;
  select count(*) into v_n from public.centros_custo where id = v_centro and not ativo;
  if v_n = 1 then
    v_res := v_res || '[OK ] apagar a obra desativa o centro em vez de apagá-lo' || E'\n';
  else
    v_res := v_res || '[FALHA] o centro não sobreviveu à exclusão da obra' || E'\n';
  end if;

  -- ==========================================================
  -- PAPEL: gestao (rebaixa v_alvo)
  -- ==========================================================
  -- ==========================================================
  -- O GUARDA DO FATURAMENTO PASSOU A OLHAR O CENTRO
  -- ==========================================================
  -- Este é o ponto mais frágil da migração. `trg_lancamento_protege_faturamento`
  -- travava `projeto_id`; como ele virou DERIVADO, o cliente não o envia mais e
  -- a comparação nunca acusaria diferença — a trava sumiria sem nenhum sintoma.
  -- O que tem de estar imutável agora é o `centro_custo_id`.
  insert into public.projetos (nome, cliente_id) values ('Obra guarda faturamento', v_cliente)
  returning id into v_proj;
  select id into v_centro from public.centros_custo where projeto_id = v_proj;
  insert into public.etapas_cronograma (projeto_id, nome) values (v_proj, 'Etapa teste')
  returning id into v_etapa;
  insert into public.medicoes_obra (projeto_id, etapa_id, percentual_medido, status)
  values (v_proj, v_etapa, 10, 'Aprovada') returning id into v_med;

  insert into public.lancamentos_financeiros
    (tipo, descricao, valor, categoria, conta_id, centro_custo_id, medicao_id)
  values ('Receita', 'Faturamento de teste', 1000, 'Faturamento Obra', v_conta, v_centro, v_med)
  returning id into v_lanc;
  v_res := v_res || '[OK ] faturamento nasce no centro da obra' || E'\n';

  begin
    update public.lancamentos_financeiros set centro_custo_id = v_escrit where id = v_lanc;
    v_res := v_res || '[FALHA] deixou trocar o centro de um faturamento' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] centro de faturamento é imutável' || E'\n';
  end;

  begin
    update public.lancamentos_financeiros set valor = 5 where id = v_lanc;
    v_res := v_res || '[FALHA] deixou trocar o valor de um faturamento' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] valor de faturamento segue travado' || E'\n';
  end;

  -- ...e o que sempre foi correção de registro continua passando.
  begin
    update public.lancamentos_financeiros set descricao = 'Correcao', pago = true where id = v_lanc;
    v_res := v_res || '[OK ] descrição e pago seguem editáveis' || E'\n';
  exception when others then
    v_res := v_res || format('[FALHA] travou correção de registro (%s)%s', sqlerrm, E'\n');
  end;

  reset role;
  -- Volta a identidade de ADMIN antes de mexer em papel: o guarda
  -- `fn_profile_protege_privilegio` olha o JWT, não o role do Postgres, e o
  -- alvo já foi rebaixado no passo anterior.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role = 'gestao' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.centros_custo;
  if v_n > 0 then
    v_res := v_res || '[OK ] gestao LÊ os centros de custo' || E'\n';
  else
    v_res := v_res || '[FALHA] gestao não lê centros de custo (o seletor ficaria vazio)' || E'\n';
  end if;

  -- INSERT recusado pela RLS LANÇA (ao contrário do UPDATE, que só casa zero
  -- linhas em silêncio — é por isso que os dois casos são escritos diferente).
  begin
    insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza)
    values ('7777', 'Gestao tentou', v_sint, 'Analitico', 'Administrativo');
    v_res := v_res || '[FALHA] gestao criou centro de custo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] gestao não cria centro' || E'\n';
  end;

  -- O ponto 3: gestao tem de receber ERRO, não lista vazia.
  begin
    perform public.fn_custo_por_centro();
    v_res := v_res || '[FALHA] gestao executou fn_custo_por_centro' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] gestao barrada em fn_custo_por_centro (erro, não zero)' || E'\n';
  end;

  -- ==========================================================
  -- PAPEL: financeiro
  -- ==========================================================
  reset role;
  -- Volta a identidade de ADMIN antes de mexer em papel: o guarda
  -- `fn_profile_protege_privilegio` olha o JWT, não o role do Postgres, e o
  -- alvo já foi rebaixado no passo anterior.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role = 'financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.centros_custo;
  if v_n > 0 then
    v_res := v_res || '[OK ] financeiro LÊ os centros de custo' || E'\n';
  else
    v_res := v_res || '[FALHA] financeiro não lê centros de custo' || E'\n';
  end if;

  update public.centros_custo set nome = 'Financeiro tentou' where id = v_escrit;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    v_res := v_res || '[OK ] financeiro não edita centro' || E'\n';
  else
    v_res := v_res || '[FALHA] financeiro editou centro de custo' || E'\n';
  end if;

  begin
    perform public.fn_custo_por_centro();
    v_res := v_res || '[OK ] financeiro executa fn_custo_por_centro' || E'\n';
  exception when others then
    v_res := v_res || format('[FALHA] financeiro barrado no próprio relatório (%s)%s', sqlerrm, E'\n');
  end;

  -- ==========================================================
  -- PAPEL: campo
  -- ==========================================================
  reset role;
  -- Volta a identidade de ADMIN antes de mexer em papel: o guarda
  -- `fn_profile_protege_privilegio` olha o JWT, não o role do Postgres, e o
  -- alvo já foi rebaixado no passo anterior.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  update public.profiles set role = 'campo' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.centros_custo;
  if v_n = 0 then
    v_res := v_res || '[OK ] campo não lê centros de custo' || E'\n';
  else
    v_res := v_res || '[FALHA] campo leu centros de custo' || E'\n';
  end if;

  begin
    perform public.fn_custo_por_centro();
    v_res := v_res || '[FALHA] campo executou fn_custo_por_centro' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] campo barrado em fn_custo_por_centro' || E'\n';
  end;

  -- ==========================================================
  -- anon
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from public.centros_custo limit 1;
    v_res := v_res || '[FALHA] anon leu centros_custo' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem acesso a centros_custo' || E'\n';
  end;
  begin
    perform public.fn_custo_por_centro();
    v_res := v_res || '[FALHA] anon executou fn_custo_por_centro' || E'\n';
  exception when others then
    v_res := v_res || '[OK ] anon sem EXECUTE em fn_custo_por_centro' || E'\n';
  end;

  reset role;
  raise exception 'CENTRO DE CUSTO — transacao revertida, nada foi gravado:%', v_res;
end $$;
