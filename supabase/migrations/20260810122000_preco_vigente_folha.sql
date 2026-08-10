-- ============================================================
-- 'Folha' — o custo-hora de quem já está contratado
-- ============================================================
-- A cadeia de `fn_preco_vigente` resolve em 4 níveis: 1 Cotação (firme) →
-- 2 Praticado → 3 Estimado → 4 Referência (SINAPI). Para material isso está
-- completo. Para MÃO DE OBRA falta a fonte mais firme que existe numa empresa
-- que contrata: a própria folha de pagamento.
--
-- `funcionarios.catalogo_mao_de_obra_id` existe desde 20260726221330 e nunca
-- teve consumidor — o comentário daquela migration prometia "comparar o HH
-- apontado com o coeficiente da composição e derivar o custo/hora real a
-- partir da folha". Esta migration cumpre a segunda metade.
--
--   preço/hora = maior salário ativo × (1 + encargos/100) ÷ jornada mensal
--
-- ------------------------------------------------------------
-- Três decisões que precisam estar escritas, porque nenhuma é óbvia:
-- ------------------------------------------------------------
--
-- 1. FOLHA É NÍVEL 1, NÃO UM QUINTO NÍVEL. `nivel` continua sendo 1..4 e
--    'Folha' entra como uma segunda fonte do nível 1, ao lado de 'Cotação'.
--    Nível 1 passa a significar "preço firme e contratado". Criar um nível 5
--    obrigaria a mexer em `NivelPreco`, nas views de confiança e na aritmética
--    de contingência para expressar a mesma ideia — que este preço não é
--    estimativa, é compromisso assinado.
--
-- 2. FOLHA VEM ANTES DA COTAÇÃO. Se o cargo tem gente contratada, esse é o
--    custo: o salário é pago com ou sem a obra, e uma cotação de empreiteiro
--    mais barata não desfaz a folha — ela é uma decisão diferente (terceirizar),
--    não um preço melhor para o mesmo insumo. Misturar as duas na regra do
--    "menor preço" das cotações produziria um número que não corresponde a
--    nenhuma decisão real.
--
-- 3. MAIOR SALÁRIO ATIVO, não a média. Escolha explícita do usuário: orçar
--    pelo pior caso garante que a obra não estoure na mão de obra. O custo de
--    ser conservador é conhecido — com um único funcionário no cargo, o preço
--    exibido revela o salário dele para quem souber a conta inversa. O
--    catálogo é admin+gestão, os mesmos papéis que já veem a aba Equipe, então
--    isso não amplia alcance; qualquer RPC futura que exponha preço de MO a
--    outro papel precisa lembrar disto.

-- ============================================================
-- 1. CHECK das colunas de procedência congelada
-- ============================================================
-- `insumos_projeto` e `itens_proposta` gravam a fonte no momento do vínculo.
-- Sem isto o primeiro vínculo de um insumo com preço de folha morre com 23514
-- e o usuário vê um erro cru de constraint.
alter table public.insumos_projeto
  drop constraint if exists insumos_projeto_preco_fonte_efetiva_check;
alter table public.insumos_projeto
  add constraint insumos_projeto_preco_fonte_efetiva_check
  check (preco_fonte_efetiva is null
         or preco_fonte_efetiva in ('Cotação', 'Folha', 'Praticado', 'Estimado', 'Referência'));

alter table public.itens_proposta
  drop constraint if exists itens_proposta_preco_fonte_efetiva_check;
alter table public.itens_proposta
  add constraint itens_proposta_preco_fonte_efetiva_check
  check (preco_fonte_efetiva is null
         or preco_fonte_efetiva in ('Cotação', 'Folha', 'Praticado', 'Estimado', 'Referência'));

-- ============================================================
-- 2. O custo-hora da folha, isolado numa função
-- ============================================================
-- Separada de `fn_preco_vigente` para poder ser testada e exibida sozinha: a
-- tela precisa mostrar "seu pedreiro custa R$ 27,80/h" mesmo quando o insumo
-- não está em composição nenhuma.
create or replace function public.fn_custo_hora_folha(p_insumo_id uuid)
returns table (preco numeric, funcionarios integer, data_origem date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(max(f.salario_base) * (1 + cfg.encargos_sociais_percentual / 100.0)
               / cfg.jornada_mensal_horas, 2),
         count(*)::int,
         max(f.updated_at)::date
    from public.funcionarios f
    cross join (
      select encargos_sociais_percentual, jornada_mensal_horas
        from public.empresa_config
       where singleton
       limit 1
    ) cfg
   where f.catalogo_mao_de_obra_id = p_insumo_id
     and f.status = 'Ativo'
     and f.salario_base is not null
     and f.salario_base > 0
     -- Encargos não configurados: a folha não entra. `having` vazio via este
     -- filtro é mais barato que um `if` no chamador e mantém a regra num lugar.
     and cfg.encargos_sociais_percentual is not null
  having count(*) > 0;
$$;

comment on function public.fn_custo_hora_folha(uuid) is
  'Custo/hora de um insumo de mão de obra a partir da folha: MAIOR salário ativo × (1+encargos) ÷ jornada mensal. Não devolve linha se não houver funcionário ativo vinculado ou se os encargos não estiverem configurados.';

-- REVOKE, e não grant. Esta função é SECURITY DEFINER e lê `salario_base`, e o
-- PostgREST expõe toda função de `public` em /rest/v1/rpc/ — com EXECUTE para
-- `authenticated`, qualquer usuário logado (inclusive um SEM profile) chamaria
-- com um uuid de insumo e recuperaria o salário pela conta inversa
-- (preço × jornada ÷ (1+encargos)). Verificado em transação revertida: devolveu
-- 3.400,22 para um salário de 3.400,00.
--
-- Não precisa de grant: o único chamador é `fn_preco_vigente`, que também é
-- DEFINER e a alcança de qualquer forma. O grant era excesso desde o início.
revoke execute on function public.fn_custo_hora_folha(uuid) from anon, authenticated, public;

-- ============================================================
-- 3. A cadeia, com a folha na frente
-- ============================================================
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
      select distinct e.item_id
        from expandido e
       where not exists (
         select 1 from public.composicao_itens f where f.composicao_id = e.item_id
       )
    ),
    niveis as (
      select pv.nivel, pv.fonte, pv.data_origem
        from folhas
        cross join lateral public.fn_preco_vigente(folhas.item_id) pv
    )
    select v_item.preco_referencia,
           coalesce(max(n.nivel), 4::smallint),
           -- Rótulo do PIOR componente-folha, e não um rótulo derivado do
           -- número. Antes da folha, nível 1 só podia ser 'Cotação' e o `case`
           -- bastava; agora nível 1 pode ser 'Cotação' OU 'Folha', e devolver
           -- sempre 'Cotação' diria que há fornecedor onde há holerite.
           coalesce((array_agg(n.fonte order by n.nivel desc, n.data_origem nulls last))[1],
                    'Referência'),
           null::uuid,
           min(n.data_origem),
           (current_date - min(n.data_origem))::int
      from niveis n;
    return;
  end if;

  -- NÍVEL 1a — FOLHA. Antes da cotação: ver decisão 2 no cabeçalho.
  -- O rótulo agregado da composição acima continua dizendo 'Cotação' para
  -- nível 1 de propósito — lá o número descreve a firmeza do conjunto, não a
  -- origem de um item só, e "Cotação" é a leitura correta de "nível 1".
  if v_item.categoria = 'Mão de Obra' then
    return query
    select fh.preco, 1::smallint, 'Folha'::text, null::uuid, fh.data_origem,
           (current_date - fh.data_origem)::int
      from public.fn_custo_hora_folha(p_insumo_id) fh;
    if found then return; end if;
  end if;

  -- NÍVEL 1b — cotação vigente, a mais barata.
  return query
  select cf.preco_unitario,
         1::smallint,
         'Cotação'::text,
         cf.fornecedor_id,
         cf.data_cotacao,
         (current_date - cf.data_cotacao)::int
    from public.cotacoes_fornecedores cf
   where cf.catalogo_id = p_insumo_id
     and cf.ativa
     and cf.data_cotacao + cf.validade_dias >= current_date
   order by cf.preco_unitario asc, cf.data_cotacao desc
   limit 1;
  if found then return; end if;

  -- NÍVEL 2 — praticado: cotação vencida ou preço de fornecedor no histórico.
  return query
  select p.preco, 2::smallint, 'Praticado'::text, p.fornecedor_id, p.data,
         (current_date - p.data)::int
    from (
      select cf.preco_unitario as preco, cf.fornecedor_id, cf.data_cotacao as data
        from public.cotacoes_fornecedores cf
       where cf.catalogo_id = p_insumo_id
         and cf.ativa
         and cf.data_cotacao + cf.validade_dias < current_date
      union all
      select hp.preco, null::uuid, hp.data
        from public.catalogo_historico_precos hp
       where hp.catalogo_id = p_insumo_id
         and hp.fonte = 'Fornecedor'
    ) p
   order by p.data desc, p.preco asc
   limit 1;
  if found then return; end if;

  -- NÍVEIS 3 e 4 — digitado ou referência.
  return query
  select v_item.preco_referencia,
         case when v_item.preco_fonte = 'Manual' then 3 else 4 end::smallint,
         case when v_item.preco_fonte = 'Manual' then 'Estimado' else 'Referência' end,
         v_item.fornecedor_padrao_id,
         v_item.data_atualizacao_preco,
         (current_date - v_item.data_atualizacao_preco)::int;
end;
$$;

comment on function public.fn_preco_vigente(uuid) is
  'Preço vigente de um insumo pela cadeia: 1 Folha/Cotação (firme) → 2 Praticado → 3 Estimado → 4 Referência. Folha só para categoria Mão de Obra, com funcionário ativo vinculado e encargos configurados, e vem ANTES da cotação.';

-- ============================================================
-- 4. Propagação — o ponto que passaria despercebido
-- ============================================================
-- `fn_custo_composicao` soma `fn_preco_vigente` das folhas, que agora depende
-- de `funcionarios` e de `empresa_config`. Nenhum gatilho reagia a essas
-- tabelas: sem o que vem abaixo, aumentar um salário deixaria toda composição
-- que usa aquele cargo com o preço velho, em silêncio, até alguém mexer num
-- coeficiente por acaso.
--
-- Só o pai DIRETO é recalculado aqui. Isso basta: `fn_aplica_custo_composicao`
-- escreve em `catalogo_insumos.preco_referencia`, o que dispara
-- `fn_propaga_custo_composicao` e a mudança sobe sozinha o resto da árvore.
-- É o mesmo desenho de `fn_propaga_custo_cotacao`.
create or replace function public.fn_propaga_custo_folha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai uuid;
  v_insumos uuid[];
begin
  -- Trocar o vínculo de cargo mexe nas composições do cargo ANTIGO e do NOVO.
  v_insumos := array_remove(array[
    (case when tg_op <> 'INSERT' then old.catalogo_mao_de_obra_id end),
    (case when tg_op <> 'DELETE' then new.catalogo_mao_de_obra_id end)
  ], null);

  if array_length(v_insumos, 1) is null then
    return null;
  end if;

  for v_pai in
    select distinct ci.composicao_id
      from public.composicao_itens ci
     where ci.insumo_id = any (v_insumos)
  loop
    perform public.fn_aplica_custo_composicao(v_pai);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_propaga_custo_folha on public.funcionarios;
create trigger trg_propaga_custo_folha
  after insert or delete or update of salario_base, status, catalogo_mao_de_obra_id
  on public.funcionarios
  for each row execute function public.fn_propaga_custo_folha();

-- Encargos e jornada mudam o custo de TODA mão de obra de uma vez, então aqui
-- não há como restringir o alcance: recalcula toda composição povoada.
-- Acontece uma vez por ano, na revisão dos parâmetros.
create or replace function public.fn_propaga_custo_parametros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai uuid;
begin
  for v_pai in
    select distinct ci.composicao_id from public.composicao_itens ci
  loop
    perform public.fn_aplica_custo_composicao(v_pai);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_propaga_custo_parametros on public.empresa_config;
create trigger trg_propaga_custo_parametros
  after update of encargos_sociais_percentual, jornada_mensal_horas
  on public.empresa_config
  for each row
  when (old.encargos_sociais_percentual is distinct from new.encargos_sociais_percentual
        or old.jornada_mensal_horas is distinct from new.jornada_mensal_horas)
  execute function public.fn_propaga_custo_parametros();

revoke execute on function public.fn_propaga_custo_folha() from anon, authenticated, public;
revoke execute on function public.fn_propaga_custo_parametros() from anon, authenticated, public;
