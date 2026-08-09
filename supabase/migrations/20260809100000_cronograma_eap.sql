-- ============================================================
-- CRONOGRAMA VIRA EAP — hierarquia, ordem própria e marcos
-- ============================================================
-- `etapas_cronograma` tinha nome, duas datas e um encarregado. Toda etapa era
-- irmã de toda etapa, e a única ordem existente era `order by data_inicio, id` —
-- derivada, portanto impossível de ajustar à mão. Uma obra não é uma lista plana
-- de cinco itens: é uma Estrutura Analítica de Projeto, com grupos ("Estrutura")
-- e frentes dentro deles ("Fôrma", "Armação", "Concretagem"). Sem hierarquia e
-- sem ordem não há como planejar, e a tela só conseguia listar.
--
-- Este arquivo dá à etapa: pai, ordem entre irmãos, marco, modo de agendamento
-- e linha de base. As dependências entre atividades vêm no arquivo seguinte —
-- são outra tabela e outro invariante, e esta migration precisa poder ser
-- aplicada sozinha.
--
-- ============================================================
-- Decisões de modelagem, e o que foi recusado
-- ============================================================
-- `ordem` INTEIRA E DENSA, não fracionária. Uma obra tem dezenas de etapas:
-- renumerar a lista de irmãos inteira cabe num `update ... from
-- jsonb_to_recordset` e devolve uma ordem canônica, sem buracos e igual em
-- qualquer cliente. Ordem fracionária (ponto médio entre vizinhos) evita a
-- reescrita mas acumula perda de precisão e produz ordens diferentes em clientes
-- concorrentes.
--
-- Isto CONTRADIZ a decisão registrada em 20260808100000_tarefas.sql ("SEM coluna
-- `ordem`, e isso é escolha"), e a contradição é o ponto. Lá a ordem era
-- derivável — prazo, prioridade, `created_at` — e portanto igual para todo
-- mundo. Aqui a ordem É a EAP: é informação que só quem planeja tem, não deriva
-- de nada, e duas pessoas ordenando a mesma obra querem ver a mesma coisa.
--
-- SEM coluna `wbs` armazenada. O código "1.2.3" é derivado da árvore na view.
-- Guardá-lo obrigaria a reescrever todos os descendentes a cada reordenação de
-- um irmão, e o valor ficaria errado no instante em que alguém inserisse uma
-- linha por SQL direto.
--
-- SEM coluna `duracao_dias`. Início, fim e duração são três campos para dois
-- graus de liberdade — um gerador de divergência. A duração é calculada em dias
-- úteis por `src/lib/cronograma/calendario.ts`. Coluna gerada também não serve:
-- com feriados a função deixa de ser IMMUTABLE.
--
-- `agendamento` nasce 'manual' para TODAS as etapas, inclusive as existentes.
-- Uma etapa automática é movida pelas predecessoras dela; ligar isso de repente
-- em cronogramas já preenchidos mudaria datas que alguém digitou. Quem quiser o
-- reagendamento automático liga etapa a etapa, de propósito.
--
-- `baseline_*` na própria linha, e não uma tabela de versões. A pergunta que a
-- obra faz é "atrasou quanto em relação ao combinado", uma comparação com UMA
-- linha de base — a vigente. Histórico de replanejamentos é outro recurso, e
-- guardá-lo aqui custaria uma tabela e um join para responder a mesma pergunta.
--
-- `on delete cascade` no `parent_id`: excluir um grupo leva as frentes dentro
-- dele. É o que a árvore significa, e a alternativa (`set null`) largaria as
-- filhas na raiz sem que ninguém percebesse.

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------
alter table public.etapas_cronograma
  add column parent_id uuid references public.etapas_cronograma(id) on delete cascade,
  add column ordem integer not null default 0,
  add column eh_marco boolean not null default false,
  add column agendamento text not null default 'manual'
    check (agendamento in ('manual','automatico')),
  add column baseline_inicio date,
  add column baseline_fim date,
  add column baseline_em timestamptz,
  add column baseline_por uuid references public.profiles(id) on delete set null;

comment on column public.etapas_cronograma.parent_id is
  'Etapa-grupo à qual esta pertence. NULL = raiz da EAP. Só etapa-FOLHA vincula orçamento e recebe medição — ver fn_execucao_so_em_folha.';
comment on column public.etapas_cronograma.ordem is
  'Posição entre os irmãos, densa e começando em 1. É a ordem da EAP, não uma preferência de exibição.';
comment on column public.etapas_cronograma.agendamento is
  'automatico = as datas seguem as predecessoras; manual = a data foi fixada por alguém e o motor não a move (só acusa conflito).';

-- Toda etapa existente vira raiz, na ordem que a tela já mostrava
-- (cronogramaService.list ordenava por data_inicio, id).
update public.etapas_cronograma e
   set ordem = s.n
  from (
    select id,
           row_number() over (partition by projeto_id
                              order by data_inicio nulls last, id) as n
      from public.etapas_cronograma
  ) s
 where s.id = e.id;

-- `deferrable initially deferred` é obrigatório: reordenar irmãos troca valores
-- dentro da mesma transação e passa por estados temporariamente duplicados.
-- `nulls not distinct` porque as raízes têm parent_id NULL e, sem isso, o unique
-- simplesmente não as cobriria.
alter table public.etapas_cronograma
  add constraint etapas_ordem_unica
    unique nulls not distinct (projeto_id, parent_id, ordem)
    deferrable initially deferred;

-- Marco é um instante, não um período. As duas datas podem ser NULL (marco ainda
-- sem data), mas se existirem têm de coincidir.
alter table public.etapas_cronograma
  add constraint etapas_marco_um_dia
    check (not eh_marco or data_inicio = data_fim);

create index etapas_cronograma_outline_idx
  on public.etapas_cronograma (projeto_id, parent_id, ordem);
create index etapas_cronograma_pai_idx
  on public.etapas_cronograma (parent_id) where parent_id is not null;

-- `ordem` nasce no fim da lista de irmãos quando ninguém a informa.
--
-- Sem isto, o `default 0` mais o unique acima QUEBRARIAM a criação de obra:
-- fn_criar_projeto_manual e fn_criar_projeto_from_proposta inserem cinco etapas
-- de uma vez sem informar ordem, as cinco sairiam com 0, e a segunda linha já
-- violaria a constraint. As duas RPCs continuam intocadas por causa desta
-- trigger — e é ela também que torna seguro um insert por SQL direto.
create or replace function public.fn_etapa_ordem_padrao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ordem is null or new.ordem = 0 then
    select coalesce(max(ordem), 0) + 1 into new.ordem
      from public.etapas_cronograma
     where projeto_id = new.projeto_id
       and parent_id is not distinct from new.parent_id;
  end if;
  return new;
end;
$$;

create trigger trg_etapa_ordem_padrao
  before insert on public.etapas_cronograma
  for each row execute function public.fn_etapa_ordem_padrao();

-- ------------------------------------------------------------
-- 2. Integridade da árvore
-- ------------------------------------------------------------
-- Todas SECURITY DEFINER pela lição de 20260804100000: guarda que lê uma tabela
-- sem policy para o papel que está escrevendo não dispara — e não dispara EM
-- SILÊNCIO, deixando passar exatamente o que ela existe para barrar.

create or replace function public.fn_etapa_hierarquia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pai_projeto uuid;
  v_profundidade int;
  v_ciclo boolean;
begin
  -- `projeto_id` imutável. Nunca foi necessário antes e passa a ser: é ele que
  -- sustenta o `projeto_id` denormalizado de etapa_dependencia (arquivo
  -- seguinte). Sem esta guarda, mover uma etapa de obra deixaria dependências
  -- apontando para o projeto errado — e a RLS passaria a autorizar pela obra
  -- errada, que é falha de acesso, não de exibição.
  if tg_op = 'UPDATE' and new.projeto_id is distinct from old.projeto_id then
    raise exception 'Uma etapa não pode mudar de obra.';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Uma etapa não pode ser subetapa de si mesma.';
  end if;

  select projeto_id into v_pai_projeto
    from public.etapas_cronograma where id = new.parent_id;

  if v_pai_projeto is null then
    raise exception 'A etapa-grupo informada não existe.';
  end if;
  if v_pai_projeto <> new.projeto_id then
    raise exception 'A etapa-grupo pertence a outra obra.';
  end if;

  -- Sobe do pai até a raiz de uma vez só, colhendo profundidade E ciclo.
  --
  -- O ciclo importa mais do que parece: a CTE da view desce a partir das raízes,
  -- então um ramo que aponta para si mesmo não fica "errado" — ele DESAPARECE
  -- da árvore inteira, e a obra passa a mostrar um cronograma vazio sem erro
  -- nenhum. O `nivel < 20` é o cinto extra caso um ciclo já exista nos dados.
  with recursive sobe as (
    select id, parent_id, 1 as nivel
      from public.etapas_cronograma
     where id = new.parent_id
    union all
    select e.id, e.parent_id, s.nivel + 1
      from public.etapas_cronograma e
      join sobe s on e.id = s.parent_id
     where s.nivel < 20
  )
  select max(nivel), bool_or(id = new.id)
    into v_profundidade, v_ciclo
    from sobe;

  if v_ciclo then
    raise exception 'Isto colocaria a etapa dentro de uma subetapa dela mesma.';
  end if;
  if v_profundidade > 3 then
    raise exception 'A EAP aceita no máximo 4 níveis.';
  end if;

  return new;
end;
$$;

-- Uma etapa vira grupo quando OUTRA linha passa a apontar para ela. Por isso a
-- checagem mora aqui e olha `new.parent_id` — não há evento na linha do futuro
-- grupo para observar.
create or replace function public.fn_etapa_pai_sem_execucao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  if new.parent_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  select nome into v_nome from public.etapas_cronograma where id = new.parent_id;

  if exists (select 1 from public.etapa_orcamento_vinculo v where v.etapa_id = new.parent_id) then
    raise exception
      'A etapa "%" tem orçamento vinculado e por isso não pode virar grupo. Remova os vínculos dela, ou crie a subetapa dentro de outra.', v_nome;
  end if;

  if exists (select 1 from public.medicoes_obra m where m.etapa_id = new.parent_id) then
    raise exception
      'A etapa "%" já tem boletim de medição e por isso não pode virar grupo. Grupo é soma das frentes; medir os dois contaria o mesmo serviço duas vezes.', v_nome;
  end if;

  return new;
end;
$$;

-- O mesmo invariante visto do outro lado, e as DUAS são necessárias: acima o
-- evento é "alguém virou meu filho", aqui é "alguém tentou medir/vincular". Ter
-- só uma deixa o buraco aberto pelo outro caminho — a lição de 20260803100001.
create or replace function public.fn_execucao_so_em_folha()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  if exists (select 1 from public.etapas_cronograma f where f.parent_id = new.etapa_id) then
    select nome into v_nome from public.etapas_cronograma where id = new.etapa_id;
    raise exception
      'A etapa "%" é um grupo da EAP: orçamento e medição pertencem às frentes dentro dela. Medir o grupo faria fn_apply_medicao aplicar o mesmo valor duas vezes no item de orçamento.', v_nome;
  end if;
  return new;
end;
$$;

create trigger trg_etapa_hierarquia
  before insert or update on public.etapas_cronograma
  for each row execute function public.fn_etapa_hierarquia();

create trigger trg_etapa_pai_sem_execucao
  before insert or update on public.etapas_cronograma
  for each row execute function public.fn_etapa_pai_sem_execucao();

create trigger trg_vinculo_so_em_folha
  before insert or update on public.etapa_orcamento_vinculo
  for each row execute function public.fn_execucao_so_em_folha();

create trigger trg_medicao_so_em_folha
  before insert or update on public.medicoes_obra
  for each row execute function public.fn_execucao_so_em_folha();

-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. fn_aplicar_cronograma — a escrita em lote
-- ------------------------------------------------------------
-- Reordenar irmãos NÃO cabe em updates soltos, e o motivo é o
-- `deferrable initially deferred` lá em cima: ele adia a checagem do unique até
-- o fim da TRANSAÇÃO, e cada chamada do PostgREST é uma transação própria.
-- Trocar a etapa 2 com a 3 em duas chamadas colide na primeira delas. Mover uma
-- etapa de posição também renumera os irmãos — são N linhas que só fazem sentido
-- juntas.
--
-- Daí uma RPC que recebe o DIFF e o aplica numa transação. Ela nasce aqui com
-- dois conjuntos (`etapas` e `ordens`) e ganha `dep_criadas`/`dep_removidas` no
-- arquivo de dependências — mesma função, mesmo contrato, sem uma segunda porta
-- de escrita para manter em paralelo.
--
-- SECURITY INVOKER, e aqui é o oposto de fn_has_projeto_access: as policies de
-- `etapas_cronograma` SÃO a definição de quem pode planejar. DEFINER contornaria
-- exatamente a regra que se quer aplicar. A guarda de papel explícita abaixo é
-- redundante com a RLS de propósito — ela produz uma mensagem legível em vez de
-- "0 linhas afetadas".
create or replace function public.fn_aplicar_cronograma(
  p_projeto_id uuid,
  p_mudancas   jsonb,
  p_versao     timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_versao_atual timestamptz;
  v_esperado int;
  v_afetado  int;
begin
  -- `coalesce` obrigatório: sem profile, fn_current_role() devolve NULL,
  -- `NULL not in (...)` vale NULL e o IF simplesmente não dispara. Já custou uma
  -- correção inteira em 20260719130001.
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Seu perfil não pode editar o cronograma desta obra.';
  end if;

  -- Concorrência otimista. Sem isto, dois planejadores na mesma obra se
  -- sobrescrevem em silêncio: cada um manda um diff calculado sobre um estado
  -- que o outro já mudou, e o último a salvar vence sem que ninguém veja.
  -- `is distinct from` e não `>`: uma exclusão ABAIXA o max(updated_at), e a
  -- comparação por maior deixaria esse caso passar.
  select max(updated_at) into v_versao_atual
    from public.etapas_cronograma where projeto_id = p_projeto_id;

  if p_versao is not null and v_versao_atual is distinct from p_versao then
    raise exception 'O cronograma foi alterado por outra pessoa enquanto você editava. Recarregue a obra antes de salvar.';
  end if;

  -- 1) Datas, marco e modo de agendamento.
  --    `percentual_executado` e `status` não estão aqui e nunca estarão: são
  --    derivados de medição aprovada e não têm caminho de escrita (fix #1).
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'etapas'), 0);
  if v_esperado > 0 then
    update public.etapas_cronograma e
       set data_inicio = m.data_inicio,
           data_fim    = m.data_fim,
           agendamento = coalesce(m.agendamento, e.agendamento),
           eh_marco    = coalesce(m.eh_marco, e.eh_marco)
      from jsonb_to_recordset(p_mudancas -> 'etapas')
        as m(id uuid, data_inicio date, data_fim date, agendamento text, eh_marco boolean)
     where e.id = m.id
       and e.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    -- Esta contagem é o `garantirEscrita` (src/services/escrita.ts) trazido para
    -- dentro da transação, e faz DUAS coisas: pega a linha recusada pela RLS
    -- (que sob PostgREST volta como 200 e faz a tela comemorar), e pega o id que
    -- não pertence a esta obra — o buraco que fn_medicao_etapa_do_projeto fechou
    -- em 20260803100001. Um payload forjado reescreveria o cronograma alheio.
    if v_afetado <> v_esperado then
      raise exception
        'Cronograma não gravado: % de % etapas foram alcançadas. Alguma não pertence a esta obra ou seu perfil não pode alterá-la.',
        v_afetado, v_esperado;
    end if;
  end if;

  -- 2) Posição na EAP. `parent_id` e `ordem` sempre juntos: mover uma etapa
  --    renumera a lista de irmãos de origem E a de destino.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'ordens'), 0);
  if v_esperado > 0 then
    update public.etapas_cronograma e
       set parent_id = o.parent_id,
           ordem     = o.ordem
      from jsonb_to_recordset(p_mudancas -> 'ordens')
        as o(id uuid, parent_id uuid, ordem integer)
     where e.id = o.id
       and e.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception
        'Reordenação não gravada: % de % etapas foram alcançadas. Alguma não pertence a esta obra ou seu perfil não pode alterá-la.',
        v_afetado, v_esperado;
    end if;
  end if;

  -- Devolve o estado autoritativo: o cliente descarta o palpite otimista e fica
  -- com wbs_codigo, eh_folha, nivel e status recalculados pela view.
  return jsonb_build_object(
    'etapas', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.ordem_path, v.id)
        from public.v_etapas_cronograma v
       where v.projeto_id = p_projeto_id
    ), '[]'::jsonb),
    'versao', (
      select max(updated_at) from public.etapas_cronograma where projeto_id = p_projeto_id
    )
  );
end;
$$;

comment on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) is
  'Aplica um diff de cronograma (datas + posição na EAP) numa transação só. Existe porque reordenar irmãos esbarra no unique deferrable, que só relaxa DENTRO de uma transação — e o PostgREST abre uma por chamada. Ganha dep_criadas/dep_removidas em 20260809110000.';

grant execute on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 5. fn_salvar_baseline — congela o plano vigente
-- ------------------------------------------------------------
-- A linha de base é o "combinado" contra o qual o replanejamento é medido: sem
-- ela, um cronograma que escorrega três semanas em três meses parece sempre em
-- dia, porque as datas de referência escorregam junto.
--
-- Uma linha de base só, sobrescrita a cada chamada — não um histórico de
-- versões. A pergunta que a obra faz é "atrasou quanto em relação ao que foi
-- combinado", e ela é sobre a base VIGENTE. Guardar todas exigiria uma tabela e
-- um join para responder a mesma coisa.
create or replace function public.fn_salvar_baseline(p_projeto_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Seu perfil não pode salvar a linha de base desta obra.';
  end if;

  update public.etapas_cronograma
     set baseline_inicio = data_inicio,
         baseline_fim    = data_fim,
         baseline_em     = now(),
         baseline_por    = auth.uid()
   where projeto_id = p_projeto_id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.fn_salvar_baseline(uuid) is
  'Congela data_inicio/data_fim de todas as etapas da obra como linha de base. Sobrescreve a anterior: a comparação que interessa é com o plano vigente.';

grant execute on function public.fn_salvar_baseline(uuid) to authenticated;
