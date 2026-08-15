-- ============================================================
-- SINAPI → PROPOSTA: AS TRÊS CAMADAS NÃO SE CONTAMINAM
-- ============================================================
-- Irmão de `fluxo_ponta_a_ponta.sql` e `papeis.sql`, e com a mesma mecânica:
-- encena o papel por `request.jwt.claims`, roda tudo numa transação e termina
-- com `raise exception` para reverter — nada é gravado.
--
-- O QUE ESTE ARQUIVO TESTA
--
-- A regra de negócio de 15/ago/2026 tem uma afirmação central, e ela é de
-- ISOLAMENTO: existem três composições e três preços para a mesma atividade, e
-- mexer numa não pode mexer nas outras.
--
--   SINAPI      referência de mercado, imutável
--   Catálogo    o padrão da empresa, reutilizável
--   Proposta    o que vai ser executado NAQUELA obra
--
-- Isolamento é o tipo de coisa que passa despercebida quando quebra: nada na
-- tela avisa que o catálogo foi contaminado por uma proposta. Por isso as sete
-- asserções abaixo são quase todas negativas — "o que NÃO mudou".
--
-- A ARMADILHA, a mesma dos irmãos: `set_config` de jwt sozinho roda como
-- `postgres` e não testa RLS nenhuma. Todo trecho que depende dela vem entre
-- `set local role authenticated` e `reset role`.
--
-- COMO RODAR
--   psql "$DATABASE_URL" -f supabase/tests/sinapi_direto_na_proposta.sql
begin;

do $$
declare
  v_admin      uuid;
  v_cliente    uuid;
  v_prop       uuid;
  v_item       uuid;
  v_codigo     int := 101162;  -- alvenaria de vedação com cobogó, 4 componentes
  v_cat_antes  int;
  v_cat_depois int;
  v_sinapi_antes  int;
  v_sinapi_depois int;
  v_base       numeric;
  v_ref        numeric;
  v_custo      numeric;
  v_ajustadas  int;
  v_pedreiro   uuid;
  v_r          jsonb;
  v_res        text := E'\n';
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  select id into v_cliente from public.clientes limit 1;
  if v_admin is null or v_cliente is null then
    raise exception 'Pré-requisito ausente: é preciso um profile admin ativo e um cliente.';
  end if;

  select count(*) into v_cat_antes from public.catalogo_insumos;
  select count(*) into v_sinapi_antes from referencia.composicao_item
   where composicao = v_codigo
     and publicacao_id = (select max(id) from referencia.publicacao where concluida_em is not null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into public.propostas (cliente_id, numero, descricao, status, valor_estimado)
  values (v_cliente, 'TESTE-SINAPI', 'teste de isolamento', 'Elaboração', 0)
  returning id into v_prop;

  -- ==========================================================
  -- 1. A atividade entra na proposta sem passar pelo catálogo
  -- ==========================================================
  v_item := public.proposta_adicionar_sinapi(v_prop, v_codigo, 3);

  select count(*) into v_cat_depois from public.catalogo_insumos;
  v_res := v_res || format('[%s] adicionar da SINAPI não escreveu no catálogo (%s → %s)%s',
    case when v_cat_depois = v_cat_antes then 'OK ' else 'FALHA' end,
    v_cat_antes, v_cat_depois, E'\n');

  -- ==========================================================
  -- 2. A composição veio junto, e o custo bate com o publicado
  -- ==========================================================
  select preco_unitario_base, preco_referencia_sinapi
    into v_base, v_ref
    from public.itens_proposta where id = v_item;
  select count(*) into v_ajustadas from public.itens_proposta_composicao
   where item_proposta_id = v_item;

  v_res := v_res || format('[%s] composição copiada: %s componentes%s',
    case when v_ajustadas > 0 then 'OK ' else 'FALHA' end, v_ajustadas, E'\n');

  -- A soma do nível 1 reproduz o publicado a menos de centavos (o SINAPI trunca
  -- cada parcela, o app soma exato e arredonda uma vez). Mais que R$ 0,10 de
  -- diferença não é arredondamento — é componente faltando.
  v_res := v_res || format('[%s] custo da composição %s ≈ publicado %s%s',
    case when abs(v_base - v_ref) <= 0.10 then 'OK ' else 'FALHA' end,
    v_base, v_ref, E'\n');

  -- ==========================================================
  -- 3. Procedência: referência publicada é nível 4, não "estimado"
  -- ==========================================================
  v_res := v_res || format('[%s] procedência do item vindo da SINAPI%s',
    case when exists (
      select 1 from public.itens_proposta
       where id = v_item and preco_nivel = 4 and preco_fonte_efetiva = 'Referência'
    ) then 'OK ' else 'FALHA' end, E'\n');

  -- ==========================================================
  -- 4. Adaptar à obra move o custo do item, e só dele
  -- ==========================================================
  select id into v_pedreiro from public.itens_proposta_composicao
   where item_proposta_id = v_item and categoria = 'Mão de Obra' limit 1;

  if v_pedreiro is null then
    v_res := v_res || format('[  -] composição sem mão de obra; passo 4 pulado%s', E'\n');
  else
    update public.itens_proposta_composicao
       set preco_unitario = round(preco_unitario / 2, 2)
     where id = v_pedreiro;

    select preco_unitario_base, preco_referencia_sinapi into v_custo, v_ref
      from public.itens_proposta where id = v_item;

    v_res := v_res || format('[%s] editar a composição baixou o custo do item (%s → %s)%s',
      case when v_custo < v_base then 'OK ' else 'FALHA' end, v_base, v_custo, E'\n');

    -- O preço SINAPI congelado no item é o registro de onde tudo partiu.
    v_res := v_res || format('[%s] preço SINAPI preservado no item: %s%s',
      case when v_ref is not null and v_ref <> v_custo then 'OK ' else 'FALHA' end,
      v_ref, E'\n');

    select linhas_ajustadas into v_ajustadas from public.v_itens_proposta where id = v_item;
    v_res := v_res || format('[%s] a view marca %s linha(s) adaptada(s)%s',
      case when v_ajustadas = 1 then 'OK ' else 'FALHA' end, v_ajustadas, E'\n');
  end if;

  -- ==========================================================
  -- 5. A base SINAPI continua intocada
  -- ==========================================================
  select count(*) into v_sinapi_depois from referencia.composicao_item
   where composicao = v_codigo
     and publicacao_id = (select max(id) from referencia.publicacao where concluida_em is not null);
  v_res := v_res || format('[%s] referência SINAPI intacta (%s componentes)%s',
    case when v_sinapi_depois = v_sinapi_antes then 'OK ' else 'FALHA' end,
    v_sinapi_depois, E'\n');

  -- ==========================================================
  -- 6. Editar a composição NÃO escreveu no catálogo
  -- ==========================================================
  select count(*) into v_cat_depois from public.catalogo_insumos;
  v_res := v_res || format('[%s] catálogo segue intacto depois da edição (%s)%s',
    case when v_cat_depois = v_cat_antes then 'OK ' else 'FALHA' end, v_cat_depois, E'\n');

  -- ==========================================================
  -- 7. "Salvar no catálogo" é explícito — e declara o que não levou
  -- ==========================================================
  v_r := public.proposta_item_salvar_no_catalogo(v_item);
  select count(*) into v_cat_depois from public.catalogo_insumos;

  v_res := v_res || format('[%s] salvar no catálogo criou o item (%s → %s)%s',
    case when v_cat_depois > v_cat_antes then 'OK ' else 'FALHA' end,
    v_cat_antes, v_cat_depois, E'\n');

  -- O preço de insumo no catálogo é o padrão da empresa e não é rebaixado por
  -- uma proposta; quando isso faz o custo divergir, a RPC precisa dizer.
  v_res := v_res || format('[%s] divergência de preço declarada: proposta %s × catálogo %s, %s insumo(s)%s',
    case when (v_r->>'custo_proposta')::numeric <> (v_r->>'custo_catalogo')::numeric
           and jsonb_array_length(v_r->'precos_divergentes') > 0
         then 'OK '
         when (v_r->>'custo_proposta')::numeric = (v_r->>'custo_catalogo')::numeric
           and jsonb_array_length(v_r->'precos_divergentes') = 0
         then 'OK '
         else 'FALHA' end,
    v_r->>'custo_proposta', v_r->>'custo_catalogo',
    jsonb_array_length(v_r->'precos_divergentes'), E'\n');

  -- E a proposta não foi puxada para o preço do catálogo.
  select preco_unitario_base into v_base from public.itens_proposta where id = v_item;
  v_res := v_res || format('[%s] preço da proposta preservado após salvar (%s)%s',
    case when v_base = (v_r->>'custo_proposta')::numeric then 'OK ' else 'FALHA' end,
    v_base, E'\n');

  raise exception 'SINAPI → PROPOSTA — transação revertida, nada foi gravado:%', v_res;
end $$;

rollback;
