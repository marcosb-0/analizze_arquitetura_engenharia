-- ============================================================
-- CENTRO DE CUSTO: O RAZÃO GANHA UMA DIMENSÃO OBRIGATÓRIA
-- ============================================================
--
-- Até aqui o app tinha UMA dimensão de custo, e ela era opcional:
-- `lancamentos_financeiros.projeto_id`, nullable desde 20260718190004. Três
-- buracos vinham daí:
--
--   1. Despesa administrativa ficava órfã. Aluguel, energia, marketing,
--      impostos e o salário do escritório entravam com `projeto_id = null` e
--      não apareciam em NENHUMA visão de custo — `fn_resultado_obra`
--      (20260731150000) só soma `where l.projeto_id = p.id`. Não havia como
--      responder "quanto custa a estrutura da empresa por mês".
--   2. A folha nascia sem destino: a tela monta o lançamento de salário sem
--      obra, então 100% da folha era custo órfão.
--   3. O termo já estava na tela, mentindo: o filtro do razão se chamava
--      "Centro de Custo / Categoria", mas filtrava `categoria` — o check de 11
--      valores, que é NATUREZA do gasto, não centro de custo.
--
-- O modelo é o do SAP: a Kostenstelle é uma dimensão ORGANIZACIONAL,
-- hierárquica e obrigatória em todo lançamento, separada da natureza do gasto.
--
-- ------------------------------------------------------------
-- AS TRÊS DECISÕES DE PRODUTO (19/set/2026)
-- ------------------------------------------------------------
--   - Árvore ÚNICA, com as obras dentro dela. Cada obra ganha seu centro
--     automaticamente e convive com os administrativos. Todo lançamento aponta
--     para exatamente um centro.
--   - SEM rateio de indiretos para as obras. Cada centro acumula o seu; a
--     margem da obra continua exatamente como está.
--   - SEM orçado por centro nesta etapa. Só realizado.
--
-- ------------------------------------------------------------
-- A REGRA QUE SUSTENTA TUDO: `projeto_id` VIRA DERIVADO
-- ------------------------------------------------------------
-- O usuário passa a escolher só o CENTRO. `projeto_id` é recalculado por
-- trigger a partir dele (trg_z_lancamento_deriva_projeto). Com isso:
--
--   - `fn_resultado_obra`, `ResultadoPorObra`, `v_compras_fornecedor` e o
--     índice `lancamentos_financeiros_projeto_idx` seguem valendo SEM alteração;
--   - centro e obra não podem divergir, porque não há dois campos a preencher.
--
-- Momento raro e aproveitado: `lancamentos_financeiros` tem ZERO linhas em
-- produção nesta data. A coluna nasce `not null` sem backfill e sem período de
-- convivência. Os `update` de backfill abaixo existem só para o caso de alguém
-- lançar algo entre escrever e aplicar esta migration.

-- ------------------------------------------------------------
-- 1. O MESTRE
-- ------------------------------------------------------------
create table if not exists public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null
    constraint centros_custo_codigo_preenchido check (length(trim(codigo)) > 0),
  nome text not null
    constraint centros_custo_nome_preenchido check (length(trim(nome)) > 0),
  -- `restrict`: apagar um nó que agrupa outros esconderia a subárvore inteira
  -- do relatório sem aviso. Centro sai de circulação por `ativo`, não por delete.
  pai_id uuid references public.centros_custo(id) on delete restrict,
  tipo text not null
    constraint centros_custo_tipo_valido check (tipo in ('Sintetico', 'Analitico')),
  natureza text not null
    constraint centros_custo_natureza_valida
    check (natureza in ('Administrativo', 'Operacional', 'Comercial', 'Obra')),
  -- `set null` e NÃO cascade: apagar uma obra não pode apagar o centro, senão o
  -- histórico financeiro dela morre junto. Espelha o `set null` que
  -- `lancamentos_financeiros.projeto_id` já usa desde 20260718190004.
  projeto_id uuid references public.projetos(id) on delete set null,
  responsavel_id uuid references public.profiles(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint centros_custo_codigo_unico unique (codigo),
  -- Raiz da árvore é sempre agrupador: um analítico solto no topo receberia
  -- lançamento sem nunca aparecer sob nenhum total.
  constraint centros_custo_raiz_agrupa check (pai_id is not null or tipo = 'Sintetico')
);

comment on table public.centros_custo is
  'Árvore organizacional de centros de custo (modelo Kostenstelle do SAP), criada em 20260920120000. Dimensão obrigatória de todo lançamento do razão. As obras entram na mesma árvore, sob o nó 2000, com centro criado por trigger.';
comment on column public.centros_custo.tipo is
  'Sintetico agrupa e NÃO recebe lançamento; Analitico é o único postável. Mesma separação de cost center group vs cost center do SAP.';
comment on column public.centros_custo.natureza is
  'A Kostenstellenart: para que serve o centro. Separa custo de obra de custo de estrutura no relatório, já que não há rateio.';
comment on column public.centros_custo.projeto_id is
  'Preenchido => este é o centro de uma obra, criado por trg_projeto_cria_centro. NULL depois que a obra é apagada (FK set null), e aí o centro fica inativo guardando o histórico.';
comment on column public.centros_custo.ativo is
  'Mesmo papel de contas_financeiras.ativa: some das ESCOLHAS (lançar, folha) mas continua nomeando o histórico. Não existe delete de centro.';

create index if not exists centros_custo_pai_idx on public.centros_custo (pai_id);
create index if not exists centros_custo_codigo_idx on public.centros_custo (codigo);
create index if not exists centros_custo_responsavel_idx on public.centros_custo (responsavel_id);
create unique index if not exists centros_custo_projeto_unico
  on public.centros_custo (projeto_id) where projeto_id is not null;

drop trigger if exists trg_centros_custo_updated_at on public.centros_custo;
create trigger trg_centros_custo_updated_at
  before update on public.centros_custo
  for each row execute function public.fn_set_updated_at();

-- A coluna do razão entra AQUI, antes da validação da árvore, porque
-- `fn_validar_centro_custo` a consulta. plpgsql resolve SQL só na execução, e
-- hoje nenhum UPDATE em centros_custo corre durante esta migration — mas
-- depender dessa ordem de ramos para a migration não quebrar é sorte, não
-- desenho.
alter table public.lancamentos_financeiros
  add column if not exists centro_custo_id uuid references public.centros_custo(id) on delete restrict;

comment on column public.lancamentos_financeiros.centro_custo_id is
  'Dimensão organizacional obrigatória (20260920120000). É a ÚNICA coisa que o usuário escolhe: projeto_id é derivado dela por trg_z_lancamento_deriva_projeto.';

-- ------------------------------------------------------------
-- 2. INTEGRIDADE DA ÁRVORE
-- ------------------------------------------------------------
create or replace function public.fn_validar_centro_custo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pai_tipo text;
begin
  if new.pai_id is not null then
    if new.pai_id = new.id then
      raise exception 'Um centro de custo não pode ser pai de si mesmo.';
    end if;

    select tipo into v_pai_tipo from public.centros_custo where id = new.pai_id;
    if not found then
      raise exception 'O centro de custo pai não existe.';
    end if;
    if v_pai_tipo <> 'Sintetico' then
      raise exception 'O centro pai precisa ser sintético (agrupador). Um centro analítico não tem filhos.';
    end if;

    -- Ciclo: subir do pai até a raiz e ver se passa por este centro.
    if tg_op = 'UPDATE' and exists (
      with recursive ancestrais as (
        select id, pai_id from public.centros_custo where id = new.pai_id
        union all
        select c.id, c.pai_id from public.centros_custo c join ancestrais a on c.id = a.pai_id
      )
      select 1 from ancestrais where id = new.id
    ) then
      raise exception 'Essa mudança de pai criaria um ciclo na árvore de centros de custo.';
    end if;
  end if;

  if new.projeto_id is not null and (new.tipo <> 'Analitico' or new.natureza <> 'Obra') then
    raise exception 'O centro de uma obra é sempre analítico e de natureza Obra.';
  end if;

  if new.tipo = 'Analitico' and exists (select 1 from public.centros_custo where pai_id = new.id) then
    raise exception 'Este centro agrupa outros centros, então não pode virar analítico.';
  end if;

  if tg_op = 'UPDATE' then
    if new.tipo = 'Sintetico' and exists (
      select 1 from public.lancamentos_financeiros where centro_custo_id = new.id
    ) then
      raise exception 'Este centro já tem lançamentos, então não pode virar sintético (agrupador não recebe lançamento).';
    end if;

    -- O centro de uma obra é estrutura gerada, não cadastro. `nome` fica
    -- editável (a trigger de renome da obra o reescreve) e `ativo` também (a
    -- exclusão da obra o desliga). `projeto_id` só pode ir para NULL, que é a
    -- ação `on delete set null` da própria FK quando a obra é apagada.
    if old.projeto_id is not null then
      if new.codigo is distinct from old.codigo
      or new.tipo is distinct from old.tipo
      or new.natureza is distinct from old.natureza
      or new.pai_id is distinct from old.pai_id then
        raise exception 'Este centro foi criado junto com a obra: código, tipo, natureza e posição na árvore vêm dela.';
      end if;
      if new.projeto_id is not null and new.projeto_id is distinct from old.projeto_id then
        raise exception 'Não é possível apontar o centro de uma obra para outra obra.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.fn_validar_centro_custo() from public, anon, authenticated;

drop trigger if exists trg_validar_centro_custo on public.centros_custo;
create trigger trg_validar_centro_custo
  before insert or update on public.centros_custo
  for each row execute function public.fn_validar_centro_custo();

-- ------------------------------------------------------------
-- 3. A SEMENTE
-- ------------------------------------------------------------
-- Idempotente pelo código. Os sintéticos primeiro, porque a validação exige o
-- pai existindo e sendo agrupador.
insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza)
values ('1000', 'Empresa', null, 'Sintetico', 'Administrativo')
on conflict (codigo) do nothing;

insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza)
select v.codigo, v.nome, (select id from public.centros_custo where codigo = '1000'), 'Sintetico', v.natureza
from (values
  ('1100', 'Administrativo', 'Administrativo'),
  ('1200', 'Apoio / Operação', 'Operacional'),
  ('2000', 'Obras', 'Obra')
) as v(codigo, nome, natureza)
on conflict (codigo) do nothing;

insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza)
select v.codigo, v.nome, (select id from public.centros_custo where codigo = v.pai), 'Analitico', v.natureza
from (values
  ('1110', 'Escritório',            '1100', 'Administrativo'),
  ('1120', 'Comercial',             '1100', 'Comercial'),
  ('1130', 'TI / Sistemas',         '1100', 'Administrativo'),
  ('1140', 'Financeiro',            '1100', 'Administrativo'),
  ('1210', 'Frota e Equipamentos',  '1200', 'Operacional'),
  ('1220', 'Almoxarifado',          '1200', 'Operacional')
) as v(codigo, nome, pai, natureza)
on conflict (codigo) do nothing;

-- O nó 2000 é sintético e por isso não recebe lançamento: existe para somar as
-- obras. O código de cada obra sai desta sequência.
create sequence if not exists public.seq_centro_custo_obra start 2001;
revoke all on sequence public.seq_centro_custo_obra from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. A OBRA GANHA CENTRO SOZINHA
-- ------------------------------------------------------------
-- AFTER INSERT em `projetos` cobre as DUAS rotas de criação de obra — a manual
-- e a conversão de proposta — sem que nenhuma das duas precise saber que
-- centro de custo existe. SECURITY DEFINER porque `gestao` também cria obra e
-- só `admin` escreve em centros_custo.
create or replace function public.fn_centro_custo_da_obra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai uuid;
begin
  select id into v_pai from public.centros_custo where codigo = '2000';
  if v_pai is null then
    raise exception 'O grupo de centros de custo das obras (2000) não existe.';
  end if;

  insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza, projeto_id)
  values (nextval('public.seq_centro_custo_obra')::text, new.nome, v_pai, 'Analitico', 'Obra', new.id);

  return null;
end;
$$;

revoke all on function public.fn_centro_custo_da_obra() from public, anon, authenticated;

drop trigger if exists trg_projeto_cria_centro on public.projetos;
create trigger trg_projeto_cria_centro
  after insert on public.projetos
  for each row execute function public.fn_centro_custo_da_obra();

create or replace function public.fn_centro_custo_segue_obra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- BEFORE DELETE: depois que a FK fizer `set null` não haveria mais como
    -- achar o centro pelo projeto. O centro fica, guardando o histórico.
    update public.centros_custo set ativo = false where projeto_id = old.id;
    return old;
  end if;

  update public.centros_custo set nome = new.nome
  where projeto_id = new.id and nome is distinct from new.nome;
  return null;
end;
$$;

revoke all on function public.fn_centro_custo_segue_obra() from public, anon, authenticated;

drop trigger if exists trg_projeto_renomeia_centro on public.projetos;
create trigger trg_projeto_renomeia_centro
  after update of nome on public.projetos
  for each row execute function public.fn_centro_custo_segue_obra();

drop trigger if exists trg_projeto_desliga_centro on public.projetos;
create trigger trg_projeto_desliga_centro
  before delete on public.projetos
  for each row execute function public.fn_centro_custo_segue_obra();

-- As obras que já existem entram na árvore.
insert into public.centros_custo (codigo, nome, pai_id, tipo, natureza, projeto_id)
select nextval('public.seq_centro_custo_obra')::text, p.nome,
       (select id from public.centros_custo where codigo = '2000'), 'Analitico', 'Obra', p.id
from public.projetos p
where not exists (select 1 from public.centros_custo c where c.projeto_id = p.id);

-- ------------------------------------------------------------
-- 5. A LOTAÇÃO DO FUNCIONÁRIO
-- ------------------------------------------------------------
-- O cost center do mestre de pessoal do SAP: a folha usa a lotação como centro
-- padrão. Sem isso, a tela da folha passaria a exigir escolha manual por
-- funcionário, todo mês. Nullable: quem não tem lotação cai no seletor da tela.
alter table public.funcionarios
  add column if not exists centro_custo_id uuid references public.centros_custo(id) on delete set null;

comment on column public.funcionarios.centro_custo_id is
  'Lotação: centro de custo padrão da folha deste funcionário (20260920120000). NULL = a tela da folha pergunta.';

create index if not exists funcionarios_centro_custo_idx
  on public.funcionarios (centro_custo_id) where centro_custo_id is not null;

-- ------------------------------------------------------------
-- 6. O RAZÃO PASSA A EXIGIR CENTRO
-- ------------------------------------------------------------
-- Backfill — zero linhas em produção nesta data; existe para o caso de alguém
-- ter lançado algo entre escrever e aplicar.
update public.lancamentos_financeiros l
set centro_custo_id = c.id
from public.centros_custo c
where c.projeto_id = l.projeto_id and l.centro_custo_id is null;

update public.lancamentos_financeiros
set centro_custo_id = (select id from public.centros_custo where codigo = '1110')
where centro_custo_id is null;

alter table public.lancamentos_financeiros
  alter column centro_custo_id set not null;

create index if not exists lancamentos_financeiros_centro_idx
  on public.lancamentos_financeiros (centro_custo_id, data desc);

-- `trg_z_`: o prefixo é deliberado. Trigger BEFORE dispara em ordem
-- ALFABÉTICA, e a derivação precisa correr DEPOIS dos guardas — senão ela
-- rouba a mensagem de erro deles.
create or replace function public.fn_lancamento_deriva_projeto()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_centro record;
begin
  select tipo, ativo, projeto_id into v_centro
  from public.centros_custo where id = new.centro_custo_id;

  if not found then
    raise exception 'Centro de custo não encontrado.';
  end if;

  -- `ativo` só é cobrado quando o centro está sendo ESCOLHIDO. Sem isso,
  -- marcar como pago um lançamento antigo de obra encerrada seria recusado.
  if tg_op = 'INSERT' or new.centro_custo_id is distinct from old.centro_custo_id then
    if v_centro.tipo <> 'Analitico' then
      raise exception 'Este centro de custo agrupa outros e não recebe lançamento. Escolha um centro analítico.';
    end if;
    if not v_centro.ativo then
      raise exception 'Este centro de custo está inativo e não recebe lançamento.';
    end if;
  end if;

  new.projeto_id := v_centro.projeto_id;
  return new;
end;
$$;

revoke all on function public.fn_lancamento_deriva_projeto() from public, anon, authenticated;

drop trigger if exists trg_z_lancamento_deriva_projeto on public.lancamentos_financeiros;
create trigger trg_z_lancamento_deriva_projeto
  before insert or update on public.lancamentos_financeiros
  for each row execute function public.fn_lancamento_deriva_projeto();

-- ------------------------------------------------------------
-- 7. O GUARDA DO FATURAMENTO PASSA A OLHAR O CENTRO
-- ------------------------------------------------------------
-- Recria fn_lancamento_protege_faturamento (20260731160000) trocando a trava.
-- Ela bloqueava `projeto_id`, que agora é DERIVADO: o cliente não o envia mais,
-- a comparação nunca acusaria diferença e a trava sumiria em silêncio. O que
-- precisa ficar imutável é o `centro_custo_id`, de onde o projeto sai. A
-- comparação de `projeto_id` fica junto, como defesa em profundidade — quem
-- mandar o campo à mão continua barrado (a derivação só corre depois deste
-- guarda, por ordem alfabética de trigger).
create or replace function public.fn_lancamento_protege_faturamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.medicao_id is null then
    return new;
  end if;

  if new.valor           is distinct from old.valor
  or new.tipo            is distinct from old.tipo
  or new.categoria       is distinct from old.categoria
  or new.medicao_id      is distinct from old.medicao_id
  or new.centro_custo_id is distinct from old.centro_custo_id
  or new.projeto_id      is distinct from old.projeto_id then
    raise exception
      'Este lançamento veio do faturamento de uma medição: valor, tipo, categoria, centro de custo e medição não podem ser alterados. Para trocar o valor, exclua o lançamento e fature a medição de novo.';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_lancamento_protege_faturamento() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 8. O FATURAMENTO DA MEDIÇÃO NASCE NO CENTRO DA OBRA
-- ------------------------------------------------------------
-- Recria fn_gerar_lancamento_medicao (20260817100002) idêntica, salvo por
-- gravar `centro_custo_id`. Deixa de gravar `projeto_id`: a derivação o repõe
-- a partir do centro, e escrever os dois abriria a porta para divergirem.
create or replace function public.fn_gerar_lancamento_medicao(p_medicao_id uuid, p_conta_id uuid, p_pago boolean default false)
returns lancamentos_financeiros
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_medicao      record;
  v_projeto_nome text;
  v_centro_id    uuid;
  v_valor        numeric;
  v_lancamento   public.lancamentos_financeiros;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem faturar medições.';
  end if;

  select * into v_medicao from public.medicoes_obra where id = p_medicao_id;
  if not found then
    raise exception 'Medição não encontrada.';
  end if;

  if v_medicao.status is distinct from 'Aprovada' then
    raise exception 'Só medições aprovadas podem ser faturadas (situação atual: %).', coalesce(v_medicao.status, 'sem status');
  end if;

  if not exists (select 1 from public.contas_financeiras where id = p_conta_id) then
    raise exception 'Conta financeira não encontrada.';
  end if;

  select coalesce(sum(valor_aplicado), 0) into v_valor
  from public.medicao_item_orcamento
  where medicao_id = p_medicao_id;

  if v_valor <= 0 then
    raise exception 'Esta medição não tem valor executado para faturar (sem itens de orçamento vinculados à etapa).';
  end if;

  if exists (
    select 1 from public.lancamentos_financeiros
    where medicao_id = p_medicao_id and categoria = 'Faturamento Obra'
  ) then
    raise exception 'Esta medição já foi faturada.';
  end if;

  select nome into v_projeto_nome from public.projetos where id = v_medicao.projeto_id;

  select id into v_centro_id from public.centros_custo where projeto_id = v_medicao.projeto_id;
  if v_centro_id is null then
    raise exception 'Esta obra não tem centro de custo.';
  end if;

  insert into public.lancamentos_financeiros (
    tipo, descricao, valor, data, categoria, pago, conta_id, centro_custo_id, medicao_id
  ) values (
    'Receita',
    'Faturamento de medição — ' || coalesce(v_projeto_nome, 'Obra') ||
      ' (' || to_char(v_medicao.data_medicao, 'DD/MM/YYYY') || ')',
    v_valor,
    current_date,
    'Faturamento Obra',
    p_pago,
    p_conta_id,
    v_centro_id,
    p_medicao_id
  )
  returning * into v_lancamento;

  return v_lancamento;
end;
$function$;

-- ------------------------------------------------------------
-- 9. MATRIZ DE ACESSO
-- ------------------------------------------------------------
-- Mestre organizacional: os três papéis de escritório LEEM (precisam para o
-- seletor de lançamento e para o relatório), só `admin` ESCREVE. `campo` não
-- vê — e não entra no módulo financeiro.
--
-- Não há policy de DELETE, de propósito: centro sai de circulação por
-- `ativo = false`, nunca por delete, senão o histórico do razão perde o nome do
-- dono. Uma `for all` futura reabre esse buraco — foi a mesma decisão que
-- deixou `contratos` sem policy de INSERT (20260812100000).
alter table public.centros_custo enable row level security;
revoke all on public.centros_custo from anon, authenticated;
grant select, insert, update on public.centros_custo to authenticated;

drop policy if exists centros_custo_ler on public.centros_custo;
create policy centros_custo_ler on public.centros_custo for select to authenticated
  using (public.fn_current_role() in ('admin', 'gestao', 'financeiro'));

drop policy if exists centros_custo_criar on public.centros_custo;
create policy centros_custo_criar on public.centros_custo for insert to authenticated
  with check (public.fn_current_role() = 'admin');

drop policy if exists centros_custo_editar on public.centros_custo;
create policy centros_custo_editar on public.centros_custo for update to authenticated
  using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

-- ------------------------------------------------------------
-- 10. LEITURA: A ÁRVORE
-- ------------------------------------------------------------
-- Colunas EXPLÍCITAS, nunca `c.*`: view com estrela congela as colunas no
-- momento da criação e passa a ignorar coluna nova em silêncio (já custou dois
-- bugs em propostas).
--
-- A view NÃO junta `profiles` para resolver o nome do responsável, embora
-- `responsavel_id` esteja aqui: `financeiro` não tem policy de select em
-- profiles (só `admin` e `gestao` têm). Num join invoker isso não daria erro —
-- daria o nome EM BRANCO, só para esse papel, em silêncio. O nome é resolvido
-- no cliente por `fn_pessoas_atribuiveis()`, que existe exatamente porque
-- financeiro e campo não leem profiles.
drop view if exists public.v_centros_custo;
create view public.v_centros_custo with (security_invoker = true) as
with recursive hierarquia as (
  select
    c.id, c.codigo, c.nome, c.pai_id, c.tipo, c.natureza, c.projeto_id,
    c.responsavel_id, c.ativo, c.created_at, c.updated_at,
    1 as nivel,
    c.codigo as caminho
  from public.centros_custo c
  where c.pai_id is null
  union all
  select
    f.id, f.codigo, f.nome, f.pai_id, f.tipo, f.natureza, f.projeto_id,
    f.responsavel_id, f.ativo, f.created_at, f.updated_at,
    h.nivel + 1,
    h.caminho || ' / ' || f.codigo
  from public.centros_custo f
  join hierarquia h on f.pai_id = h.id
)
select
  h.id,
  h.codigo,
  h.nome,
  h.pai_id,
  h.tipo,
  h.natureza,
  h.projeto_id,
  h.responsavel_id,
  h.ativo,
  h.created_at,
  h.updated_at,
  h.nivel,
  h.caminho,
  exists (select 1 from public.centros_custo fi where fi.pai_id = h.id) as tem_filhos,
  p.nome as projeto_nome
from hierarquia h
left join public.projetos p on p.id = h.projeto_id;

comment on view public.v_centros_custo is
  'Árvore de centros de custo achatada com nivel, caminho e tem_filhos. Ordenar por `caminho` devolve a ordem de árvore. security_invoker: quem não tem policy em centros_custo não lê nada aqui.';

grant select on public.v_centros_custo to authenticated;

-- ------------------------------------------------------------
-- 11. LEITURA: O CUSTO REALIZADO POR CENTRO
-- ------------------------------------------------------------
-- SECURITY DEFINER pelo mesmo motivo que `fn_resultado_obra` é
-- (20260731150000): `gestao` NÃO tem policy em `lancamentos_financeiros`, e uma
-- view invoker somaria ZERO para ela em vez de recusar — ausência de policy
-- corrompe cálculo em silêncio. Definer + guarda explícita transforma isso num
-- erro que a pessoa lê.
--
-- Cada centro vem com o que foi lançado NELE e com o acumulado da sua
-- SUBÁRVORE, para o sintético mostrar o total dos filhos. Não há rateio: o
-- indireto para no centro dele e nunca encosta na margem da obra.
create or replace function public.fn_custo_por_centro(p_de date default null, p_ate date default null)
returns table (
  centro_id uuid,
  codigo text,
  nome text,
  pai_id uuid,
  tipo text,
  natureza text,
  projeto_id uuid,
  ativo boolean,
  nivel integer,
  caminho text,
  despesa_lancada numeric,
  despesa_paga numeric,
  receita_lancada numeric,
  receita_recebida numeric,
  despesa_lancada_arvore numeric,
  despesa_paga_arvore numeric,
  receita_lancada_arvore numeric,
  receita_recebida_arvore numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem ver o custo por centro.';
  end if;

  return query
  with recursive hierarquia as (
    select c.id, c.codigo, c.nome, c.pai_id, c.tipo, c.natureza, c.projeto_id, c.ativo,
           1 as nivel, c.codigo as caminho
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, f.codigo, f.nome, f.pai_id, f.tipo, f.natureza, f.projeto_id, f.ativo,
           h.nivel + 1, h.caminho || ' / ' || f.codigo
    from public.centros_custo f
    join hierarquia h on f.pai_id = h.id
  ),
  descendencia as (
    select c.id as ancestral, c.id as descendente from public.centros_custo c
    union all
    select d.ancestral, f.id
    from descendencia d
    join public.centros_custo f on f.pai_id = d.descendente
  ),
  direto as (
    select
      c.id,
      coalesce(sum(l.valor) filter (where l.tipo = 'Despesa'), 0) as despesa_lancada,
      coalesce(sum(l.valor) filter (where l.tipo = 'Despesa' and l.pago), 0) as despesa_paga,
      coalesce(sum(l.valor) filter (where l.tipo = 'Receita'), 0) as receita_lancada,
      coalesce(sum(l.valor) filter (where l.tipo = 'Receita' and l.pago), 0) as receita_recebida
    from public.centros_custo c
    left join public.lancamentos_financeiros l
      on l.centro_custo_id = c.id
     and (p_de is null or l.data >= p_de)
     and (p_ate is null or l.data <= p_ate)
    group by c.id
  ),
  acumulado as (
    select
      d.ancestral as id,
      coalesce(sum(t.despesa_lancada), 0) as despesa_lancada,
      coalesce(sum(t.despesa_paga), 0) as despesa_paga,
      coalesce(sum(t.receita_lancada), 0) as receita_lancada,
      coalesce(sum(t.receita_recebida), 0) as receita_recebida
    from descendencia d
    join direto t on t.id = d.descendente
    group by d.ancestral
  )
  select
    h.id, h.codigo, h.nome, h.pai_id, h.tipo, h.natureza, h.projeto_id, h.ativo,
    h.nivel, h.caminho,
    t.despesa_lancada, t.despesa_paga, t.receita_lancada, t.receita_recebida,
    a.despesa_lancada, a.despesa_paga, a.receita_lancada, a.receita_recebida
  from hierarquia h
  join direto t on t.id = h.id
  join acumulado a on a.id = h.id
  order by h.caminho;
end;
$$;

revoke all on function public.fn_custo_por_centro(date, date) from anon, public;
grant execute on function public.fn_custo_por_centro(date, date) to authenticated;
