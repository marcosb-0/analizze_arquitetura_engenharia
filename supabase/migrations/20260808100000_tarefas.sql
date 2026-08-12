-- ============================================================
-- TAREFAS — o trabalho de escritório que não é obra, proposta nem lançamento
-- ============================================================
-- O app cobre obra, proposta, financeiro, equipe e catálogo. O que ficou de fora
-- é o dia a dia que não pertence a nenhum deles: "renovar o seguro", "levar a ART
-- na prefeitura", "cobrar a medição da Vila Nova". Isso vivia em WhatsApp e na
-- cabeça de alguém — não havia como delegar, nem como saber o que está parado com
-- quem.
--
-- Uma tabela só, lida de dois jeitos pela aplicação: a lista "minhas do dia"
-- (o que é meu e vence hoje ou já venceu) e o quadro kanban por `status`. São a
-- MESMA linha — concluir na lista move o card de coluna no quadro, sem
-- sincronização nenhuma para escrever ou errar.
--
-- ============================================================
-- Decisões de modelagem, e o que foi recusado
-- ============================================================
-- `projeto_id` NULLABLE. A tarefa pode ser da empresa ou de uma obra. Duas
-- tabelas — "tarefa da empresa" e "tarefa da obra" — dobrariam policy, service e
-- tela para uma diferença que cabe numa coluna anulável.
--
-- `prioridade` reusa o vocabulário de `notificacoes` ('Alta'/'Média'/'Baixa',
-- acentuado). Um segundo vocabulário de prioridade no mesmo schema é o tipo de
-- divergência que só aparece no dia em que alguém tenta unir as duas listas.
--
-- SEM coluna `ordem`, e isso é escolha. Soltar o card numa coluna é mudança de
-- `status`, e só. Reordenar DENTRO da coluna exigiria reescrever N linhas a cada
-- arraste e um critério de desempate entre clientes concorrentes; a ordem aqui é
-- derivada (prazo, prioridade, `created_at`) e portanto igual para todo mundo.
--
-- `on delete cascade` em `projeto_id` mas `on delete set null` em
-- `responsavel_id`: excluir a obra leva junto as tarefas dela, que perderam o
-- assunto; já desligar uma pessoa não pode apagar o trabalho — a tarefa fica sem
-- dono e visível para a gestão reatribuir. Perder tarefa por desligamento seria
-- exatamente o modo de falha que este módulo existe para evitar.
--
-- `concluida_em` existe para o card saber a própria idade: a coluna "Feito"
-- mostra só o que fechou há pouco, senão vira um cemitério que cresce para
-- sempre. Quem preenche é a trigger, não a aplicação — pela mesma razão de
-- sempre, o campo passaria a mentir assim que alguém movesse o card por outro
-- caminho (RPC, SQL direto, um segundo cliente).

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  status text not null default 'A fazer'
    check (status in ('A fazer','Fazendo','Em revisão','Concluída')),
  prioridade text not null default 'Média'
    check (prioridade in ('Alta','Média','Baixa')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  criado_por uuid not null default auth.uid() references public.profiles(id),
  projeto_id uuid references public.projetos(id) on delete cascade,
  prazo date,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tarefas is
  'Tarefas do dia a dia da empresa. `projeto_id` nulo = tarefa da empresa; preenchido = tarefa de obra.';
comment on column public.tarefas.prazo is
  'Coluna `date`, não timestamptz: prazo é um dia do calendário, não um instante. No cliente, exibir com formatarDataBR — `new Date(''2026-08-12'')` é lido como UTC e mostra 11/08 no Brasil.';
comment on column public.tarefas.concluida_em is
  'Mantida pela trigger trg_tarefa_estado, nunca pela aplicação.';

-- O índice que serve as duas telas: "as minhas, abertas, por prazo".
create index if not exists tarefas_responsavel_idx on public.tarefas (responsavel_id, status, prazo);
-- Parcial: a maioria das tarefas é da empresa e teria `projeto_id` nulo ocupando
-- o índice sem que ninguém consulte por ele.
create index if not exists tarefas_projeto_idx on public.tarefas (projeto_id) where projeto_id is not null;

-- ============================================================
-- Trigger 1 — o estado derivado
-- ============================================================
create or replace function public.fn_tarefa_estado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();

  if new.status = 'Concluída' then
    -- `coalesce` e não atribuição direta: editar o título de uma tarefa já
    -- concluída não pode rejuvenescer o card e trazê-lo de volta à coluna
    -- "Feito" recente. Num UPDATE, `new` já traz o valor antigo das colunas que
    -- o cliente não mandou, então isto preserva o carimbo original sem precisar
    -- de `old` — que num INSERT não existe e cujo acesso levantaria "record
    -- old is not assigned yet".
    new.concluida_em := coalesce(new.concluida_em, now());
  else
    new.concluida_em := null;
  end if;

  return new;
end;
$$;

-- Trigger-only: ninguém deve poder invocá-la como RPC pelo PostgREST.
revoke execute on function public.fn_tarefa_estado() from anon, authenticated, public;

create trigger trg_tarefa_estado
  before insert or update on public.tarefas
  for each row execute function public.fn_tarefa_estado();

-- ============================================================
-- Trigger 2 — `campo` só muda a situação
-- ============================================================
-- RLS **não restringe colunas** — a lição de 20260802100000. A policy de update
-- do `campo` garante que a linha é dele, e nada mais: sem esta trigger ele
-- poderia reescrever o título, mudar o prazo ou reatribuir a tarefa a outra
-- pessoa, tudo dentro da própria policy.
--
-- SECURITY DEFINER porque o corpo chama fn_current_role(), que lê `profiles` —
-- um guard que consulta tabela com RLS e não é DEFINER não dispara, em silêncio,
-- justamente para o papel que devia barrar (20260729120001; já custou 2 episódios).
create or replace function public.fn_tarefa_campo_so_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- O `coalesce` é obrigatório (20260719130001, 20260802100002): sem ele
  -- fn_current_role() NULL faz `NULL = 'campo'` valer NULL — não FALSE, mas
  -- também não TRUE —, e o `if` não dispara. Aqui o efeito seria benigno por
  -- acidente; escrever sem o coalesce é que faz o padrão errado sobreviver.
  if coalesce(public.fn_current_role(), '') <> 'campo' then
    return new;
  end if;

  if new.titulo         is distinct from old.titulo
     or new.descricao      is distinct from old.descricao
     or new.prioridade     is distinct from old.prioridade
     or new.prazo          is distinct from old.prazo
     or new.responsavel_id is distinct from old.responsavel_id
     or new.projeto_id     is distinct from old.projeto_id
     or new.criado_por     is distinct from old.criado_por
  then
    raise exception
      'Sua função permite apenas mudar a situação da tarefa, não editá-la ou repassá-la.';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_tarefa_campo_so_status() from anon, authenticated, public;

-- Roda ANTES de trg_tarefa_estado (o Postgres ordena triggers de mesmo timing
-- pelo nome, e `campo_so_status` < `estado`), então compara new×old ainda como o
-- cliente mandou. Não que fizesse diferença — as duas colunas que a outra
-- trigger mexe estão fora da lista acima de propósito.
create trigger trg_tarefa_campo_so_status
  before update on public.tarefas
  for each row execute function public.fn_tarefa_campo_so_status();

-- ============================================================
-- RLS
-- ============================================================
alter table public.tarefas enable row level security;

drop policy if exists "admin_all_tarefas" on public.tarefas;
create policy "admin_all_tarefas" on public.tarefas for all
  using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_tarefas" on public.tarefas;
create policy "gestao_all_tarefas" on public.tarefas for all
  using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- `financeiro` opera a própria pauta: o que ele criou e o que mandaram para ele.
-- Não é o escritório inteiro porque a lista dele não deve encher com a rotina de
-- obra que não lhe diz respeito.
drop policy if exists "financeiro_all_tarefas" on public.tarefas;
create policy "financeiro_all_tarefas" on public.tarefas for all
  using (
    public.fn_current_role() = 'financeiro'
    and (criado_por = auth.uid() or responsavel_id = auth.uid())
  )
  with check (
    public.fn_current_role() = 'financeiro'
    and (criado_por = auth.uid() or responsavel_id = auth.uid())
  );

-- ATENÇÃO ao nome: `campo_select_*` neste repo costuma significar "leitura que
-- não checa papel", alcançando os 4 (ver campo_select_etapas_cronograma e o
-- comentário longo em src/constants/tabAccess.ts). ESTA aqui é o contrário —
-- tem `fn_current_role() = 'campo'` explícito e alcança só o campo. Dito por
-- extenso porque é justamente neste ponto que a matriz já foi lida errado.
drop policy if exists "campo_select_tarefas" on public.tarefas;
create policy "campo_select_tarefas" on public.tarefas for select
  using (public.fn_current_role() = 'campo' and responsavel_id = auth.uid());

-- `with check` repete a condição do `using` de propósito: sem ele o campo
-- passaria a tarefa adiante e ela sumiria da vista dele — um "concluído" que na
-- verdade é um repasse. Com ele, o servidor recusa.
drop policy if exists "campo_update_tarefas" on public.tarefas;
create policy "campo_update_tarefas" on public.tarefas for update
  using (public.fn_current_role() = 'campo' and responsavel_id = auth.uid())
  with check (public.fn_current_role() = 'campo' and responsavel_id = auth.uid());

-- `campo` não recebe insert nem delete: ele executa a pauta, não a define.

-- ============================================================
-- fn_pessoas_atribuiveis — o seletor de responsável
-- ============================================================
-- SEM ISTO O MÓDULO NASCE QUEBRADO, e do jeito pior. `financeiro` e `campo` não
-- têm nenhuma policy de SELECT em `profiles`: enxergam só a própria linha. O
-- seletor "Responsável" viria VAZIO — sem erro, sem log, sem nada. É o mesmo
-- modo de falha de 20260804100000, onde a ausência de uma policy não barrou tela
-- nenhuma e apenas corrompeu um número em silêncio.
--
-- POR QUE NÃO ALARGAR A POLICY DE `profiles`: RLS não filtra coluna. Uma policy
-- de select para os 4 papéis daria a todo mundo o `email`, o `role` e o
-- `funcionario_id` de todo mundo — e `funcionario_id` é a ponte para a folha de
-- pagamento. Para preencher um <select> de nomes, seria pagar caro demais.
--
-- Um único caminho para os 4 papéis, e não "admin lê profiles, os outros usam a
-- RPC": duas fontes para a mesma lista divergem, e a que só um papel exercita é
-- a que quebra sem ninguém ver.
create or replace function public.fn_pessoas_atribuiveis()
returns table (id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    -- Cadastro recém-criado ainda não tem `full_name`; sem o fallback a pessoa
    -- aparece como linha em branco no seletor e ninguém sabe quem é.
    coalesce(nullif(trim(p.full_name), ''), p.email, 'Sem nome'),
    p.role
  from public.profiles p
  where p.active
  order by 2;
$$;

comment on function public.fn_pessoas_atribuiveis() is
  'Id, nome de exibição e papel dos acessos ativos, para o seletor de responsável de tarefa. SECURITY DEFINER porque financeiro e campo não leem profiles; devolve só estas 3 colunas justamente para não expor email/funcionario_id alargando a policy da tabela.';

revoke execute on function public.fn_pessoas_atribuiveis() from anon, public;
grant execute on function public.fn_pessoas_atribuiveis() to authenticated;
