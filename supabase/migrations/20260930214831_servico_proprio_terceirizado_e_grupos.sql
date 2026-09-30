-- Serviço próprio × serviço terceirizado, e grupos de serviço no catálogo.
--
-- ## 1. "Serviço" virava "Terceiros"
--
-- O catálogo tinha UMA categoria de serviço, e `fn_categoria_custo_do_catalogo`
-- a levava para `Terceiros` no orçamento. Quem cadastrou reboco, emboço,
-- chapisco e alvenaria cadastrou o serviço QUE A EMPRESA EXECUTA — e a proposta
-- os mostrava como subcontratados. Os 9 SRV da base e os 6 itens de proposta
-- vindos deles eram todos serviço próprio.
--
-- Agora são duas coisas:
--   catálogo  'Serviço'               (SRV) → orçamento 'Serviços'   (próprio)
--   catálogo  'Serviço terceirizado'  (TER) → orçamento 'Terceiros'  (subcontratado)
--
-- Os VALORES gravados 'Serviço' e 'Terceiros' ficam como estão, e a interface
-- os rotula "Serviço próprio" e "Serviços terceirizados"
-- (`src/constants/categorias.ts`). Renomear o valor obrigaria a reescrever as
-- funções que o comparam e as revisões congeladas de proposta, que guardam a
-- categoria como texto — e um snapshot não deve mudar de nome depois de tirado.
--
-- ## 2. Grupos
--
-- Categoria diz a NATUREZA do custo (material, mão de obra…); não responde "me
-- mostre o que é de revestimento". `catalogo_grupos` é essa segunda dimensão,
-- lista gerenciada e não texto livre pelo mesmo motivo das unidades
-- (20260920132016): texto livre gera "Reboco" e "reboco " como dois filtros.

-- ---------------------------------------------------------------------------
-- 1a. Os domínios
-- ---------------------------------------------------------------------------
alter table public.catalogo_insumos drop constraint if exists catalogo_insumos_categoria_check;
alter table public.catalogo_insumos add constraint catalogo_insumos_categoria_check
  check (categoria in ('Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Serviço terceirizado', 'Taxa'));

alter table public.itens_proposta_composicao drop constraint if exists itens_proposta_composicao_categoria_check;
alter table public.itens_proposta_composicao add constraint itens_proposta_composicao_categoria_check
  check (categoria in ('Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Serviço terceirizado', 'Taxa'));

alter table public.itens_proposta drop constraint if exists itens_proposta_categoria_check;
alter table public.itens_proposta add constraint itens_proposta_categoria_check
  check (categoria in ('Materiais', 'Mão de Obra', 'Equipamentos', 'Serviços', 'Terceiros',
                       'Deslocamentos', 'Administração', 'Contingências'));

alter table public.itens_orcamento drop constraint if exists itens_orcamento_categoria_check;
alter table public.itens_orcamento add constraint itens_orcamento_categoria_check
  check (categoria in ('Materiais', 'Mão de Obra', 'Equipamentos', 'Serviços', 'Terceiros',
                       'Deslocamentos', 'Administração', 'Contingências'));

-- ---------------------------------------------------------------------------
-- 1b. Código TER-0001
-- ---------------------------------------------------------------------------
insert into public.catalogo_sequencia (prefixo, proximo) values ('TER', 1)
on conflict (prefixo) do nothing;

create or replace function public.fn_proximo_codigo_catalogo(p_categoria text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prefixo text;
  v_n       int;
begin
  v_prefixo := case p_categoria
    when 'Material'             then 'MAT'
    when 'Mão de Obra'          then 'MO'
    when 'Equipamento'          then 'EQP'
    when 'Serviço'              then 'SRV'
    when 'Serviço terceirizado' then 'TER'
    when 'Taxa'                 then 'TXA'
  end;

  if v_prefixo is null then
    raise exception 'Categoria "%" não tem prefixo de código. Acrescente-a em catalogo_sequencia.', p_categoria;
  end if;

  update public.catalogo_sequencia
     set proximo = proximo + 1
   where prefixo = v_prefixo
  returning proximo - 1 into v_n;

  return v_prefixo || '-' || lpad(v_n::text, 4, '0');
end;
$function$;

revoke all on function public.fn_proximo_codigo_catalogo(text) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 1c. As duas pontes catálogo ↔ orçamento
-- ---------------------------------------------------------------------------
-- Espelho de `MAPA_CATEGORIA` em src/lib/preco.ts — as duas têm de bater.
create or replace function public.fn_categoria_custo_do_catalogo(p_categoria text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case p_categoria
    when 'Material'             then 'Materiais'
    when 'Mão de Obra'          then 'Mão de Obra'
    when 'Equipamento'          then 'Equipamentos'
    when 'Serviço'              then 'Serviços'
    when 'Serviço terceirizado' then 'Terceiros'
    when 'Taxa'                 then 'Administração'
    else 'Materiais'
  end;
$function$;

-- O caminho inverso vive dentro de proposta_item_salvar_no_catalogo. Recriada
-- a partir da definição em produção; só o `case` de v_categoria mudou.
create or replace function public.proposta_item_salvar_no_catalogo(p_item_id uuid)
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
  v_categoria  text;
  v_topo_novo  boolean := false;
  v_criados    int := 0;
  v_reusados   int := 0;
  v_divergem   jsonb := '[]'::jsonb;
  v_extra      jsonb := '[]'::jsonb;
  v_custo_prop numeric(14,2);
  v_custo_cat  numeric(14,2);
  v_preco_cat  numeric(14,2);
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem escrever no catálogo.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;

  select round(sum(coeficiente * preco_unitario), 2) into v_custo_prop
    from public.itens_proposta_composicao where item_proposta_id = p_item_id;

  v_categoria := case v_item.categoria
    when 'Materiais'     then 'Material'
    when 'Mão de Obra'   then 'Mão de Obra'
    when 'Equipamentos'  then 'Equipamento'
    when 'Serviços'      then 'Serviço'
    when 'Terceiros'     then 'Serviço terceirizado'
    when 'Administração' then 'Taxa'
    else 'Material'
  end;

  select ca.id, ca.preco_referencia into v_id, v_preco_cat
    from public.catalogo_insumos ca
   where public.fn_chave_insumo(ca.descricao) = public.fn_chave_insumo(v_item.descricao)
     and ca.unidade = v_item.unidade;

  if v_id is null then
    insert into public.catalogo_insumos (
      descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
    ) values (
      v_item.descricao, v_item.unidade, v_item.preco_unitario_base,
      v_categoria, 'Insumo', 'Manual'
    )
    returning id into v_id;
    v_topo_novo := true;

    if v_id is null then
      raise exception 'Nenhuma linha foi criada — sem permissão para escrever no catálogo.';
    end if;
  elsif v_preco_cat is distinct from v_item.preco_unitario_base then
    v_divergem := v_divergem || jsonb_build_object(
      'descricao',      v_item.descricao,
      'preco_proposta', v_item.preco_unitario_base,
      'preco_catalogo', v_preco_cat
    );
  end if;

  for v_comp in
    select * from public.itens_proposta_composicao
     where item_proposta_id = p_item_id
     order by ordem
  loop
    v_filho_id  := v_comp.catalogo_insumo_id;
    v_preco_cat := null;

    if v_filho_id is null then
      select ca.id, ca.preco_referencia into v_filho_id, v_preco_cat
        from public.catalogo_insumos ca
       where public.fn_chave_insumo(ca.descricao) = public.fn_chave_insumo(v_comp.descricao)
         and ca.unidade = v_comp.unidade;
    else
      select ca.preco_referencia into v_preco_cat
        from public.catalogo_insumos ca where ca.id = v_filho_id;
    end if;

    if v_filho_id is null then
      insert into public.catalogo_insumos (
        descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
      ) values (
        v_comp.descricao, v_comp.unidade, v_comp.preco_unitario,
        v_comp.categoria, 'Insumo', 'Manual'
      )
      returning id into v_filho_id;
      v_criados := v_criados + 1;
    else
      v_reusados := v_reusados + 1;
      if v_preco_cat is distinct from v_comp.preco_unitario then
        v_divergem := v_divergem || jsonb_build_object(
          'descricao',      v_comp.descricao,
          'preco_proposta', v_comp.preco_unitario,
          'preco_catalogo', v_preco_cat
        );
      end if;
    end if;

    insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
    values (v_id, v_filho_id, v_comp.coeficiente)
    on conflict (composicao_id, insumo_id) do update
       set coeficiente = excluded.coeficiente;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'descricao',   ca.descricao,
           'codigo',      ca.codigo,
           'coeficiente', ci.coeficiente
         )), '[]'::jsonb)
    into v_extra
    from public.composicao_itens ci
    join public.catalogo_insumos ca on ca.id = ci.insumo_id
   where ci.composicao_id = v_id
     and not exists (
       select 1 from public.itens_proposta_composicao ipc
        where ipc.item_proposta_id = p_item_id
          and public.fn_chave_insumo(ipc.descricao) = public.fn_chave_insumo(ca.descricao)
          and ipc.unidade = ca.unidade
     );

  update public.itens_proposta
     set catalogo_insumo_id = v_id
   where id = p_item_id;

  select ca.preco_referencia into v_custo_cat
    from public.catalogo_insumos ca where ca.id = v_id;

  return jsonb_build_object(
    'catalogo_insumo_id', v_id,
    'item_criado',        v_topo_novo,
    'componentes',        v_criados + v_reusados,
    'itens_criados',      v_criados,
    'itens_reusados',     v_reusados,
    'custo_proposta',     v_custo_prop,
    'custo_catalogo',     v_custo_cat,
    'precos_divergentes', v_divergem,
    'componentes_extra',  v_extra
  );
end;
$function$;

-- A quebra por categoria da composição tem UMA faixa de serviço: próprio e
-- terceirizado somam juntos em `custo_servico`. Sem isto o terceirizado
-- entraria no total e sumiria de todas as faixas.
create or replace function public.catalogo_composicao_agregados(p_ids uuid[])
returns table(composicao_id uuid, custo_total numeric, hh_por_unidade numeric, hh_fora_de_hora integer, custo_mao_de_obra numeric, custo_material numeric, custo_equipamento numeric, custo_servico numeric, custo_taxa numeric, qtd_folhas integer, folhas_sem_preco integer, folhas_inativas integer, profundidade integer)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para ler composições do catálogo.';
  end if;

  return query
  with ids as (select distinct unnest(p_ids) as id),
  folhas as (
    select i.id, arv.insumo_id, arv.coef_acumulado, arv.nivel
      from ids i
      cross join lateral public.fn_composicao_arvore(i.id) arv
     where arv.eh_folha
  ),
  pv as (
    select d.insumo_id as fid, v.preco
      from (select distinct f.insumo_id from folhas f) d
      cross join lateral public.fn_preco_vigente(d.insumo_id) v
  )
  select f.id,
         coalesce(round(sum(f.coef_acumulado * pv.preco), 2), 0),
         coalesce(sum(f.coef_acumulado)
           filter (where c.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(c.unidade)), 0),
         count(*) filter (where c.categoria = 'Mão de Obra'
                            and not public.fn_unidade_e_hora(c.unidade))::int,
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Mão de Obra'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Material'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Equipamento'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria in ('Serviço', 'Serviço terceirizado')), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Taxa'), 2), 0),
         count(*)::int,
         count(*) filter (where pv.preco is null or pv.preco = 0)::int,
         count(*) filter (where not c.ativo)::int,
         max(f.nivel)::int
    from folhas f
    join public.catalogo_insumos c on c.id = f.insumo_id
    left join pv on pv.fid = f.insumo_id
   group by f.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Grupos
-- ---------------------------------------------------------------------------
create table if not exists public.catalogo_grupos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (btrim(nome) <> ''),
  created_at timestamptz not null default now()
);

-- A mesma chave de identidade dos insumos (minúscula, sem acento, espaço
-- colapsado): "Revestimento" e "revestimento " são o mesmo grupo.
create unique index if not exists catalogo_grupos_nome_key
  on public.catalogo_grupos (public.fn_chave_insumo(nome));

comment on table public.catalogo_grupos is
  'Tipo de serviço (Alvenaria, Revestimento cerâmico…) — segunda dimensão do catálogo, ao lado da categoria. Filtra listagem e buscas; não entra em preço.';

-- Mesma matriz de catalogo_insumos: só admin e gestão leem ou escrevem o
-- catálogo. Sem policy de DELETE: grupo em uso não pode sumir, e a exclusão
-- condicional deste repo é RPC (ver feedback_exclusao_condicional_rpc) — fica
-- para quando houver tela de gestão dos grupos.
alter table public.catalogo_grupos enable row level security;
revoke all on public.catalogo_grupos from anon, authenticated;
grant select, insert, update on public.catalogo_grupos to authenticated;

drop policy if exists catalogo_grupos_ler on public.catalogo_grupos;
create policy catalogo_grupos_ler on public.catalogo_grupos
  for select to authenticated
  using (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

drop policy if exists catalogo_grupos_criar on public.catalogo_grupos;
create policy catalogo_grupos_criar on public.catalogo_grupos
  for insert to authenticated
  with check (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

drop policy if exists catalogo_grupos_renomear on public.catalogo_grupos;
create policy catalogo_grupos_renomear on public.catalogo_grupos
  for update to authenticated
  using (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'))
  with check (coalesce(public.fn_current_role(), '') in ('admin', 'gestao'));

-- ON DELETE RESTRICT e não SET NULL: set null passaria calado e desclassificaria
-- os itens sem ninguém ver.
alter table public.catalogo_insumos
  add column if not exists grupo_id uuid references public.catalogo_grupos(id) on delete restrict;
create index if not exists catalogo_insumos_grupo_idx on public.catalogo_insumos (grupo_id);

comment on column public.catalogo_insumos.grupo_id is
  'Tipo de serviço do item (catalogo_grupos). Opcional: mão de obra e equipamento costumam não ter.';

-- A view lista as colunas uma a uma (não congela como `select c.*`, mas
-- também não ganha coluna nova sozinha). Acrescentadas NO FIM, que é o único
-- lugar onde `create or replace view` aceita coluna nova.
create or replace view public.v_catalogo_insumos
with (security_invoker = true)
as
select c.id,
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
    ( select count(distinct io.projeto_id) as count
           from itens_orcamento io
          where io.catalogo_insumo_id = c.id) as obras_utilizando,
    ( select count(*) as count
           from cotacoes_fornecedores cf
          where cf.catalogo_id = c.id and cf.ativa) as cotacoes_ativas,
    ( select count(*) as count
           from catalogo_historico_precos hp
          where hp.catalogo_id = c.id) as pontos_historico,
    ( select count(*) as count
           from composicao_itens ci
          where ci.composicao_id = c.id) as qtd_componentes,
    ( select count(*) as count
           from composicao_itens ci
          where ci.insumo_id = c.id) as usado_em_composicoes,
    (exists ( select 1
           from composicao_itens ci
             join catalogo_insumos f on f.id = ci.insumo_id
          where ci.composicao_id = c.id and not f.ativo)) as tem_componente_inativo,
    pv.preco as preco_vigente,
    pv.nivel as preco_nivel,
    pv.fonte as preco_fonte_efetiva,
    pv.fornecedor_id as preco_fornecedor_id,
    pv.data_origem as preco_data_origem,
    pv.dias_idade as preco_dias_idade,
    c.codigo,
    c.grupo_id,
    ( select g.nome from catalogo_grupos g where g.id = c.grupo_id) as grupo_nome
   from catalogo_insumos c
     cross join lateral fn_preco_vigente(c.id) pv(preco, nivel, fonte, fornecedor_id, data_origem, dias_idade);

-- ---------------------------------------------------------------------------
-- 3. Os dados que já existiam
-- ---------------------------------------------------------------------------
-- Os itens de proposta que vieram de um SRV eram serviço próprio rotulado
-- como terceiro.
update public.itens_proposta ip
   set categoria = 'Serviços'
  from public.catalogo_insumos ca
 where ca.id = ip.catalogo_insumo_id
   and ca.categoria = 'Serviço'
   and ip.categoria = 'Terceiros';

-- Duas composições de serviço cadastradas como Material. O código MAT-xxxx
-- fica: ele é imutável por desenho (20260920132353).
update public.catalogo_insumos
   set categoria = 'Serviço'
 where codigo in ('MAT-0009', 'MAT-0014') and categoria = 'Material';

update public.itens_proposta ip
   set categoria = 'Serviços'
  from public.catalogo_insumos ca
 where ca.id = ip.catalogo_insumo_id
   and ca.codigo in ('MAT-0009', 'MAT-0014')
   and ip.categoria = 'Materiais';

insert into public.catalogo_grupos (nome) values
  ('Aglomerantes e agregados'),
  ('Alvenaria'),
  ('Argamassas'),
  ('Chapisco, emboço e reboco'),
  ('Concreto'),
  ('Demolição'),
  ('Pintura'),
  ('Pisos'),
  ('Revestimento cerâmico')
on conflict do nothing;

update public.catalogo_insumos c
   set grupo_id = g.id
  from (values
    ('MAT-0001', 'Aglomerantes e agregados'),
    ('MAT-0002', 'Aglomerantes e agregados'),
    ('MAT-0003', 'Aglomerantes e agregados'),
    ('MAT-0004', 'Aglomerantes e agregados'),
    ('MAT-0005', 'Aglomerantes e agregados'),
    ('MAT-0008', 'Aglomerantes e agregados'),
    ('MAT-0006', 'Pintura'),
    ('SRV-0006', 'Pintura'),
    ('MAT-0007', 'Alvenaria'),
    ('SRV-0007', 'Alvenaria'),
    ('SRV-0002', 'Argamassas'),
    ('SRV-0004', 'Argamassas'),
    ('SRV-0003', 'Chapisco, emboço e reboco'),
    ('SRV-0005', 'Chapisco, emboço e reboco'),
    ('SRV-0008', 'Concreto'),
    ('SRV-0009', 'Pisos'),
    ('MAT-0009', 'Demolição'),
    ('MAT-0010', 'Revestimento cerâmico'),
    ('MAT-0011', 'Revestimento cerâmico'),
    ('MAT-0012', 'Revestimento cerâmico'),
    ('MAT-0013', 'Revestimento cerâmico'),
    ('MAT-0014', 'Revestimento cerâmico'),
    ('SRV-0010', 'Revestimento cerâmico')
  ) as m(codigo, grupo)
  join public.catalogo_grupos g on g.nome = m.grupo
 where c.codigo = m.codigo
   and c.grupo_id is null;
