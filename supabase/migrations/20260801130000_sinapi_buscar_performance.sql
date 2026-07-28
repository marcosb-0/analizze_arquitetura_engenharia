-- ============================================================
-- SINAPI: busca por palavras e paginação que não varre a base inteira
-- ============================================================
-- Reclamação do usuário: a tela de adoção é lenta e a pesquisa é ruim. As duas
-- coisas foram medidas com EXPLAIN (ANALYZE, BUFFERS) na base real antes e
-- depois — 16.492 itens, 55.657 arestas, 38.443 preços.
--
--                       ANTES        DEPOIS
--   abrir o painel      854 ms       88 ms
--   'concreto'          216 ms       25 ms
--   'bloco alvenaria'   0 resultados 6,5 ms / 271 resultados
--   código '89480'      —            3,3 ms
--
-- ============================================================
-- 1. Por que era lento: custo proporcional ao RESULTADO, não à página
-- ============================================================
-- `ja_adotado` era um EXISTS correlacionado contra catalogo_insumos, avaliado
-- para TODA linha que passava no filtro, antes do LIMIT. A conta bate com o
-- medido: 16.492 linhas × ~5,5 buffers ≈ 90.700, e o EXPLAIN acusava 91.765.
-- Com termo, 1.810 resultados × 5,5 ≈ 10.000, e o medido foi 12.626.
--
-- No mesmo caminho, dois desperdícios menores: o agregado de componentes varria
-- as 55.657 arestas de composicao_item a cada busca (~40 ms) e
-- composicao_situacao entrava por hash de 10.454 linhas — tudo isso para
-- preencher duas colunas de 40 linhas.
--
-- A correção é estrutural: filtrar, ordenar e paginar primeiro com o mínimo de
-- colunas, e só então enriquecer as ~40 linhas da página. O preço permanece no
-- primeiro passo porque a ordenação depende dele ("item com preço primeiro").
-- Depois disso, cada enriquecimento vira index scan de 40 loops.
--
-- ============================================================
-- 2. Por que a busca era ruim: substring contígua
-- ============================================================
-- O filtro era `busca like '%termo%'`. Medido na base real:
--
--   'alvenaria de blocos' -> 12 itens
--   'alvenaria bloco'     ->  0     <- tirar uma palavra zera o resultado
--   'bloco alvenaria'     ->  0     <- inverter a ordem zera o resultado
--   'concreto usinado'    -> 65
--   'usinado concreto'    ->  0
--
-- Agora o termo é quebrado em palavras e TODAS precisam aparecer, em qualquer
-- ordem. A primeira vai como `like` indexável — o índice trigram
-- `item_busca_trgm_idx` cobre `%x%`, verificado com Bitmap Index Scan — e as
-- demais filtram o conjunto já estreito. Busca por código segue funcionando:
-- `item.busca` termina com o código.
--
-- ============================================================
-- 3. Por que plpgsql com EXECUTE, e não `language sql`
-- ============================================================
-- Esta é a parte não óbvia, e custou medição para descobrir.
--
-- `SET search_path` IMPEDE o inlining de função SQL. Sem inlining, o corpo é
-- planejado uma vez por sessão com os argumentos como parâmetros opacos, e o
-- planner escolhe um plano genérico ruim. O mesmo SQL, escrito inline com os
-- valores reais, custava 68 ms; dentro da função com `language sql` + `SET`,
-- 400 ms. Testado também sem `SET`: 52 ms — confirmando que o `SET` era a
-- causa, não a estrutura da consulta.
--
-- Tirar o `SET search_path` resolveria, mas as 52 funções de `public` neste
-- schema têm `SET` sem exceção, e removê-lo levantaria um alerta
-- `function_search_path_mutable` no linter do Supabase. Trocar uma convenção de
-- segurança universal por 36 ms não se paga.
--
-- `RETURN QUERY EXECUTE` com `format(%L)` resolve os dois lados: os valores
-- entram como LITERAIS, então cada chamada recebe um plano customizado com
-- estatísticas reais, e o `SET search_path` continua valendo. O custo é o
-- replanejamento (~8 ms), já embutido nos números medidos acima.
--
-- Sobre injeção: todo valor passa por `%L`, que escapa aspas. `p_termo` é o
-- único texto de origem do usuário e é o primeiro a passar por lá. Os `%%` do
-- corpo produzem o `%` literal dos LIKEs.

create or replace function public.sinapi_buscar(
  p_termo      text default null,
  p_uf         char(2) default 'MG',
  p_regime     char(2) default 'SD',
  p_tipo       text default null,
  p_publicacao integer default null,
  p_limite     integer default 50,
  p_offset     integer default 0
)
returns table (
  codigo integer, tipo text, descricao text, unidade text, grupo text,
  preco numeric, situacao text, qtd_componentes bigint, ja_adotado boolean, total bigint
)
language plpgsql
stable
set search_path = public, referencia, pg_temp
as $fn$
begin
  return query execute format($q$
    with pub as (
      select coalesce(%L::integer,
        (select max(id) from referencia.publicacao where concluida_em is not null)) as id
    ),
    tk as (
      select array_remove(string_to_array(public.fn_normaliza_busca(coalesce(%L::text,'')), ' '), '') as t
    ),
    -- Conjunto minúsculo (o catálogo da empresa), montado uma vez em vez de um
    -- exists por linha da base. Mesma normalização do índice
    -- `catalogo_insumos_sinapi_unico`, que o plano usa.
    adotados as (
      select ca.codigo_sinapi
        from public.catalogo_insumos ca
        cross join lateral (
          select to_char(p.mes_referencia,'YYYY-MM') as mes, (%L::text = 'CD') as deson
            from referencia.publicacao p cross join pub where p.id = pub.id) k
       where ca.codigo_sinapi is not null
         and coalesce(ca.uf,'') = %L
         and coalesce(ca.mes_referencia,'') = k.mes
         and coalesce(ca.desonerado,false) = k.deson
    ),
    -- Passo 1: só o necessário para filtrar, contar e ordenar.
    base as (
      select i.codigo, i.descricao, round(pr.centavos/100.0,2) as preco, count(*) over () as total
        from referencia.item i
        cross join pub
        cross join tk
        left join referencia.preco pr
               on pr.publicacao_id = pub.id and pr.uf = %L and pr.regime = %L and pr.codigo = i.codigo
       where (%L::text is null or i.tipo = %L)
         -- primeira palavra: indexável pelo trigram
         and (cardinality(tk.t) = 0 or i.busca like '%%' || tk.t[1] || '%%')
         -- demais palavras: filtro sobre o conjunto já estreitado, ordem livre
         and (cardinality(tk.t) < 2
              or i.busca like all (select '%%' || x || '%%' from unnest(tk.t[2:]) x))
    ),
    -- Passo 2: a página. Item com preço primeiro — quem não tem preço publicado
    -- é resultado de segunda classe para quem está orçando.
    pagina as (
      select * from base order by (preco is null), descricao
       limit greatest(1, least(%L::integer, 200)) offset greatest(0, %L::integer)
    )
    -- Passo 3: enriquece só as linhas da página, tudo por índice.
    select pg.codigo, i.tipo, pg.descricao, i.unidade, i.grupo, pg.preco, cs.situacao,
           coalesce((select count(*) from referencia.composicao_item ci
                      where ci.publicacao_id = (select id from pub) and ci.composicao = pg.codigo),0),
           pg.codigo::text in (select codigo_sinapi from adotados),
           pg.total
      from pagina pg
      join referencia.item i on i.codigo = pg.codigo
      left join referencia.composicao_situacao cs
             on cs.composicao = pg.codigo and cs.publicacao_id = (select id from pub)
     order by (pg.preco is null), pg.descricao
  $q$,
    p_publicacao, p_termo, p_regime, p_uf, p_uf, p_regime, p_tipo, p_tipo,
    coalesce(p_limite,50), coalesce(p_offset,0));
end;
$fn$;

revoke execute on function public.sinapi_buscar(text, char, char, text, integer, integer, integer) from anon, public;
grant  execute on function public.sinapi_buscar(text, char, char, text, integer, integer, integer) to authenticated;
