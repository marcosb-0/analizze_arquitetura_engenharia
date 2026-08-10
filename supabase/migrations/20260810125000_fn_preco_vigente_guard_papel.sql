-- ============================================================
-- Fechando o último caminho para a folha de pagamento
-- ============================================================
-- `20260810122000` revogou `fn_custo_hora_folha` de `authenticated` depois de o
-- advisor mostrar que o PostgREST a expunha como RPC e o salário era
-- recuperável pela conta inversa. Sobrou o caminho de um passo: quem chamasse
-- `fn_preco_vigente` diretamente com o uuid de um insumo de mão de obra
-- recebia o mesmo número, porque ela é SECURITY DEFINER e chama a outra
-- internamente.
--
-- Um usuário de `campo` alcança esse uuid legitimamente: `catalogo_insumo_id`
-- aparece em `insumos_projeto`, onde ele tem SELECT na obra dele.
--
-- ------------------------------------------------------------
-- Por que GUARD e não REVOKE
-- ------------------------------------------------------------
-- `authenticated` PRECISA de EXECUTE aqui: `v_catalogo_insumos` e
-- `v_composicao_itens` são `security_invoker = true`, então a permissão é
-- checada contra quem chama. Revogar quebraria o catálogo inteiro para admin e
-- gestão — que são justamente quem pode usá-lo.
--
-- ------------------------------------------------------------
-- Por que a condição é sobre a SESSÃO, não só sobre o papel
-- ------------------------------------------------------------
-- Um `raise` para todo papel fora de admin/gestão pegaria também as conexões
-- SEM papel de aplicação: console SQL, `service_role`, jobs. E essas atravessam
-- a cadeia de gatilhos — mexer num coeficiente dispara `fn_recalcula_composicao`
-- → `fn_custo_composicao` → `fn_preco_vigente`. O guard ingênuo tornaria
-- impossível corrigir um coeficiente pelo painel do Supabase.
--
-- `auth.role()` separa os dois mundos: devolve 'authenticated'/'anon' quando a
-- chamada vem de um usuário final pelo PostgREST, e NULL numa conexão de
-- backend. Verificado antes de escrever.
--
-- ------------------------------------------------------------
-- Nenhum caminho legítimo se perde — conferido, não presumido
-- ------------------------------------------------------------
-- Os únicos chamadores são: as duas views acima (base `catalogo_insumos`, cuja
-- RLS já é admin+gestão), o gatilho `fn_congela_procedencia_preco` (dispara só
-- em ESCRITA de `insumos_projeto` e `itens_proposta`, onde campo e financeiro
-- têm apenas SELECT), `fn_custo_composicao` e as cinco RPCs do catálogo — todas
-- SECURITY DEFINER com guard próprio.
--
-- Testado em transação revertida, os cinco casos:
--   1. JWT sem profile chamando a RPC direto ......... recusado
--   2. admin lendo v_catalogo_insumos ................ 10 linhas, com preço
--   3. sem papel lendo v_catalogo_insumos ............ 0 linhas, SEM erro
--      (a RLS corta antes de o lateral executar — este era o risco do guard)
--   4. escrita em composicao_itens sem JWT (console) . gatilho recalculou
--   5. escrita como admin + RPCs de composição ....... HH e custo atualizados

create or replace function public.fn_preco_vigente(p_insumo_id uuid)
returns table (preco numeric, nivel smallint, fonte text, fornecedor_id uuid,
               data_origem date, dias_idade integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item   public.catalogo_insumos;
  v_tem_filhos boolean;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para consultar o preço vigente do catálogo.';
  end if;

  select * into v_item from public.catalogo_insumos where id = p_insumo_id;
  if not found then
    return;
  end if;

  select exists (select 1 from public.composicao_itens where composicao_id = p_insumo_id)
    into v_tem_filhos;

  -- Composição: o preço é o derivado, e a confiança é a do PIOR componente
  -- folha. Uma composição não é mais firme que o seu elo mais fraco.
  if v_tem_filhos then
    return query
    with recursive expandido as (
      select ci.insumo_id as item_id, 1 as nivel_arvore
        from public.composicao_itens ci
       where ci.composicao_id = p_insumo_id
      union all
      select ci.insumo_id, e.nivel_arvore + 1
        from expandido e
        join public.composicao_itens ci on ci.composicao_id = e.item_id
       where e.nivel_arvore < 20
    ),
    folhas as (
      select distinct e.item_id from expandido e
       where not exists (select 1 from public.composicao_itens f where f.composicao_id = e.item_id)
    ),
    niveis as (
      select pv.nivel, pv.fonte, pv.data_origem
        from folhas cross join lateral public.fn_preco_vigente(folhas.item_id) pv
    )
    select v_item.preco_referencia,
           coalesce(max(n.nivel), 4::smallint),
           -- Rótulo do PIOR componente-folha, e não derivado do número: nível 1
           -- pode ser 'Cotação' OU 'Folha'.
           coalesce((array_agg(n.fonte order by n.nivel desc, n.data_origem nulls last))[1], 'Referência'),
           null::uuid, min(n.data_origem), (current_date - min(n.data_origem))::int
      from niveis n;
    return;
  end if;

  -- NÍVEL 1a — FOLHA, antes da cotação (ver 20260810122000).
  if v_item.categoria = 'Mão de Obra' then
    return query
    select fh.preco, 1::smallint, 'Folha'::text, null::uuid, fh.data_origem,
           (current_date - fh.data_origem)::int
      from public.fn_custo_hora_folha(p_insumo_id) fh;
    if found then return; end if;
  end if;

  -- NÍVEL 1b — cotação vigente, a mais barata.
  return query
  select cf.preco_unitario, 1::smallint, 'Cotação'::text, cf.fornecedor_id,
         cf.data_cotacao, (current_date - cf.data_cotacao)::int
    from public.cotacoes_fornecedores cf
   where cf.catalogo_id = p_insumo_id and cf.ativa
     and cf.data_cotacao + cf.validade_dias >= current_date
   order by cf.preco_unitario asc, cf.data_cotacao desc limit 1;
  if found then return; end if;

  -- NÍVEL 2 — praticado: cotação vencida ou preço de fornecedor no histórico.
  return query
  select p.preco, 2::smallint, 'Praticado'::text, p.fornecedor_id, p.data,
         (current_date - p.data)::int
    from (
      select cf.preco_unitario as preco, cf.fornecedor_id, cf.data_cotacao as data
        from public.cotacoes_fornecedores cf
       where cf.catalogo_id = p_insumo_id and cf.ativa
         and cf.data_cotacao + cf.validade_dias < current_date
      union all
      select hp.preco, null::uuid, hp.data
        from public.catalogo_historico_precos hp
       where hp.catalogo_id = p_insumo_id and hp.fonte = 'Fornecedor'
    ) p
   order by p.data desc, p.preco asc limit 1;
  if found then return; end if;

  -- NÍVEIS 3 e 4 — digitado ou referência.
  return query
  select v_item.preco_referencia,
         case when v_item.preco_fonte = 'Manual' then 3 else 4 end::smallint,
         case when v_item.preco_fonte = 'Manual' then 'Estimado' else 'Referência' end,
         v_item.fornecedor_padrao_id, v_item.data_atualizacao_preco,
         (current_date - v_item.data_atualizacao_preco)::int;
end;
$$;

comment on function public.fn_preco_vigente(uuid) is
  'Preço vigente pela cadeia: 1 Folha/Cotação (firme) → 2 Praticado → 3 Estimado → 4 Referência. GUARD DE PAPEL: sessão de usuário final precisa ser admin/gestão, porque o ramo Folha deriva de salario_base e o PostgREST expõe a função como RPC. Conexão de backend (auth.role() nulo) passa, senão a cadeia de gatilhos quebraria fora da aplicação.';
