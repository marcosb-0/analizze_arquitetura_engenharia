-- ============================================================
-- ÁRVORE ANALÍTICA DA COMPOSIÇÃO — o que a tela nunca teve
-- ============================================================
-- Hoje só existe `v_composicao_itens`: os filhos DIRETOS de uma composição.
-- Quem abre uma composição adotada do SINAPI vê "ARGAMASSA 0,028 M3" e para
-- aí — não vê que dentro da argamassa há cimento, areia e mais um servente.
-- A base SINAPI tem essa visão (`sinapi_custo_expandido`, usada pela tela de
-- adoção); o catálogo próprio, que é o que a empresa monta e orça, não tinha.
--
-- Três funções, com papéis distintos:
--
--   fn_composicao_arvore          estrutura pura, sem preço. INTERNA.
--   catalogo_composicao_expandida a árvore com preço resolvido. RPC pública.
--   catalogo_composicao_agregados HH e custo por categoria, EM LOTE. RPC.
--   catalogo_composicao_hh        quebra por cargo + quem está na folha. RPC.
--
-- Separar a estrutura do preço não é purismo: a explosão de insumos da obra
-- (fase 7) precisa da mesma recursão com outra precificação, e duplicar a CTE
-- seria garantir que as duas divirjam na primeira manutenção.

-- ============================================================
-- 1. A regra de "isto é hora", numa casa só
-- ============================================================
-- `unidade` é texto livre em `catalogo_insumos`, então a regra precisa ser
-- tolerante à digitação e ao mesmo tempo estreita: MES (mensalista) é mão de
-- obra e NÃO é homem-hora. O SINAPI publica os dois para todo cargo — 192
-- itens em H e 184 em MES no mesmo grupo.
create or replace function public.fn_unidade_e_hora(p_unidade text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select upper(btrim(coalesce(p_unidade, ''))) in ('H', 'HR', 'HORA', 'HORAS', 'HH');
$$;

comment on function public.fn_unidade_e_hora(text) is
  'Unidade representa hora trabalhada? Estreita de propósito: MES/DIA são mão de obra mas não são homem-hora, e somá-los ao HH misturaria grandezas.';

-- ============================================================
-- 2. A recursão, sem preço
-- ============================================================
create or replace function public.fn_composicao_arvore(p_id uuid)
returns table (
  nivel          integer,
  ordem          text[],
  caminho        uuid[],
  componente_id  uuid,
  pai_id         uuid,
  insumo_id      uuid,
  coeficiente    numeric,
  coeficiente_referencia numeric,
  coef_acumulado numeric,
  eh_folha       boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive arvore as (
    select 1 as nivel,
           array[f.categoria || '~' || f.descricao] as ordem,
           array[ci.insumo_id] as caminho,
           ci.id as componente_id,
           p_id as pai_id,
           ci.insumo_id,
           -- Cast explícito obrigatório: o termo recursivo multiplica e produz
           -- `numeric` puro; sem isto o Postgres recusa a CTE com 42804
           -- ("column has type numeric(15,7) in non-recursive term but type
           -- numeric overall"). Já custou uma migration recusada em 26/jul.
           ci.coeficiente::numeric as coeficiente,
           ci.coeficiente_referencia::numeric as coeficiente_referencia,
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
           ci.coeficiente_referencia::numeric,
           -- Composição dentro de composição: o coeficiente acumula por
           -- multiplicação. 0,028 m³ de argamassa × 0,32 kg de cimento por m³
           -- = 0,00896 kg de cimento por m² de alvenaria.
           a.coef_acumulado * ci.coeficiente
      from arvore a
      join public.composicao_itens ci on ci.composicao_id = a.insumo_id
      join public.catalogo_insumos f  on f.id = ci.insumo_id
      -- Teto de profundidade como segunda camada: o guard de ciclo já impede
      -- a única forma de estourar isto, mas uma função que roda para sempre é
      -- pior que uma que devolve árvore incompleta.
     where a.nivel < 20
  )
  select a.nivel, a.ordem, a.caminho, a.componente_id, a.pai_id, a.insumo_id,
         a.coeficiente, a.coeficiente_referencia, a.coef_acumulado,
         not exists (select 1 from public.composicao_itens f where f.composicao_id = a.insumo_id)
    from arvore a
   -- `order by ordem` produz travessia de árvore: cada pai vem colado nos
   -- seus filhos. `sinapi_custo_expandido` ordena por (nivel, descricao), o
   -- que agrupa por profundidade e embaralha as subcomposições — serve para
   -- uma tabela plana, não para indentação.
   order by a.ordem;
$$;

comment on function public.fn_composicao_arvore(uuid) is
  'Estrutura expandida de uma composição, sem preço. `ordem` é a chave de travessia (pai colado nos filhos); `caminho` permite agregar subárvore por prefixo. INTERNA — a RPC pública é catalogo_composicao_expandida.';

-- SECURITY DEFINER sem guard de papel: por isso fica inacessível de fora.
revoke execute on function public.fn_composicao_arvore(uuid) from anon, authenticated, public;

-- ============================================================
-- 3. A RPC pública, com preço
-- ============================================================
create or replace function public.catalogo_composicao_expandida(p_id uuid)
returns table (
  nivel          integer,
  ordem          text[],
  caminho        uuid[],
  componente_id  uuid,
  pai_id         uuid,
  insumo_id      uuid,
  descricao      text,
  codigo_sinapi  text,
  unidade        text,
  categoria      text,
  tipo_item      text,
  ativo          boolean,
  observacao     text,
  coeficiente    numeric,
  coeficiente_referencia numeric,
  coef_acumulado numeric,
  eh_folha       boolean,
  eh_hora        boolean,
  preco_unitario numeric,
  preco_nivel    smallint,
  preco_fonte    text,
  custo          numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- `coalesce` não é decorativo: sem ele um JWT sem profile faz fn_current_role
  -- devolver NULL, o `not in` avaliar NULL, o IF não disparar, e a checagem
  -- passar em silêncio para quem deveria ser barrado.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para abrir composições do catálogo.';
  end if;

  return query
  with a as (
    select * from public.fn_composicao_arvore(p_id)
  ),
  -- `distinct` antes do lateral: fn_preco_vigente é recursiva para composição,
  -- e um insumo que aparece em cinco ramos seria resolvido cinco vezes.
  pv as (
    select d.insumo_id as id, v.preco, v.nivel, v.fonte
      from (select distinct arv.insumo_id from a arv) d
      cross join lateral public.fn_preco_vigente(d.insumo_id) v
  ),
  folhas as (
    select arv.caminho, round(arv.coef_acumulado * p.preco, 2) as custo
      from a arv
      join pv p on p.id = arv.insumo_id
     where arv.eh_folha
  )
  select arv.nivel, arv.ordem, arv.caminho, arv.componente_id, arv.pai_id, arv.insumo_id,
         c.descricao, c.codigo_sinapi, c.unidade, c.categoria, c.tipo_item, c.ativo,
         ci.observacao,
         arv.coeficiente, arv.coeficiente_referencia, arv.coef_acumulado,
         arv.eh_folha,
         (c.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(c.unidade)),
         p.preco, p.nivel, p.fonte,
         case
           when arv.eh_folha then round(arv.coef_acumulado * p.preco, 2)
           -- Nó-galho carrega o subtotal da própria subárvore, para a linha
           -- explicar de onde vêm os R$ 2,15 da argamassa. Prefixo do caminho,
           -- não `@>`: contenção de array ignora posição e pegaria ramo irmão
           -- que por acaso use os mesmos insumos.
           else (select coalesce(sum(f.custo), 0) from folhas f
                  where f.caminho[1:array_length(arv.caminho, 1)] = arv.caminho)
         end
    from a arv
    join public.catalogo_insumos c on c.id = arv.insumo_id
    join public.composicao_itens ci on ci.id = arv.componente_id
    left join pv p on p.id = arv.insumo_id
   order by arv.ordem;
end;
$$;

comment on function public.catalogo_composicao_expandida(uuid) is
  'Árvore analítica de uma composição até as folhas, com preço vigente. SOMAR APENAS `eh_folha` — a linha de subcomposição traz o subtotal dela para explicar, e somá-la junto conta o mesmo dinheiro duas vezes (mesmo contrato de sinapi_custo_expandido em nivel=1). Σ das folhas difere do total armazenado em centavos: aqui arredonda por linha, fn_custo_composicao arredonda uma vez no fim.';

revoke execute on function public.catalogo_composicao_expandida(uuid) from anon, public;
grant execute on function public.catalogo_composicao_expandida(uuid) to authenticated;

-- ============================================================
-- 4. Agregados: HH e custo por categoria, em lote
-- ============================================================
-- Em lote porque os dois consumidores são a tabela do catálogo (60 ids de uma
-- página) e a área de trabalho (1 id). Uma função só evita a versão "N+1
-- requisições" aparecer na listagem.
--
-- O cálculo é do BANCO, e não por dogma: `fn_preco_vigente` é SECURITY DEFINER
-- e revogada como leitura direta, então o cliente não CONSEGUE reproduzir a
-- cadeia de 4 níveis. Uma soma no cliente seria uma segunda conta
-- estruturalmente incapaz de bater com a primeira.
--
-- Percentuais NÃO são devolvidos: são custo_categoria / custo_total, divisão
-- de dois números que já vão. Mandar pronto seria uma terceira representação
-- do mesmo dado, com uma terceira chance de divergir.
create or replace function public.catalogo_composicao_agregados(p_ids uuid[])
returns table (
  composicao_id     uuid,
  custo_total       numeric,
  hh_por_unidade    numeric,
  hh_fora_de_hora   integer,
  custo_mao_de_obra numeric,
  custo_material    numeric,
  custo_equipamento numeric,
  custo_servico     numeric,
  custo_taxa        numeric,
  qtd_folhas        integer,
  folhas_sem_preco  integer,
  folhas_inativas   integer,
  profundidade      integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para ler composições do catálogo.';
  end if;

  return query
  with ids as (
    select distinct unnest(p_ids) as id
  ),
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
         -- HH só conta folha de mão de obra medida em hora. Mão de obra por
         -- empreitada (m²) ou mensalista (MES) entra no custo_mao_de_obra mas
         -- NÃO no HH — e `hh_fora_de_hora` é o contador que faz a tela avisar
         -- em vez de exibir um HH incompleto como se fosse completo.
         coalesce(sum(f.coef_acumulado)
           filter (where c.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(c.unidade)), 0),
         count(*) filter (where c.categoria = 'Mão de Obra'
                            and not public.fn_unidade_e_hora(c.unidade))::int,
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Mão de Obra'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Material'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Equipamento'), 2), 0),
         coalesce(round(sum(f.coef_acumulado * pv.preco) filter (where c.categoria = 'Serviço'), 2), 0),
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
$$;

comment on function public.catalogo_composicao_agregados(uuid[]) is
  'HH por unidade e custo por categoria de várias composições de uma vez. HH conta só folha de Mão de Obra medida em hora; `hh_fora_de_hora` conta a MO que ficou de fora, para a tela poder avisar. Percentuais não vêm prontos de propósito.';

revoke execute on function public.catalogo_composicao_agregados(uuid[]) from anon, public;
grant execute on function public.catalogo_composicao_agregados(uuid[]) to authenticated;

-- ============================================================
-- 5. Quebra por cargo — fecha o vínculo com a aba Equipe
-- ============================================================
-- `funcionarios.catalogo_mao_de_obra_id` existe desde 20260726221330 e só
-- ganhou consumidor agora. `funcionarios_vinculados = 0` é a informação
-- acionável: a composição pede PEDREIRO e ninguém na folha está marcado como
-- PEDREIRO — o que, com a fonte de preço 'Folha', tem consequência em dinheiro.
create or replace function public.catalogo_composicao_hh(p_id uuid)
returns table (
  insumo_id      uuid,
  descricao      text,
  unidade        text,
  eh_hora        boolean,
  coef_acumulado numeric,
  preco_unitario numeric,
  preco_fonte    text,
  custo          numeric,
  funcionarios_vinculados integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para ler composições do catálogo.';
  end if;

  return query
  select c.id,
         c.descricao,
         c.unidade,
         public.fn_unidade_e_hora(c.unidade),
         -- O mesmo cargo pode entrar por vários ramos (pedreiro direto e
         -- pedreiro dentro da argamassa): soma antes de mostrar.
         round(sum(arv.coef_acumulado), 7),
         max(pv.preco),
         max(pv.fonte),
         round(sum(arv.coef_acumulado) * max(pv.preco), 2),
         (select count(*) from public.funcionarios f
           where f.catalogo_mao_de_obra_id = c.id and f.status = 'Ativo')::int
    from public.fn_composicao_arvore(p_id) arv
    join public.catalogo_insumos c on c.id = arv.insumo_id
    cross join lateral public.fn_preco_vigente(c.id) pv
   where arv.eh_folha
     and c.categoria = 'Mão de Obra'
   group by c.id, c.descricao, c.unidade
   order by 8 desc;
end;
$$;

comment on function public.catalogo_composicao_hh(uuid) is
  'Mão de obra de uma composição, agrupada por cargo, com quantos funcionários ativos estão vinculados a cada um. Zero vinculados significa que aquele cargo é orçado pelo SINAPI e não pela folha.';

revoke execute on function public.catalogo_composicao_hh(uuid) from anon, public;
grant execute on function public.catalogo_composicao_hh(uuid) to authenticated;
