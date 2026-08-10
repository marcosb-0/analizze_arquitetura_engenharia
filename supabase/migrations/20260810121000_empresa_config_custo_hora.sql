-- ============================================================
-- PARÂMETROS DE CUSTO-HORA — encargos e jornada
-- ============================================================
-- Contexto: o catálogo herda do SINAPI o preço-hora de cada cargo (PEDREIRO
-- R$ 33,62/h em MG 06/2026). Isso é uma REFERÊNCIA de mercado, não o custo da
-- empresa: quem tem gente na folha paga o que assinou, não o que o SINAPI
-- publicou. Sem estes dois parâmetros não há como converter salário mensal em
-- custo por hora, e é por isso que eles vêm antes da migration que usa.
--
-- `encargos_sociais_percentual` é NULLABLE DE PROPÓSITO, e essa é a decisão
-- que importa aqui. Um default de 0 faria a mão de obra parecer custar só o
-- salário — 40% a 90% mais barata do que é — e o número apareceria em toda
-- composição, orçamento e proposta sem nada indicando que estava incompleto.
-- Nulo significa "não configurado", e a cadeia de preço simplesmente não usa
-- a folha enquanto estiver assim: o comportamento anterior (SINAPI) continua
-- valendo, que é o certo para quem ainda não respondeu à pergunta.
--
-- Não há valor "padrão de mercado" honesto para sugerir: o percentual muda
-- com regime tributário, desoneração e convenção coletiva. Quem sabe é o
-- usuário.

alter table public.empresa_config
  add column if not exists encargos_sociais_percentual numeric(6,2)
    check (encargos_sociais_percentual is null
           or (encargos_sociais_percentual >= 0 and encargos_sociais_percentual <= 300)),
  -- 220 h é a jornada mensal padrão da CLT (44 h semanais). Este tem default
  -- porque, ao contrário dos encargos, existe um valor certo por lei que vale
  -- para a maioria — e errar aqui distorce menos do que zerar encargos.
  add column if not exists jornada_mensal_horas numeric(6,2) not null default 220
    check (jornada_mensal_horas > 0),
  -- Usada só na conversão coeficiente ↔ produtividade da tela de composição
  -- (1,939 H/m² ⇄ 4,13 m²/dia). Não entra em nenhum cálculo de dinheiro.
  add column if not exists jornada_diaria_horas numeric(5,2) not null default 8
    check (jornada_diaria_horas > 0 and jornada_diaria_horas <= 24);

comment on column public.empresa_config.encargos_sociais_percentual is
  'Encargos sociais sobre o salário base, em %. NULO = não configurado: a fonte de preço "Folha" fica desligada e a cadeia segue no SINAPI. Nunca assumir 0.';
comment on column public.empresa_config.jornada_mensal_horas is
  'Horas mensais para converter salário em custo/hora. Padrão CLT 220 h.';
comment on column public.empresa_config.jornada_diaria_horas is
  'Horas por dia, usada só na conversão entre coeficiente (H/un) e produtividade (un/dia). Não entra em cálculo de custo.';
