-- ============================================================
-- ENCARGOS SOCIAIS POR RUBRICA — grupos A, B, C e D
-- ============================================================
-- Até aqui o encargo era UM número: `empresa_config.encargos_sociais_percentual`,
-- digitado à mão (ex.: 80). O número podia até estar certo, mas nada no app
-- conseguia mostrar de onde ele veio, nem conferi-lo, nem defendê-lo numa
-- planilha de concorrência. E um percentual único não distingue HORISTA de
-- MENSALISTA, que na tabela oficial diferem em ~40 pontos.
--
-- Esta migration não muda preço nenhum: só cria a tabela e a função que soma.
-- Quem liga a chave é 20260920150001, e mesmo lá o padrão é 'Direto'.
--
-- ------------------------------------------------------------
-- A TABELA DE REFERÊNCIA, e por que ela NÃO é semeada com valores
-- ------------------------------------------------------------
-- Fonte: SINAPI – Cálculos e Parâmetros, Apêndice 15 – Encargos Sociais –
-- Paraíba, Caixa Econômica Federal, vigência a partir de 01/2025.
--
--   CÓDIGO  DESCRIÇÃO                        HORISTA    MENSALISTA
--   A1      INSS                        5,00% ou 20,00%  (idem)      ← ver abaixo
--   A2      SESI                              1,50%       1,50%
--   A3      SENAI                             1,00%       1,00%
--   A4      INCRA                             0,20%       0,20%
--   A5      SEBRAE                            0,60%       0,60%
--   A6      Salário Educação                  2,50%       2,50%
--   A7      Seguro Contra Acidentes           3,00%       3,00%
--   A8      FGTS                              8,00%       8,00%
--   A9      SECONCI                           0,00%       0,00%
--   B1      Repouso Semanal Remunerado       18,02%    Não incide
--   B2      Feriados                          4,31%    Não incide
--   B3      Auxílio-Enfermidade               0,86%       0,65%
--   B4      13º Salário                      10,96%       8,33%
--   B5      Licença Paternidade               0,07%       0,05%
--   B6      Faltas Justificadas               0,73%       0,56%
--   B7      Dias de Chuvas                    2,04%    Não incide
--   B8      Auxílio Acidente de Trabalho      0,10%       0,07%
--   B9      Férias Gozadas                    9,76%       7,42%
--   B10     Salário Maternidade               0,03%       0,03%
--   C1      Aviso Prévio Indenizado           4,53%       3,45%
--   C2      Aviso Prévio Trabalhado           0,11%       0,08%
--   C3      Férias Indenizadas                4,29%       3,26%
--   C4      Depósito Rescisão Sem Justa Causa 2,96%       2,25%
--   C5      Indenização Adicional             0,38%       0,29%
--   (D é derivado — ver as fórmulas adiante)
--   TOTAL                     91,01% / 51,84% com desoneração
--                            113,60% / 69,85% sem desoneração
--
-- Os percentuais entram NULOS. Mesmo argumento que 20260810121000 já gravou
-- para o campo escalar, e ele não mudou por termos passado a detalhar:
--
--   "Não há valor 'padrão de mercado' honesto para sugerir: o percentual muda
--    com regime tributário, desoneração e convenção coletiva. Quem sabe é o
--    usuário."
--
-- A9 (SECONCI) muda por UF e é 0,00% em vários estados. A7 (RAT/SAT) muda com o
-- grau de risco e o FAP. B7 (dias de chuva) muda por região. Semear a Paraíba
-- para uma obra em São Paulo produziria uma tabela que PARECE conferida — pior
-- que uma vazia. Os números acima ficam aqui como ponto de partida que o
-- usuário copia conscientemente, com fonte e data à vista.
--
-- ------------------------------------------------------------
-- DESONERAÇÃO NÃO PRECISA DE COLUNA: ela é uma rubrica
-- ------------------------------------------------------------
-- A tabela da Caixa publica quatro colunas (com/sem desoneração × horista/
-- mensalista) e é tentador espelhar as quatro. Não é preciso: conferindo célula
-- a célula, entre "com" e "sem desoneração" **só o A1 muda** (5,00% → 20,00%).
-- A2..A9, todo o B e todo o C são idênticos, e o D é derivado. A desoneração já
-- está representada: é o valor que o usuário digita no A1.
--
-- ------------------------------------------------------------
-- GRUPO D É CALCULADO, NUNCA DIGITADO — fórmulas conferidas
-- ------------------------------------------------------------
-- D1 "Reincidência de Grupo A sobre Grupo B"
-- D2 "Reincidência de Grupo A sobre Aviso Prévio Trabalhado e Reincidência do
--     FGTS sobre Aviso Prévio Indenizado"
--
-- Conferidas contra as quatro células publicadas (operandos em pontos
-- percentuais, daí o ÷100):
--
--   D2 = A×C2 + A8×C1
--     horista    sem deson.: 36,80×0,11 + 8,00×4,53 = 0,4029 → 0,40%  ✓
--     horista    com deson.: 21,80×0,11 + 8,00×4,53 = 0,3864 → 0,39%  ✓
--     mensalista sem deson.: 36,80×0,08 + 8,00×3,45 = 0,3054 → 0,31%  ✓
--     mensalista com deson.: 21,80×0,08 + 8,00×3,45 = 0,2934 → 0,29%  ✓
--
--   D1 = A×B                     (sem desoneração)
--     horista:    36,80×46,88 = 17,2518 → 17,25%  ✓
--     mensalista: 36,80×17,11 =  6,2965 →  6,30%  ✓
--
--   D1 = A×B − A1×B4             (com desoneração, Lei nº 14.973/2024: o INSS
--                                 não reincide sobre o 13º)
--     horista:    21,80×46,88 − 5,00×10,96 =  9,6718 → 9,67%  ✓
--     mensalista: 21,80×17,11 − 5,00× 8,33 =  3,3130 → 3,31%  ✓
--
-- Por que D2 usa A8 e não o total de A: aviso prévio INDENIZADO não é
-- remuneração, então INSS e terceiros não incidem — só o FGTS, por previsão
-- legal expressa. O aviso prévio TRABALHADO é tempo trabalhado e leva o grupo A
-- inteiro. Não é assimetria por descuido; é a razão de D2 existir separado.
--
-- As DUAS variantes de D1 estão no conjunto fechado porque a tabela oficial usa
-- uma em cada coluna. Quem escolhe é o usuário, junto com o A1 — as duas
-- decisões são a mesma decisão (o regime tributário), e separá-las produziria a
-- combinação incoerente calada.
--
-- O conjunto é fechado por CHECK e resolvido por `case`: fórmula nova exige
-- migration. Isto é regra contábil, não dado do usuário, e um campo de texto
-- livre aqui viraria um interpretador de expressões dentro do banco.
--
-- FÓRMULA NOVA = MEXER EM TRÊS LUGARES: o CHECK abaixo, o `case` de
-- `fn_encargos_totais()` e o espelho em `src/lib/encargos.ts`.

create table if not exists public.encargos_rubricas (
  -- `codigo` é a chave, como em `unidades_medida`: tabela de domínio, sem ciclo
  -- de vida de linha. As fórmulas do grupo D citam 'A1', 'A8', 'B4', 'C1' e
  -- 'C2' pelo nome, então o código precisa ser estável — renomear um quebra o
  -- `case`, e uma PK deixa isso explícito em vez de escondido numa unique.
  codigo      text primary key,
  grupo       text not null check (grupo in ('A', 'B', 'C', 'D')),
  descricao   text not null,

  -- Mesma faixa do escalar que estas rubricas somam para produzir
  -- (`empresa_config.encargos_sociais_percentual`, 0..300).
  percentual_horista    numeric(7,4)
    check (percentual_horista is null
           or (percentual_horista >= 0 and percentual_horista <= 300)),
  percentual_mensalista numeric(7,4)
    check (percentual_mensalista is null
           or (percentual_mensalista >= 0 and percentual_mensalista <= 300)),

  -- "Não incide" da tabela oficial (B1, B2 e B7 no mensalista) é uma resposta
  -- COMPLETA, e precisa ser distinguível de "ainda não preenchida". Com um nulo
  -- só para as duas coisas, a tela não saberia se cobra o preenchimento ou se
  -- mostra um traço — e o total não saberia se pode fechar.
  aplica_horista    boolean not null default true,
  aplica_mensalista boolean not null default true,

  formula text
    check (formula is null
           or formula in ('A*B', 'A*B-A1*B4', 'A*C2+A8*C1')),

  ordem integer not null,
  ativo boolean not null default true,

  updated_at timestamptz not null default now(),

  -- ('B', 'A3') não pode existir: o grupo é o prefixo do código, e o grupo é a
  -- chave de agregação de D1.
  constraint encargos_rubricas_codigo_do_grupo
    check (codigo like grupo || '%'),

  -- Grupo D é derivado, e SÓ o grupo D é derivado.
  constraint encargos_rubricas_d_e_derivado check (
    (grupo = 'D')
      = (formula is not null)
  ),
  constraint encargos_rubricas_d_nao_e_digitado check (
    grupo <> 'D'
      or (percentual_horista is null and percentual_mensalista is null)
  ),

  -- "Não incide" não é um zero disfarçado: sem isto, B1 poderia guardar 18,02
  -- no mensalista com `aplica_mensalista = false` e ninguém saberia qual dos
  -- dois a soma respeitou.
  constraint encargos_rubricas_nao_incide_fica_vazio check (
    (aplica_horista    or percentual_horista    is null)
    and
    (aplica_mensalista or percentual_mensalista is null)
  )
);

comment on table public.encargos_rubricas is
  'Rubricas de encargo social nos grupos A, B, C e D (estrutura SINAPI). Somadas por fn_encargos_totais() produzem o percentual que a cadeia de preço já consome. Percentual nulo = não respondida; aplica_* false = não incide naquele regime.';
comment on column public.encargos_rubricas.formula is
  'Só grupo D, conjunto fechado. A1 é o INSS, A8 o FGTS, B4 o 13º, C1 o aviso prévio indenizado e C2 o trabalhado. Operandos em pontos percentuais: o produto é dividido por 100. Fórmula nova mexe aqui, no case de fn_encargos_totais() e em src/lib/encargos.ts.';
comment on column public.encargos_rubricas.aplica_mensalista is
  'false = "Não incide" da tabela oficial (repouso semanal, feriados, dias de chuva). Diferente de percentual nulo, que é "não respondida".';

create index if not exists encargos_rubricas_ordem on public.encargos_rubricas (ordem);

drop trigger if exists trg_encargos_rubricas_updated_at on public.encargos_rubricas;
create trigger trg_encargos_rubricas_updated_at
  before update on public.encargos_rubricas
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- Semente: a estrutura, sem os números
-- ============================================================
-- `ordem` deixa buracos de 10 para caber rubrica nova sem renumerar tudo.
insert into public.encargos_rubricas
  (codigo, grupo, descricao, aplica_horista, aplica_mensalista, formula, ordem) values
  ('A1',  'A', 'INSS',                                true,  true,  null, 110),
  ('A2',  'A', 'SESI',                                true,  true,  null, 120),
  ('A3',  'A', 'SENAI',                               true,  true,  null, 130),
  ('A4',  'A', 'INCRA',                               true,  true,  null, 140),
  ('A5',  'A', 'SEBRAE',                              true,  true,  null, 150),
  ('A6',  'A', 'Salário Educação',                    true,  true,  null, 160),
  ('A7',  'A', 'Seguro Contra Acidentes de Trabalho', true,  true,  null, 170),
  ('A8',  'A', 'FGTS',                                true,  true,  null, 180),
  ('A9',  'A', 'SECONCI',                             true,  true,  null, 190),

  ('B1',  'B', 'Repouso Semanal Remunerado',          true,  false, null, 210),
  ('B2',  'B', 'Feriados',                            true,  false, null, 220),
  ('B3',  'B', 'Auxílio-Enfermidade',                 true,  true,  null, 230),
  ('B4',  'B', '13º Salário',                         true,  true,  null, 240),
  ('B5',  'B', 'Licença Paternidade',                 true,  true,  null, 250),
  ('B6',  'B', 'Faltas Justificadas',                 true,  true,  null, 260),
  ('B7',  'B', 'Dias de Chuvas',                      true,  false, null, 270),
  ('B8',  'B', 'Auxílio Acidente de Trabalho',        true,  true,  null, 280),
  ('B9',  'B', 'Férias Gozadas',                      true,  true,  null, 290),
  ('B10', 'B', 'Salário Maternidade',                 true,  true,  null, 300),

  ('C1',  'C', 'Aviso Prévio Indenizado',             true,  true,  null, 310),
  ('C2',  'C', 'Aviso Prévio Trabalhado',             true,  true,  null, 320),
  ('C3',  'C', 'Férias Indenizadas',                  true,  true,  null, 330),
  ('C4',  'C', 'Depósito Rescisão Sem Justa Causa',   true,  true,  null, 340),
  ('C5',  'C', 'Indenização Adicional',               true,  true,  null, 350),

  -- A variante de D1 acompanha o regime escolhido no A1. Nasce na versão sem
  -- desoneração porque é a que a tabela oficial aplica quando o INSS é 20%.
  ('D1',  'D', 'Reincidência de Grupo A sobre Grupo B',
                                                      true,  true,  'A*B',        410),
  ('D2',  'D', 'Reincidência de Grupo A sobre Aviso Prévio Trabalhado e Reincidência do FGTS sobre Aviso Prévio Indenizado',
                                                      true,  true,  'A*C2+A8*C1', 420)
on conflict (codigo) do nothing;

-- ============================================================
-- fn_encargos_totais — a soma, com a regra do "não respondida"
-- ============================================================
-- Devolve uma linha por grupo mais a linha 'TOTAL'.
--
-- A REGRA QUE IMPORTA: o total de um grupo só existe quando TODAS as rubricas
-- ativas que incidem naquele regime têm percentual. Falta uma e o grupo inteiro
-- devolve NULO — não a soma parcial.
--
-- `sum()` ignora nulo e devolveria 36,80 para um grupo A com o FGTS em branco.
-- Esse número está errado e não PARECE errado, que é o pior modo de falha
-- possível para um custo. Nulo obriga a tela a dizer o que falta e impede o
-- modo 'Rubricas' de ser ligado pela metade (ver o guarda em 20260920150001).
--
-- A mesma regra vale para o grupo D, e lá ela cobre um segundo caso: fórmula
-- que entrou no CHECK e não no `case` abaixo cai no `else` nulo, o grupo D fica
-- nulo, o TOTAL fica nulo e o modo não liga. Sem isso, `sum()` puularia a linha
-- e o encargo sairia menor, calado.
--
-- SECURITY DEFINER para o resultado não depender de quem chama — mas SEM
-- `revoke execute`, ao contrário de `fn_custo_hora_folha`. O contraste é
-- deliberado: aquela lê `salario_base` e devolve o salário pela conta inversa;
-- esta só lê percentuais que qualquer autenticado já pode `select`.
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
  -- A lista de grupos é FIXA, e o join é LEFT. Com `group by v.grupo` sobre as
  -- rubricas, um grupo inteiro desativado sumiria do resultado em vez de
  -- aparecer zerado — e o espelho em `src/lib/encargos.ts`, que itera sobre os
  -- quatro grupos sempre, devolveria 0 para o mesmo caso. Duas contas que
  -- discordam num canto raro é exatamente o que o teste de paridade não pegaria
  -- e o orçamento pegaria.
  grupos (grupo) as (values ('A'), ('B'), ('C')),
  -- Totais de A, B e C. O `case` externo é a regra do parágrafo acima.
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
  -- Os operandos que as fórmulas do grupo D citam pelo código.
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
  -- Grupo D, rubrica a rubrica. Operandos em pontos percentuais, daí o ÷100.
  -- Operando nulo propaga nulo pela aritmética, que é o desejado: D não se
  -- inventa sem A, B e C fechados.
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
  -- Mesma regra dos grupos digitados: linha que incide e não resolveu anula o
  -- grupo inteiro, em vez de sumir da soma.
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
  -- O total só fecha com os quatro grupos fechados. `sum` voltaria a mentir
  -- aqui pelo mesmo motivo de sempre.
  select 'TOTAL',
         case when count(*) filter (where h is null) = 0 then round(sum(h), 4) end,
         case when count(*) filter (where m is null) = 0 then round(sum(m), 4) end
    from todos
  order by 1;
$$;

comment on function public.fn_encargos_totais() is
  'Total de encargo por grupo (A, B, C, D) e a linha TOTAL, para horista e mensalista. NULO num grupo significa rubrica ativa sem percentual — nunca soma parcial. Grupo D é derivado das fórmulas, jamais digitado.';

-- ============================================================
-- RLS e grants: lê quem já lia o número somado; escreve quem administra
-- ============================================================
-- Leitura para qualquer autenticado, como `empresa_config`. Não é simetria
-- preguiçosa, é necessidade: `gestao` abre Equipe mas não abre Configurações
-- (tabAccess.ts), e o painel de custo da ficha roda o espelho no cliente.
-- Fechar o SELECT em admin deixaria aquele painel vazio sem explicação.
--
-- Sobre o vazamento que motivou o `revoke execute` de `fn_custo_hora_folha`
-- (20260810122000:99-108 — custo/hora + encargos devolve o salário pela conta
-- inversa): não piora aqui. Os três termos da inversa já eram legíveis por
-- qualquer autenticado desde 20260726120002 (`encargos_sociais_percentual` e
-- `jornada_mensal_horas` estão sob `auth_read_empresa_config`). Esta tabela
-- publica o MESMO escalar em parcelas; não acrescenta termo à equação. Quem
-- guarda o vazamento é o preço, e ele segue guardado: `fn_preco_vigente` exige
-- admin/gestão desde 20260810125000.
--
-- INSERT e DELETE não são concedidos a ninguém: rubrica nova entra por
-- migration, como em `unidades_medida`. E o grant de UPDATE é por COLUNA —
-- RLS não recorta coluna, e sem isso a tela poderia apagar o C1 e cortar
-- metade do D2 sem que nada reclamasse.
alter table public.encargos_rubricas enable row level security;

revoke all on public.encargos_rubricas from anon, authenticated;
grant select on public.encargos_rubricas to authenticated;
grant update (percentual_horista, percentual_mensalista, aplica_horista, aplica_mensalista, ativo, formula)
  on public.encargos_rubricas to authenticated;

drop policy if exists "auth_read_encargos_rubricas" on public.encargos_rubricas;
create policy "auth_read_encargos_rubricas" on public.encargos_rubricas
  for select using (auth.uid() is not null);

drop policy if exists "admin_gestao_write_encargos_rubricas" on public.encargos_rubricas;
create policy "admin_gestao_write_encargos_rubricas" on public.encargos_rubricas
  for update using (public.fn_current_role() in ('admin', 'gestao'))
  with check (public.fn_current_role() in ('admin', 'gestao'));

-- ============================================================
-- Propagação: mexer numa rubrica move o custo de toda composição
-- ============================================================
-- Reusa `fn_propaga_custo_parametros()` de 20260810122000. Dá para reusar
-- porque ela não referencia NEW nem OLD: varre `composicao_itens` e chama
-- `fn_aplica_custo_composicao` para cada pai distinto.
--
-- FOR EACH STATEMENT, e não FOR EACH ROW como o gêmeo em `empresa_config`.
-- A função recalcula TODAS as composições a cada disparo; a tela salva as 26
-- rubricas num upsert só, e por linha isso seriam 26 varreduras completas do
-- catálogo em cadeia. O serviço no cliente precisa mandar UM request pela
-- tabela inteira, nunca um PATCH por célula — é a outra metade desta decisão.
--
-- Sem `update of`: `ativo`, os dois percentuais, os dois `aplica_*` e a fórmula
-- mudam o total. Disparar demais aqui é barato; disparar de menos é o bug
-- silencioso que 20260810141000 documenta.
--
-- Risco que fica visível de propósito: `fn_propaga_custo_parametros` foi escrita
-- para uma revisão anual de parâmetro ("acontece uma vez por ano"), e esta tela
-- a transforma num evento por salvamento. No tamanho atual do catálogo isso é
-- irrelevante. Se o catálogo crescer, a correção honesta é tornar o recálculo
-- assíncrono — NÃO estreitar a lista de colunas do trigger.
drop trigger if exists trg_propaga_custo_rubricas on public.encargos_rubricas;
create trigger trg_propaga_custo_rubricas
  after insert or update or delete on public.encargos_rubricas
  for each statement execute function public.fn_propaga_custo_parametros();
