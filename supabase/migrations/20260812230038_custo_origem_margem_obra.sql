-- ============================================================
-- O CUSTO PASSA A SOBREVIVER À CONVERSÃO PROPOSTA → OBRA (item A1)
-- ============================================================
--
-- É o item P1 das duas auditorias, e o motivo pelo qual o app **não consegue
-- dizer a margem de nenhuma obra**.
--
-- ------------------------------------------------------------
-- O QUE ACONTECIA
-- ------------------------------------------------------------
-- Na proposta, custo e negociação ficam separados: `preco_unitario_base` é o
-- preço do catálogo e `ajuste` é o que se decidiu cobrar a mais. Na obra os dois
-- colapsavam num número só, com o BDI multiplicado por cima:
--
--   proposta:  base 39,60  +  ajuste Valor +6,00        →  venda 45,60
--   obra:      base 61,56  (= 45,60 × 1,35)  +  'Nenhum'
--
-- Depois disso, 39,60 não existe em lugar nenhum do modelo da obra. E como
-- `itens_orcamento.valor_orcado` também é preço de VENDA (ver
-- `analise-financeiro.md` §7.3.1), não sobra nenhum lado de custo com que
-- comparar. Margem é a diferença entre dois números, e só um deles era guardado.
--
-- Três consequências, todas registradas em `analise-catalogo.md`:
--
--   §3.1 — o selo de procedência (`preco_nivel`, `preco_fonte_efetiva`) descreve
--          um preço que foi substituído. "SINAPI, R$ 31,55" aparecia ao lado de
--          R$ 58,34: 85% de distância. E é esse selo que alimenta o
--          `ConfiancaPreco` e a contingência sugerida — decisão de margem
--          tomada sobre um rótulo que não descreve o valor ao lado dele.
--   §3.2 — sem custo, não há margem.
--   §3.3 — o ajuste sumia como NÚMERO. O wizard preservava só o `motivo`, que é
--          texto opcional: sem motivo digitado e com BDI 0, o resultado era
--          `null`, e não sobrava registro de que alguém quase dobrou um preço.
--
-- ------------------------------------------------------------
-- A ESCOLHA: ACRESCENTAR, NÃO REINTERPRETAR
-- ------------------------------------------------------------
-- A tentação é fazer `preco_unitario_base` voltar a significar custo e o
-- `ajuste` carregar a margem. Isso quebraria a cadeia financeira inteira:
-- `fn_sync_valor_item_orcamento` soma `quantidade × preco_unitario` para dentro
-- de `itens_orcamento.valor_orcado`, que é preço de venda e alimenta o razão. O
-- repositório já registra ter errado sobre essa coluna uma vez.
--
-- Então nada do que existe muda de significado. As colunas abaixo são novas e
-- guardam o que era descartado. `preco_unitario` continua sendo a venda, e a
-- soma que chega ao financeiro continua idêntica.

alter table public.insumos_projeto
  add column if not exists custo_origem         numeric(14,4),
  add column if not exists ajuste_origem_tipo   text,
  add column if not exists ajuste_origem_valor  numeric(14,4),
  add column if not exists bdi_aplicado         numeric(6,3);

comment on column public.insumos_projeto.custo_origem is
  'Custo unitário que o SELO de procedência (preco_nivel/preco_fonte_efetiva/preco_data_origem) descreve — antes de negociação e antes de BDI. É o outro lado da margem: venda é preco_unitario. NULL = desconhecido (linha anterior a 20260812230038, ou item cujo custo nunca foi registrado).';
comment on column public.insumos_projeto.ajuste_origem_tipo is
  'O que a proposta negociou sobre o custo: Nenhum | Percentual | Valor. Preservado como DADO, não como texto no motivo — o §3.3 registra o caso em que o motivo ficou nulo e o ajuste sumiu sem rastro.';
comment on column public.insumos_projeto.ajuste_origem_valor is
  'O valor da negociação, na unidade que ajuste_origem_tipo diz. Junto com custo_origem e bdi_aplicado, reconstrói preco_unitario por aritmética.';
comment on column public.insumos_projeto.bdi_aplicado is
  'BDI (%) que a conversão multiplicou sobre o preço negociado. Fecha a conta: (custo_origem ⊕ ajuste_origem) × (1 + bdi_aplicado/100) = preco_unitario.';

-- ------------------------------------------------------------
-- O CHECK QUE MANTÉM O TIPO HONESTO
-- ------------------------------------------------------------
-- Mesmo domínio de `ajuste_tipo`, e nulo é permitido porque a coluna inteira é
-- opcional. Sem isto, um 'Percentual' escrito 'percentual' passaria e o cálculo
-- de margem silenciosamente ignoraria o ajuste.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.insumos_projeto'::regclass
       and conname = 'insumos_projeto_ajuste_origem_tipo_check'
  ) then
    alter table public.insumos_projeto
      add constraint insumos_projeto_ajuste_origem_tipo_check
      check (ajuste_origem_tipo is null or ajuste_origem_tipo in ('Nenhum', 'Percentual', 'Valor'));
  end if;
end $$;

-- ------------------------------------------------------------
-- SEM BACKFILL, E ISSO É UMA CONSTATAÇÃO, NÃO UMA OMISSÃO
-- ------------------------------------------------------------
-- Conferido antes de aplicar: `insumos_projeto` tem ZERO linhas neste banco. Os
-- dados de obra que existiam eram de teste e foram removidos; o que há hoje é
-- uma proposta real ainda em elaboração. Não existe custo antigo a recuperar, e
-- portanto nenhum critério heurístico precisa ser inventado para adivinhá-lo.
--
-- Se um dia houver linhas antigas com `custo_origem` nulo, o caminho é o mesmo
-- que a auditoria descreve: casar `insumos_projeto` com `itens_proposta` por
-- (proposta da obra, catalogo_insumo_id) e só aceitar o par quando o preço de
-- venda bater — a assinatura da conversão. Nulo continua significando
-- "desconhecido", e a tela precisa dizer isso em vez de mostrar margem falsa.

-- ------------------------------------------------------------
-- A MARGEM, POR ITEM
-- ------------------------------------------------------------
-- Colunas explícitas, nunca `select ip.*`: view com estrela congela a lista de
-- colunas no momento da criação e já causou dois bugs silenciosos neste banco.
drop view if exists public.v_insumos_projeto;
create view public.v_insumos_projeto
with (security_invoker = true) as
  select
    ip.id,
    ip.projeto_id,
    ip.catalogo_insumo_id,
    ip.item_orcamento_id,
    ip.quantidade,
    ip.fornecedor_id,
    ip.etapa_vinculada_id,
    ip.quantidade_executada,
    ip.status,
    ip.observacoes,
    ip.created_at,
    ip.updated_at,
    ip.preco_unitario_base,
    ip.ajuste_tipo,
    ip.ajuste_valor,
    ip.ajuste_motivo,
    ip.preco_unitario,
    ip.preco_nivel,
    ip.preco_fonte_efetiva,
    ip.preco_data_origem,
    ip.custo_origem,
    ip.ajuste_origem_tipo,
    ip.ajuste_origem_valor,
    ip.bdi_aplicado,
    round(ip.quantidade * ip.preco_unitario, 2) as valor_total,
    round(ip.quantidade * ip.preco_unitario_base, 2) as valor_total_base,
    round(ip.quantidade * (ip.preco_unitario - ip.preco_unitario_base), 2) as valor_ajuste,
    -- Custo e margem só existem quando o custo é conhecido. `null` e não zero:
    -- zero afirmaria "custou nada", e uma soma de zeros vira margem de 100% —
    -- exatamente o número falso que este item veio impedir.
    case when ip.custo_origem is not null
         then round(ip.quantidade * ip.custo_origem, 2) end as valor_total_custo,
    case when ip.custo_origem is not null
         then round(ip.quantidade * (ip.preco_unitario - ip.custo_origem), 2) end as margem_valor,
    case when ip.custo_origem is not null and ip.preco_unitario > 0
         then round((ip.preco_unitario - ip.custo_origem) / ip.preco_unitario * 100, 2) end as margem_percentual,
    case
      when ip.quantidade > 0::numeric
        then least(round(ip.quantidade_executada / ip.quantidade * 100::numeric, 2), 100::numeric)
      else 0::numeric
    end as percentual_executado,
    ci.descricao as insumo_descricao,
    ci.unidade as insumo_unidade,
    ci.categoria as insumo_categoria,
    ci.preco_referencia as insumo_preco_referencia
  from public.insumos_projeto ip
  join public.catalogo_insumos ci on ci.id = ip.catalogo_insumo_id;

comment on view public.v_insumos_projeto is
  'Insumos da obra com os derivados de valor e, desde 20260812230038, a margem por item. As três colunas de margem são NULAS quando custo_origem é nulo — sem custo conhecido não há margem, e zerar produziria margem de 100%.';

-- ------------------------------------------------------------
-- A MARGEM, POR OBRA
-- ------------------------------------------------------------
-- Separada de `v_resumo_obra` de propósito: aquela é lida em TODA listagem de
-- obra, e a margem só interessa a quem abre o resultado. Somar um join a mais
-- na leitura mais quente do app para servir uma tela é o tipo de custo que o
-- §4.2 acabou de tirar daqui.
--
-- `itens_conhecidos` / `itens_total` existe para a tela poder dizer sobre QUANTO
-- do orçamento ela está falando. Uma margem apurada sobre 3 de 40 itens é um
-- número verdadeiro sobre uma amostra, e apresentá-lo como "a margem da obra"
-- seria a mesma classe de erro que o §3.1 aponta: um rótulo que não descreve o
-- número ao lado dele.
create or replace view public.v_margem_obra
with (security_invoker = true) as
  select
    ip.projeto_id,
    count(*)                                          as itens_total,
    count(*) filter (where ip.custo_origem is not null) as itens_conhecidos,
    round(sum(ip.quantidade * ip.preco_unitario), 2)  as venda_total,
    round(sum(ip.quantidade * ip.custo_origem)
            filter (where ip.custo_origem is not null), 2) as custo_total,
    round(sum(ip.quantidade * (ip.preco_unitario - ip.custo_origem))
            filter (where ip.custo_origem is not null), 2) as margem_valor,
    -- O percentual é sobre a VENDA DOS ITENS COM CUSTO CONHECIDO, não sobre a
    -- venda total: dividir a margem de parte do orçamento pela venda inteira
    -- daria um percentual menor que o real, e a conta não fecharia com a coluna
    -- ao lado.
    case
      when sum(ip.quantidade * ip.preco_unitario) filter (where ip.custo_origem is not null) > 0
        then round(
               sum(ip.quantidade * (ip.preco_unitario - ip.custo_origem)) filter (where ip.custo_origem is not null)
               / sum(ip.quantidade * ip.preco_unitario) filter (where ip.custo_origem is not null)
               * 100, 2)
    end as margem_percentual
  from public.insumos_projeto ip
  group by ip.projeto_id;

comment on view public.v_margem_obra is
  'Margem real por obra: venda (preco_unitario) contra custo de origem, desde 20260812230038. itens_conhecidos/itens_total diz sobre quanto do orçamento a margem fala — sem isso, margem apurada sobre 3 de 40 itens seria apresentada como a margem da obra.';

grant select on public.v_margem_obra to authenticated;
