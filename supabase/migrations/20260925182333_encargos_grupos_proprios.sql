-- ============================================================
-- GRUPOS DE ENCARGO PRÓPRIOS (E, F, …) ALÉM DE A, B, C E D
-- ============================================================
-- Até aqui o grupo era um CHECK fixo ('A','B','C','D'), e a rubrica própria
-- (20260921013606) só entrava em A, B ou C. Há encargo que a empresa quer ver
-- separado da estrutura SINAPI — um acordo coletivo, um adicional, um seguro
-- de vida em grupo — e enfiá-lo no C ("rescisórios") mente sobre o que ele é.
--
-- A REGRA DE CÁLCULO DO GRUPO PRÓPRIO, e por que é esta:
--
--   Grupo próprio SOMA DIRETO NO TOTAL, como o C. Não entra em fórmula nenhuma
--   do D e não sofre reincidência do A.
--
-- As fórmulas do D são regra contábil fechada (ver 20260920193443) e citam
-- A, B, A1, A8, B4, C1 e C2 pelo nome. Fazer um grupo novo reincidir exigiria
-- a empresa escrever fórmula — o interpretador de expressões que aquela
-- migration recusou de propósito. Quem precisa que um valor reincida o cadastra
-- como rubrica do B, onde a reincidência já acontece.
--
-- A mesma regra do "nulo não é zero" vale: rubrica ativa de grupo próprio sem
-- percentual anula o grupo, e o TOTAL, e impede o modo 'Rubricas' de ligar.
-- Grupo próprio VAZIO (sem rubrica ativa) soma zero — mesmo resultado do `left
-- join` que A, B e C já tinham, e mesmo resultado do espelho em
-- `src/lib/encargos.ts`, que itera pelos grupos presentes nas rubricas.

create table if not exists public.encargos_grupos (
  -- Uma letra, porque o código da rubrica é a letra do grupo + número
  -- (`encargos_rubricas_codigo_do_grupo`) e as fórmulas citam 'A1' e cia.
  codigo  text primary key check (codigo ~ '^[A-Z]$'),
  titulo  text not null check (length(btrim(titulo)) between 1 and 60),
  ordem   integer not null,
  sistema boolean not null default false,
  created_at timestamptz not null default now(),
  -- A–D são a estrutura SINAPI; os próprios começam no E.
  constraint encargos_grupos_proprios_depois_do_d check (sistema or codigo between 'E' and 'Z')
);

comment on table public.encargos_grupos is
  'Grupos de encargo social. A–D são estruturais (sistema); E–Z são da empresa e somam direto no TOTAL de fn_encargos_totais(), sem entrar nas fórmulas do D.';

insert into public.encargos_grupos (codigo, titulo, ordem, sistema) values
  ('A', 'Obrigações sociais',        100, true),
  ('B', 'Incidência do grupo A',     200, true),
  ('C', 'Rescisórios',               300, true),
  ('D', 'Reincidências calculadas',  400, true)
on conflict (codigo) do nothing;

-- O CHECK fixo vira chave estrangeira: rubrica só existe em grupo que existe,
-- e grupo com rubrica não pode ser excluído (`restrict`) — a tela oferece a
-- exclusão só para grupo vazio, e o banco garante o resto.
alter table public.encargos_rubricas drop constraint if exists encargos_rubricas_grupo_check;
alter table public.encargos_rubricas
  add constraint encargos_rubricas_grupo_fk
  foreign key (grupo) references public.encargos_grupos (codigo)
  on update restrict on delete restrict;

-- Rubrica própria pode ir a qualquer grupo MENOS o D (derivado).
alter table public.encargos_rubricas drop constraint if exists encargos_personalizadas_validas;
alter table public.encargos_rubricas
  add constraint encargos_personalizadas_validas
    check (sistema or (grupo <> 'D' and formula is null
      and codigo ~ '^[A-Z][1-9][0-9]{0,3}$'));

-- ------------------------------------------------------------
-- RLS: lê quem lê as rubricas; cria e exclui quem administra
-- ------------------------------------------------------------
alter table public.encargos_grupos enable row level security;

revoke all on public.encargos_grupos from anon, authenticated;
grant select on public.encargos_grupos to authenticated;
-- `sistema` fica fora do grant de INSERT: ninguém cria grupo estrutural.
grant insert (codigo, titulo, ordem) on public.encargos_grupos to authenticated;
grant update (titulo) on public.encargos_grupos to authenticated;
grant delete on public.encargos_grupos to authenticated;

drop policy if exists "auth_read_encargos_grupos" on public.encargos_grupos;
create policy "auth_read_encargos_grupos" on public.encargos_grupos
  for select using (auth.uid() is not null);

drop policy if exists "admin_gestao_insert_encargos_grupos" on public.encargos_grupos;
create policy "admin_gestao_insert_encargos_grupos" on public.encargos_grupos
  for insert to authenticated
  with check (coalesce(public.fn_current_role() in ('admin', 'gestao'), false) and not sistema);

drop policy if exists "admin_gestao_update_encargos_grupos" on public.encargos_grupos;
create policy "admin_gestao_update_encargos_grupos" on public.encargos_grupos
  for update to authenticated
  using (coalesce(public.fn_current_role() in ('admin', 'gestao'), false) and not sistema)
  with check (coalesce(public.fn_current_role() in ('admin', 'gestao'), false) and not sistema);

drop policy if exists "admin_gestao_delete_encargos_grupos" on public.encargos_grupos;
create policy "admin_gestao_delete_encargos_grupos" on public.encargos_grupos
  for delete to authenticated
  using (coalesce(public.fn_current_role() in ('admin', 'gestao'), false) and not sistema);

-- ------------------------------------------------------------
-- fn_encargos_totais: os grupos somados deixam de ser a lista fixa (A, B, C)
-- ------------------------------------------------------------
-- Única mudança de corpo: o CTE `grupos` lê a tabela nova (todos menos o D,
-- que continua derivado). O TOTAL já somava tudo o que estivesse em `todos`,
-- então o grupo próprio entra nele sem outra alteração — e o custo-hora
-- (`fn_custo_hora_folha`) e o guarda do modo 'Rubricas' só leem o TOTAL.
create or replace function public.fn_encargos_totais()
returns table (grupo text, horista numeric, mensalista numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vivas as (
    select r.grupo, r.codigo, r.formula,
           r.aplica_horista, r.aplica_mensalista,
           r.percentual_horista, r.percentual_mensalista
      from public.encargos_rubricas r
     where r.ativo
  ),
  -- LEFT join a partir dos grupos, como antes: grupo sem rubrica ativa aparece
  -- zerado em vez de sumir do resultado.
  grupos (grupo) as (select g.codigo from public.encargos_grupos g where g.codigo <> 'D'),
  somas as (
    select g.grupo,
           case when count(v.codigo) filter (
                       where v.aplica_horista and v.percentual_horista is null
                     ) = 0
                then coalesce(sum(v.percentual_horista)
                              filter (where v.aplica_horista), 0)
           end as h,
           case when count(v.codigo) filter (
                       where v.aplica_mensalista and v.percentual_mensalista is null
                     ) = 0
                then coalesce(sum(v.percentual_mensalista)
                              filter (where v.aplica_mensalista), 0)
           end as m
      from grupos g
      left join vivas v on v.grupo = g.grupo
     group by g.grupo
  ),
  operandos as (
    select
      (select h from somas where grupo = 'A') as a_h,
      (select m from somas where grupo = 'A') as a_m,
      (select h from somas where grupo = 'B') as b_h,
      (select m from somas where grupo = 'B') as b_m,
      max(v.percentual_horista)    filter (where v.codigo = 'A1') as a1_h,
      max(v.percentual_mensalista) filter (where v.codigo = 'A1') as a1_m,
      max(v.percentual_horista)    filter (where v.codigo = 'A8') as a8_h,
      max(v.percentual_mensalista) filter (where v.codigo = 'A8') as a8_m,
      max(v.percentual_horista)    filter (where v.codigo = 'B4') as b4_h,
      max(v.percentual_mensalista) filter (where v.codigo = 'B4') as b4_m,
      max(v.percentual_horista)    filter (where v.codigo = 'C1') as c1_h,
      max(v.percentual_mensalista) filter (where v.codigo = 'C1') as c1_m,
      max(v.percentual_horista)    filter (where v.codigo = 'C2') as c2_h,
      max(v.percentual_mensalista) filter (where v.codigo = 'C2') as c2_m
      from vivas v
  ),
  linhas_d as (
    select v.aplica_horista, v.aplica_mensalista,
           case v.formula
             when 'A*B'        then o.a_h * o.b_h / 100
             when 'A*B-A1*B4'  then (o.a_h * o.b_h - o.a1_h * o.b4_h) / 100
             when 'A*C2+A8*C1' then (o.a_h * o.c2_h + o.a8_h * o.c1_h) / 100
           end as h,
           case v.formula
             when 'A*B'        then o.a_m * o.b_m / 100
             when 'A*B-A1*B4'  then (o.a_m * o.b_m - o.a1_m * o.b4_m) / 100
             when 'A*C2+A8*C1' then (o.a_m * o.c2_m + o.a8_m * o.c1_m) / 100
           end as m
      from vivas v
      cross join operandos o
     where v.grupo = 'D'
  ),
  derivadas as (
    select 'D'::text as grupo,
           case when count(*) filter (where aplica_horista and h is null) = 0
                then coalesce(sum(h) filter (where aplica_horista), 0)
           end as h,
           case when count(*) filter (where aplica_mensalista and m is null) = 0
                then coalesce(sum(m) filter (where aplica_mensalista), 0)
           end as m
      from linhas_d
  ),
  todos as (
    select grupo, h, m from somas
    union all
    select grupo, h, m from derivadas
  )
  select grupo, round(h, 4), round(m, 4) from todos
  union all
  select 'TOTAL',
         case when count(*) filter (where h is null) = 0 then round(sum(h), 4) end,
         case when count(*) filter (where m is null) = 0 then round(sum(m), 4) end
    from todos
  order by 1;
$$;

comment on function public.fn_encargos_totais() is
  'Total de encargo por grupo (A–D e os grupos próprios de encargos_grupos) e a linha TOTAL, para horista e mensalista. NULO num grupo significa rubrica ativa sem percentual — nunca soma parcial. Grupo D é derivado; grupos próprios somam direto no TOTAL.';

-- Excluir grupo não mexe em custo (grupo com rubrica não se exclui), mas a
-- criação de rubrica nele sim — e essa já dispara `trg_propaga_custo_rubricas`.
