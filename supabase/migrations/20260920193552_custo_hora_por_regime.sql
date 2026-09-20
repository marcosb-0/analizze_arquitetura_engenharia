-- ============================================================
-- O CUSTO-HORA PASSA A LER AS RUBRICAS — atrás de uma chave
-- ============================================================
-- 20260920150000 criou `encargos_rubricas` e `fn_encargos_totais()`. Esta
-- migration liga as duas pontas, e a decisão que governa tudo aqui é esta:
--
--   `encargos_modo = 'Direto'` REPRODUZ O COMPORTAMENTO DE HOJE, EXATAMENTE.
--
-- O default é 'Direto', então nenhuma composição, nenhum orçamento e nenhuma
-- proposta já formada se move por causa desta migration. É a mesma escolha que
-- 20260810141000 fez ao introduzir benefícios ("ficha em branco reproduz
-- exatamente o resultado anterior"), e ela existe porque o alternativo é mexer
-- no preço de obra em andamento sem ninguém ter pedido.
--
-- `encargos_sociais_percentual` NÃO é migrado para dentro da tabela nem zerado.
-- Ele fica intacto justamente para que voltar a 'Direto' restaure os preços
-- anteriores tal e qual — é o que torna a chave reversível, e portanto segura
-- de oferecer.
--
-- ------------------------------------------------------------
-- A cadeia de herança passa de dois degraus para três
-- ------------------------------------------------------------
--   1. `funcionarios.encargos_percentual`   — o override da ficha (inalterado)
--   2. o total do REGIME, quando modo = 'Rubricas'                    ← NOVO
--   3. `empresa_config.encargos_sociais_percentual` — o número digitado
--
-- `coalesce`, nunca `||`: encargo de 0% é resposta legítima (PJ), e um `||` a
-- trocaria pelo degrau seguinte em silêncio. A regra final não muda: nulo nos
-- TRÊS degraus significa que não existe custo/hora, a fonte `Folha` fica
-- desligada e a cadeia de preço segue no catálogo. Zero mentiria.

alter table public.empresa_config
  add column if not exists encargos_modo text not null default 'Direto'
    check (encargos_modo in ('Direto', 'Rubricas'));

comment on column public.empresa_config.encargos_modo is
  'Direto = usa encargos_sociais_percentual, o número digitado. Rubricas = usa o total de fn_encargos_totais() conforme o regime do funcionário. O guarda trg_z_empresa_config_valida_encargos impede ligar Rubricas com a tabela incompleta. Voltar para Direto restaura os preços anteriores.';

-- ============================================================
-- regime_encargos — e a armadilha que o default evita
-- ============================================================
-- LEIA ANTES DE TROCAR O DEFAULT PARA 'Horista'.
--
-- `funcionarios.salario_base` é uma remuneração MENSAL, e o divisor
-- `jornada_mensal_horas` vale 220 h — a jornada da CLT, que JÁ INCLUI o repouso
-- semanal remunerado (44 h/semana ÷ 6 dias × 30 dias). Ou seja: `salário ÷ 220`
-- já é um custo-hora de mensalista.
--
-- A coluna HORISTA do SINAPI existe porque o horista recebe só pelas horas
-- efetivamente trabalhadas, e por isso DSR, feriados e dias de chuva precisam
-- ser somados como encargo. Aplicá-la a um salário mensal cobra tudo isso duas
-- vezes: 18,02 + 4,31 + 2,04 = 24,37 pontos, mais a reincidência deles no D1.
-- Na tabela da Paraíba a diferença entre os dois regimes é de ~44 pontos —
-- perto de 25% a mais em TODA mão de obra, sem erro e sem aviso.
--
-- Por isso o default é 'Mensalista': não é preferência, é o que corresponde ao
-- significado de `salario_base` nesta tabela. E por isso a tela precisa avisar
-- quando alguém marcar 'Horista' sem trocar também a jornada para as horas
-- efetivamente trabalhadas (~190 h).
--
-- O modelo honesto é `tipo_remuneracao ('Mensal'|'Horária')` + `salario_hora`,
-- e ele está FORA do escopo desta etapa. Quem for fechar essa lacuna começa por
-- aqui, não trocando este default.
alter table public.funcionarios
  add column if not exists regime_encargos text not null default 'Mensalista'
    check (regime_encargos in ('Horista', 'Mensalista'));

comment on column public.funcionarios.regime_encargos is
  'Qual coluna de encargos_rubricas vale para esta pessoa. Padrão Mensalista porque salario_base é MENSAL e jornada 220 h já inclui o DSR — marcar Horista sem trocar a jornada para as horas efetivamente trabalhadas cobra repouso, feriado e chuva duas vezes. Só é lido quando empresa_config.encargos_modo = Rubricas.';

-- ============================================================
-- O estado inválido deixa de ser representável
-- ============================================================
-- Sem isto, ligar 'Rubricas' com a tabela pela metade faria `fn_encargos_totais`
-- devolver nulo, o `coalesce` cair no degrau 3 e o sistema voltar ao número
-- digitado — funcionando, com a tela afirmando que usa rubricas. Degradação
-- silenciosa é o modo de falha que este repositório mais persegue, e a resposta
-- dele é sempre a mesma: tornar o estado impossível em vez de tolerá-lo.
--
-- SECURITY DEFINER porque o guarda chama `fn_encargos_totais()`, que também é —
-- manter os dois iguais evita que o resultado dependa de quem escreve.
create or replace function public.fn_valida_encargos_modo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_h numeric;
  v_m numeric;
begin
  if new.encargos_modo <> 'Rubricas' then
    return new;
  end if;

  -- Tabela sem nenhuma rubrica ativa soma zero, e zero passaria pelo teste de
  -- nulo abaixo — ligando o modo para cobrar 0% de encargo, que é a mentira
  -- que este guarda inteiro existe para impedir. Não deveria acontecer (a
  -- semente traz as 26 e DELETE não é concedido a ninguém), e é por isso mesmo
  -- que a checagem é barata.
  if not exists (select 1 from public.encargos_rubricas where ativo) then
    raise exception
      'Não é possível orçar pela tabela de rubricas: nenhuma rubrica está ativa.'
      using errcode = 'check_violation';
  end if;

  select horista, mensalista into v_h, v_m
    from public.fn_encargos_totais()
   where grupo = 'TOTAL';

  if v_h is null or v_m is null then
    raise exception
      'Não é possível orçar pela tabela de rubricas: faltam percentuais. Preencha todas as rubricas ativas dos grupos A, B e C nos dois regimes, desative as que não usa, ou marque que a rubrica não incide no regime.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_valida_encargos_modo() from anon, authenticated, public;

-- `trg_z_` não é estético: trigger BEFORE dispara em ordem ALFABÉTICA, e este
-- guarda precisa correr DEPOIS dos que já existem em `empresa_config`, senão
-- rouba a mensagem deles.
drop trigger if exists trg_z_empresa_config_valida_encargos on public.empresa_config;
create trigger trg_z_empresa_config_valida_encargos
  before insert or update of encargos_modo on public.empresa_config
  for each row execute function public.fn_valida_encargos_modo();

-- O espelho do guarda acima: com o modo já ligado, apagar o percentual de uma
-- rubrica ativa reabriria o mesmo buraco pelo outro lado.
create or replace function public.fn_valida_encargos_rubrica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modo text;
  v_h numeric;
  v_m numeric;
begin
  select encargos_modo into v_modo
    from public.empresa_config where singleton limit 1;

  if coalesce(v_modo, 'Direto') <> 'Rubricas' then
    return null;
  end if;

  select horista, mensalista into v_h, v_m
    from public.fn_encargos_totais()
   where grupo = 'TOTAL';

  if v_h is null or v_m is null then
    raise exception
      'A empresa está orçando pela tabela de rubricas, então nenhuma rubrica ativa pode ficar sem percentual. Desative a rubrica, ou marque que ela não incide naquele regime.'
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

revoke execute on function public.fn_valida_encargos_rubrica() from anon, authenticated, public;

-- AFTER e FOR EACH STATEMENT: a pergunta é sobre a tabela inteira depois da
-- escrita, não sobre a linha. Um guarda por linha recusaria o passo
-- intermediário de quem preenche a tabela de cima para baixo numa transação só.
drop trigger if exists trg_z_encargos_rubricas_completas on public.encargos_rubricas;
create trigger trg_z_encargos_rubricas_completas
  after insert or update or delete on public.encargos_rubricas
  for each statement execute function public.fn_valida_encargos_rubrica();

-- ============================================================
-- fn_custo_hora_folha — o degrau novo, e nada mais
-- ============================================================
-- Tudo o que 20260810141000 decidiu continua valendo e não se repete aqui: o
-- `max` é sobre o CUSTO/HORA e não sobre o salário; benefício ausente é zero;
-- e o EXECUTE segue revogado porque custo/hora mais encargos devolve o salário
-- pela conta inversa (verificado: 3.400,22 para um salário de 3.400,00).
--
-- A estrutura mudou num ponto, e de propósito: a herança agora mora numa CTE
-- (`base.encargos_efetivos`) em vez de aparecer duas vezes, no `select` e no
-- `where`. Com três degraus, a expressão duplicada era quase garantia de as
-- duas cópias divergirem numa manutenção futura — e o cabeçalho da versão
-- anterior já prometia "a regra fica num lugar só".
create or replace function public.fn_custo_hora_folha(p_insumo_id uuid)
returns table (preco numeric, funcionarios integer, data_origem date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (
    select encargos_sociais_percentual, jornada_mensal_horas, encargos_modo
      from public.empresa_config
     where singleton
     limit 1
  ),
  -- Uma leitura só para toda a folha: a tabela de rubricas é da empresa, não
  -- da pessoa. Devolve nulo enquanto estiver incompleta — e aí o `coalesce`
  -- abaixo cai no número digitado, que é o degrau que sempre existiu. Essa
  -- queda é o que mantém a chave reversível sem quebrar preço.
  rub as (
    select horista, mensalista
      from public.fn_encargos_totais()
     where grupo = 'TOTAL'
  ),
  base as (
    select f.salario_base,
           f.vale_transporte_mensal, f.vale_alimentacao_mensal,
           f.plano_saude_mensal, f.outros_beneficios_mensal,
           f.updated_at,
           coalesce(f.jornada_mensal_horas, cfg.jornada_mensal_horas) as jornada_efetiva,
           coalesce(
             f.encargos_percentual,
             -- Sem ELSE: em 'Direto' o `case` devolve nulo e o coalesce segue
             -- para o degrau 3, termo por termo igual à versão anterior. É
             -- disto que depende a garantia de compatibilidade desta migration.
             case when cfg.encargos_modo = 'Rubricas' then
               case f.regime_encargos
                 when 'Horista' then rub.horista
                 else                rub.mensalista
               end
             end,
             cfg.encargos_sociais_percentual
           ) as encargos_efetivos
      from public.funcionarios f
      cross join cfg
      cross join rub
     where f.catalogo_mao_de_obra_id = p_insumo_id
       and f.status = 'Ativo'
       and f.salario_base is not null
       and f.salario_base > 0
  ),
  custos as (
    select round(
             (b.salario_base * (1 + b.encargos_efetivos / 100.0)
              + coalesce(b.vale_transporte_mensal, 0)
              + coalesce(b.vale_alimentacao_mensal, 0)
              + coalesce(b.plano_saude_mensal, 0)
              + coalesce(b.outros_beneficios_mensal, 0))
             / b.jornada_efetiva, 2) as custo_hora,
           b.updated_at
      from base b
     -- Encargo indefinido nos TRÊS degraus: a folha não entra e a cadeia segue
     -- no catálogo. A regra fica aqui, num lugar só.
     where b.encargos_efetivos is not null
  )
  select max(custo_hora), count(*)::int, max(updated_at)::date
    from custos
  having count(*) > 0;
$$;

comment on function public.fn_custo_hora_folha(uuid) is
  'Custo/hora de um insumo de mão de obra a partir da folha: MAIOR custo/hora entre os ativos vinculados, onde custo/hora = (salário × (1+encargos) + benefícios) ÷ jornada mensal. Encargos herdam em três degraus: ficha, tabela de rubricas por regime (só quando encargos_modo = Rubricas), número digitado da empresa. Não devolve linha sem funcionário ativo vinculado ou sem encargos em nenhum dos três.';

revoke execute on function public.fn_custo_hora_folha(uuid) from anon, authenticated, public;

-- ============================================================
-- Propagação — as listas enumeradas coluna a coluna
-- ============================================================
-- Esquecer uma coluna aqui não dá erro: deixa toda composição que usa aquele
-- cargo com o preço velho, calada, até alguém mexer num coeficiente por acaso.
-- 20260810141000 documentou isso ao acrescentar as seis colunas de benefício, e
-- as duas colunas desta migration entram pelo mesmo motivo.
drop trigger if exists trg_propaga_custo_folha on public.funcionarios;
create trigger trg_propaga_custo_folha
  after insert or delete or update of
    salario_base, status, catalogo_mao_de_obra_id,
    encargos_percentual, jornada_mensal_horas,
    vale_transporte_mensal, vale_alimentacao_mensal,
    plano_saude_mensal, outros_beneficios_mensal,
    regime_encargos
  on public.funcionarios
  for each row execute function public.fn_propaga_custo_folha();

-- Virar a chave move o custo de TODA mão de obra de uma vez — é o disparo mais
-- caro do sistema, e também o mais raro. `encargos_modo` entra na lista `update
-- of` E na cláusula `when`: esquecer a segunda é a metade silenciosa do bug.
drop trigger if exists trg_propaga_custo_parametros on public.empresa_config;
create trigger trg_propaga_custo_parametros
  after update of encargos_sociais_percentual, jornada_mensal_horas, encargos_modo
  on public.empresa_config
  for each row
  when (old.encargos_sociais_percentual is distinct from new.encargos_sociais_percentual
        or old.jornada_mensal_horas is distinct from new.jornada_mensal_horas
        or old.encargos_modo is distinct from new.encargos_modo)
  execute function public.fn_propaga_custo_parametros();
