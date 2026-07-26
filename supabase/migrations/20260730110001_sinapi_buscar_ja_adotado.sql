-- ============================================================================
-- `sinapi_buscar` passa a dizer o que já está no catálogo
-- ============================================================================
-- A adoção é idempotente (item já adotado é reusado, não duplicado), mas até
-- aqui o usuário só descobria isso DEPOIS de clicar, pelo toast. Numa base de
-- 16.492 itens, procurar "argamassa" e não saber quais dos 25 resultados já
-- estão no catálogo é a confusão mais provável desta tela.
--
-- `ja_adotado` resolve olhando a mesma chave que o índice único do catálogo usa:
-- (código, UF, mês, desonerado). Um item adotado em 06/2026 não conta como
-- adotado quando se está olhando 07/2026 — é outro preço, e adotar de novo é o
-- comportamento certo.
--
-- Fica em `security invoker`, então a RLS de `catalogo_insumos` continua valendo:
-- quem não pode ver o catálogo recebe `false`, e não um vazamento.
--
-- DROP antes do CREATE: `create or replace` não consegue acrescentar coluna a um
-- `returns table` — o Postgres trata isso como mudança de tipo de retorno e
-- recusa ("cannot change return type of existing function"). Como o GRANT some
-- com a função, ele é refeito no fim.
drop function if exists public.sinapi_buscar(text, char, char, text, integer, integer, integer);

create function public.sinapi_buscar(
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
  ja_adotado      boolean,
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
  chave as (
    -- Mesma normalização do índice `catalogo_insumos_sinapi_unico`.
    select to_char(p.mes_referencia, 'YYYY-MM') as mes,
           (p_regime = 'CD')                    as deson
      from referencia.publicacao p
      cross join pub
     where p.id = pub.id
  ),
  filtrado as (
    select i.codigo, i.tipo, i.descricao, i.unidade, i.grupo,
           round(pr.centavos / 100.0, 2) as preco,
           cs.situacao,
           coalesce(ci.qtd, 0) as qtd_componentes,
           exists (
             select 1 from public.catalogo_insumos ca
              cross join chave k
              where ca.codigo_sinapi = i.codigo::text
                and coalesce(ca.uf, '') = p_uf
                and coalesce(ca.mes_referencia, '') = k.mes
                and coalesce(ca.desonerado, false) = k.deson
           ) as ja_adotado
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
      left join (select ci2.composicao, count(*) as qtd
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
         f.qtd_componentes, f.ja_adotado,
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

comment on function public.sinapi_buscar(text, char, char, text, integer, integer, integer) is
  'Busca na base de referência SINAPI com preço resolvido para (publicação, UF, '
  'regime) e `ja_adotado` dizendo se o item já está no catálogo nessa mesma chave. '
  'Item sem preço publicado vem com preco nulo em vez de desaparecer, e ordena '
  'depois de quem tem preço.';
