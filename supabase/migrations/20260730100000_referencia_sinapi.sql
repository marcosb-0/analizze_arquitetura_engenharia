-- ============================================================================
-- Base de referência SINAPI
-- ============================================================================
-- Decidido em 2026-07-26, depois de MEDIR a planilha real de 06/2026 em vez de
-- estimar. A estimativa anterior (~40 mil insumos, 100–150 mil coeficientes,
-- projeto Supabase separado) estava inflada em ~8×:
--
--     insumos ............  4.876
--     composições ....... 10.454
--     arestas ........... 55.657   (composição → item, com coeficiente)
--     regimes ...........      3   SD / CD / SE  (não 2 — existe "sem encargos")
--
-- Como o volume real é pequeno, a base entra num SCHEMA do projeto existente e
-- não num segundo projeto: o plano free permite 2 projetos ativos e os dois já
-- estão em uso. O isolamento que importava vem do schema + GRANT, não da
-- fronteira de projeto.
--
-- REGRAS DE FRONTEIRA (o que faz esta base ser barata de manter):
--
--  1. NADA aqui é alvo de foreign key. `itens_orcamento`, `insumos_projeto` e
--     `cotacoes` continuam apontando para `public.catalogo_insumos`. Um mês do
--     SINAPI pode ser apagado inteiro sem quebrar um único orçamento.
--  2. A base é SOMENTE LEITURA para a aplicação. Escrita só por migration ou
--     pelo importador com a chave de serviço.
--  3. O que a empresa usa de verdade é COPIADO para o catálogo dela (adoção).
--     Esta base só é lida na hora de pesquisar e adotar.
--
-- O que NÃO entra nesta migration, de propósito: as planilhas
-- `SINAPI_familias_e_coeficientes` (representatividade de preço),
-- `SINAPI_mao_de_obra` (percentual de mão de obra por composição) e
-- `SINAPI_Manutenções` (log de criação/desativação de itens). Nenhuma delas é
-- necessária para orçar; entram quando houver uso concreto.
-- ============================================================================

create schema if not exists referencia;

comment on schema referencia is
  'Base de referência SINAPI: dado público, somente leitura, nunca alvo de FK. '
  'Ver 20260730100000_referencia_sinapi.sql.';


-- ---------------------------------------------------------------------------
-- 1. Publicação — a unidade de importação
-- ---------------------------------------------------------------------------
-- O SINAPI é republicado todo mês. Tudo que varia no tempo (coeficiente, preço,
-- situação) pende de uma publicação, então descartar um mês é um DELETE só.
create table if not exists referencia.publicacao (
  id             serial primary key,
  mes_referencia date        not null unique,
  data_emissao   date        not null,
  arquivo        text        not null,
  importado_em   timestamptz not null default now(),
  -- Preenchido pelo importador ao terminar; publicação sem isto ficou pela metade.
  concluida_em   timestamptz
);

comment on table referencia.publicacao is
  'Um mês de referência do SINAPI. Apagar a linha apaga o mês inteiro por cascade.';
comment on column referencia.publicacao.mes_referencia is
  'Primeiro dia do mês (ex.: 2026-06-01). É a chave natural da publicação.';
comment on column referencia.publicacao.concluida_em is
  'Nulo enquanto a importação não fechou. Consulta deve ignorar publicação incompleta.';


-- ---------------------------------------------------------------------------
-- 2. Item — insumo ou composição
-- ---------------------------------------------------------------------------
-- Verificado na planilha: os códigos são todos numéricos e os dois namespaces
-- NÃO colidem (zero códigos em comum entre as abas de insumo e de composição),
-- então uma tabela só, com `codigo` como chave, é suficiente.
--
-- O item é um retrato do estado atual, não uma série: descrição e unidade mudam
-- pouco e a importação do mês seguinte sobrescreve. O que é datado por
-- publicação são os coeficientes e os preços, nas tabelas abaixo.
create table if not exists referencia.item (
  codigo        integer primary key,
  tipo          text not null check (tipo in ('INSUMO', 'COMPOSICAO')),
  descricao     text not null,
  unidade       text,
  -- Insumo: a "Classificação" (MATERIAL, MAO DE OBRA, EQUIPAMENTO...).
  -- Composição: o "Grupo" (Alvenaria de Vedação, Argamassas...). 171 valores.
  grupo         text,
  -- Só insumo. C = preço coletado, CR = coeficiente de representatividade.
  origem_preco  text,
  -- 1.162 insumos aparecem no Analítico como item de composição mas NÃO têm
  -- linha na aba de preços — são os "SEM PREÇO" do SINAPI. Existem como item,
  -- não como preço. Por isso descrição/unidade vêm do Analítico quando falta a
  -- aba de preço, e por isso não há NOT NULL em unidade.
  visto_em_preco boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists item_tipo_idx  on referencia.item (tipo);
create index if not exists item_grupo_idx on referencia.item (grupo);

comment on table referencia.item is
  'Insumo ou composição do SINAPI. Retrato atual — a série temporal está em preco/composicao_item.';
comment on column referencia.item.visto_em_preco is
  'false = item conhecido só pelo Analítico, sem preço publicado (os "SEM PREÇO" do SINAPI).';


-- ---------------------------------------------------------------------------
-- 3. Busca — coluna normalizada + trigram
-- ---------------------------------------------------------------------------
-- Mesmo desenho de `public.catalogo_insumos.busca`: sem acento, minúscula, com
-- o código junto, para "arg col" e "88316" caírem no mesmo índice. Reusa
-- `public.fn_normaliza_busca`, que já existe — duas normalizações diferentes no
-- mesmo banco seria garantir que a busca no catálogo e na referência divergem.
alter table referencia.item
  add column if not exists busca text;

create or replace function referencia.fn_item_busca()
returns trigger
language plpgsql
security definer
set search_path = referencia, public, pg_temp
as $$
begin
  new.busca := public.fn_normaliza_busca(coalesce(new.descricao, '') || ' ' || new.codigo::text);
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_item_busca on referencia.item;
create trigger trg_item_busca
  before insert or update of descricao, codigo on referencia.item
  for each row execute function referencia.fn_item_busca();

-- `extensions.gin_trgm_ops`: pg_trgm e unaccent vivem no schema `extensions`
-- neste projeto, não em public.
create index if not exists item_busca_trgm_idx
  on referencia.item using gin (busca extensions.gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- 4. Composição → item (o coeficiente)
-- ---------------------------------------------------------------------------
-- Verificado: nenhum par (composição, item) se repete dentro de uma publicação,
-- então a chave composta é segura.
--
-- numeric(15,7) e não (14,6): o SINAPI publica 7 casas decimais de verdade
-- (0,6650246 aparece 7.478 vezes). Com 6 casas o sétimo dígito se perde.
--
-- `coeficiente >= 0` e não `> 0`: existem 4 coeficientes exatamente zero na
-- planilha (insumo 436 nas composições 106514–106517). A base de referência é
-- uma cópia fiel; é a ADOÇÃO que descarta componente de coeficiente zero,
-- porque `public.composicao_itens` exige `> 0`.
create table if not exists referencia.composicao_item (
  publicacao_id integer not null references referencia.publicacao(id) on delete cascade,
  composicao    integer not null references referencia.item(codigo) on delete cascade,
  item          integer not null references referencia.item(codigo) on delete cascade,
  coeficiente   numeric(15,7) not null check (coeficiente >= 0),
  -- COM PREÇO / SEM PREÇO / COM CUSTO / SEM CUSTO / EM ESTUDO — a situação do
  -- ITEM dentro desta composição, como o SINAPI publica.
  situacao      text,
  primary key (publicacao_id, composicao, item),
  constraint composicao_item_nao_recursivo check (composicao <> item)
);

create index if not exists composicao_item_item_idx
  on referencia.composicao_item (publicacao_id, item);

comment on table referencia.composicao_item is
  'Estrutura analítica: 55.657 arestas em 06/2026. Nacional — não varia por UF.';


-- ---------------------------------------------------------------------------
-- 5. Situação da composição por publicação
-- ---------------------------------------------------------------------------
-- Separado do preço porque não varia por UF nem por regime.
-- 2.050 das 10.454 composições são "SEM CUSTO": o SINAPI não calculou custo
-- para elas (falta preço de algum item). A planilha mostra 0,00 nessas células;
-- ver o comentário em referencia.preco.
create table if not exists referencia.composicao_situacao (
  publicacao_id integer not null references referencia.publicacao(id) on delete cascade,
  composicao    integer not null references referencia.item(codigo) on delete cascade,
  situacao      text not null,
  primary key (publicacao_id, composicao)
);


-- ---------------------------------------------------------------------------
-- 6. Preço / custo por UF e regime
-- ---------------------------------------------------------------------------
-- Uma tabela para os dois: preço de insumo e custo de composição têm a mesma
-- forma. `referencia.item.tipo` diz qual é.
--
-- É a ÚNICA tabela que multiplica (item × UF × regime × mês), então é estreita
-- de propósito: inteiro em centavos, não numeric. Só MG está sendo importada —
-- ~44,6 mil linhas por mês. As 27 UFs dariam ~1,14 milhão por mês (~95 MB com
-- índices), o que gastaria o free em 4–5 meses de histórico.
--
-- bigint e não integer: o insumo mais caro de 06/2026 custa R$ 8.375.063,09 =
-- 837.506.309 centavos. Cabe em integer, mas com 2,5× de folga só — pouco para
-- uma base que é republicada todo mês por terceiros.
--
-- NÃO EXISTE LINHA COM centavos = 0 POR DESIGN. A planilha publica 0,00 para as
-- composições "SEM CUSTO", e zero ali significa DESCONHECIDO, não "de graça".
-- Gravar esse zero deixaria um serviço entrar num orçamento a custo nenhum. A
-- ausência de linha é a representação de "sem preço publicado".
create table if not exists referencia.preco (
  publicacao_id integer  not null references referencia.publicacao(id) on delete cascade,
  codigo        integer  not null references referencia.item(codigo) on delete cascade,
  uf            char(2)  not null,
  -- SD = encargos sociais sem desoneração   (abas ISD / CSD)
  -- CD = encargos sociais com desoneração   (abas ICD / CCD)
  -- SE = sem encargos sociais               (abas ISE / CSE)
  regime        char(2)  not null check (regime in ('SD', 'CD', 'SE')),
  centavos      bigint   not null check (centavos > 0),
  -- %AS: o SINAPI marca quando o custo usou preço atribuído de São Paulo por
  -- falta de coleta local. Não-zero em ~2.138 composições de MG. É sinal de
  -- qualidade do dado, não de preço.
  pct_as        numeric(9,6),
  primary key (publicacao_id, codigo, uf, regime)
);

create index if not exists preco_lookup_idx
  on referencia.preco (publicacao_id, uf, regime, codigo);

comment on table referencia.preco is
  'Preço de insumo e custo de composição, em centavos. Sem linha = sem preço publicado; '
  'nunca grava o 0,00 que a planilha usa para "SEM CUSTO".';


-- ---------------------------------------------------------------------------
-- 7. Permissões — leitura e nada mais
-- ---------------------------------------------------------------------------
-- Mesma lição de `catalogo_insumos`: convenção não protege nada, GRANT protege.
-- A aplicação não tem como escrever aqui nem por engano.
grant usage on schema referencia to authenticated;

grant select on referencia.publicacao         to authenticated;
grant select on referencia.item               to authenticated;
grant select on referencia.composicao_item    to authenticated;
grant select on referencia.composicao_situacao to authenticated;
grant select on referencia.preco              to authenticated;

revoke insert, update, delete on all tables in schema referencia from authenticated;
revoke all on schema referencia from anon;

-- RLS ligada com política permissiva: é dado público de referência, todo mundo
-- logado lê tudo. A política existe para que o advisor não aponte tabela sem
-- RLS num schema alcançável — não para restringir.
alter table referencia.publicacao          enable row level security;
alter table referencia.item                enable row level security;
alter table referencia.composicao_item     enable row level security;
alter table referencia.composicao_situacao enable row level security;
alter table referencia.preco               enable row level security;

do $$
declare t text;
begin
  foreach t in array array['publicacao','item','composicao_item','composicao_situacao','preco'] loop
    execute format('drop policy if exists leitura_publica on referencia.%I', t);
    execute format(
      'create policy leitura_publica on referencia.%I for select to authenticated using (true)', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Views em public — a superfície que o app enxerga
-- ---------------------------------------------------------------------------
-- O PostgREST só expõe `public`. Em vez de mudar a configuração de schemas
-- expostos do projeto, a base aparece como views. Efeito colateral desejado:
-- a view é a fronteira, então a forma interna pode mudar sem mexer no app.
--
-- `security_invoker = true` para a leitura correr com o papel de quem chama
-- (que tem SELECT, e só).
--
-- COLUNAS EXPLÍCITAS, nunca `select i.*`: view com estrela congela a lista de
-- colunas no momento da criação e já causou dois bugs silenciosos neste banco.

-- A publicação vigente é a mais recente que fechou a importação.
create or replace view public.v_sinapi_publicacao
with (security_invoker = true) as
  select p.id,
         p.mes_referencia,
         p.data_emissao,
         p.importado_em,
         (p.id = (select max(id) from referencia.publicacao where concluida_em is not null))
           as vigente
    from referencia.publicacao p
   where p.concluida_em is not null;

-- A view de item NÃO junta preço de propósito.
--
-- A tentação era devolver item + preço numa view só. Mas preço existe por
-- (publicação, UF, regime), então o join exige esses três valores — e uma view
-- não recebe parâmetro. Filtrar depois, no cliente, esconderia justamente os
-- 1.162 itens SEM PREÇO: com `left join`, quem não tem preço vem com
-- `publicacao_id` nulo e desaparece no `where publicacao_id = X`. A busca com
-- preço é a função `public.sinapi_buscar` abaixo, que recebe os parâmetros.
drop view if exists public.v_sinapi_item;
create view public.v_sinapi_item
with (security_invoker = true) as
  select i.codigo,
         i.tipo,
         i.descricao,
         i.unidade,
         i.grupo,
         i.origem_preco,
         i.visto_em_preco,
         i.busca
    from referencia.item i;

drop view if exists public.v_sinapi_composicao_item;
create view public.v_sinapi_composicao_item
with (security_invoker = true) as
  select ci.publicacao_id,
         ci.composicao,
         ci.item,
         ci.coeficiente,
         ci.situacao,
         i.tipo        as item_tipo,
         i.descricao   as item_descricao,
         i.unidade     as item_unidade,
         i.grupo       as item_grupo
    from referencia.composicao_item ci
    join referencia.item i on i.codigo = ci.item;

grant select on public.v_sinapi_publicacao      to authenticated;
grant select on public.v_sinapi_item            to authenticated;
grant select on public.v_sinapi_composicao_item to authenticated;


-- Busca paginada com preço resolvido. É a porta de entrada da tela de adoção.
-- Recebe publicação/UF/regime porque preço só existe nessa tripla; `left join`
-- para item sem preço aparecer com `preco` nulo em vez de sumir do resultado.
create or replace function public.sinapi_buscar(
  p_termo      text    default null,
  p_uf         char(2) default 'MG',
  p_regime     char(2) default 'SD',
  p_tipo       text    default null,
  p_publicacao integer default null,
  p_limite     integer default 50,
  p_offset     integer default 0
)
returns table (
  codigo          integer,
  tipo            text,
  descricao       text,
  unidade         text,
  grupo           text,
  preco           numeric,
  situacao        text,
  qtd_componentes bigint,
  total           bigint
)
language sql
stable
security invoker
set search_path = public, referencia, pg_temp
as $$
  with pub as (
    select coalesce(
      p_publicacao,
      (select max(id) from referencia.publicacao where concluida_em is not null)
    ) as id
  ),
  filtrado as (
    select i.codigo, i.tipo, i.descricao, i.unidade, i.grupo,
           round(pr.centavos / 100.0, 2) as preco,
           cs.situacao,
           coalesce(ci.qtd, 0) as qtd_componentes
      from referencia.item i
      cross join pub
      left join referencia.preco pr
             on pr.codigo = i.codigo
            and pr.publicacao_id = pub.id
            and pr.uf = p_uf
            and pr.regime = p_regime
      left join referencia.composicao_situacao cs
             on cs.composicao = i.codigo
            and cs.publicacao_id = pub.id
      left join (select composicao, count(*) as qtd
                   from referencia.composicao_item ci2
                   cross join pub p2
                  where ci2.publicacao_id = p2.id
                  group by 1) ci
             on ci.composicao = i.codigo
     where (p_tipo is null or i.tipo = p_tipo)
       and (
         p_termo is null
         or btrim(p_termo) = ''
         or i.busca like '%' || public.fn_normaliza_busca(p_termo) || '%'
       )
  )
  select f.codigo, f.tipo, f.descricao, f.unidade, f.grupo, f.preco, f.situacao,
         f.qtd_componentes,
         count(*) over () as total
    from filtrado f
   -- Item com preço primeiro: quem não tem preço publicado é resultado de
   -- segunda classe para quem está orçando.
   order by (f.preco is null), f.descricao
   limit greatest(1, least(coalesce(p_limite, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.sinapi_buscar(text, char, char, text, integer, integer, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 9. Custo de uma composição SINAPI, expandido
-- ---------------------------------------------------------------------------
-- MEDIDO contra os 8.404 custos publicados de SP e confirmado em MG e no regime
-- com desoneração: o SINAPI TRUNCA em centavos a cada passo, não arredonda.
--
--     0,0212 × 22,51 = 0,477212  →  SINAPI publica 0,47
--
-- Taxa de reprodução do número publicado, sobre 8.404 composições:
--
--     trunca produto E total ... 92,8% exato, +7,1% dentro de 1 centavo, 7 fora
--     trunca só o total ........ 19,5%
--     arredonda half-up ........  8,3%
--
-- Como nem truncando dá 100%, o custo publicado em `referencia.preco` continua
-- sendo a autoridade — esta função é para EXPLICAR o número, item por item, não
-- para substituí-lo.
--
-- Note que isto é uma convenção DIFERENTE da de `public.fn_custo_composicao`,
-- que expande até a folha e arredonda half-up para não acumular erro. As duas
-- estão certas nos seus contextos; a diferença aparece na adoção e é por isso
-- que adotar traz o custo publicado, não um recalculado.
-- Uma função só, em `public`, `security invoker`. A versão anterior tinha um
-- par (interna em `referencia` + fachada em `public`) e a fachada invoker
-- chamava a interna com EXECUTE revogado do `public` — o `authenticated` bateria
-- em permission denied. A interna não acrescentava nada: quem chama já tem
-- SELECT nas tabelas de referência, que é exatamente a permissão necessária.
create or replace function public.sinapi_custo_expandido(
  p_composicao   integer,
  p_publicacao   integer default null,
  p_uf           char(2) default 'MG',
  p_regime       char(2) default 'SD'
)
returns table (
  nivel          integer,
  item           integer,
  descricao      text,
  unidade        text,
  tipo           text,
  coeficiente    numeric,
  coef_acumulado numeric,
  preco_unitario numeric,
  custo          numeric
)
language sql
stable
security invoker
set search_path = public, referencia, pg_temp
as $$
  with recursive pub as (
    select coalesce(
      p_publicacao,
      (select max(id) from referencia.publicacao where concluida_em is not null)
    ) as id
  ),
  arvore as (
    -- `with recursive` vale para a lista inteira de CTEs; `arvore` é a única
    -- recursiva e `pub` acima é resolvida antes dela.
    select 1                        as nivel,
           ci.item,
           ci.coeficiente           as coeficiente,
           -- Cast explícito: sem ele o termo não-recursivo tipa numeric(15,7) e
           -- o recursivo numeric puro, e o Postgres recusa a CTE ("column has
           -- type numeric(15,7) in non-recursive term but type numeric overall").
           -- Já custou uma migration recusada em 26/jul.
           ci.coeficiente::numeric  as coef_acumulado
      from referencia.composicao_item ci
      cross join pub
     where ci.composicao = p_composicao
       and ci.publicacao_id = pub.id
    union all
    -- `union all` com teto de nível: a base é dado de terceiro e um ciclo
    -- publicado por engano não pode virar loop infinito aqui.
    select a.nivel + 1,
           ci.item,
           ci.coeficiente,
           a.coef_acumulado * ci.coeficiente
      from arvore a
      join referencia.composicao_item ci
        on ci.composicao = a.item
      cross join pub
     where ci.publicacao_id = pub.id
       and a.nivel < 20
  )
  select a.nivel,
         a.item,
         i.descricao,
         i.unidade,
         i.tipo,
         a.coeficiente,
         a.coef_acumulado,
         round(p.centavos / 100.0, 2),
         -- trunc, não round: é a convenção do SINAPI, medida contra 8.404
         -- custos publicados.
         trunc(a.coef_acumulado * p.centavos / 100.0, 2)
    from arvore a
    cross join pub
    join referencia.item i on i.codigo = a.item
    left join referencia.preco p
           on p.codigo = a.item
          and p.publicacao_id = pub.id
          and p.uf = p_uf
          and p.regime = p_regime
   order by a.nivel, i.descricao;
$$;

grant execute on function public.sinapi_custo_expandido(integer, integer, char, char) to authenticated;
