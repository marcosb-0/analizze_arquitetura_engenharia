-- ============================================================
-- DEPENDÊNCIAS ENTRE ATIVIDADES — o sequenciamento
-- ============================================================
-- A EAP (20260809100000) organizou as etapas em árvore, mas a árvore diz
-- CONTINÊNCIA, não ordem: "Reboco está dentro de Acabamento" não é a mesma
-- informação que "Reboco só começa quando a Alvenaria termina". A segunda é a
-- que faz um cronograma valer alguma coisa — é dela que saem o replanejamento
-- em cascata e o caminho crítico.
--
-- Uma tabela de arestas, quatro tipos de vínculo (FS/SS/FF/SF) e um atraso em
-- dias. O cálculo em si (forward pass, folga, caminho crítico) roda no CLIENTE,
-- em `src/lib/cronograma/` — ver a justificativa no fim deste cabeçalho.
--
-- ============================================================
-- Decisões de modelagem, e o que foi recusado
-- ============================================================
-- `projeto_id` DENORMALIZADO, e esta é a decisão mais importante do arquivo.
--
-- `etapa_orcamento_vinculo` não tem `projeto_id`: chegar ao projeto passa pela
-- etapa. O preço disso está registrado em 20260804100000 — foi preciso criar
-- `fn_has_etapa_access` SECURITY DEFINER só para a policy conseguir dar o salto,
-- e até lá o vínculo ficou invisível para dois papéis, o que corrompeu o avanço
-- físico EM SILÊNCIO (20% para um papel, 4% para outro, sem erro nenhum).
--
-- Com `projeto_id` na própria linha, a policy é `fn_has_projeto_access(projeto_id)`,
-- idêntica em forma à de `etapas_cronograma`, sem função nova e sem salto. O
-- preço da denormalização — poder divergir da etapa — já está pago: a trigger
-- `fn_etapa_hierarquia` tornou `etapas_cronograma.projeto_id` IMUTÁVEL, e a
-- trigger abaixo exige que as duas pontas sejam da mesma obra.
--
-- `atraso_dias` entre −365 e 365. Lag de anos é sempre erro de digitação, e sem
-- o check ele vira uma barra fora da tela e um forward pass que "funciona".
--
-- SÓ FOLHA ↔ FOLHA. Ligação de ou para etapa-grupo é recusada. As datas do grupo
-- são rollup derivado (`inicio_efetivo`/`fim_efetivo` na view): uma restrição
-- sobre um valor que ninguém escreve não tem onde ser aplicada. E mantém o
-- modelo com UMA regra — folha é a unidade de trabalho — que já vale para
-- vínculo de orçamento e medição. Quem precisar liga um marco de fim de fase,
-- que é o que engenheiro faz de qualquer jeito.
--
-- SEM `unique (sucessora_id)`: uma etapa pode ter várias predecessoras, e é
-- justamente o máximo entre elas que o forward pass calcula.
--
-- ============================================================
-- Por que o CPM roda no cliente
-- ============================================================
-- Arrastar uma barra precisa mostrar, no mesmo quadro, onde as sucessoras vão
-- parar. Isso é uma ida ao servidor por pixel — inviável. Então o motor existe
-- no cliente de qualquer forma, e a escolha real não é "cliente ou servidor",
-- é "só cliente" ou "cliente E servidor".
--
-- E "cliente e servidor" significa duas implementações de CPM. Este repositório
-- já tolera UMA fórmula duplicada (`calcularAvancoFisico` ↔ `v_resumo_obra`), e
-- só a tolera porque são três regras e `avanco.test.ts` tranca os dois lados.
-- CPM com quatro tipos de vínculo, atraso, dias úteis, forward e backward pass
-- é outra ordem de grandeza — e o modo de falha de uma divergência é uma data
-- plausível e errada.
--
-- Há ainda um motivo mecânico: uma trigger de reagendamento brigaria com a
-- escrita em lote. Um `update` de N linhas dispararia N recomputações em
-- cascata, cada uma reescrevendo linhas que a própria instrução ainda vai
-- tocar — o resultado passaria a depender da ordem das linhas.
--
-- O que o servidor precisa ser dono, ele é, e barato: ciclo é uma CTE recursiva
-- numa trigger, pertinência é um `exists`, atomicidade é a RPC.

create table public.etapa_dependencia (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  predecessora_id uuid not null references public.etapas_cronograma(id) on delete cascade,
  sucessora_id    uuid not null references public.etapas_cronograma(id) on delete cascade,
  -- FS: a sucessora começa depois que a predecessora termina (o caso comum).
  -- SS: começam juntas.  FF: terminam juntas.  SF: raro, e existe por completude.
  tipo text not null default 'FS' check (tipo in ('FS','SS','FF','SF')),
  atraso_dias integer not null default 0 check (atraso_dias between -365 and 365),
  created_at timestamptz not null default now(),
  criado_por uuid references public.profiles(id) on delete set null,
  constraint dep_nao_reflexiva check (predecessora_id <> sucessora_id),
  constraint dep_unica unique (predecessora_id, sucessora_id)
);

comment on table public.etapa_dependencia is
  'Sequenciamento entre etapas-folha. projeto_id é denormalizado de propósito, para a policy não precisar saltar pela etapa — ver 20260804100000, onde esse salto custou o avanço físico divergente por papel.';

-- Os dois últimos servem as CTEs recursivas das triggers, que percorrem o grafo
-- nas duas direções.
create index etapa_dependencia_projeto_idx      on public.etapa_dependencia (projeto_id);
create index etapa_dependencia_sucessora_idx    on public.etapa_dependencia (sucessora_id);
create index etapa_dependencia_predecessora_idx on public.etapa_dependencia (predecessora_id);

-- ------------------------------------------------------------
-- Integridade
-- ------------------------------------------------------------
create or replace function public.fn_dependencia_integridade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
  s record;
begin
  select id, projeto_id, nome,
         not exists (select 1 from public.etapas_cronograma f where f.parent_id = e.id) as eh_folha
    into p
    from public.etapas_cronograma e where e.id = new.predecessora_id;

  select id, projeto_id, nome,
         not exists (select 1 from public.etapas_cronograma f where f.parent_id = e.id) as eh_folha
    into s
    from public.etapas_cronograma e where e.id = new.sucessora_id;

  if p.id is null or s.id is null then
    raise exception 'Uma das etapas da ligação não existe.';
  end if;

  -- É esta linha que sustenta o `projeto_id` denormalizado: sem ela, a coluna
  -- poderia apontar para uma obra que o autor enxerga enquanto as etapas são de
  -- outra — e a policy passaria a autorizar pela obra errada.
  if p.projeto_id <> new.projeto_id or s.projeto_id <> new.projeto_id then
    raise exception 'A ligação e as duas etapas têm de ser da mesma obra.';
  end if;

  if not p.eh_folha then
    raise exception
      'A etapa "%" é um grupo da EAP e não pode ser predecessora. As datas do grupo são a soma das frentes dentro dele; ligue a frente que de fato termina.', p.nome;
  end if;
  if not s.eh_folha then
    raise exception
      'A etapa "%" é um grupo da EAP e não pode ser sucessora. Ligue a frente que de fato começa.', s.nome;
  end if;

  return new;
end;
$$;

/**
 * Ciclo.
 *
 * Um cronograma com A → B → A não tem solução: o forward pass nunca termina, e
 * a ordenação topológica devolve um conjunto vazio. O cliente já barra ao
 * arrastar (`detectarCiclo`), mas o cliente é uma tela — quem garante é aqui.
 */
create or replace function public.fn_dependencia_sem_ciclo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha boolean;
begin
  -- Só quando as pontas mudam: alterar `tipo` ou `atraso_dias` não pode criar
  -- ciclo, e varrer o grafo a cada ajuste de atraso seria desperdício.
  if tg_op = 'UPDATE'
     and new.predecessora_id = old.predecessora_id
     and new.sucessora_id = old.sucessora_id then
    return new;
  end if;

  -- Desce a partir da SUCESSORA seguindo as sucessoras dela. Se em algum ponto
  -- alcançar a predecessora, a aresta nova fecharia o laço. O `n < 500` é o
  -- cinto extra caso um ciclo já exista nos dados.
  with recursive alcanca as (
    select d.sucessora_id as id, 1 as n
      from public.etapa_dependencia d
     where d.predecessora_id = new.sucessora_id
       and (tg_op = 'INSERT' or d.id <> old.id)
    union all
    select d.sucessora_id, a.n + 1
      from public.etapa_dependencia d
      join alcanca a on d.predecessora_id = a.id
     where a.n < 500
  )
  select exists (select 1 from alcanca where id = new.predecessora_id) into v_fecha;

  if v_fecha then
    raise exception
      'Esta ligação criaria um ciclo: "%" já depende de "%", direta ou indiretamente.',
      (select nome from public.etapas_cronograma where id = new.predecessora_id),
      (select nome from public.etapas_cronograma where id = new.sucessora_id);
  end if;

  return new;
end;
$$;

-- O Postgres dispara triggers de mesmo timing em ordem ALFABÉTICA, e a de ciclo
-- precisa rodar depois da de integridade — senão a CTE recursiva percorre o
-- grafo para depois descobrir que uma das pontas nem existe.
create trigger trg_dep_a_integridade
  before insert or update on public.etapa_dependencia
  for each row execute function public.fn_dependencia_integridade();

create trigger trg_dep_b_sem_ciclo
  before insert or update on public.etapa_dependencia
  for each row execute function public.fn_dependencia_sem_ciclo();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.etapa_dependencia enable row level security;

create policy "admin_all_etapa_dependencia" on public.etapa_dependencia for all
  using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

create policy "gestao_all_etapa_dependencia" on public.etapa_dependencia for all
  using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ATENÇÃO AO NOME. `campo_select_*` neste repositório significa "leitura que não
-- checa papel", e alcança OS QUATRO: `fn_has_projeto_access` devolve true para
-- admin, gestao e financeiro, e para campo quando ele está em `projeto_equipe`.
-- É a mesma forma de `campo_select_etapas_cronograma` e a mesma intenção.
--
-- (O comentário em 20260718190006_rls_policies.sql:111 — "No policy at all on
-- cronograma/etapas… for 'financeiro'" — está ERRADO desde 18/jul/2026. Foi
-- conferido antes de escrever este arquivo; não copie aquele comentário.)
--
-- Campo e financeiro precisam ler a aresta: os dois já enxergam as duas pontas,
-- e esconder só a ligação não protege nada — faria o Gantt deles desenhar
-- barras sem setas, que é pior do que não desenhar.
create policy "campo_select_etapa_dependencia" on public.etapa_dependencia for select
  using (public.fn_has_projeto_access(projeto_id));

-- ------------------------------------------------------------
-- fn_aplicar_cronograma ganha as arestas
-- ------------------------------------------------------------
-- Mesma função, mesmo contrato, dois conjuntos a mais. Arrastar uma barra que
-- cria uma ligação produz, de uma vez: a aresta nova, a etapa movida e as N
-- sucessoras reagendadas. Em chamadas separadas, uma falha no meio deixa uma
-- ligação cujas datas a contradizem — e nada na tela avisa.
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
  if coalesce(public.fn_current_role(), '') not in ('admin','gestao') then
    raise exception 'Seu perfil não pode editar o cronograma desta obra.';
  end if;

  select max(updated_at) into v_versao_atual
    from public.etapas_cronograma where projeto_id = p_projeto_id;

  if p_versao is not null and v_versao_atual is distinct from p_versao then
    raise exception 'O cronograma foi alterado por outra pessoa enquanto você editava. Recarregue a obra antes de salvar.';
  end if;

  -- 1) Datas, marco e modo de agendamento.
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
    if v_afetado <> v_esperado then
      raise exception
        'Cronograma não gravado: % de % etapas foram alcançadas. Alguma não pertence a esta obra ou seu perfil não pode alterá-la.',
        v_afetado, v_esperado;
    end if;
  end if;

  -- 2) Posição na EAP.
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

  -- 3) Ligações removidas ANTES das criadas: trocar o tipo de uma ligação é
  --    remover e recriar, e na ordem inversa a nova esbarraria em `dep_unica`.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'dep_removidas'), 0);
  if v_esperado > 0 then
    delete from public.etapa_dependencia d
     using jsonb_array_elements_text(p_mudancas -> 'dep_removidas') as r(id)
     where d.id = r.id::uuid
       and d.projeto_id = p_projeto_id;

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception 'Ligações não removidas: % de % foram alcançadas.', v_afetado, v_esperado;
    end if;
  end if;

  -- 4) Ligações novas. `projeto_id` vem do PARÂMETRO, não do payload: assim um
  --    payload forjado não consegue criar aresta apontando para outra obra, e a
  --    trigger de integridade confere que as duas pontas batem com ele.
  v_esperado := coalesce(jsonb_array_length(p_mudancas -> 'dep_criadas'), 0);
  if v_esperado > 0 then
    insert into public.etapa_dependencia
      (id, projeto_id, predecessora_id, sucessora_id, tipo, atraso_dias, criado_por)
    select coalesce(c.id, gen_random_uuid()), p_projeto_id, c.predecessora_id, c.sucessora_id,
           coalesce(c.tipo, 'FS'), coalesce(c.atraso_dias, 0), auth.uid()
      from jsonb_to_recordset(p_mudancas -> 'dep_criadas')
        as c(id uuid, predecessora_id uuid, sucessora_id uuid, tipo text, atraso_dias integer);

    get diagnostics v_afetado = row_count;
    if v_afetado <> v_esperado then
      raise exception 'Ligações não criadas: % de % foram gravadas.', v_afetado, v_esperado;
    end if;
  end if;

  return jsonb_build_object(
    'etapas', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.ordem_path, v.id)
        from public.v_etapas_cronograma v
       where v.projeto_id = p_projeto_id
    ), '[]'::jsonb),
    'dependencias', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.id)
        from public.etapa_dependencia d
       where d.projeto_id = p_projeto_id
    ), '[]'::jsonb),
    'versao', (
      select max(updated_at) from public.etapas_cronograma where projeto_id = p_projeto_id
    )
  );
end;
$$;

comment on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) is
  'Aplica um diff de cronograma — datas, posição na EAP e ligações — numa transação só. As contagens por conjunto são o garantirEscrita levado para dentro do SQL: sob RLS um update que casa zero linhas volta 200, e a tela comemora enquanto o banco fica intacto.';

grant execute on function public.fn_aplicar_cronograma(uuid, jsonb, timestamptz) to authenticated;
