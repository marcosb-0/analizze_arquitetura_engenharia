-- ============================================================
-- RESUMO POR OBRA — a metade que faltava do §4.2
-- ============================================================
-- O item 23 da auditoria (§15, Fase 2) ficou pendente com o motivo escrito: a
-- INCORREÇÃO do §4.2 foi corrigida em 29/jul (`buscarTudo` paginou as 16
-- leituras, e os números pararam de mentir a partir da linha 1001), mas o TETO
-- DE MEMÓRIA continuou. O painel de indicadores e a lista de obras baixavam
-- `v_itens_orcamento`, `v_etapas_cronograma`, `etapa_orcamento_vinculo`,
-- `medicoes_obra` e `medicao_item_orcamento` INTEIRAS — todas as obras, linha a
-- linha — para somar no cliente.
--
-- Duas telas precisam de número por obra e nunca precisaram das linhas:
--
--   * `DashboardOverview` — total orçado/contratado/executado, avanço físico
--     médio, desvio por categoria, atividades atrasadas;
--   * `ProjetosTab` — barra de avanço, distintivos de risco e a contagem do
--     diálogo de exclusão.
--
-- Este arquivo move essas quatro perguntas para o servidor. São views, não
-- funções: a resposta muda a cada medição aprovada e não há nada a materializar.
--
-- ============================================================
-- Por que `security_invoker` e não SECURITY DEFINER
-- ============================================================
-- `fn_resultado_obra` é DEFINER porque atravessa `lancamentos_financeiros`, que
-- `gestao` não pode ler — uma view invoker somaria zero e diria que nenhuma obra
-- faturou nada (ver o cabeçalho de 20260731150000).
--
-- Aqui é o oposto, e a distinção é o ponto: estas views leem EXATAMENTE as
-- mesmas views e tabelas que o cliente já lia para fazer a mesma conta. Com
-- `security_invoker` o resultado é, por construção, idêntico ao que cada papel
-- via antes — inclusive a queda para média simples de quem não enxerga
-- `etapa_orcamento_vinculo`. Abrir isto com DEFINER não corrigiria nada e
-- passaria a mostrar, agregado, número de obra que o papel não pode abrir.
--
-- O corolário incômodo continua valendo e está registrado no §11.8: papel sem
-- policy numa das pontas recebe número menor, não erro. Foi o que fez o avanço
-- físico divergir 20% vs 4% por papel até 20260804100000. A regra ao conferir a
-- matriz de acesso é olhar as tabelas SEM política, não as com.
--
-- ============================================================
-- Fidelidade a `src/lib/avanco.ts`
-- ============================================================
-- `avanco_fisico` reimplementa `calcularAvancoFisico` em SQL, e uma divergência
-- aqui reapareceria como "a mesma obra com dois números em duas telas" — o
-- defeito que aquele arquivo existe para ter matado. As três regras dele estão
-- reproduzidas uma a uma abaixo, e `src/lib/avanco.test.ts` guarda o contrato do
-- lado do cliente:
--
--   1. sem etapas          → 0
--   2. peso total zero     → média simples de `percentual_executado`
--   3. caso normal         → média ponderada por (peso% × valor_orcado do item)
--
-- `round()` do Postgres arredonda meio para longe do zero e `Math.round` do JS
-- arredonda meio para cima; percentual é sempre não-negativo, então os dois
-- concordam em todo o domínio de entrada.

-- ============================================================
-- 1) v_resumo_obra — uma linha por obra
-- ============================================================
create or replace view public.v_resumo_obra
with (security_invoker = true) as
select
  p.id as projeto_id,

  orc.itens_total,
  orc.valor_orcado,
  orc.valor_contratado,
  orc.valor_executado,
  -- Não existe coluna de "aditivos" aqui de propósito: `alteracoes_orcamento` é
  -- log de inserção de item, não aditivo de contrato, e somá-la ao orçado
  -- contaria cada item duas vezes. O porquê está na nota da view de desvio.
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

-- Cada agregado é subconsulta lateral própria, e não um FROM com quatro joins:
-- juntar itens, etapas e medições no mesmo produto multiplicaria as linhas e
-- inflaria TODAS as somas. É a mesma nota do corpo de `fn_resultado_obra`.
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
    -- `io.projeto_id = p.id` não é redundante com o vínculo: o cliente montava
    -- `orcadoPorItem` só com os itens DA OBRA e caía no `?? 0` para qualquer
    -- vínculo que apontasse para fora. Sem esta linha, um vínculo cruzado
    -- passaria a pesar aqui e não lá — e as duas telas voltariam a discordar.
    select coalesce(sum((v.peso_percentual / 100) * io.valor_orcado), 0) as peso
    from public.etapa_orcamento_vinculo v
    join public.v_itens_orcamento io
      on io.id = v.item_orcamento_id and io.projeto_id = p.id
    where v.etapa_id = e.id
  ) pe
  where e.projeto_id = p.id
) cro

cross join lateral (
  select
    count(*)                                       as medicoes_total,
    count(*) filter (where m.status = 'Pendente')  as medicoes_pendentes
  from public.medicoes_obra m
  where m.projeto_id = p.id
) med;

comment on view public.v_resumo_obra is
  'Uma linha por obra com os agregados que o painel e a lista de obras somavam no cliente (§4.2). security_invoker de propósito: o número é o que ESTE papel enxerga, igual ao que a conta no cliente dava. avanco_fisico espelha src/lib/avanco.ts.';

-- ============================================================
-- 2) v_desvio_categoria_obra — só as categorias estouradas
-- ============================================================
-- O cartão "Desvio Orçamentário Crítico" varria projeto × categoria no cliente
-- e descartava tudo que estava dentro do planejado. O filtro cabe no servidor, e
-- o que sobe é só o que a tela desenha.
--
-- `planejado > 0` reproduz a guarda do cliente: categoria sem orçamento (só
-- supressão, ou nada) não é estouro, é dado incompleto — e sem a guarda toda
-- execução em categoria zerada apareceria como desvio crítico.
--
-- SOBRE O TERMO DAS ALTERAÇÕES — verificado, e não é o que o nome sugere.
--
-- O cliente somava `alteracoes_orcamento` casando `a.item = categoria`, e essa
-- soma É SEMPRE ZERO hoje. `alteracoes_orcamento.item` guarda a DESCRIÇÃO do
-- item ("Pedreiro (1 un)"), não a categoria: quem escreve a tabela é o gatilho
-- `trg_log_item_orcamento_insert` (20260719160002), que registra
-- `new.descricao`. Conferido nas 3 linhas do banco — nenhuma casa com
-- 'Terceiros' ou 'Mão de Obra'.
--
-- E é bom que não case. Toda linha de `alteracoes_orcamento` hoje é o log de uma
-- INSERÇÃO de item, com o mesmo `valor_orcado` que já entrou em
-- `sum(io.valor_orcado)`. Se o casamento funcionasse, o planejado contaria cada
-- item duas vezes e o painel deixaria de acusar estouros reais.
--
-- Ou seja: a tabela é um livro de auditoria de itens, não um fluxo de aditivos
-- de contrato — não existe tela que registre alteração à mão (o console só a
-- LISTA, em `AbaOrcamento`), e `handleAddAlteracaoOrcamento` não tem chamador.
-- O termo fica no lugar para preservar exatamente a semântica do cliente: se
-- algum dia passar a existir aditivo por categoria, as duas telas mudam juntas.
-- Ver o registro no §4.2 de docs/auditoria-completa.md.
create or replace view public.v_desvio_categoria_obra
with (security_invoker = true) as
select
  c.projeto_id,
  c.categoria,
  c.planejado,
  c.executado,
  c.executado - c.planejado as excesso
from (
  select
    io.projeto_id,
    io.categoria,
    sum(io.valor_orcado) + coalesce((
      -- `alteracoes_orcamento.item` guarda o NOME da categoria, não uma FK. É
      -- assim desde 20260718190003 e o cliente casava do mesmo jeito.
      select sum(case when a.tipo = 'Aumento' then a.valor else -a.valor end)
      from public.alteracoes_orcamento a
      where a.projeto_id = io.projeto_id and a.item = io.categoria
    ), 0) as planejado,
    sum(io.valor_executado) as executado
  from public.v_itens_orcamento io
  group by io.projeto_id, io.categoria
) c
where c.planejado > 0
  and c.executado > c.planejado;

comment on view public.v_desvio_categoria_obra is
  'Categorias cujo executado passou do orçado + alterações. Já filtrada: cada linha é uma linha do cartão de desvio do painel.';

-- ============================================================
-- 3) v_etapa_atrasada — as atividades vencidas
-- ============================================================
-- `dias_atraso` sai daqui porque o cliente o calculava com `new Date()` sobre
-- uma coluna `date` — a armadilha de fuso que já errou em 9 telas e que
-- `formatarDataBR` existe para evitar. `current_date - data_fim` é aritmética de
-- data no servidor: inteiro de dias, sem hora e sem fuso no meio.
--
-- Não é o mesmo conjunto de `v_resumo_obra.etapas_atrasadas`, e a diferença é
-- de propósito: aquele conta o `status` derivado da view de etapas (que exige
-- < 100% de medição APROVADA); este repete a regra que o painel usava — a
-- própria `v_etapas_cronograma` já resolve `percentual_executado` contando só
-- medição aprovada, então as duas contas coincidem, e o filtro explícito abaixo
-- mantém a equivalência visível em vez de implícita.
create or replace view public.v_etapa_atrasada
with (security_invoker = true) as
select
  e.id          as etapa_id,
  e.projeto_id,
  e.nome        as etapa_nome,
  e.data_fim,
  (current_date - e.data_fim)::int as dias_atraso
from public.v_etapas_cronograma e
where e.percentual_executado < 100
  and e.data_fim is not null
  and e.data_fim < current_date;

comment on view public.v_etapa_atrasada is
  'Etapas com prazo vencido e execução abaixo de 100%. dias_atraso vem do servidor: a coluna é `date` e calcular no cliente com new Date() atrasa um dia.';

-- ============================================================
-- 4) v_medicao_recente — o feed do painel, com o que ele mostra
-- ============================================================
-- O feed renderiza TRÊS boletins e, para cada um, o nome da etapa e o valor
-- medido. Para chegar aos três, o painel baixava `medicoes_obra`,
-- `medicao_item_orcamento` (uma linha por item de orçamento POR medição — a que
-- estoura primeiro) e `etapas_cronograma` inteiras.
--
-- Com a view, `.order('data_medicao').limit(3)` resolve no servidor.
create or replace view public.v_medicao_recente
with (security_invoker = true) as
select
  m.id,
  m.projeto_id,
  m.etapa_id,
  e.nome as etapa_nome,
  m.data_medicao,
  m.percentual_medido,
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
  'Boletins com nome da etapa e valor aplicado já somado, para o feed do painel pedir .limit(n) em vez de baixar três tabelas inteiras.';

-- ============================================================
-- Índice
-- ============================================================
-- `v_medicao_recente` é sempre lida em ordem decrescente de data com limite. Os
-- demais filtros por obra já estão cobertos por 20260803100000, que criou os
-- índices de `projeto_id` justamente para "toda leitura escopada da Fase 2".
create index if not exists medicoes_obra_data_desc_idx
  on public.medicoes_obra (data_medicao desc, id);

-- As views herdam a RLS das tabelas de base (security_invoker); `grant` aqui é
-- só o direito de referenciar o nome, como nas demais views do repo.
grant select on public.v_resumo_obra           to authenticated;
grant select on public.v_desvio_categoria_obra to authenticated;
grant select on public.v_etapa_atrasada        to authenticated;
grant select on public.v_medicao_recente       to authenticated;
