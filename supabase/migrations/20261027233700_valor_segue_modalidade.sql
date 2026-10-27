-- O valor GRAVADO da proposta segue a modalidade de contratação.
--
-- Até aqui a modalidade ("Só mão de obra" / "Mão de obra e material") era só um
-- texto no descritivo, e a divisão mão de obra × material era feita no cliente,
-- na hora de mostrar. O PDF de uma proposta "só mão de obra" saía sem o
-- material, mas `valor_estimado` — que é o que o contrato, a revisão, o
-- resultado por obra e a conversão em obra leem — continuava com ele. Aceita a
-- proposta, o contrato nascia com um valor maior que o enviado ao cliente.
--
-- 1. `propostas.modalidade` vira coluna. O texto do descritivo continua sendo
--    escrito (é o que o cliente lê e o que vira cláusula), mas o valor não pode
--    depender de comparar texto.
-- 2. Cada item guarda os PESOS da natureza do custo dele (mão de obra, material,
--    terceirizado, outros), abertos pela composição — a cópia da proposta, ou a
--    do catálogo, descendo subcomposições. É a mesma regra que
--    `lib/divisaoNatureza.ts` aplicava no cliente, agora num lugar só.
--    Os pesos são CONGELADOS como o preço do item: calculados quando o item
--    entra, troca de insumo ou tem a composição mexida; mudar preço no catálogo
--    depois não reabre a proposta.
-- 3. A parte de material de uma linha é `round(total × peso_material / soma)`,
--    e é a MESMA fórmula no banco e no cliente (`fn_material_da_linha` ×
--    `materialDaLinha`). Item sem peso nenhum cai na categoria dele.
-- 4. `fn_sync_valor_proposta`, `fn_registrar_revisao_proposta` e `v_propostas`
--    somam só o que a modalidade contrata. `v_propostas.valor_itens_completo`
--    guarda o orçamento inteiro, para a tela mostrar os dois.

-- 1. Modalidade --------------------------------------------------------------
alter table public.propostas
  add column modalidade text
  check (modalidade in ('mao_de_obra', 'mao_de_obra_material'));

comment on column public.propostas.modalidade is
  'Modalidade de contratação. mao_de_obra: o material sai do valor (o cliente fornece). Null = não definida, valor completo.';

-- 2. Pesos por natureza ------------------------------------------------------
alter table public.itens_proposta
  add column peso_mao_de_obra  numeric not null default 0,
  add column peso_material     numeric not null default 0,
  add column peso_terceirizado numeric not null default 0,
  add column peso_outros       numeric not null default 0;

comment on column public.itens_proposta.peso_material is
  'Custo de material na composição do item (coeficiente × preço). Só a PROPORÇÃO entre os pesos importa. Ver fn_pesos_natureza_item.';

-- Natureza de um insumo do catálogo. "Serviço" próprio que chega como folha
-- (sem composição por baixo) é execução da própria equipe: mão de obra.
create or replace function public.fn_natureza_insumo(p_categoria text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_categoria
    when 'Material'             then 'material'
    when 'Mão de Obra'          then 'mao_de_obra'
    when 'Serviço'              then 'mao_de_obra'
    when 'Serviço terceirizado' then 'terceirizado'
    else 'outros'
  end;
$$;

create or replace function public.fn_pesos_natureza_item(p_item_id uuid, p_catalogo_id uuid)
returns table (mao_de_obra numeric, material numeric, terceirizado numeric, outros numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.itens_proposta_composicao where item_proposta_id = p_item_id) then
    -- A composição adaptada à proposta manda. Um componente que é composição
    -- no catálogo (a argamassa dentro do emboço) é aberto pelas folhas dele,
    -- com o custo que tem NESTA proposta.
    return query
    with comp as (
      select c.coeficiente * c.preco_unitario as custo, c.categoria, c.catalogo_insumo_id
        from public.itens_proposta_composicao c
       where c.item_proposta_id = p_item_id
    ),
    folhas as (
      select f.raiz_id, public.fn_natureza_insumo(f.categoria) as n,
             sum(f.coef_acumulado * coalesce(f.preco_unitario, 0)) as v
        from public.fn_composicao_folhas(
               array(select distinct catalogo_insumo_id from comp where catalogo_insumo_id is not null)
             ) f
       group by 1, 2
    ),
    tot as (
      select raiz_id, sum(v) filter (where v > 0) as t from folhas group by 1
    ),
    partes as (
      select fo.n, c.custo * fo.v / t.t as v
        from comp c
        join tot t on t.raiz_id = c.catalogo_insumo_id and t.t > 0
        join folhas fo on fo.raiz_id = c.catalogo_insumo_id and fo.v > 0
      union all
      select public.fn_natureza_insumo(c.categoria), c.custo
        from comp c
       where not exists (select 1 from tot t where t.raiz_id = c.catalogo_insumo_id and t.t > 0)
    )
    select coalesce(sum(p.v) filter (where p.n = 'mao_de_obra'  and p.v > 0), 0),
           coalesce(sum(p.v) filter (where p.n = 'material'     and p.v > 0), 0),
           coalesce(sum(p.v) filter (where p.n = 'terceirizado' and p.v > 0), 0),
           coalesce(sum(p.v) filter (where p.n = 'outros'       and p.v > 0), 0)
      from partes p;
    return;
  end if;

  -- Sem cópia: a composição do catálogo, se houver. Sem nenhuma, tudo zero e a
  -- linha cai na categoria do item.
  return query
  select coalesce(sum(x.v) filter (where x.n = 'mao_de_obra'  and x.v > 0), 0),
         coalesce(sum(x.v) filter (where x.n = 'material'     and x.v > 0), 0),
         coalesce(sum(x.v) filter (where x.n = 'terceirizado' and x.v > 0), 0),
         coalesce(sum(x.v) filter (where x.n = 'outros'       and x.v > 0), 0)
    from (
      select public.fn_natureza_insumo(f.categoria) as n, f.coef_acumulado * coalesce(f.preco_unitario, 0) as v
        from public.fn_composicao_folhas(case when p_catalogo_id is null then '{}'::uuid[] else array[p_catalogo_id] end) f
    ) x;
end;
$$;

-- 3. A parte de material de uma linha -----------------------------------------
-- Espelho exato de `materialDaLinha` em src/lib/divisaoNatureza.ts.
create or replace function public.fn_material_da_linha(
  p_total numeric, p_categoria text,
  p_mo numeric, p_mat numeric, p_ter numeric, p_out numeric
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_mo, 0) + coalesce(p_mat, 0) + coalesce(p_ter, 0) + coalesce(p_out, 0) <= 0
      then case when p_categoria = 'Materiais' then p_total else 0 end
    else round(p_total * coalesce(p_mat, 0) / (coalesce(p_mo, 0) + coalesce(p_mat, 0) + coalesce(p_ter, 0) + coalesce(p_out, 0)), 2)
  end;
$$;

-- O valor da linha que a modalidade contrata (sem BDI).
create or replace function public.fn_valor_contratado_linha(
  p_total numeric, p_categoria text,
  p_mo numeric, p_mat numeric, p_ter numeric, p_out numeric,
  p_modalidade text
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_total - case when p_modalidade = 'mao_de_obra'
                        then public.fn_material_da_linha(p_total, p_categoria, p_mo, p_mat, p_ter, p_out)
                        else 0 end;
$$;

-- Pesos no INSERT e na troca de insumo. `trg_z_` para rodar depois de
-- `trg_congela_procedencia_item_proposta` (BEFORE dispara em ordem alfabética).
create or replace function public.fn_itens_proposta_pesos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select p.mao_de_obra, p.material, p.terceirizado, p.outros
    into new.peso_mao_de_obra, new.peso_material, new.peso_terceirizado, new.peso_outros
    from public.fn_pesos_natureza_item(new.id, new.catalogo_insumo_id) p;
  return new;
end;
$$;

create trigger trg_z_itens_proposta_pesos
  before insert or update of catalogo_insumo_id on public.itens_proposta
  for each row execute function public.fn_itens_proposta_pesos();

-- E quando a composição do item muda. O update dispara o AFTER do item, que
-- refaz o valor da proposta.
create or replace function public.fn_atualizar_pesos_item_proposta(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_item_id is null then
    return;
  end if;
  update public.itens_proposta ip
     set peso_mao_de_obra  = p.mao_de_obra,
         peso_material     = p.material,
         peso_terceirizado = p.terceirizado,
         peso_outros       = p.outros
    from public.fn_pesos_natureza_item(p_item_id, (select catalogo_insumo_id from public.itens_proposta where id = p_item_id)) p
   where ip.id = p_item_id
     and (ip.peso_mao_de_obra, ip.peso_material, ip.peso_terceirizado, ip.peso_outros)
         is distinct from (p.mao_de_obra, p.material, p.terceirizado, p.outros);
end;
$$;

create or replace function public.fn_itens_proposta_composicao_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_sync_preco_item_proposta(old.item_proposta_id);
    perform public.fn_atualizar_pesos_item_proposta(old.item_proposta_id);
  else
    perform public.fn_sync_preco_item_proposta(new.item_proposta_id);
    perform public.fn_atualizar_pesos_item_proposta(new.item_proposta_id);
    if tg_op = 'UPDATE' and new.item_proposta_id is distinct from old.item_proposta_id then
      perform public.fn_sync_preco_item_proposta(old.item_proposta_id);
      perform public.fn_atualizar_pesos_item_proposta(old.item_proposta_id);
    end if;
  end if;
  return null;
end;
$$;

-- 4. O valor gravado -----------------------------------------------------------
create or replace function public.fn_sync_valor_proposta(p_proposta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_itens int;
  v_soma  numeric(14,2);
  v_bdi   numeric(6,3);
  v_manual numeric(14,2);
  v_modalidade text;
  v_total numeric(14,2);
begin
  if p_proposta_id is null then
    return;
  end if;

  select bdi_percentual, valor_manual, modalidade
    into v_bdi, v_manual, v_modalidade
    from public.propostas where id = p_proposta_id;

  -- Só o que a modalidade contrata: na "só mão de obra", o material de cada
  -- linha fica de fora.
  select count(*), coalesce(sum(public.fn_valor_contratado_linha(
           round(quantidade * preco_unitario, 2), categoria,
           peso_mao_de_obra, peso_material, peso_terceirizado, peso_outros, v_modalidade)), 0)
    into v_itens, v_soma
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  if v_itens = 0 then
    v_total := coalesce(v_manual, 0);
  else
    v_total := round(v_soma * (1 + coalesce(v_bdi, 0) / 100.0), 2);
  end if;

  update public.propostas
     set valor_estimado = v_total,
         updated_at     = now()
   where id = p_proposta_id
     and valor_estimado is distinct from v_total;
end;
$$;

-- Modalidade passa a refazer o valor, como o BDI.
create or replace function public.fn_proposta_bdi_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bdi_percentual is distinct from old.bdi_percentual
     or new.valor_manual is distinct from old.valor_manual
     or new.modalidade is distinct from old.modalidade then
    perform public.fn_sync_valor_proposta(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.fn_registrar_revisao_proposta(
  p_proposta_id uuid, p_alteracoes text, p_valor numeric default null, p_data date default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_proposta   record;
  v_versao     int;
  v_qtd_itens  int;
  v_valor_itens numeric(14,2);
  v_total      numeric(14,2);
  v_revisao_id uuid;
begin
  -- FOR UPDATE serializa duas revisões concorrentes: sem isso as duas leem a
  -- mesma versão máxima e a segunda bate na unique (proposta_id, versao).
  select * into v_proposta from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  if coalesce(btrim(p_alteracoes), '') = '' then
    raise exception 'Descreva o que mudou nesta revisão.';
  end if;

  -- Mesma soma de fn_sync_valor_proposta — só o que a modalidade contrata —,
  -- para o total da revisão bater exatamente com o valor_estimado vigente.
  select count(*), coalesce(sum(public.fn_valor_contratado_linha(
           round(quantidade * preco_unitario, 2), categoria,
           peso_mao_de_obra, peso_material, peso_terceirizado, peso_outros, v_proposta.modalidade)), 0)
    into v_qtd_itens, v_valor_itens
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  if v_qtd_itens > 0 then
    v_total := round(v_valor_itens * (1 + v_proposta.bdi_percentual / 100.0), 2);
  else
    v_total := coalesce(p_valor, v_proposta.valor_estimado);
    v_valor_itens := 0;
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.revisoes_proposta where proposta_id = p_proposta_id;

  insert into public.revisoes_proposta
    (proposta_id, versao, data, valor, valor_itens, bdi_percentual, alteracoes)
  values
    (p_proposta_id, v_versao, coalesce(p_data, current_date), v_total, v_valor_itens,
     v_proposta.bdi_percentual, p_alteracoes)
  returning id into v_revisao_id;

  insert into public.itens_revisao_proposta
    (revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario, total, ordem)
  select
    v_revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario,
    round(quantidade * preco_unitario, 2), ordem
  from public.itens_proposta
  where proposta_id = p_proposta_id;

  -- O descritivo desta versão. Sem filtrar corpo vazio: o snapshot registra o
  -- que a proposta era, inclusive a seção que estava em branco na hora.
  insert into public.secoes_revisao_proposta
    (revisao_id, titulo, corpo, posicao, ordem)
  select v_revisao_id, titulo, corpo, posicao, ordem
    from public.proposta_secoes
   where proposta_id = p_proposta_id;

  -- Sem itens o número digitado continua sendo a única fonte do valor, então
  -- ele ainda manda em valor_estimado. Com itens, valor_estimado pertence ao
  -- trigger e a revisão não encosta nele.
  if v_qtd_itens = 0 and p_valor is not null then
    update public.propostas set valor_estimado = p_valor where id = p_proposta_id;
  end if;

  return v_revisao_id;
end;
$$;

-- Views: colunas novas no FIM (create or replace view não reordena).
create or replace view public.v_propostas as
 select p.id,
    p.numero,
    p.cliente_id,
    p.descricao,
    p.valor_estimado,
    p.data_validade,
    p.status,
    p.created_at,
    p.updated_at,
    p.bdi_percentual,
    p.valor_manual,
    p.data_envio,
    p.motivo_rejeicao,
    p.bdi_visivel_pdf,
    p.prazo_execucao_dias,
    coalesce(i.qtd_itens, 0::bigint) as qtd_itens,
    coalesce(i.valor_itens, 0::numeric) as valor_itens,
    round(coalesce(i.valor_itens, 0::numeric) * (1::numeric + p.bdi_percentual / 100.0), 2) as valor_calculado,
    coalesce(s.qtd_secoes, 0::bigint) as qtd_secoes,
    p.apresentacao_documento,
    p.modalidade,
    coalesce(i.valor_itens_completo, 0::numeric) as valor_itens_completo
   from propostas p
     left join lateral (
       select count(*) as qtd_itens,
              sum(public.fn_valor_contratado_linha(
                round(ip.quantidade * ip.preco_unitario, 2), ip.categoria,
                ip.peso_mao_de_obra, ip.peso_material, ip.peso_terceirizado, ip.peso_outros, p.modalidade)) as valor_itens,
              sum(round(ip.quantidade * ip.preco_unitario, 2)) as valor_itens_completo
         from itens_proposta ip
        where ip.proposta_id = p.id) i on true
     left join lateral (
       select count(*) as qtd_secoes
         from proposta_secoes ps
        where ps.proposta_id = p.id and length(btrim(ps.corpo)) > 0) s on true;

create or replace view public.v_itens_proposta as
 select ip.id,
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
    coalesce(c.qtd_componentes, 0::bigint) as qtd_componentes,
    c.custo_composicao,
    coalesce(c.linhas_ajustadas, 0::bigint) as linhas_ajustadas,
    ip.peso_mao_de_obra,
    ip.peso_material,
    ip.peso_terceirizado,
    ip.peso_outros
   from itens_proposta ip
     left join lateral (
       select count(*) as qtd_componentes,
              round(sum(pc.coeficiente * pc.preco_unitario), 2) as custo_composicao,
              count(*) filter (where pc.coeficiente_referencia is not null and pc.coeficiente <> pc.coeficiente_referencia
                                  or pc.preco_unitario_referencia is not null and pc.preco_unitario <> pc.preco_unitario_referencia
                                  or pc.coeficiente_referencia is null) as linhas_ajustadas
         from itens_proposta_composicao pc
        where pc.item_proposta_id = ip.id) c on true;

-- Funções chamadas só por trigger ou por outras funções: sem grant a ninguém.
revoke execute on function public.fn_pesos_natureza_item(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_itens_proposta_pesos() from public, anon, authenticated;
revoke execute on function public.fn_atualizar_pesos_item_proposta(uuid) from public, anon, authenticated;

-- 5. Dados existentes ----------------------------------------------------------
-- A modalidade sai do texto do descritivo, que é como o app a gravava.
update public.propostas p
   set modalidade = case s.corpo
         when 'Execução de mão de obra. Os materiais são fornecidos pelo cliente e não integram o fornecimento da contratada.'
           then 'mao_de_obra'
         when 'Execução de mão de obra e fornecimento dos materiais previstos no orçamento e nas composições desta proposta.'
           then 'mao_de_obra_material'
       end
  from public.proposta_secoes s
 where s.proposta_id = p.id
   and s.titulo = 'Modalidade de contratação';

-- Pesos de todos os itens; o AFTER de cada um refaz o valor da proposta.
update public.itens_proposta ip
   set peso_mao_de_obra  = p.mao_de_obra,
       peso_material     = p.material,
       peso_terceirizado = p.terceirizado,
       peso_outros       = p.outros
  from public.itens_proposta x
  cross join lateral public.fn_pesos_natureza_item(x.id, x.catalogo_insumo_id) p
 where ip.id = x.id;
