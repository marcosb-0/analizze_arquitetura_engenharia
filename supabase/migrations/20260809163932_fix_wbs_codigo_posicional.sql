-- ============================================================
-- wbs_codigo divergia do cliente assim que a ordem ganhava um buraco
-- ============================================================
-- Encontrado ao aplicar a EAP no banco, com dado real. A view montava o código
-- a partir do valor CRU de `ordem` (`array_to_string(ordem_path)`), enquanto
-- `montarArvore` em src/lib/cronograma/wbs.ts numera pela POSIÇÃO na lista de
-- irmãos. Os dois concordam enquanto a ordem é densa — e o app a mantém densa,
-- porque `reordenar.ts` renumera e `trg_etapa_ordem_padrao` atribui max+1.
--
-- Mas basta EXCLUIR uma etapa do meio para a ordem virar 1,3,4: o servidor
-- passa a dizer "1.3" e a tela "1.2" para a mesma frente. Excluir etapa é
-- operação corriqueira, e o código da EAP é o que aparece no relatório impresso
-- e na conversa com o cliente. `wbs.test.ts` afirma guardar essa paridade e não
-- guardava — só compara a numeração do cliente consigo mesma.
--
-- A numeração passa a ser posicional dos DOIS lados. `row_number()` não pode
-- viver no termo recursivo de uma CTE recursiva (o Postgres recusa), então a
-- posição é calculada antes, numa CTE não-recursiva do mesmo `with recursive`.
--
-- `ordem_path` continua sendo a ordenação total estável que `buscarTudo` usa
-- para paginar: `row_number()` sobre (ordem, id) preserva exatamente a sequência
-- anterior, só troca os rótulos por 1..n.
--
-- Conferido no banco com ordem 1,3,4,5,47 → wbs_codigo 1,2,3,4,5.

drop view if exists public.v_etapa_atrasada;
drop view if exists public.v_resumo_obra;
drop view if exists public.v_etapas_cronograma;

create view public.v_etapas_cronograma
with (security_invoker = true) as
with recursive numerada as (
  -- `partition by projeto_id, parent_id`: NULL agrupa com NULL no PARTITION BY,
  -- então as raízes de uma obra caem todas na mesma janela.
  select id, projeto_id, parent_id,
         row_number() over (partition by projeto_id, parent_id order by ordem, id)::int as pos
    from public.etapas_cronograma
),
arvore as (
  select n.id, n.projeto_id, 0 as nivel, array[n.pos] as ordem_path
    from numerada n
   where n.parent_id is null
  union all
  select f.id, f.projeto_id, a.nivel + 1, a.ordem_path || f.pos
    from numerada f
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
  a.ordem_path,
  array_to_string(a.ordem_path, '.') as wbs_codigo,
  not exists (select 1 from public.etapas_cronograma f where f.parent_id = e.id) as eh_folha,
  coalesce(roll.inicio, e.data_inicio) as inicio_efetivo,
  coalesce(roll.fim,    e.data_fim)    as fim_efetivo,
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
  select min(de.data_inicio) as inicio, max(de.data_fim) as fim
    from public.etapas_cronograma de
    join arvore d on d.id = de.id
   where d.projeto_id = a.projeto_id
     and d.id <> e.id
     and d.ordem_path[1:array_length(a.ordem_path, 1)] = a.ordem_path
) roll;

comment on view public.v_etapas_cronograma is
  'Etapas com a árvore da EAP resolvida (nivel, ordem_path, wbs_codigo, eh_folha) e as datas do grupo roladas dos filhos. wbs_codigo é POSICIONAL (1..n entre irmãos), igual a montarArvore no cliente — usar o valor cru de `ordem` divergia assim que uma exclusão abria buraco. LISTA DE COLUNAS EXPLÍCITA de propósito: `select e.*` congela colunas e já causou 3 bugs silenciosos.';

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

grant select on public.v_etapas_cronograma to authenticated;
grant select on public.v_resumo_obra       to authenticated;
grant select on public.v_etapa_atrasada    to authenticated;
