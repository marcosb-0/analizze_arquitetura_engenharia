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
