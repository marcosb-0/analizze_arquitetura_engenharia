-- ============================================================
-- AS VIEWS DO CRONOGRAMA, RECRIADAS PARA ENXERGAR A EAP
-- ============================================================
-- Arquivo separado porque é o passo que falha em SILÊNCIO, e separado ele é
-- fácil de reler quando alguém acrescentar a próxima coluna.
--
-- 3. As views
-- ------------------------------------------------------------
-- ATENÇÃO — este é o passo que falha em silêncio.
--
-- `v_etapas_cronograma` foi criada com `select e.*` (20260718190003) e recriada
-- ainda com `e.*` em 20260720140001. `e.*` CONGELA a lista de colunas no momento
-- da criação: nenhuma das oito colunas acima apareceria na view, e como o
-- cliente lê pela view e não pela tabela, o cronograma nasceria cego. É a
-- terceira ocorrência desta armadilha no repositório — 20260726120000 documenta
-- as duas primeiras, ambas em propostas.
--
-- Por isso a lista abaixo é EXPLÍCITA. Coluna nova em etapas_cronograma exige
-- editar este select; é chato de propósito.
--
-- E `create or replace` não serve aqui (só permite acrescentar colunas no fim),
-- então é drop + create — o que derruba as duas views dependentes,
-- `v_resumo_obra` e `v_etapa_atrasada`, recriadas logo abaixo. O `security_invoker`,
-- os `grant` e os `comment on view` NÃO sobrevivem ao drop e são re-declarados.
--
-- `v_desvio_categoria_obra` e `v_medicao_recente` não dependem desta view
-- (a primeira lê v_itens_orcamento, a segunda lê a TABELA etapas_cronograma com
-- colunas nomeadas) e não são tocadas.

drop view if exists public.v_etapa_atrasada;
drop view if exists public.v_resumo_obra;
drop view if exists public.v_etapas_cronograma;

create view public.v_etapas_cronograma
with (security_invoker = true) as
with recursive arvore as (
  select e.id, e.projeto_id, 0 as nivel, array[e.ordem] as ordem_path
    from public.etapas_cronograma e
   where e.parent_id is null
  union all
  select f.id, f.projeto_id, a.nivel + 1, a.ordem_path || f.ordem
    from public.etapas_cronograma f
    join arvore a on a.id = f.parent_id
)
select
  e.id,
  e.projeto_id,
  e.nome,
  e.data_inicio,
  e.data_fim,
  e.responsavel_id,
  e.parent_id,
  e.ordem,
  e.eh_marco,
  e.agendamento,
  e.baseline_inicio,
  e.baseline_fim,
  e.baseline_em,
  e.baseline_por,
  e.created_at,
  e.updated_at,

  a.nivel,
  -- Ordem TOTAL e estável da árvore em pré-ordem: [1] < [1,1] < [1,2] < [2].
  -- É disto que `buscarTudo` precisa para paginar. Com a ordem antiga
  -- (data_inicio, id) a hierarquia intercalaria pais e filhos entre blocos de
  -- 1000 e o cliente montaria uma árvore parcial — sem erro nenhum.
  a.ordem_path,
  array_to_string(a.ordem_path, '.') as wbs_codigo,
  not exists (select 1 from public.etapas_cronograma f where f.parent_id = e.id) as eh_folha,

  -- Datas do grupo são rollup dos descendentes; da folha, as próprias. O
  -- coalesce cobre os dois casos sem um `case` sobre eh_folha: em folha o
  -- agregado é NULL (não há descendente estrito) e cai nas colunas da linha.
  coalesce(roll.inicio, e.data_inicio) as inicio_efetivo,
  coalesce(roll.fim,    e.data_fim)    as fim_efetivo,

  -- Idênticos aos de 20260720140001: só medição APROVADA avança etapa, e não
  -- existe caminho de escrita para nenhum dos dois (fix #1).
  --
  -- Um GRUPO não tem medição — fn_execucao_so_em_folha barra — então cai em 0
  -- aqui, e isso é intencional: o percentual do grupo é a média das frentes
  -- PONDERADA PELO ORÇADO delas, que é exatamente o que `calcularAvancoFisico`
  -- (src/lib/avanco.ts) já faz, com teste guardando as três regras. Reimplementar
  -- essa média aqui seria a TERCEIRA cópia da mesma fórmula (a primeira é
  -- avanco.ts, a segunda é v_resumo_obra) — e o modo de falha de uma divergência
  -- é a mesma obra com dois números em duas telas. Quem consome filtra por
  -- `eh_folha` e rola o grupo no cliente.
  least(100, coalesce((
    select sum(m.percentual_medido) from public.medicoes_obra m
    where m.etapa_id = e.id and m.status = 'Aprovada'
  ), 0)) as percentual_executado,
  case
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id and m.status = 'Aprovada'), 0) >= 100
      then 'Concluído'
    when e.data_fim is not null and e.data_fim < current_date
      then 'Atrasado'
    when coalesce((select sum(m.percentual_medido) from public.medicoes_obra m where m.etapa_id = e.id and m.status = 'Aprovada'), 0) > 0
      then 'Em Andamento'
    else 'Não Iniciado'
  end as status

from public.etapas_cronograma e
join arvore a on a.id = e.id
cross join lateral (
  -- Descendente estrito é quem tem o ordem_path desta linha como prefixo e não
  -- é ela mesma. Sai de graça da CTE que já foi montada para o wbs_codigo — uma
  -- segunda recursão por linha custaria caro numa view lida a cada abertura da obra.
  select min(de.data_inicio) as inicio, max(de.data_fim) as fim
    from public.etapas_cronograma de
    join arvore d on d.id = de.id
   where d.projeto_id = a.projeto_id
     and d.id <> e.id
     and d.ordem_path[1:array_length(a.ordem_path, 1)] = a.ordem_path
) roll;

comment on view public.v_etapas_cronograma is
  'Etapas com a árvore da EAP resolvida (nivel, ordem_path, wbs_codigo, eh_folha) e as datas do grupo roladas dos filhos. percentual_executado/status seguem derivados só de medição Aprovada e valem para FOLHA — o percentual do grupo é rolado no cliente por calcularAvancoFisico. LISTA DE COLUNAS EXPLÍCITA de propósito: `select e.*` congela colunas e já causou 3 bugs silenciosos.';

-- ------------------------------------------------------------
-- v_resumo_obra — idêntica a 20260804110000, com UMA mudança
-- ------------------------------------------------------------
-- `and e.eh_folha` no agregado de cronograma. Sem isso os grupos passariam a
-- contar como trabalho: `etapas_total` subiria, e `avanco_fisico` cairia no
-- ramo de média simples dividindo por um denominador que inclui grupos a 0% —
-- uma obra com 5 grupos e 15 frentes a 100% mostraria 75%. E esse número aparece
-- na lista de obras e no painel, que existem justamente para não divergir do
-- console.
--
-- A paridade com src/lib/avanco.ts continua garantida porque os dois lados
-- passam a filtrar pela MESMA coluna derivada (`eh_folha`, resolvida na view
-- acima) em vez de cada um recalcular "tem filhos?" do seu jeito.
create view public.v_resumo_obra
with (security_invoker = true) as
select
  p.id as projeto_id,

  orc.itens_total,
  orc.valor_orcado,
  orc.valor_contratado,
  orc.valor_executado,

  cro.etapas_total,
  cro.etapas_atrasadas,
  cro.etapas_concluidas,
  case
    when cro.etapas_total = 0 then 0
    when cro.peso_total > 0  then round(cro.ponderada / cro.peso_total)::int
    else round(cro.soma_simples / cro.etapas_total)::int
  end as avanco_fisico,

  med.medicoes_total,
  med.medicoes_pendentes
from public.projetos p

cross join lateral (
  select
    count(*)                                  as itens_total,
    coalesce(sum(io.valor_orcado), 0)         as valor_orcado,
    coalesce(sum(io.valor_contratado), 0)     as valor_contratado,
    coalesce(sum(io.valor_executado), 0)      as valor_executado
  from public.v_itens_orcamento io
  where io.projeto_id = p.id
) orc

cross join lateral (
  select
    count(*)                                        as etapas_total,
    count(*) filter (where e.status = 'Atrasado')   as etapas_atrasadas,
    count(*) filter (where e.status = 'Concluído')  as etapas_concluidas,
    coalesce(sum(e.percentual_executado), 0)        as soma_simples,
    coalesce(sum(pe.peso), 0)                       as peso_total,
    coalesce(sum(e.percentual_executado * pe.peso), 0) as ponderada
  from public.v_etapas_cronograma e
  cross join lateral (
    select coalesce(sum((v.peso_percentual / 100) * io.valor_orcado), 0) as peso
    from public.etapa_orcamento_vinculo v
    join public.v_itens_orcamento io
      on io.id = v.item_orcamento_id and io.projeto_id = p.id
    where v.etapa_id = e.id
  ) pe
  where e.projeto_id = p.id
    and e.eh_folha
) cro

cross join lateral (
  select
    count(*)                                       as medicoes_total,
    count(*) filter (where m.status = 'Pendente')  as medicoes_pendentes
  from public.medicoes_obra m
  where m.projeto_id = p.id
) med;

comment on view public.v_resumo_obra is
  'Uma linha por obra com os agregados que o painel e a lista de obras somavam no cliente (§4.2). security_invoker de propósito: o número é o que ESTE papel enxerga. avanco_fisico espelha src/lib/avanco.ts, e ambos contam só etapa-FOLHA — grupo da EAP não é trabalho, é soma.';

-- ------------------------------------------------------------
-- v_etapa_atrasada — idêntica a 20260804110000, com UMA mudança
-- ------------------------------------------------------------
-- `and e.eh_folha`: sem o filtro, um grupo atrasado apareceria no cartão do
-- painel junto com a frente que o atrasou — dois alarmes para um fato só, e o
-- grupo sem responsável para acionar.
create view public.v_etapa_atrasada
with (security_invoker = true) as
select
  e.id          as etapa_id,
  e.projeto_id,
  e.nome        as etapa_nome,
  e.data_fim,
  (current_date - e.data_fim)::int as dias_atraso
from public.v_etapas_cronograma e
where e.percentual_executado < 100
  and e.eh_folha
  and e.data_fim is not null
  and e.data_fim < current_date;

comment on view public.v_etapa_atrasada is
  'Etapas-folha com prazo vencido e execução abaixo de 100%. dias_atraso vem do servidor: a coluna é `date` e calcular no cliente com new Date() atrasa um dia.';

-- Os grants NÃO sobrevivem ao drop das views acima.
grant select on public.v_etapas_cronograma to authenticated;
grant select on public.v_resumo_obra       to authenticated;
grant select on public.v_etapa_atrasada    to authenticated;
