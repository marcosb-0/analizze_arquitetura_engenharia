-- ============================================================
-- FLUXO PONTA A PONTA, POR PAPEL — teste executável (A13 / item 41)
-- ============================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- É o item que as duas auditorias marcaram como P1 e nenhuma tinha fechado:
-- "coerência número-a-número entre todas as telas não exercitada em cada
-- passo". Tudo o mais foi verificado lendo código ou consultando o banco em
-- repouso. O que nunca tinha sido exercitado é a CADEIA — proposta aprovada
-- vira obra, obra recebe medição, medição aprovada vira dinheiro no razão — e
-- se os números de cada etapa continuam batendo com os da anterior.
--
-- O companheiro é `papeis.sql`, e a divisão é clara: lá se testa QUEM PODE,
-- aqui se testa SE OS NÚMEROS FECHAM. Os dois encenam papel por
-- `request.jwt.claims` e os dois revertem tudo.
--
-- ------------------------------------------------------------
-- A ARMADILHA QUE ESTE ARQUIVO CAIU, E QUE VOCÊ TAMBÉM CAIRIA
-- ------------------------------------------------------------
-- `set_config('request.jwt.claims', …)` **não basta**. Ele diz ao Postgres quem
-- você alega ser, mas quem executa continua sendo o papel do banco — e se esse
-- papel for `postgres`, a RLS não se aplica a nada. Na primeira versão deste
-- teste, um `campo` sem vínculo nenhum "conseguiu" lançar medição na obra, e a
-- conclusão óbvia (falha grave de segurança) estava errada: era o teste que
-- estava furado.
--
-- Por isso todo trecho que depende de RLS vem entre `set local role
-- authenticated` e `reset role`. Os guardas em plpgsql (`fn_aprovar_medicao`,
-- `fn_criar_projeto_from_proposta`) não precisam disso — eles checam
-- `fn_current_role()` e barram de qualquer jeito, o que é justamente o motivo
-- pelo qual o teste furado parecia funcionar.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/fluxo_ponta_a_ponta.sql
--
-- **Nada é persistido**: o bloco termina em `raise exception`, que devolve o
-- relatório e reverte a transação inteira — obra, medições e lançamentos
-- inclusive. Conferido depois de rodar: `projetos`, `medicoes_obra`,
-- `lancamentos_financeiros` e `insumos_projeto` voltaram a zero, e a proposta
-- voltou a "Elaboração".
--
-- PRÉ-REQUISITOS: um admin, um gestao, um financeiro e um campo ativos; uma
-- proposta com itens vinculados ao catálogo; uma conta financeira. Sem eles o
-- teste diz o que faltou em vez de falhar por dentro.
--
-- NÃO ESTÁ NO CI pelo mesmo motivo de `papeis.sql`: exigiria credencial de
-- banco no Actions e um projeto descartável por execução.

do $$
declare
  v_res    text := E'\n';
  v_admin uuid; v_gestao uuid; v_fin uuid; v_campo uuid;
  v_prop uuid; v_bdi numeric; v_conta uuid; v_payload jsonb;
  v_proj public.projetos; v_etapa uuid; v_med uuid;
  v_orcado numeric; v_venda numeric; v_fanout numeric;
  v_avanco numeric; v_exec numeric; v_lanc numeric; v_n int;
  m record;
begin
  -- ==========================================================
  -- 0. Pré-requisitos
  -- ==========================================================
  select id into v_admin  from public.profiles where role='admin'      and active limit 1;
  select id into v_gestao from public.profiles where role='gestao'     and active limit 1;
  select id into v_fin    from public.profiles where role='financeiro' and active limit 1;
  select id into v_campo  from public.profiles where role='campo'      and active limit 1;
  select id, bdi_percentual into v_prop, v_bdi
    from public.propostas order by created_at limit 1;
  select id into v_conta from public.contas_financeiras limit 1;

  if v_admin is null or v_gestao is null or v_fin is null or v_campo is null then
    raise exception 'PRÉ-REQUISITO: faltam papéis ativos (admin=% gestao=% financeiro=% campo=%).',
      v_admin is not null, v_gestao is not null, v_fin is not null, v_campo is not null;
  end if;
  if v_prop is null then raise exception 'PRÉ-REQUISITO: nenhuma proposta.'; end if;
  if v_conta is null then raise exception 'PRÉ-REQUISITO: nenhuma conta financeira.'; end if;

  select count(*) into v_n from public.itens_proposta
   where proposta_id = v_prop and catalogo_insumo_id is not null;
  if v_n = 0 then
    raise exception 'PRÉ-REQUISITO: a proposta não tem item de catálogo — sem insumo não há custo nem margem a conferir.';
  end if;
  v_res := v_res || format('proposta com %s itens de catálogo, BDI %s%%%s', v_n, v_bdi, E'\n');

  -- ==========================================================
  -- 1–2. Aprovação, e quem NÃO pode converter
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  update public.propostas set status='Aprovada' where id=v_prop;

  perform set_config('request.jwt.claims', json_build_object('sub',v_fin,'role','authenticated')::text, true);
  begin
    perform public.fn_criar_projeto_from_proposta(v_prop, '{"nome":"x"}'::jsonb);
    v_res := v_res || format('[FALHA] financeiro converteu a proposta%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] financeiro não converte proposta%s', E'\n');
  end;

  -- ==========================================================
  -- 3. gestão converte, com o payload que o assistente monta
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub',v_gestao,'role','authenticated')::text, true);
  select jsonb_build_object(
    'nome','[A13] fluxo ponta a ponta','endereco','Canteiro de teste',
    'data_inicio',current_date::text,'data_fim',(current_date+60)::text,
    'etapas', jsonb_build_array(jsonb_build_object('ref','1','nome','Etapa única',
        'data_inicio',current_date::text,'data_fim',(current_date+60)::text)),
    'itens', jsonb_agg(jsonb_build_object(
      'categoria','Terceiros','descricao',left(ip.descricao,40),
      'valor_orcado', round(ip.quantidade * round(ip.preco_unitario*(1+v_bdi/100),2),2),
      'valor_contratado',0,'etapa_ref','1',
      'catalogo_insumo_id',ip.catalogo_insumo_id,'quantidade',ip.quantidade,
      'preco_unitario_base', round(ip.preco_unitario*(1+v_bdi/100),2),
      'ajuste_tipo','Nenhum','ajuste_valor',0,'ajuste_motivo',null,
      -- Item A1: o custo e a negociação atravessam a conversão.
      'custo_origem', ip.preco_unitario_base,
      'ajuste_origem_tipo', ip.ajuste_tipo,
      'ajuste_origem_valor', ip.ajuste_valor,
      'bdi_aplicado', v_bdi))
  ) into v_payload from public.itens_proposta ip where ip.proposta_id = v_prop;

  v_proj := public.fn_criar_projeto_from_proposta(v_prop, v_payload);
  select id into v_etapa from public.etapas_cronograma where projeto_id=v_proj.id limit 1;

  -- ==========================================================
  -- 4. O orçamento da obra é a proposta com BDI — sem perder centavo
  -- ==========================================================
  select sum(valor_orcado) into v_orcado from public.itens_orcamento where projeto_id=v_proj.id;
  select round(sum(ip.quantidade * round(ip.preco_unitario*(1+v_bdi/100),2)),2) into v_venda
    from public.itens_proposta ip where ip.proposta_id=v_prop;
  v_res := v_res || format('[%s] orçamento da obra %s = proposta com BDI %s%s',
    case when v_orcado=v_venda then 'OK ' else 'FALHA' end, v_orcado, v_venda, E'\n');

  -- ==========================================================
  -- 5. A margem, que antes do item A1 não existia
  -- ==========================================================
  select * into m from public.v_margem_obra where projeto_id=v_proj.id;
  v_res := v_res || format('[%s] margem %s (%s%%) sobre %s/%s itens%s',
    case when m.itens_conhecidos = m.itens_total then 'OK ' else 'AVISO' end,
    m.margem_valor, m.margem_percentual, m.itens_conhecidos, m.itens_total, E'\n');

  -- ==========================================================
  -- 6–7. Campo sem vínculo é barrado PELA POLICY, não pelo guarda
  -- ==========================================================
  -- Desde 20260812235828 a mensagem é de permissão. Antes, o guarda de
  -- integridade lia o cronograma pela RLS do chamador, não achava a etapa
  -- (invisível para quem não tem a obra) e mandava "recarregue a tela e
  -- selecione a etapa novamente" — instrução que nunca resolveria.
  perform set_config('request.jwt.claims', json_build_object('sub',v_campo,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.medicoes_obra (projeto_id, etapa_id, percentual_medido, criado_por)
    values (v_proj.id, v_etapa, 30, v_campo);
    v_res := v_res || format('[FALHA] campo sem vínculo lançou medição%s', E'\n');
  exception when others then
    v_res := v_res || format('[%s] campo sem vínculo barrado (%s)%s',
      case when sqlstate='42501' then 'OK ' else 'AVISO' end, sqlstate, E'\n');
  end;
  reset role;

  -- ==========================================================
  -- 8–9. Vinculado, o campo mede
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub',v_gestao,'role','authenticated')::text, true);
  insert into public.projeto_equipe (projeto_id, profile_id, papel)
  values (v_proj.id, v_campo, 'Campo');

  perform set_config('request.jwt.claims', json_build_object('sub',v_campo,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.medicoes_obra (projeto_id, etapa_id, percentual_medido, criado_por)
  values (v_proj.id, v_etapa, 30, v_campo) returning id into v_med;
  reset role;
  v_res := v_res || format('[%s] campo vinculado lançou boletim de 30%% (status %s)%s',
    case when (select status from public.medicoes_obra where id=v_med)='Pendente' then 'OK ' else 'FALHA' end,
    (select status from public.medicoes_obra where id=v_med), E'\n');

  -- ==========================================================
  -- 10. Quem mede não aprova
  -- ==========================================================
  begin
    perform public.fn_aprovar_medicao(v_med, false);
    v_res := v_res || format('[FALHA] campo aprovou a própria medição%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo não aprova medição%s', E'\n');
  end;

  -- ==========================================================
  -- 11–13. Aprovação, fan-out e avanço físico
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub',v_gestao,'role','authenticated')::text, true);
  perform public.fn_aprovar_medicao(v_med, false);

  select coalesce(sum(valor_aplicado),0) into v_fanout
    from public.medicao_item_orcamento where medicao_id=v_med;
  select avanco_fisico into v_avanco from public.v_resumo_obra where projeto_id=v_proj.id;
  select sum(valor_executado) into v_exec from public.v_itens_orcamento where projeto_id=v_proj.id;

  -- O fan-out arredonda POR ITEM, e é isso que se quer: cada linha vira um
  -- valor em reais antes de somar. A soma dos arredondados difere de "30% do
  -- total arredondado no fim" em até um centavo (aqui: 6.613,50 contra
  -- 6.613,51). Comparar contra o total arredondado acusaria uma divergência que
  -- não existe — e "consertá-la" quebraria a integridade de cada linha.
  v_res := v_res || format('[%s] avanço físico %s%% e executado %s = fan-out %s%s',
    case when v_avanco = 30 and v_exec = v_fanout then 'OK ' else 'FALHA' end,
    v_avanco, v_exec, v_fanout, E'\n');

  -- ==========================================================
  -- 14–15. Faturamento, e idempotência
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub',v_fin,'role','authenticated')::text, true);
  perform public.fn_gerar_lancamento_medicao(v_med, v_conta, false);
  select sum(valor) into v_lanc from public.lancamentos_financeiros
   where projeto_id=v_proj.id and tipo='Receita';
  v_res := v_res || format('[%s] receita lançada %s = executado%s',
    case when v_lanc = v_fanout then 'OK ' else 'FALHA' end, v_lanc, E'\n');

  begin
    perform public.fn_gerar_lancamento_medicao(v_med, v_conta, false);
    v_res := v_res || format('[FALHA] faturou o mesmo boletim duas vezes%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] segundo faturamento barrado%s', E'\n');
  end;

  -- ==========================================================
  -- 16. A margem atravessou o ciclo inteiro
  -- ==========================================================
  select * into m from public.v_margem_obra where projeto_id=v_proj.id;
  v_res := v_res || format('[%s] margem após medir e faturar: %s (%s%%)%s',
    case when m.margem_valor is not null then 'OK ' else 'FALHA' end,
    m.margem_valor, m.margem_percentual, E'\n');

  reset role;
  raise exception 'FLUXO PONTA A PONTA — transação revertida, nada foi gravado:%', v_res;
end $$;
