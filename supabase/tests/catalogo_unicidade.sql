-- ============================================================
-- Identidade única do catálogo — teste executável
-- ============================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Até 20/set/2026 `catalogo_insumos` não tinha NENHUM índice único além da
-- chave primária, e os dois caminhos de escrita (a interface e a RPC da
-- proposta) faziam INSERT incondicional. A base estava limpa por ter 17 linhas,
-- não por ter defesa. As quatro migrations daquele dia deram identidade ao
-- catálogo, e é fácil desfazê-las sem perceber: basta alguém recriar
-- `fn_catalogo_insumo_before_write` a partir de uma versão antiga, ou mudar o
-- nome de uma trigger e quebrar a ordem alfabética de que a geração do código
-- depende. Este arquivo faz isso aparecer.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/catalogo_unicidade.sql
--
-- ou cole no SQL Editor do painel. **Nada é persistido**: o bloco termina com um
-- `raise exception` que devolve o relatório e reverte tudo.
--
-- `set local role authenticated` é OBRIGATÓRIO e não decorativo: `set_config`
-- do JWT sozinho deixa a sessão rodando como `postgres`, que ignora RLS. Um
-- teste sem ele já "provou" neste repo uma falha de segurança que não existia.
--
-- NÃO ESTÁ NO CI pelo mesmo motivo de `papeis.sql`: exigiria credencial de banco
-- no runner e um projeto descartável por execução.
--
-- PRÉ-REQUISITO: um admin ativo em `profiles` e um cliente em `clientes`.
do $$
declare
  v_admin  uuid;
  v_cli    uuid;
  v_prop   uuid;
  v_item   uuid;
  v_item2  uuid;
  v_a uuid; v_ped uuid; v_tij uuid; v_alv uuid; v_arg uuid;
  v_ci1 uuid; v_ci2 uuid;
  v_cod text; v_busca text; v_tipo text; v_fonte text;
  v_preco numeric;
  v_r1 jsonb; v_r2 jsonb; v_r3 jsonb;
  v_n0 int; v_n1 int; v_n2 int; v_n3 int;
  v_res text := E'\n';
  v_erro text;
  v_falhas int := 0;

begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then
    raise exception 'Pré-requisito ausente: nenhum admin ativo em profiles.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ------------------------------------------------------------
  -- 1. Código gerado por categoria, em sequência
  -- ------------------------------------------------------------
  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Cimento CP-II 50kg', 'sc', 42.00, 'Material') returning id, codigo into v_a, v_cod;
  if v_cod !~ '^MAT-\d{4}$' then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('1. Material -> %s  (formato MAT-NNNN)%s', v_cod, E'\n');

  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Pedreiro', 'h', 30.00, 'Mão de Obra') returning id, codigo into v_ped, v_cod;
  if v_cod !~ '^MO-\d{4}$' then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('2. Mão de Obra -> %s  (prefixo próprio, contador próprio)%s', v_cod, E'\n');

  -- ------------------------------------------------------------
  -- 2. O código entra na `busca` — prova a ORDEM das triggers BEFORE
  -- ------------------------------------------------------------
  -- `trg_catalogo_codigo` tem de disparar antes de
  -- `trg_catalogo_insumo_before_write`, e o que garante isso é a ordem
  -- ALFABÉTICA do nome. Renomear uma delas quebra esta linha — e, na tela,
  -- buscar por "MAT-0001" deixaria de achar o item no dia em que ele nasce.
  select busca into v_busca from public.catalogo_insumos where id = v_a;
  if v_busca not like 'mat-%' then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('3. busca começa com o código: %L%s', left(v_busca, 20), E'\n');

  -- ------------------------------------------------------------
  -- 3. O gêmeo por grafia é recusado
  -- ------------------------------------------------------------
  -- Caixa, acento e espaço repetido, tudo de uma vez. É o espaço duplo que
  -- exige `fn_chave_insumo` em vez de `fn_normaliza_busca`.
  begin
    insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
      values ('  CIMENTO   CP-II  50KG ', 'sc', 99.00, 'Material');
    v_res := v_res || '4. FALHOU: gêmeo por grafia foi aceito' || E'\n';
    v_falhas := v_falhas + 1;
  exception when unique_violation then
    v_res := v_res || '4. ok: gêmeo por grafia recusado' || E'\n';
  end;

  -- Mesmo nome em OUTRA unidade é item legítimo: "Cimento 50kg" em saco e em
  -- quilo têm preços legitimamente diferentes.
  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Cimento CP-II 50kg', 'kg', 0.84, 'Material');
  v_res := v_res || '5. ok: mesmo nome em outra unidade aceito' || E'\n';

  -- ------------------------------------------------------------
  -- 4. O código é imutável
  -- ------------------------------------------------------------
  begin
    update public.catalogo_insumos set codigo = 'MAT-9999' where id = v_a;
    v_res := v_res || '6. FALHOU: código foi alterado' || E'\n';
    v_falhas := v_falhas + 1;
  exception when others then
    get stacked diagnostics v_erro = message_text;
    v_res := v_res || format('6. ok: %s%s', v_erro, E'\n');
  end;

  -- ------------------------------------------------------------
  -- 5. Unidade fora do domínio canônico
  -- ------------------------------------------------------------
  begin
    insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
      values ('Areia média', 'M3', 120.00, 'Material');
    v_res := v_res || '7. FALHOU: unidade "M3" foi aceita' || E'\n';
    v_falhas := v_falhas + 1;
  exception when foreign_key_violation then
    v_res := v_res || '7. ok: unidade fora do domínio recusada' || E'\n';
  end;

  -- ------------------------------------------------------------
  -- 6. Promoção e rebaixamento: "composição vazia" não é representável
  -- ------------------------------------------------------------
  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Tijolo cerâmico', 'un', 0.80, 'Material') returning id into v_tij;
  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Alvenaria de vedação', 'm²', 1.00, 'Serviço') returning id into v_alv;

  select tipo_item into v_tipo from public.catalogo_insumos where id = v_alv;
  if v_tipo <> 'Insumo' then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('8. item novo nasce %s  (esperado Insumo)%s', v_tipo, E'\n');

  -- 0,80 h × R$ 30,00 = R$ 24,00
  insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
    values (v_alv, v_ped, 0.80) returning id into v_ci1;
  select tipo_item, preco_fonte, preco_referencia into v_tipo, v_fonte, v_preco
    from public.catalogo_insumos where id = v_alv;
  if v_tipo <> 'Composicao' or v_fonte <> 'Composicao' or v_preco <> 24.00 then
    v_falhas := v_falhas + 1;
  end if;
  v_res := v_res || format('9. 1º componente promove: %s / %s / R$ %s  (esperado Composicao/Composicao/24.00)%s',
                           v_tipo, v_fonte, v_preco, E'\n');

  -- + 26 un × R$ 0,80 = R$ 20,80  →  R$ 44,80
  insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
    values (v_alv, v_tij, 26) returning id into v_ci2;
  select preco_referencia into v_preco from public.catalogo_insumos where id = v_alv;
  if v_preco <> 44.80 then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('10. 2º componente: R$ %s  (esperado 44.80)%s', v_preco, E'\n');

  -- O mesmo insumo duas vezes na mesma composição continua barrado.
  begin
    insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
      values (v_alv, v_ped, 0.10);
    v_res := v_res || '11. FALHOU: insumo repetido na composição foi aceito' || E'\n';
    v_falhas := v_falhas + 1;
  exception when unique_violation then
    v_res := v_res || '11. ok: insumo repetido na mesma composição recusado' || E'\n';
  end;

  -- Ciclo continua barrado depois que o guard perdeu a checagem de tipo.
  insert into public.catalogo_insumos (descricao, unidade, preco_referencia, categoria)
    values ('Argamassa 1:2:8', 'm³', 1.00, 'Serviço') returning id into v_arg;
  insert into public.composicao_itens (composicao_id, insumo_id, coeficiente) values (v_arg, v_alv, 1);
  begin
    insert into public.composicao_itens (composicao_id, insumo_id, coeficiente) values (v_alv, v_arg, 1);
    v_res := v_res || '12. FALHOU: ciclo aceito' || E'\n';
    v_falhas := v_falhas + 1;
  exception when others then
    v_res := v_res || '12. ok: ciclo ainda barrado' || E'\n';
  end;

  -- Sair o último componente rebaixa e CONGELA o custo derivado como preço
  -- digitado — é o número certo, e não zero.
  delete from public.composicao_itens where id = v_ci2;
  delete from public.composicao_itens where id = v_ci1;
  select tipo_item, preco_fonte, preco_referencia into v_tipo, v_fonte, v_preco
    from public.catalogo_insumos where id = v_alv;
  if v_tipo <> 'Insumo' or v_fonte <> 'Manual' or v_preco <> 24.00 then
    v_falhas := v_falhas + 1;
  end if;
  v_res := v_res || format('13. sem componentes: %s / %s / R$ %s  (esperado Insumo/Manual/24.00 congelado)%s',
                           v_tipo, v_fonte, v_preco, E'\n');

  -- ------------------------------------------------------------
  -- 7. "Salvar no catálogo" reusa em vez de duplicar
  -- ------------------------------------------------------------
  -- É a porta por onde a duplicata entrava: INSERT incondicional do item de topo
  -- e de todo componente sem `catalogo_insumo_id`.
  select id into v_cli from public.clientes limit 1;
  if v_cli is null then
    raise exception 'Pré-requisito ausente: nenhum cliente em clientes.';
  end if;

  insert into public.propostas (numero, cliente_id, descricao)
    values ('TESTE-UNICIDADE', v_cli, 'Proposta do teste de unicidade') returning id into v_prop;

  insert into public.itens_proposta (proposta_id, descricao, unidade, categoria, preco_unitario_base)
    values (v_prop, 'Contrapiso 1:4 e=2cm', 'm²', 'Terceiros', 39.60) returning id into v_item;
  insert into public.itens_proposta_composicao
    (item_proposta_id, descricao, unidade, categoria, coeficiente, preco_unitario, ordem)
    values (v_item, 'Pedreiro', 'h', 'Mão de Obra', 0.50, 30.00, 1),
           (v_item, 'Areia lavada', 'm³', 'Material', 0.02, 110.00, 2);

  select count(*) into v_n0 from public.catalogo_insumos;
  v_r1 := public.proposta_item_salvar_no_catalogo(v_item);
  select count(*) into v_n1 from public.catalogo_insumos;
  -- Pedreiro já existe (reusado); Areia lavada e o item de topo são novos.
  if (v_r1->>'itens_criados')::int <> 1 or (v_r1->>'itens_reusados')::int <> 1
     or (v_r1->>'item_criado')::boolean is not true then
    v_falhas := v_falhas + 1;
  end if;
  v_res := v_res || format('14. 1ª gravação: catálogo %s -> %s, criados=%s reusados=%s topo_novo=%s%s',
    v_n0, v_n1, v_r1->>'itens_criados', v_r1->>'itens_reusados', v_r1->>'item_criado', E'\n');

  -- A MESMA gravação de novo: nada pode ser criado.
  v_r2 := public.proposta_item_salvar_no_catalogo(v_item);
  select count(*) into v_n2 from public.catalogo_insumos;
  if v_n2 <> v_n1 or (v_r2->>'itens_criados')::int <> 0
     or (v_r2->>'item_criado')::boolean is not false then
    v_falhas := v_falhas + 1;
  end if;
  v_res := v_res || format('15. 2ª gravação: catálogo %s -> %s, criados=%s topo_novo=%s  (esperado 0 / false)%s',
    v_n1, v_n2, v_r2->>'itens_criados', v_r2->>'item_criado', E'\n');

  -- Outra grafia dos MESMOS nomes: reuso por nome+unidade, não por FK.
  insert into public.itens_proposta (proposta_id, descricao, unidade, categoria, preco_unitario_base)
    values (v_prop, '  CONTRAPISO   1:4 E=2CM ', 'm²', 'Terceiros', 45.00) returning id into v_item2;
  insert into public.itens_proposta_composicao
    (item_proposta_id, descricao, unidade, categoria, coeficiente, preco_unitario, ordem)
    values (v_item2, 'PEDREIRO', 'h', 'Mão de Obra', 0.60, 35.00, 1);

  v_r3 := public.proposta_item_salvar_no_catalogo(v_item2);
  select count(*) into v_n3 from public.catalogo_insumos;
  if v_n3 <> v_n2 or (v_r3->>'itens_criados')::int <> 0 then
    v_falhas := v_falhas + 1;
  end if;
  v_res := v_res || format('16. outra grafia: catálogo %s -> %s, criados=%s  (esperado sem crescer)%s',
    v_n2, v_n3, v_r3->>'itens_criados', E'\n');

  -- Divergência de preço é RELATADA, e o catálogo não é sobrescrito.
  if jsonb_array_length(v_r3->'precos_divergentes') = 0 then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('17. divergências relatadas: %s%s',
    jsonb_array_length(v_r3->'precos_divergentes'), E'\n');

  -- O componente que estava no catálogo e não veio desta proposta sobrevive, e
  -- é relatado. Reusar por nome pode alcançar composição de outra pessoa.
  if jsonb_array_length(v_r3->'componentes_extra') = 0 then v_falhas := v_falhas + 1; end if;
  v_res := v_res || format('18. componentes extra preservados e relatados: %s%s',
    v_r3->'componentes_extra', E'\n');

  v_res := v_res || E'\n' || case when v_falhas = 0
    then '== TUDO PASSOU =='
    else format('== %s ASSERÇÃO(ÕES) FALHARAM ==', v_falhas) end || E'\n';

  raise exception '%', v_res;
end $$;
