-- Remove a SINAPI do banco.
--
-- Decisão de produto (19/set/2026): a composição é montada no app, e a SINAPI
-- passa a ser consultada fora dele. Nada aqui apaga insumo, composição ou preço:
-- o que veio da adoção SINAPI vira Manual (nível 3, "Estimado") com o mesmo
-- preço, e só a identidade SINAPI (código, UF, mês, regime, coeficiente
-- publicado) e a base de referência saem.
--
-- Ordem: (1) reescreve o que lê as colunas, (2) converte o dado, (3) troca os
-- CHECKs, (4) derruba views e colunas, (5) derruba a base. A `busca` do catálogo
-- guardava o código SINAPI e é refeita no passo 2 pela trigger já reescrita.

-- ---------------------------------------------------------------------------
-- 1. Funções e triggers que liam as colunas
-- ---------------------------------------------------------------------------

create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tem_componentes boolean;
begin
  new.busca := public.fn_normaliza_busca(
    coalesce(new.descricao, '') || ' ' ||
    coalesce(new.aplicacao, '') || ' ' ||
    coalesce(new.composicao, '')
  );
  select exists (
    select 1 from public.composicao_itens ci where ci.composicao_id = new.id
  ) into v_tem_componentes;
  if tg_op = 'UPDATE'
     and old.tipo_item = 'Composicao'
     and new.tipo_item <> 'Composicao'
     and v_tem_componentes then
    raise exception 'Esta composição tem componentes. Remova-os antes de convertê-la em insumo simples.';
  end if;
  if new.tipo_item = 'Composicao' and v_tem_componentes then
    new.preco_referencia := public.fn_custo_composicao(new.id);
    new.preco_fonte      := 'Composicao';
  end if;
  if tg_op = 'UPDATE'
     and new.preco_referencia is distinct from old.preco_referencia
     and new.data_atualizacao_preco = old.data_atualizacao_preco then
    new.data_atualizacao_preco := current_date;
  end if;
  return new;
end;
$function$;

-- Serve `itens_proposta` e `insumos_projeto`. Sem catálogo, o preço é digitado:
-- nível 3, Estimado. O ramo "veio da SINAPI" (nível 4) saiu junto com o código.
create or replace function public.fn_congela_procedencia_preco()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pv record;
begin
  if new.preco_nivel is not null
     and new.preco_fonte_efetiva is not null then
    return new;
  end if;
  if new.catalogo_insumo_id is null then
    new.preco_nivel         := 3;
    new.preco_fonte_efetiva := 'Estimado';
    new.preco_data_origem   := current_date;
    return new;
  end if;
  select * into v_pv from public.fn_preco_vigente(new.catalogo_insumo_id);
  if found then
    new.preco_nivel         := v_pv.nivel;
    new.preco_fonte_efetiva := v_pv.fonte;
    new.preco_data_origem   := v_pv.data_origem;
  end if;
  return new;
end;
$function$;

-- A árvore devolvia `coeficiente_referencia` (o índice publicado pela SINAPI).
-- Mudar o retorno exige derrubar; quem a chama é plpgsql e não a referencia por
-- coluna, então nenhum dos 5 chamadores precisa mudar.
drop function public.catalogo_composicao_expandida(uuid);
drop function public.fn_composicao_arvore(uuid);

create function public.fn_composicao_arvore(p_id uuid)
returns table(
  nivel integer, ordem text[], caminho uuid[], componente_id uuid, pai_id uuid,
  insumo_id uuid, coeficiente numeric, coef_acumulado numeric, eh_folha boolean
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with recursive arvore as (
    select 1 as nivel,
           array[f.categoria || '~' || f.descricao] as ordem,
           array[ci.insumo_id] as caminho,
           ci.id as componente_id,
           p_id as pai_id,
           ci.insumo_id,
           ci.coeficiente::numeric as coeficiente,
           ci.coeficiente::numeric as coef_acumulado
      from public.composicao_itens ci
      join public.catalogo_insumos f on f.id = ci.insumo_id
     where ci.composicao_id = p_id
    union all
    select a.nivel + 1,
           a.ordem || (f.categoria || '~' || f.descricao),
           a.caminho || ci.insumo_id,
           ci.id,
           a.insumo_id,
           ci.insumo_id,
           ci.coeficiente::numeric,
           a.coef_acumulado * ci.coeficiente
      from arvore a
      join public.composicao_itens ci on ci.composicao_id = a.insumo_id
      join public.catalogo_insumos f  on f.id = ci.insumo_id
     where a.nivel < 20
  )
  select a.nivel, a.ordem, a.caminho, a.componente_id, a.pai_id, a.insumo_id,
         a.coeficiente, a.coef_acumulado,
         not exists (select 1 from public.composicao_itens f where f.composicao_id = a.insumo_id)
    from arvore a order by a.ordem;
$function$;

revoke all on function public.fn_composicao_arvore(uuid) from public, anon, authenticated;
grant execute on function public.fn_composicao_arvore(uuid) to service_role;

create function public.catalogo_composicao_expandida(p_id uuid)
returns table(
  nivel integer, ordem text[], caminho uuid[], componente_id uuid, pai_id uuid,
  insumo_id uuid, descricao text, unidade text, categoria text, tipo_item text,
  ativo boolean, observacao text, coeficiente numeric, coef_acumulado numeric,
  eh_folha boolean, eh_hora boolean, preco_unitario numeric, preco_nivel smallint,
  preco_fonte text, custo numeric
)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para abrir composições do catálogo.';
  end if;

  return query
  with a as (select * from public.fn_composicao_arvore(p_id)),
  pv as (
    select d.insumo_id as id, v.preco, v.nivel, v.fonte
      from (select distinct arv.insumo_id from a arv) d
      cross join lateral public.fn_preco_vigente(d.insumo_id) v
  ),
  folhas as (
    select arv.caminho, round(arv.coef_acumulado * p.preco, 2) as custo
      from a arv join pv p on p.id = arv.insumo_id
     where arv.eh_folha
  )
  select arv.nivel, arv.ordem, arv.caminho, arv.componente_id, arv.pai_id, arv.insumo_id,
         c.descricao, c.unidade, c.categoria, c.tipo_item, c.ativo,
         ci.observacao,
         arv.coeficiente, arv.coef_acumulado,
         arv.eh_folha,
         (c.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(c.unidade)),
         p.preco, p.nivel, p.fonte,
         case
           when arv.eh_folha then round(arv.coef_acumulado * p.preco, 2)
           else (select coalesce(sum(f.custo), 0) from folhas f
                  where f.caminho[1:array_length(arv.caminho, 1)] = arv.caminho)
         end
    from a arv
    join public.catalogo_insumos c on c.id = arv.insumo_id
    join public.composicao_itens ci on ci.id = arv.componente_id
    left join pv p on p.id = arv.insumo_id
   order by arv.ordem;
end;
$function$;

revoke all on function public.catalogo_composicao_expandida(uuid) from public, anon;
grant execute on function public.catalogo_composicao_expandida(uuid) to authenticated, service_role;

-- O índice de referência da linha da proposta passa a ser o próprio coeficiente
-- do catálogo no momento da cópia (era `coalesce(referência SINAPI, coeficiente)`).
create or replace function public.proposta_item_copiar_composicao_catalogo(p_item_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item     record;
  v_comp     record;
  v_ordem    int := 0;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem montar o orçamento de uma proposta.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;
  if v_item.catalogo_insumo_id is null then
    raise exception 'Este item não veio do catálogo.';
  end if;
  if exists (select 1 from public.itens_proposta_composicao where item_proposta_id = p_item_id) then
    raise exception 'Este item já tem composição nesta proposta.';
  end if;

  for v_comp in
    select ci.insumo_id, ci.coeficiente,
           ca.descricao, ca.unidade, ca.categoria,
           pv.preco
      from public.composicao_itens ci
      join public.catalogo_insumos ca on ca.id = ci.insumo_id
      cross join lateral public.fn_preco_vigente(ci.insumo_id) pv
     where ci.composicao_id = v_item.catalogo_insumo_id
     order by ca.categoria, ca.descricao
  loop
    insert into public.itens_proposta_composicao (
      item_proposta_id, catalogo_insumo_id, descricao, unidade, categoria,
      coeficiente, coeficiente_referencia, preco_unitario, preco_unitario_referencia, ordem
    ) values (
      p_item_id, v_comp.insumo_id, v_comp.descricao, v_comp.unidade, v_comp.categoria,
      v_comp.coeficiente, v_comp.coeficiente,
      coalesce(v_comp.preco, 0), v_comp.preco, v_ordem
    );
    v_ordem := v_ordem + 1;
  end loop;

  return v_ordem;
end;
$function$;

-- UF e regime só existiam para achar o insumo pela identidade SINAPI. Sem ela o
-- item vira sempre um insumo novo do catálogo (era o que já acontecia com o item
-- próprio); os componentes seguem reaproveitando o `catalogo_insumo_id` que a
-- linha da proposta já carrega.
drop function public.proposta_item_salvar_no_catalogo(uuid, character, character);

create function public.proposta_item_salvar_no_catalogo(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item       record;
  v_id         uuid;
  v_comp       record;
  v_filho_id   uuid;
  v_criados    int := 0;
  v_reusados   int := 0;
  v_divergem   jsonb := '[]'::jsonb;
  v_custo_prop numeric(14,2);
  v_custo_cat  numeric(14,2);
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem escrever no catálogo.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;

  -- O custo desta proposta, antes de qualquer coisa: e ele que o usuario ve na
  -- tela e espera reencontrar.
  select round(sum(coeficiente * preco_unitario), 2) into v_custo_prop
    from public.itens_proposta_composicao where item_proposta_id = p_item_id;

  insert into public.catalogo_insumos (
    descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
  ) values (
    v_item.descricao,
    v_item.unidade,
    v_item.preco_unitario_base,
    case v_item.categoria
      when 'Materiais'      then 'Material'
      when 'Mão de Obra'    then 'Mão de Obra'
      when 'Equipamentos'   then 'Equipamento'
      when 'Terceiros'      then 'Serviço'
      when 'Administração'  then 'Taxa'
      else 'Material'
    end,
    case when exists (select 1 from public.itens_proposta_composicao
                       where item_proposta_id = p_item_id)
         then 'Composicao' else 'Insumo' end,
    'Manual'
  )
  returning id into v_id;

  if v_id is null then
    raise exception 'Nenhuma linha foi criada — sem permissão para escrever no catálogo.';
  end if;

  for v_comp in
    select * from public.itens_proposta_composicao
     where item_proposta_id = p_item_id
     order by ordem
  loop
    v_filho_id := v_comp.catalogo_insumo_id;

    if v_filho_id is null then
      -- Insumo novo: nasce com o preco DA PROPOSTA, porque nao ha padrao
      -- anterior para preservar. Aqui os dois numeros coincidem.
      insert into public.catalogo_insumos (
        descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
      ) values (
        v_comp.descricao,
        v_comp.unidade,
        v_comp.preco_unitario,
        v_comp.categoria,
        'Insumo',
        'Manual'
      )
      returning id into v_filho_id;
      v_criados := v_criados + 1;
    else
      v_reusados := v_reusados + 1;
      -- O insumo ja tinha padrao proprio. O preco DELE nao e sobrescrito — mas
      -- a divergencia e reportada, com os dois numeros, para a tela dizer o que
      -- ficou de fora em vez de o usuario descobrir na proxima proposta.
      if exists (
        select 1 from public.catalogo_insumos ca
         where ca.id = v_filho_id
           and ca.preco_referencia is distinct from v_comp.preco_unitario
      ) then
        v_divergem := v_divergem || jsonb_build_object(
          'descricao',      v_comp.descricao,
          'preco_proposta', v_comp.preco_unitario,
          'preco_catalogo', (select ca.preco_referencia from public.catalogo_insumos ca where ca.id = v_filho_id)
        );
      end if;
    end if;

    insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
    values (v_id, v_filho_id, v_comp.coeficiente)
    on conflict (composicao_id, insumo_id) do update
       set coeficiente = excluded.coeficiente;
  end loop;

  update public.itens_proposta
     set catalogo_insumo_id = v_id
   where id = p_item_id;

  -- O custo que o catalogo de fato ficou valendo, depois do gatilho dele.
  select ca.preco_referencia into v_custo_cat
    from public.catalogo_insumos ca where ca.id = v_id;

  return jsonb_build_object(
    'catalogo_insumo_id', v_id,
    'componentes',        v_criados + v_reusados,
    'itens_criados',      v_criados,
    'itens_reusados',     v_reusados,
    'custo_proposta',     v_custo_prop,
    'custo_catalogo',     v_custo_cat,
    'precos_divergentes', v_divergem
  );
end;
$function$;

revoke all on function public.proposta_item_salvar_no_catalogo(uuid) from public, anon;
grant execute on function public.proposta_item_salvar_no_catalogo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Dado existente: a origem SINAPI vira Manual, com o mesmo preço
-- ---------------------------------------------------------------------------
-- O `set descricao = descricao` só faz a trigger refazer a `busca` sem o código.
update public.catalogo_insumos
   set preco_fonte = case when preco_fonte = 'SINAPI' then 'Manual' else preco_fonte end,
       descricao   = descricao;

update public.catalogo_historico_precos set fonte = 'Manual' where fonte = 'SINAPI';

-- ---------------------------------------------------------------------------
-- 3. CHECKs sem 'SINAPI'
-- ---------------------------------------------------------------------------
alter table public.catalogo_insumos
  drop constraint catalogo_insumos_preco_fonte_check,
  add constraint catalogo_insumos_preco_fonte_check
    check (preco_fonte in ('Fornecedor', 'Manual', 'Composicao'));

alter table public.catalogo_historico_precos
  drop constraint catalogo_historico_precos_fonte_check,
  add constraint catalogo_historico_precos_fonte_check
    check (fonte in ('Fornecedor', 'Manual', 'Composicao'));

-- ---------------------------------------------------------------------------
-- 4. Views e colunas
-- ---------------------------------------------------------------------------
-- Uma view congela as colunas que existiam quando foi criada, então cada uma
-- que perde coluna é derrubada e refeita (security_invoker e grants como eram).
drop view if exists public.v_sinapi_publicacao;
drop view if exists public.v_sinapi_item;
drop view if exists public.v_sinapi_composicao_item;
drop view public.v_catalogo_insumos;
drop view public.v_composicao_itens;
drop view public.v_itens_proposta;

drop function if exists public.sinapi_buscar(text, character, character, text, integer, integer, integer);
drop function if exists public.sinapi_custo_expandido(integer, integer, character, character);
drop function if exists public.sinapi_adotar(integer, text, integer, character, character);
drop function if exists public.sinapi_importar(text, text, jsonb);
drop function if exists public.proposta_adicionar_sinapi(uuid, integer, numeric, integer, character, character);
drop function if exists public.fn_sinapi_categoria(text, text);

drop index if exists public.catalogo_insumos_sinapi_unico;
drop index if exists public.itens_proposta_codigo_sinapi_idx;

alter table public.catalogo_insumos
  drop column codigo_sinapi,
  drop column tipo,
  drop column uf,
  drop column mes_referencia,
  drop column desonerado;
alter table public.composicao_itens drop column coeficiente_referencia;
alter table public.itens_proposta
  drop column codigo_sinapi,
  drop column preco_referencia_sinapi;
alter table public.itens_proposta_composicao drop column codigo_sinapi;

create view public.v_catalogo_insumos with (security_invoker = true) as
 SELECT c.id,
    c.descricao,
    c.unidade,
    c.preco_referencia,
    c.categoria,
    c.fornecedor_padrao_id,
    c.composicao,
    c.aplicacao,
    c.ativo,
    c.data_atualizacao_preco,
    c.created_at,
    c.updated_at,
    c.tipo_item,
    c.preco_fonte,
    c.busca,
    ( SELECT count(DISTINCT io.projeto_id) AS count
           FROM itens_orcamento io
          WHERE (io.catalogo_insumo_id = c.id)) AS obras_utilizando,
    ( SELECT count(*) AS count
           FROM cotacoes_fornecedores cf
          WHERE ((cf.catalogo_id = c.id) AND cf.ativa)) AS cotacoes_ativas,
    ( SELECT count(*) AS count
           FROM catalogo_historico_precos hp
          WHERE (hp.catalogo_id = c.id)) AS pontos_historico,
    ( SELECT count(*) AS count
           FROM composicao_itens ci
          WHERE (ci.composicao_id = c.id)) AS qtd_componentes,
    ( SELECT count(*) AS count
           FROM composicao_itens ci
          WHERE (ci.insumo_id = c.id)) AS usado_em_composicoes,
    (EXISTS ( SELECT 1
           FROM (composicao_itens ci
             JOIN catalogo_insumos f ON ((f.id = ci.insumo_id)))
          WHERE ((ci.composicao_id = c.id) AND (NOT f.ativo)))) AS tem_componente_inativo,
    pv.preco AS preco_vigente,
    pv.nivel AS preco_nivel,
    pv.fonte AS preco_fonte_efetiva,
    pv.fornecedor_id AS preco_fornecedor_id,
    pv.data_origem AS preco_data_origem,
    pv.dias_idade AS preco_dias_idade
   FROM (catalogo_insumos c
     CROSS JOIN LATERAL fn_preco_vigente(c.id) pv(preco, nivel, fonte, fornecedor_id, data_origem, dias_idade));

create view public.v_composicao_itens with (security_invoker = true) as
 SELECT ci.id,
    ci.composicao_id,
    ci.insumo_id,
    ci.coeficiente,
    ci.observacao,
    ci.created_at,
    ci.updated_at,
    c.descricao AS insumo_descricao,
    c.unidade AS insumo_unidade,
    c.categoria AS insumo_categoria,
    c.tipo_item AS insumo_tipo_item,
    c.preco_referencia AS insumo_preco_referencia,
    c.ativo AS insumo_ativo,
    pv.preco AS insumo_preco_vigente,
    pv.nivel AS insumo_preco_nivel,
    pv.fonte AS insumo_preco_fonte,
    round((ci.coeficiente * pv.preco), 2) AS custo_total
   FROM ((composicao_itens ci
     JOIN catalogo_insumos c ON ((c.id = ci.insumo_id)))
     CROSS JOIN LATERAL fn_preco_vigente(ci.insumo_id) pv(preco, nivel, fonte, fornecedor_id, data_origem, dias_idade));

create view public.v_itens_proposta with (security_invoker = true) as
 SELECT ip.id,
    ip.proposta_id,
    ip.catalogo_insumo_id,
    ip.descricao,
    ip.unidade,
    ip.categoria,
    ip.quantidade,
    ip.preco_unitario_base,
    ip.ajuste_tipo,
    ip.ajuste_valor,
    ip.ajuste_motivo,
    ip.preco_unitario,
    ip.fornecedor_id,
    ip.observacoes,
    ip.ordem,
    ip.preco_nivel,
    ip.preco_fonte_efetiva,
    ip.preco_data_origem,
    COALESCE(c.qtd_componentes, (0)::bigint) AS qtd_componentes,
    c.custo_composicao,
    COALESCE(c.linhas_ajustadas, (0)::bigint) AS linhas_ajustadas
   FROM (itens_proposta ip
     LEFT JOIN LATERAL ( SELECT count(*) AS qtd_componentes,
            round(sum((pc.coeficiente * pc.preco_unitario)), 2) AS custo_composicao,
            count(*) FILTER (WHERE (((pc.coeficiente_referencia IS NOT NULL) AND (pc.coeficiente <> pc.coeficiente_referencia)) OR ((pc.preco_unitario_referencia IS NOT NULL) AND (pc.preco_unitario <> pc.preco_unitario_referencia)) OR (pc.coeficiente_referencia IS NULL))) AS linhas_ajustadas
           FROM itens_proposta_composicao pc
          WHERE (pc.item_proposta_id = ip.id)) c ON (true));

grant all on public.v_catalogo_insumos, public.v_composicao_itens, public.v_itens_proposta
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. A base de referência
-- ---------------------------------------------------------------------------
-- Sem FK apontando para dentro (regra de fronteira da 20260730100000) e com tudo
-- que lia dela já derrubado acima.
drop schema if exists referencia cascade;
