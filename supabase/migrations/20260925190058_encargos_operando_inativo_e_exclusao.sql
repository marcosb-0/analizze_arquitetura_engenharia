-- ============================================================
-- ENCARGOS: operando desativado vale 0 e rubrica estrutural pode sair
-- ============================================================
-- Duas decisões do usuário em 25/set/2026, depois de uma verificação que
-- mostrou o defeito abaixo em produção.
--
-- 1. OPERANDO DESATIVADO (OU INEXISTENTE) VALE 0 NAS FÓRMULAS DO D.
--
--    As fórmulas citam A1, A8, B4, C1 e C2 pelo código. Os operandos saíam de
--    `vivas` (só ativas), então desativar C2 tirava a linha, o `max()` virava
--    nulo, o D2 virava nulo, o TOTAL virava nulo — e o guarda
--    `fn_valida_encargos_rubrica` recusava o salvamento dizendo que "nenhuma
--    rubrica ativa pode ficar sem percentual", sobre uma rubrica que tinha sido
--    DESATIVADA. Quem lia não tinha como entender.
--
--    Desativar é a resposta "não pago isso", e a reincidência de algo que não
--    se paga é zero. O mesmo vale para "não incide" no regime (aplica_* false):
--    é resposta completa, e já valia 0 na soma dos grupos.
--
--    O que CONTINUA nulo, de propósito: operando ATIVO, que incide, SEM
--    percentual. Isso é pergunta em aberto, e a regra 1 de 20260920193443
--    ("nulo não é zero") segue valendo para ele.
--
-- 2. RUBRICA ESTRUTURAL PODE SER EXCLUÍDA, MENOS AS QUE AS FÓRMULAS CITAM.
--
--    Antes só a rubrica própria saía; a estrutural só desativava. Agora
--    A2–A7, A9, B1–B3, B5–B10 e C3–C5 também podem ser excluídas. A1, A8, B4,
--    C1 e C2 continuam só com desativar: excluí-las faria a fórmula usar 0 PARA
--    SEMPRE, sem linha na tela para reativar. O D é derivado e também fica.
--    Quem excluir por engano recria como rubrica própria com o mesmo código
--    (o CHECK `encargos_personalizadas_validas` aceita 'A2').
--
-- O seletor de fórmula do D1 saiu da tela na mesma entrega. O CHECK de
-- `formula` continua aceitando as duas variantes: a linha de produção já está
-- em 'A*B' e nada no banco precisa mudar por isso.

-- ------------------------------------------------------------
-- 1. fn_encargos_totais: só o CTE `operandos` muda
-- ------------------------------------------------------------
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
  -- Operando por código: ativo e incidindo SEM percentual = nulo (pergunta em
  -- aberto); desativado, excluído ou "não incide" = 0; senão o percentual.
  operandos as (
    select
      (select h from somas where grupo = 'A') as a_h,
      (select m from somas where grupo = 'A') as a_m,
      (select h from somas where grupo = 'B') as b_h,
      (select m from somas where grupo = 'B') as b_m,
      case when bool_or(v.codigo = 'A1' and v.aplica_horista and v.percentual_horista is null) then null
           else coalesce(max(v.percentual_horista) filter (where v.codigo = 'A1' and v.aplica_horista), 0) end as a1_h,
      case when bool_or(v.codigo = 'A1' and v.aplica_mensalista and v.percentual_mensalista is null) then null
           else coalesce(max(v.percentual_mensalista) filter (where v.codigo = 'A1' and v.aplica_mensalista), 0) end as a1_m,
      case when bool_or(v.codigo = 'A8' and v.aplica_horista and v.percentual_horista is null) then null
           else coalesce(max(v.percentual_horista) filter (where v.codigo = 'A8' and v.aplica_horista), 0) end as a8_h,
      case when bool_or(v.codigo = 'A8' and v.aplica_mensalista and v.percentual_mensalista is null) then null
           else coalesce(max(v.percentual_mensalista) filter (where v.codigo = 'A8' and v.aplica_mensalista), 0) end as a8_m,
      case when bool_or(v.codigo = 'B4' and v.aplica_horista and v.percentual_horista is null) then null
           else coalesce(max(v.percentual_horista) filter (where v.codigo = 'B4' and v.aplica_horista), 0) end as b4_h,
      case when bool_or(v.codigo = 'B4' and v.aplica_mensalista and v.percentual_mensalista is null) then null
           else coalesce(max(v.percentual_mensalista) filter (where v.codigo = 'B4' and v.aplica_mensalista), 0) end as b4_m,
      case when bool_or(v.codigo = 'C1' and v.aplica_horista and v.percentual_horista is null) then null
           else coalesce(max(v.percentual_horista) filter (where v.codigo = 'C1' and v.aplica_horista), 0) end as c1_h,
      case when bool_or(v.codigo = 'C1' and v.aplica_mensalista and v.percentual_mensalista is null) then null
           else coalesce(max(v.percentual_mensalista) filter (where v.codigo = 'C1' and v.aplica_mensalista), 0) end as c1_m,
      case when bool_or(v.codigo = 'C2' and v.aplica_horista and v.percentual_horista is null) then null
           else coalesce(max(v.percentual_horista) filter (where v.codigo = 'C2' and v.aplica_horista), 0) end as c2_h,
      case when bool_or(v.codigo = 'C2' and v.aplica_mensalista and v.percentual_mensalista is null) then null
           else coalesce(max(v.percentual_mensalista) filter (where v.codigo = 'C2' and v.aplica_mensalista), 0) end as c2_m
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
  'Total de encargo por grupo (A–D e os próprios) e a linha TOTAL. NULO = rubrica ativa sem percentual, nunca soma parcial. Nas fórmulas do D, operando desativado, excluído ou que não incide vale 0 (20260925200000); operando ativo sem percentual continua nulo.';

-- ------------------------------------------------------------
-- 2. Exclusão de rubrica estrutural que não é operando
-- ------------------------------------------------------------
-- O nome antigo ("…_personalizados") passaria a mentir: renomeada junto.
drop policy if exists "admin_gestao_delete_encargos_personalizados" on public.encargos_rubricas;
drop policy if exists "admin_gestao_delete_encargos_rubricas" on public.encargos_rubricas;
create policy "admin_gestao_delete_encargos_rubricas"
  on public.encargos_rubricas for delete to authenticated
  using (
    coalesce(public.fn_current_role() in ('admin', 'gestao'), false)
    and grupo <> 'D'
    and codigo not in ('A1', 'A8', 'B4', 'C1', 'C2')
  );
