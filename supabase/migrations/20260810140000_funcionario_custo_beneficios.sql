-- ============================================================
-- O que o colaborador CUSTA — encargos, jornada e benefícios por pessoa
-- ============================================================
-- A ficha guardava só `salario_base`, e `20260810121000` colocou encargos e
-- jornada em `empresa_config` como parâmetro ÚNICO da empresa. Isso resolveu o
-- caso médio e errou os três casos reais que aparecem em qualquer obra:
--
--   • o meio período, que trabalha 110 h e não 220 — o custo/hora dele é o
--     dobro do que a conta global devolve;
--   • o cargo com encargo diferente (PJ, aprendiz, diarista), que não pode
--     carregar o mesmo percentual do CLT registrado;
--   • vale-transporte, vale-refeição e plano de saúde, que a empresa paga
--     todo mês e que simplesmente não existiam em lugar nenhum do sistema.
--
-- As seis colunas abaixo são o override por pessoa. `empresa_config` continua
-- sendo o padrão: ficha em branco herda a empresa, e é assim que as fichas já
-- cadastradas seguem funcionando sem ninguém tocar nelas.
--
-- ------------------------------------------------------------
-- NULO QUER DIZER DUAS COISAS DIFERENTES AQUI, e confundir as duas é o erro
-- que essa migration existe para evitar:
-- ------------------------------------------------------------
--
--   encargos_percentual / jornada_mensal_horas  →  NULO = "herda a empresa".
--       Se a empresa também estiver nula (encargos), o custo/hora não existe e
--       a fonte de preço 'Folha' fica desligada, exatamente como hoje. Ler
--       nulo como 0 faria a mão de obra parecer 40–90% mais barata do que é —
--       é a mesma decisão já escrita em 20260810121000, e ela vale nos dois
--       níveis.
--
--   os quatro benefícios  →  NULO = "não tem", soma zero. Aqui o nulo é
--       informação completa: quem não recebe vale-transporte não recebe, e
--       não há nada a herdar da empresa. Benefício é valor absoluto por
--       pessoa; não existe padrão da empresa para herdar.
--
-- Os benefícios são quatro colunas fixas e não uma tabela filha porque o que
-- se pede deles é somar, e a soma de quatro campos nomeados é legível na ficha
-- e no orçamento sem CRUD, hook e RLS próprios. 'Outros' absorve o resto sem
-- exigir migration nova.

alter table public.funcionarios
  -- Mesma faixa de `empresa_config.encargos_sociais_percentual` de propósito:
  -- a ficha e a tela da empresa precisam recusar o mesmo valor, senão o
  -- usuário aprende a regra num lugar e apanha no outro.
  add column if not exists encargos_percentual numeric(6,2)
    check (encargos_percentual is null
           or (encargos_percentual >= 0 and encargos_percentual <= 300)),
  add column if not exists jornada_mensal_horas numeric(6,2)
    check (jornada_mensal_horas is null or jornada_mensal_horas > 0),
  add column if not exists vale_transporte_mensal numeric(14,2)
    check (vale_transporte_mensal is null or vale_transporte_mensal >= 0),
  add column if not exists vale_alimentacao_mensal numeric(14,2)
    check (vale_alimentacao_mensal is null or vale_alimentacao_mensal >= 0),
  add column if not exists plano_saude_mensal numeric(14,2)
    check (plano_saude_mensal is null or plano_saude_mensal >= 0),
  add column if not exists outros_beneficios_mensal numeric(14,2)
    check (outros_beneficios_mensal is null or outros_beneficios_mensal >= 0);

comment on column public.funcionarios.encargos_percentual is
  'Encargos sociais desta pessoa, em %. NULO = herda empresa_config.encargos_sociais_percentual. Nunca assumir 0: nulo dos dois lados desliga a fonte de preço "Folha".';
comment on column public.funcionarios.jornada_mensal_horas is
  'Horas mensais desta pessoa. NULO = herda empresa_config.jornada_mensal_horas (220 h). Preencher para meio período, escala e jornada reduzida.';
comment on column public.funcionarios.vale_transporte_mensal is
  'Vale-transporte pago pela empresa, valor mensal. NULO = não recebe (soma zero). Não há padrão da empresa a herdar.';
comment on column public.funcionarios.vale_alimentacao_mensal is
  'Vale-alimentação/refeição pago pela empresa, valor mensal. NULO = não recebe (soma zero).';
comment on column public.funcionarios.plano_saude_mensal is
  'Custo mensal do plano de saúde bancado pela empresa. NULO = não tem (soma zero).';
comment on column public.funcionarios.outros_beneficios_mensal is
  'Demais benefícios mensais somados (creche, seguro, ajuda de custo). NULO = não tem (soma zero).';

-- RLS: nada a fazer. As políticas de `funcionarios` são de LINHA
-- (admin_all_funcionarios, gestao_all_funcionarios, financeiro_select_funcionarios,
-- em 20260718190006_rls_policies.sql) e alcançam qualquer coluna nova. `campo`
-- segue sem política e portanto sem acesso, que é o desenho. Estas colunas são
-- tão sensíveis quanto `salario_base` e recebem exatamente a mesma proteção.
