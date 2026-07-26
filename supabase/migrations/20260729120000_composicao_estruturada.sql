-- ============================================================
-- COMPOSIÇÃO ESTRUTURADA — coeficientes, custo derivado, sem ciclo
-- ============================================================
-- Contexto: `catalogo_insumos.tipo_item` já distinguia 'Insumo' de 'Composicao'
-- desde 20260723120000, mas não existia nada por baixo — nenhuma tabela de
-- coeficientes. Um item marcado como composição era indistinguível de um insumo
-- simples na hora de calcular preço: alguém digitava o valor unitário à mão.
-- A coluna `composicao` (text) nunca foi composição — é ficha técnica livre
-- ("marca preferencial, aditivos, especificação"), e continua sendo.
--
-- Esta migration dá estrutura de verdade:
--
--   1. `composicao_itens`: (composição, insumo, coeficiente). Um insumo aparece
--      no máximo uma vez por composição — repetição é erro de digitação, e o
--      certo é somar o coeficiente.
--   2. Composição pode conter composição (auxiliar), como no SINAPI. O custo é
--      calculado por CTE recursiva, e só FOLHAS contribuem preço: um nó que tem
--      filhos é sempre expandido, nunca lido pelo seu preço armazenado.
--   3. CICLO É IMPOSSÍVEL. Guard no INSERT/UPDATE checa se a composição de
--      destino já está na subárvore do componente. Sem isso, um ciclo criado
--      por engano trava o cálculo para sempre e não há como descobrir onde.
--   4. Composição NÃO TEM PREÇO PRÓPRIO. O preço é forçado pela trigger BEFORE
--      em qualquer caminho de escrita — nem a aplicação, nem "adotar preço da
--      cotação", nem um UPDATE manual no console conseguem gravar um valor que
--      contradiga a lista de componentes.
--   5. Mudança de preço de um insumo PROPAGA para cima: toda composição que o
--      contém, direta ou indiretamente, é recalculada e cada recálculo entra em
--      `catalogo_historico_precos` via a trigger que já existia. É o histórico
--      de custo de composição que o banco de custos prometia e não tinha.
--
-- O que esta migration deliberadamente NÃO faz: importar SINAPI. A base de
-- referência é um problema de volume (~40 mil itens × UF × mês) e vai para um
-- projeto separado. Aqui é a estrutura, que serve primeiro à composição própria.

-- ============================================================
-- 1. 'Composicao' passa a ser uma origem de preço válida
-- ============================================================
-- Preço derivado não é 'Manual' nem 'SINAPI' nem 'Fornecedor'. Sem este valor,
-- o histórico de uma composição mentiria sobre a própria origem.
alter table public.catalogo_insumos
  drop constraint if exists catalogo_insumos_preco_fonte_check;
alter table public.catalogo_insumos
  add constraint catalogo_insumos_preco_fonte_check
  check (preco_fonte in ('SINAPI', 'Fornecedor', 'Manual', 'Composicao'));

alter table public.catalogo_historico_precos
  drop constraint if exists catalogo_historico_precos_fonte_check;
alter table public.catalogo_historico_precos
  add constraint catalogo_historico_precos_fonte_check
  check (fonte in ('SINAPI', 'Fornecedor', 'Manual', 'Composicao'));

-- ============================================================
-- 2. A tabela
-- ============================================================
create table if not exists public.composicao_itens (
  id            uuid primary key default gen_random_uuid(),
  -- CASCADE por correção formal: DELETE está revogado em catalogo_insumos
  -- (só existe soft-delete via `ativo`), então na prática nunca dispara.
  composicao_id uuid not null references public.catalogo_insumos(id) on delete cascade,
  -- RESTRICT: um insumo usado em composição não pode desaparecer por baixo dela.
  insumo_id     uuid not null references public.catalogo_insumos(id) on delete restrict,
  -- 6 casas: o SINAPI publica coeficientes como 0,000175 (perda de material).
  -- numeric(14,2) truncaria isso para zero.
  coeficiente   numeric(14,6) not null check (coeficiente > 0),
  observacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint composicao_itens_nao_recursivo check (composicao_id <> insumo_id)
);

-- Um insumo entra uma vez só. Duas linhas de "cimento" na mesma composição é
-- sempre erro de digitação — o certo é um coeficiente somado.
create unique index if not exists composicao_itens_unico
  on public.composicao_itens (composicao_id, insumo_id);

create index if not exists composicao_itens_insumo_idx
  on public.composicao_itens (insumo_id);

drop trigger if exists trg_composicao_itens_updated_at on public.composicao_itens;
create trigger trg_composicao_itens_updated_at
  before update on public.composicao_itens
  for each row execute function public.fn_set_updated_at();

comment on table public.composicao_itens is
  'Componentes de uma composição, com coeficiente por unidade da composição. Composição pode conter composição; ciclo é bloqueado por trigger.';
comment on column public.composicao_itens.coeficiente is
  'Quantidade do insumo por UMA unidade da composição. Ex.: 0,35 sc de cimento por m² de alvenaria.';

-- ============================================================
-- 3. Custo derivado — CTE recursiva, só folhas contribuem
-- ============================================================
-- SECURITY DEFINER de propósito: o custo de uma composição não pode variar em
-- função de quem está lendo. Com security invoker, uma RLS que esconda uma
-- linha faria a soma voltar menor SEM ERRO — exatamente a classe de bug
-- silencioso que este schema já pagou caro (ver comentários de 20260723120000).
create or replace function public.fn_custo_composicao(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with recursive expandido as (
    -- Nível 1: filhos diretos. O cast para `numeric` sem precisão é
    -- obrigatório: o termo recursivo multiplica coeficientes e produz `numeric`
    -- puro, e o Postgres recusa a CTE (42804) se os dois termos divergirem no
    -- tipo da coluna.
    select ci.insumo_id as item_id, ci.coeficiente::numeric as coef, 1 as nivel
      from public.composicao_itens ci
     where ci.composicao_id = p_id
    union all
    -- Composição dentro de composição: o coeficiente acumula por multiplicação.
    select ci.insumo_id, e.coef * ci.coeficiente, e.nivel + 1
      from expandido e
      join public.composicao_itens ci on ci.composicao_id = e.item_id
     -- Teto de profundidade: defesa em segunda camada. O guard de ciclo já
     -- impede a única forma de estourar isso, mas uma função de custo que
     -- roda para sempre é pior do que uma que devolve número incompleto.
     where e.nivel < 20
  )
  -- Arredonda UMA vez, no fim. A expansão vai direto às folhas em uma passada,
  -- então o valor de 2 casas armazenado numa composição auxiliar nunca entra no
  -- cálculo da composição de cima — não há acúmulo de erro de arredondamento.
  select coalesce(round(sum(e.coef * c.preco_referencia), 2), 0)
    from expandido e
    join public.catalogo_insumos c on c.id = e.item_id
   -- Só folha entrega preço. Um nó com filhos é expandido, e o preço que ele
   -- tem armazenado é ignorado aqui — senão o custo dele contaria duas vezes.
   where not exists (
     select 1 from public.composicao_itens f where f.composicao_id = e.item_id
   );
$$;

comment on function public.fn_custo_composicao(uuid) is
  'Custo unitário de uma composição = Σ (coeficiente acumulado × preço) das folhas. Composições intermediárias são expandidas, nunca lidas pelo preço armazenado.';

-- ============================================================
-- 4. Guards: tipo do destino, auto-referência e CICLO
-- ============================================================
create or replace function public.fn_composicao_item_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tipo_item text;
begin
  select tipo_item into v_tipo_item
    from public.catalogo_insumos where id = new.composicao_id;

  if v_tipo_item is null then
    raise exception 'Composição % não existe no catálogo.', new.composicao_id;
  end if;

  -- Sem isto, alguém pendura componentes num insumo simples e o preço passa a
  -- ser forçado pelo cálculo — o item muda de comportamento sem ninguém pedir.
  if v_tipo_item <> 'Composicao' then
    raise exception 'O item de destino não é uma composição (tipo_item = %). Marque-o como Composição antes de adicionar componentes.', v_tipo_item;
  end if;

  -- Ciclo: a composição de destino não pode estar dentro da subárvore do
  -- componente que está entrando. `union` (não `union all`) faz o próprio CTE
  -- parar mesmo que um ciclo já exista na tabela.
  if exists (
    with recursive descendentes as (
      select ci.insumo_id
        from public.composicao_itens ci
       where ci.composicao_id = new.insumo_id
      union
      select ci.insumo_id
        from descendentes d
        join public.composicao_itens ci on ci.composicao_id = d.insumo_id
    )
    select 1 from descendentes where insumo_id = new.composicao_id
  ) then
    raise exception 'Ciclo detectado: "%" já contém esta composição, direta ou indiretamente.',
      (select descricao from public.catalogo_insumos where id = new.insumo_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_composicao_item_guard on public.composicao_itens;
create trigger trg_composicao_item_guard
  before insert or update of composicao_id, insumo_id on public.composicao_itens
  for each row execute function public.fn_composicao_item_guard();

-- ============================================================
-- 5. Aplicar e propagar o custo
-- ============================================================
create or replace function public.fn_aplica_custo_composicao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.catalogo_insumos
     set preco_referencia = public.fn_custo_composicao(p_id),
         preco_fonte      = 'Composicao'
   where id = p_id
     and tipo_item = 'Composicao';
end;
$$;

-- Componente mudou → recalcula a composição dona. Se o coeficiente for movido
-- de uma composição para outra, as DUAS precisam ser recalculadas.
create or replace function public.fn_recalcula_composicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_aplica_custo_composicao(old.composicao_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_aplica_custo_composicao(new.composicao_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_recalcula_composicao on public.composicao_itens;
create trigger trg_recalcula_composicao
  after insert or update or delete on public.composicao_itens
  for each row execute function public.fn_recalcula_composicao();

-- Preço de um insumo mudou → toda composição que o usa fica errada. Recalcula
-- os pais diretos; cada UPDATE que muda de fato o preço re-dispara ESTA MESMA
-- trigger para o pai, e a propagação sobe a árvore sozinha. Termina porque o
-- grafo é acíclico (garantido em fn_composicao_item_guard) e porque o `when`
-- abaixo corta a cadeia no primeiro nó cujo preço não mudou.
create or replace function public.fn_propaga_custo_composicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai uuid;
begin
  for v_pai in
    select distinct ci.composicao_id
      from public.composicao_itens ci
     where ci.insumo_id = new.id
  loop
    perform public.fn_aplica_custo_composicao(v_pai);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_propaga_custo_composicao on public.catalogo_insumos;
create trigger trg_propaga_custo_composicao
  after update of preco_referencia on public.catalogo_insumos
  for each row
  when (new.preco_referencia is distinct from old.preco_referencia)
  execute function public.fn_propaga_custo_composicao();

-- ============================================================
-- 6. Composição não tem preço próprio — forçado na escrita
-- ============================================================
-- Substitui a função de 20260723120000 acrescentando o bloco do meio. As duas
-- outras responsabilidades (coluna `busca` normalizada e honestidade do
-- `data_atualizacao_preco`) seguem idênticas.
create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tem_componentes boolean;
begin
  new.busca := public.fn_normaliza_busca(
    coalesce(new.descricao, '') || ' ' ||
    coalesce(new.codigo_sinapi, '') || ' ' ||
    coalesce(new.aplicacao, '') || ' ' ||
    coalesce(new.composicao, '')
  );

  select exists (
    select 1 from public.composicao_itens ci where ci.composicao_id = new.id
  ) into v_tem_componentes;

  -- Voltar uma composição povoada para 'Insumo' deixaria os componentes órfãos
  -- e o preço solto. Esvazie a lista primeiro.
  if tg_op = 'UPDATE'
     and old.tipo_item = 'Composicao'
     and new.tipo_item <> 'Composicao'
     and v_tem_componentes then
    raise exception 'Esta composição tem componentes. Remova-os antes de convertê-la em insumo simples.';
  end if;

  -- O preço de uma composição é a soma dos componentes, sempre. Forçado aqui
  -- porque a alternativa — confiar em quem escreve — já falhou neste schema:
  -- "adotar preço da cotação", um UPDATE do console ou um bug na tela
  -- gravariam um preço que contradiz a lista de insumos, e nada acusaria.
  -- Composição sem componentes ainda não tem preço derivado: fica com o que
  -- foi digitado, e passa a ser forçada no primeiro componente adicionado.
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
$$;

revoke execute on function public.fn_custo_composicao(uuid)        from anon, authenticated, public;
revoke execute on function public.fn_aplica_custo_composicao(uuid) from anon, authenticated, public;
revoke execute on function public.fn_composicao_item_guard()       from anon, authenticated, public;
revoke execute on function public.fn_recalcula_composicao()        from anon, authenticated, public;
revoke execute on function public.fn_propaga_custo_composicao()    from anon, authenticated, public;

-- ============================================================
-- 7. RLS — mesmo alcance de catalogo_insumos (admin + gestão)
-- ============================================================
alter table public.composicao_itens enable row level security;

drop policy if exists "admin_all_composicao_itens" on public.composicao_itens;
create policy "admin_all_composicao_itens" on public.composicao_itens
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_composicao_itens" on public.composicao_itens;
create policy "gestao_all_composicao_itens" on public.composicao_itens
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- DELETE é permitido aqui, ao contrário do resto do cluster do catálogo:
-- tirar um componente de uma composição é edição de planejamento, não
-- destruição de procedência. O histórico do que a mudança causou fica em
-- catalogo_historico_precos, que segue insert-only.
grant select, insert, update, delete on public.composicao_itens to authenticated;

-- ============================================================
-- 8. Views
-- ============================================================
-- Lista de componentes já resolvida (descrição/unidade/preço do filho). Uma
-- view em vez de embedded resource do PostgREST porque composicao_itens tem
-- DUAS FKs para catalogo_insumos e o join teria que ser desambiguado pelo nome
-- da constraint em toda chamada.
create or replace view public.v_composicao_itens
with (security_invoker = true) as
select
  ci.id,
  ci.composicao_id,
  ci.insumo_id,
  ci.coeficiente,
  ci.observacao,
  ci.created_at,
  ci.updated_at,
  c.descricao                                  as insumo_descricao,
  c.unidade                                    as insumo_unidade,
  c.categoria                                  as insumo_categoria,
  c.tipo_item                                  as insumo_tipo_item,
  c.codigo_sinapi                              as insumo_codigo_sinapi,
  c.preco_referencia                           as insumo_preco_referencia,
  c.ativo                                      as insumo_ativo,
  -- Se o filho for composição, seu preco_referencia já é o custo derivado
  -- (forçado na escrita), então esta multiplicação vale em qualquer nível.
  round(ci.coeficiente * c.preco_referencia, 2) as custo_total
from public.composicao_itens ci
join public.catalogo_insumos c on c.id = ci.insumo_id;

-- Recriada (drop + create) para ganhar as três colunas novas: `create or
-- replace view` recusa colunas no meio da lista, e o `c.*` desta view congela
-- a lista de colunas no momento da criação — toda coluna nova em
-- catalogo_insumos exige recriar esta view na mesma migration.
drop view if exists public.v_catalogo_insumos;
create view public.v_catalogo_insumos
with (security_invoker = true) as
select
  c.*,
  (select count(distinct io.projeto_id)
     from public.itens_orcamento io
    where io.catalogo_insumo_id = c.id)                     as obras_utilizando,
  (select count(*)
     from public.cotacoes_fornecedores cf
    where cf.catalogo_id = c.id and cf.ativa)               as cotacoes_ativas,
  (select count(*)
     from public.catalogo_historico_precos hp
    where hp.catalogo_id = c.id)                            as pontos_historico,
  (select count(*)
     from public.composicao_itens ci
    where ci.composicao_id = c.id)                          as qtd_componentes,
  (select count(*)
     from public.composicao_itens ci
    where ci.insumo_id = c.id)                              as usado_em_composicoes,
  -- Insumo inativo dentro de composição ativa: o preço dele continua entrando
  -- na conta. Não é proibido, mas precisa ser visível na tela.
  exists (select 1
            from public.composicao_itens ci
            join public.catalogo_insumos f on f.id = ci.insumo_id
           where ci.composicao_id = c.id and not f.ativo)    as tem_componente_inativo
from public.catalogo_insumos c;

-- ============================================================
-- 9. Nada a fazer com o que já existe
-- ============================================================
-- Ao contrário de 20260723120000, esta migration NÃO faz backfill. Composições
-- criadas antes daqui têm preço digitado e zero componentes: continuam como
-- estão, e o forçamento do preço só passa a valer no primeiro componente
-- adicionado. A regra de `busca` não mudou, então um
-- `update catalogo_insumos set descricao = descricao` só sujaria o `updated_at`
-- de toda a tabela sem alterar um único valor.
