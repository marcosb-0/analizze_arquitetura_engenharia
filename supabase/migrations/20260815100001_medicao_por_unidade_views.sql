-- ============================================================
-- AS VIEWS, E A PRECISÃO QUE A MEDIÇÃO POR UNIDADE EXIGE
-- ============================================================
-- Arquivo separado de 20260815100000 pelo mesmo motivo declarado em
-- 20260809163542:1-6: este é o passo que falha em SILÊNCIO, e separado ele é
-- fácil de reler quando alguém acrescentar a próxima coluna.
--
-- 1) A PRECISÃO
-- ------------------------------------------------------------
-- `percentual_medido numeric(5,2)` é a resolução com que a etapa consegue
-- registrar um boletim. Derivando de quantidade, o buraco escala com 1/10^casas
-- RELATIVO à meta: com 2 casas, uma etapa de 5.000 m² já recusa um boletim de
-- 0,5 m² (o delta arredonda para 0,00 e fn_medicao_deriva_percentual levanta).
--
-- E o defeito real não é "recusa" — é "recusa ÀS VEZES": o mesmo boletim de
-- 1 m² numa etapa de 20.000 m² passa na segunda-feira (porque o acumulado
-- cruzou um múltiplo de 0,01) e é recusado na terça. Isso é problema de
-- resolução, e só resolução resolve. Com 4 casas o limite cai para 0,005 m²,
-- fora do que alguém mede.
--
-- Depois de uma rejeição a deriva residual também fica ≤ 1 ulp: com 4 casas a
-- etapa lê 100,0000 e vira 'Concluído'; com 2 ela podia empacar em 99,99.
--
-- CUSTO, declarado: `alter column type` faz REWRITE da tabela com ACCESS
-- EXCLUSIVE (tabela pequena, segundos) e exige derrubar as views que
-- referenciam a coluna. E `fn_sync_medicao_aprovacao` (20260720140001:39-46)
-- passa a ratear com 4 casas, então `valor_aplicado` de boletins NOVOS bate em
-- centavos diferentes dos antigos — nada retroativo, porque o fan-out é
-- congelado no momento da aprovação, mas some numa conferência manual.
--
-- 2) SÃO QUATRO VIEWS, NÃO TRÊS
-- ------------------------------------------------------------
-- Além das três do cronograma, cai `v_medicao_recente`. O cabeçalho de
-- 20260809163542:26-28 diz que ela "não depende desta view" — verdade, e
-- continua verdade. Mas ela referencia a COLUNA `m.percentual_medido`
-- (20260804110000:232-249), e isso basta para bloquear o `alter column type`.
--
-- `v_medicao_recente` nunca tinha passado por um `drop` (sempre foi
-- `create or replace`). `security_invoker`, `grant` e `comment` NÃO sobrevivem
-- ao drop: se o grant sumir, o feed do painel e a fila "a faturar" do
-- Financeiro ficam vazios para todo mundo menos o dono do banco.
--
-- 3) DE ONDE COPIAR
-- ------------------------------------------------------------
-- As três views do cronograma são copiadas de
-- 20260809163932_fix_wbs_codigo_posicional.sql:25-172, que é a versão VIGENTE —
-- NÃO de 20260809163542. A diferença é a CTE `numerada`, que torna o
-- `wbs_codigo` POSICIONAL; copiar da errada devolveria o valor cru de `ordem` e
-- reabriria o "1.3 no servidor, 1.2 na tela", que só aparece depois que alguém
-- exclui uma etapa do meio.
--
-- Não são tocadas: `v_desvio_categoria_obra`, `v_itens_orcamento` e
-- `v_insumos_projeto` — nenhuma lê `percentual_medido` nem
-- `v_etapas_cronograma`.

drop view if exists public.v_etapa_atrasada;
drop view if exists public.v_resumo_obra;
drop view if exists public.v_etapas_cronograma;
drop view if exists public.v_medicao_recente;

alter table public.medicoes_obra
  alter column percentual_medido type numeric(8,4);

comment on column public.medicoes_obra.percentual_medido is
  'Avanço deste boletim. Continua sendo a única fonte de verdade a jusante (fan-out, avanço físico, faturamento). Digitado no modo percentual; DERIVADO de quantidade_medida por fn_medicao_deriva_percentual quando a etapa tem meta. 4 casas porque a resolução é relativa à meta da etapa — ver 20260815100001.';

-- ------------------------------------------------------------
-- v_etapas_cronograma
-- ------------------------------------------------------------
-- ATENÇÃO — a lista de colunas é EXPLÍCITA de propósito, e esta é a QUARTA vez
-- que a armadilha aparece no repositório (as três primeiras estão documentadas
-- em 20260726120000 e 20260809163542). `select e.*` congela a lista no momento
-- da criação: `quantidade_prevista` e `unidade` não apareceriam, o cliente lê
-- pela view e não pela tabela, e a tela nasceria cega — sem erro nenhum.
create view public.v_etapas_cronograma
with (security_invoker = true) as
with recursive numerada as (
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
  e.quantidade_prevista,
  e.unidade,
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
  -- Mesma regra do percentual (só 'Aprovada'), mas SEM `least`: overrun em
  -- quantidade tem que aparecer na tela, como já aparece em `v_itens_orcamento`
  -- (20260718190003:178). Clampar aqui esconderia justamente o caso que o
  -- override de fn_aprovar_medicao existe para tornar consciente.
  coalesce((
    select sum(m.quantidade_medida) from public.medicoes_obra m
    where m.etapa_id = e.id and m.status = 'Aprovada'
  ), 0) as quantidade_executada,
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
  'Etapas com a árvore da EAP resolvida (nivel, ordem_path, wbs_codigo, eh_folha) e as datas do grupo roladas dos filhos. wbs_codigo é POSICIONAL (1..n entre irmãos), igual a montarArvore no cliente. percentual_executado e status continuam derivando SÓ de percentual_medido de boletim Aprovado — a meta quantitativa é entrada, não fonte de verdade. quantidade_executada não é clampada de propósito. LISTA DE COLUNAS EXPLÍCITA: `select e.*` congela colunas e já causou 3 bugs silenciosos.';

-- ------------------------------------------------------------
-- v_resumo_obra — cópia literal de 20260809163932:97-155
-- ------------------------------------------------------------
-- Zero mudança: `avanco_fisico` continua vindo de percentual_executado, que
-- continua vindo de percentual_medido. É isso que mantém a paridade com
-- src/lib/avanco.ts e o `describe('paridade com v_resumo_obra')` intactos.
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
-- v_etapa_atrasada — cópia literal de 20260809163932:156-172
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- v_medicao_recente — 20260804110000:232-249, mais a quantidade
-- ------------------------------------------------------------
-- Sem `quantidade_medida` e `unidade` aqui, o feed do painel e a fila "a
-- faturar" continuariam anunciando "+1,6667%" para um boletim que a pessoa
-- lançou como "2 m²" — o número certo, na linguagem errada.
create view public.v_medicao_recente
with (security_invoker = true) as
select
  m.id,
  m.projeto_id,
  m.etapa_id,
  e.nome as etapa_nome,
  m.data_medicao,
  m.percentual_medido,
  m.quantidade_medida,
  e.unidade,
  m.observacoes,
  m.status,
  coalesce((
    select sum(mio.valor_aplicado)
    from public.medicao_item_orcamento mio
    where mio.medicao_id = m.id
  ), 0) as valor_medido
from public.medicoes_obra m
left join public.etapas_cronograma e on e.id = m.etapa_id;

comment on view public.v_medicao_recente is
  'Boletins com nome da etapa, unidade e valor aplicado já somado, para o feed do painel pedir .limit(n) em vez de baixar três tabelas inteiras. `unidade` vem da ETAPA e não do boletim: é a meta que define a linguagem da medição.';

-- ------------------------------------------------------------
-- O que o `drop` levou junto
-- ------------------------------------------------------------
-- As views herdam a RLS das tabelas de base (security_invoker, declarado acima
-- em cada uma); `grant` aqui é só o direito de referenciar o nome.
grant select on public.v_etapas_cronograma to authenticated;
grant select on public.v_resumo_obra       to authenticated;
grant select on public.v_etapa_atrasada    to authenticated;
grant select on public.v_medicao_recente   to authenticated;

-- ------------------------------------------------------------
-- fn_aprovar_medicao — a mesma decisão, dita na língua da etapa
-- ------------------------------------------------------------
-- `create or replace` sobre 20260728120000:77-116, mesma assinatura (não
-- repetir o `drop` de lá: ele só foi necessário porque a lista de argumentos
-- tinha mudado).
--
-- O CÁLCULO do bloqueio continua sendo sobre percentual_medido — a fonte de
-- verdade não muda. O que muda é a redação quando a etapa tem meta: "112,000 de
-- 100,000 m²" diz para o engenheiro o que "112%" não diz.
--
-- E o `errcode`: useMedicoes.ts detectava o overrun por
-- `err.message.includes('ultrapassar 100%')`. Reescrever a frase sem mais nada
-- transformaria o diálogo de override num toast de erro genérico, e o
-- `npm run verify` passaria verde. O código 90100 é o contrato de verdade; a
-- substring 'ultrapassar 100' fica na frase de propósito, como rede para o
-- intervalo de deploy em que o servidor está à frente do cliente.
create or replace function public.fn_aprovar_medicao(
  p_medicao_id       uuid,
  p_permitir_overrun boolean default false
)
returns public.medicoes_obra
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med      public.medicoes_obra;
  v_acc      numeric;
  v_prevista numeric;
  v_unidade  text;
  v_qtd_acc  numeric;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Apenas administradores ou gestão podem aprovar medições.';
  end if;

  select * into v_med from public.medicoes_obra where id = p_medicao_id for update;
  if not found then raise exception 'Medição não encontrada.'; end if;
  if v_med.status = 'Aprovada' then raise exception 'Esta medição já está aprovada.'; end if;

  select coalesce(sum(percentual_medido), 0) into v_acc
  from public.medicoes_obra
  where etapa_id = v_med.etapa_id and status = 'Aprovada' and id <> p_medicao_id;

  if (v_acc + v_med.percentual_medido) > 100 and not p_permitir_overrun then
    select e.quantidade_prevista, e.unidade into v_prevista, v_unidade
    from public.etapas_cronograma e where e.id = v_med.etapa_id;

    if v_prevista is not null then
      select coalesce(sum(quantidade_medida), 0) into v_qtd_acc
      from public.medicoes_obra
      where etapa_id = v_med.etapa_id and status = 'Aprovada' and id <> p_medicao_id;

      -- O sinal de % vai concatenado ao número: em plpgsql `%%%` é lido como
      -- `%%` (literal) + `%` (placeholder) e imprimiria "%112.00".
      raise exception
        'A aprovação faria a etapa ultrapassar 100%% do previsto: ficaria em % de % % (acumulado de %). Confirme o override para prosseguir.',
        v_qtd_acc + coalesce(v_med.quantidade_medida, 0), v_prevista, v_unidade,
        round(v_acc + v_med.percentual_medido, 2)::text || '%'
        using errcode = '90100';
    end if;

    raise exception
      'A aprovação faria o acumulado da etapa ultrapassar 100%% (ficaria em %). Confirme o override para prosseguir.',
      round(v_acc + v_med.percentual_medido, 2)
      using errcode = '90100';
  end if;

  update public.medicoes_obra
  set status          = 'Aprovada',
      motivo_rejeicao = null,
      aprovado_por    = auth.uid(),
      aprovado_em     = now()
  where id = p_medicao_id
  returning * into v_med;

  return v_med;
end;
$$;
