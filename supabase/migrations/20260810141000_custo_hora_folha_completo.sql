-- ============================================================
-- O custo-hora da folha, agora com o custo inteiro
-- ============================================================
-- `fn_custo_hora_folha` (20260810122000) fazia:
--
--     maior salário ativo × (1 + encargos DA EMPRESA) ÷ 220
--
-- Três coisas ficavam de fora, e as três aparecem em qualquer folha real:
-- benefícios (VT, VR, plano de saúde) não entravam em conta nenhuma, a jornada
-- era a mesma para todo mundo, e o percentual de encargos também. Com as
-- colunas de 20260810140000 a conta passa a ser POR PESSOA:
--
--     custo mensal = salário × (1 + encargos_efetivos/100) + benefícios
--     custo/hora   = round(custo mensal ÷ jornada_efetiva, 2)
--
-- onde `_efetivos` é o valor da ficha quando preenchido e o da empresa quando
-- não. Ficha em branco reproduz exatamente o resultado anterior, então nenhum
-- preço já formado se mexe sozinho por causa desta migration.
--
-- ------------------------------------------------------------
-- A MUDANÇA DE SEMÂNTICA QUE PRECISA ESTAR ESCRITA:
-- ------------------------------------------------------------
-- `max` agora é sobre o CUSTO/HORA, não sobre o salário. A intenção de
-- 20260810122000 ("orçar pelo pior caso") não mudou — mudou o que é o pior
-- caso. Com jornadas diferentes, o maior salário deixa de ser a pessoa mais
-- cara por hora: um meio período de R$ 2.000 em 110 h custa R$ 18,18/h e sai
-- na frente de um integral de R$ 3.000 em 220 h a R$ 13,64/h. Manter o `max`
-- no salário devolveria o mais barato dos dois e o orçamento estouraria
-- justamente no caso que a regra existia para cobrir.
--
-- ------------------------------------------------------------
-- Herança dos encargos, e por que ela AMPLIA quem consegue orçar pela folha:
-- ------------------------------------------------------------
-- O filtro antigo era `cfg.encargos_sociais_percentual is not null` — sem o
-- parâmetro da empresa, ninguém tinha custo/hora. Agora é
-- `coalesce(f.encargos_percentual, cfg.encargos_sociais_percentual) is not null`:
-- quem preencheu o encargo na própria ficha entra mesmo com a empresa em
-- branco. O caso desligado continua desligado (nulo dos dois lados), que é a
-- decisão original de 20260810121000.

create or replace function public.fn_custo_hora_folha(p_insumo_id uuid)
returns table (preco numeric, funcionarios integer, data_origem date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (
    select encargos_sociais_percentual, jornada_mensal_horas
      from public.empresa_config
     where singleton
     limit 1
  ),
  custos as (
    select round(
             (f.salario_base
                * (1 + coalesce(f.encargos_percentual, cfg.encargos_sociais_percentual) / 100.0)
              + coalesce(f.vale_transporte_mensal, 0)
              + coalesce(f.vale_alimentacao_mensal, 0)
              + coalesce(f.plano_saude_mensal, 0)
              + coalesce(f.outros_beneficios_mensal, 0))
             / coalesce(f.jornada_mensal_horas, cfg.jornada_mensal_horas), 2) as custo_hora,
           f.updated_at
      from public.funcionarios f
      cross join cfg
     where f.catalogo_mao_de_obra_id = p_insumo_id
       and f.status = 'Ativo'
       and f.salario_base is not null
       and f.salario_base > 0
       -- Encargos não configurados em NENHUM dos dois níveis: a folha não
       -- entra e a cadeia segue no SINAPI. Filtrar aqui mantém a regra num
       -- lugar só, como na versão anterior.
       and coalesce(f.encargos_percentual, cfg.encargos_sociais_percentual) is not null
  )
  select max(custo_hora), count(*)::int, max(updated_at)::date
    from custos
  having count(*) > 0;
$$;

comment on function public.fn_custo_hora_folha(uuid) is
  'Custo/hora de um insumo de mão de obra a partir da folha: MAIOR custo/hora entre os ativos vinculados, onde custo/hora = (salário × (1+encargos) + benefícios) ÷ jornada mensal, com encargos e jornada herdados de empresa_config quando a ficha não os define. Não devolve linha sem funcionário ativo vinculado ou sem encargos em nenhum dos dois níveis.';

-- `create or replace` preserva a ACL, então este revoke é redundante hoje. Ele
-- fica porque o motivo dele não é: a função é SECURITY DEFINER, lê `salario_base`
-- e o PostgREST publica tudo que está em `public` como RPC. Com EXECUTE para
-- `authenticated`, qualquer logado recupera o salário pela conta inversa —
-- verificado em 20260810122000, que devolveu 3.400,22 para um salário de
-- 3.400,00. Com benefícios na conta a inversa fica menos direta, mas o cargo
-- com uma pessoa só continua entregando o número. Quem reescrever esta função
-- amanhã precisa ver esta linha junto do corpo.
revoke execute on function public.fn_custo_hora_folha(uuid) from anon, authenticated, public;

-- ============================================================
-- Propagação — a parte que quebra em silêncio se for esquecida
-- ============================================================
-- `trg_propaga_custo_folha` disparava em `update of salario_base, status,
-- catalogo_mao_de_obra_id`. As seis colunas novas mudam o custo/hora do mesmo
-- jeito que o salário muda: sem elas na lista, dar vale-refeição a um pedreiro
-- deixaria toda composição que usa PEDREIRO com o preço velho, sem erro, sem
-- aviso, até alguém mexer num coeficiente por acaso.
--
-- `fn_propaga_custo_folha` não muda — só a lista de colunas que a acorda.
drop trigger if exists trg_propaga_custo_folha on public.funcionarios;
create trigger trg_propaga_custo_folha
  after insert or delete or update of
    salario_base, status, catalogo_mao_de_obra_id,
    encargos_percentual, jornada_mensal_horas,
    vale_transporte_mensal, vale_alimentacao_mensal,
    plano_saude_mensal, outros_beneficios_mensal
  on public.funcionarios
  for each row execute function public.fn_propaga_custo_folha();
