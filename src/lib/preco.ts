import { CotacaoFornecedor, InsumoCatalogo, AjustePreco, TipoAjuste, CategoriaCusto, NivelPreco, FonteEfetivaPreco } from '../types';

/**
 * Regras de preço compartilhadas entre catálogo, proposta e orçamento da obra.
 *
 * O contrato central: um preço usado num orçamento específico é sempre
 * `base + ajuste`, nunca um número solto. A base é a foto do preço de origem
 * (catálogo ou cotação) no momento da vinculação; o ajuste é o acréscimo ou
 * desconto daquele orçamento. Mexer no ajuste NUNCA altera o catálogo global.
 *
 * As mesmas três colunas existem em `insumos_projeto` e `itens_proposta`, e o
 * `preco_unitario` é coluna GENERATED nas duas — o cálculo aqui precisa bater
 * exatamente com o do banco (ver 20260723120001 e 20260723120002).
 */

/**
 * Espelha `round(x, 2)` do Postgres: meio para LONGE DE ZERO, em decimal.
 *
 * A versão anterior era `Math.round((valor + Number.EPSILON) * 100) / 100`, e
 * **estava errada** — descoberto pelo teste de paridade em `preco.test.ts`, que
 * compara com valores calculados pelo próprio Postgres:
 *
 *     8.165 → Postgres 8.17, esta função devolvia 8.16
 *
 * Duas falhas somadas:
 *
 * 1. `Number.EPSILON` é o intervalo entre doubles consecutivos **em 1.0**
 *    (2.22e-16). Em 8.165 o intervalo representável é cerca de 8× maior, então
 *    somar EPSILON não move o número o suficiente para compensar o fato de que
 *    8.165 é, em binário, 8.16499999999999914... Funcionava em 1.005 e 2.675
 *    (magnitude ~1) e falhava a partir de ~8. Um "conserto" que só valia perto
 *    de 1 e dava a impressão de valer sempre.
 *
 * 2. `Math.round` arredonda meio para +∞, não para longe de zero:
 *    `Math.round(-0.5)` é `-0`, enquanto `round(-0.5::numeric)` no Postgres é
 *    `-1`. Só aparece em preço negativo, que existe (ver `precoUnitarioGerado`).
 *
 * A correção desloca o expoente pela via decimal (`toExponential`), que não
 * acumula erro binário: "8.165e+0" → "8.165e+2" → 816.5 exato → 817 → 8.17.
 */
function deslocaExpoente(valor: number, casas: number): number {
  const [mantissa, expoente] = valor.toExponential().split('e');
  return Number(`${mantissa}e${Number(expoente) + casas}`);
}

function round2(valor: number): number {
  if (!Number.isFinite(valor)) return valor;
  const sinal = valor < 0 ? -1 : 1;
  // Arredonda o valor absoluto e reaplica o sinal: é o que torna o meio
  // "para longe de zero", igual ao Postgres.
  return sinal * deslocaExpoente(Math.round(deslocaExpoente(Math.abs(valor), 2)), -2);
}

export const AJUSTE_NEUTRO: AjustePreco = { tipo: 'Nenhum', valor: 0 };

/**
 * Espelho EXATO da coluna `preco_unitario`, que é GENERATED em `insumos_projeto`
 * e em `itens_proposta`. Extraída de `information_schema.columns`:
 *
 *     round(CASE ajuste_tipo
 *       WHEN 'Percentual' THEN preco_unitario_base * (1 + ajuste_valor / 100.0)
 *       WHEN 'Valor'      THEN preco_unitario_base + ajuste_valor
 *       ELSE preco_unitario_base
 *     END, 2)
 *
 * Sem `Math.max`: o banco NÃO limita a zero, ele arredonda e pronto. Quem barra
 * o negativo é a CHECK `preco_unitario >= 0`, que **recusa a linha** em vez de
 * corrigi-la. Ver `aplicarAjuste` para o porquê da distinção importar.
 *
 * `src/lib/preco.test.ts` tranca esta paridade com casos calculados pelo próprio
 * Postgres. Se alguém mexer no arredondamento de um lado, o teste acusa.
 */
export function precoUnitarioGerado(base: number, ajuste: AjustePreco): number {
  const bruto =
    ajuste.tipo === 'Percentual' ? base * (1 + ajuste.valor / 100)
    : ajuste.tipo === 'Valor'    ? base + ajuste.valor
    :                              base;
  return round2(bruto);
}

/**
 * Preço para EXIBIR. Igual ao do banco, exceto que não mostra negativo.
 *
 * O comentário anterior aqui dizia "nunca devolve preço negativo (o banco tem a
 * mesma CHECK)" — e essa leitura estava errada, de um jeito que produz um bug
 * visível. Uma CHECK não é um `clamp`: o banco calcula `1,00 + (−1,50) = −0,50` e
 * então **recusa o INSERT** com `23514 insumos_projeto_preco_nao_negativo`
 * (verificado em transação revertida no projeto svgkbqfozxwrbzheshuc).
 *
 * Ou seja: com um desconto que passa do valor da base, a tela mostra `R$ 0,00`,
 * parece tudo certo, e o salvamento morre com erro cru do Postgres. O clamp
 * esconde justamente a condição que causa a recusa.
 *
 * O clamp fica, porque exibir `−R$ 0,50` no meio de uma planilha de custos é
 * pior; mas quem monta formulário deve consultar `ajusteRecusadoPeloBanco` antes
 * de deixar salvar. Ligada nos dois formulários em 10/ago/2026: `InsumosObra` e
 * `catalogo/ModalVincularObra`. Formulário novo que aplique ajuste precisa
 * repetir a checagem — o clamp continua escondendo a condição.
 */
export function aplicarAjuste(base: number, ajuste: AjustePreco): number {
  return Math.max(0, precoUnitarioGerado(base, ajuste));
}

/**
 * `true` quando o ajuste levaria o preço abaixo de zero — e portanto a escrita
 * será recusada pela CHECK do banco, por mais que a tela mostre `R$ 0,00`.
 */
export function ajusteRecusadoPeloBanco(base: number, ajuste: AjustePreco): boolean {
  return precoUnitarioGerado(base, ajuste) < 0;
}

/** Quanto o ajuste representa em reais por unidade (positivo = acréscimo). */
export function deltaAjuste(base: number, ajuste: AjustePreco): number {
  return round2(aplicarAjuste(base, ajuste) - base);
}

/** O mesmo delta em percentual sobre a base — para exibir "−10%" mesmo quando o ajuste foi em R$. */
export function deltaAjustePercentual(base: number, ajuste: AjustePreco): number {
  if (base <= 0) return 0;
  return round2((deltaAjuste(base, ajuste) / base) * 100);
}

export function descreveAjuste(base: number, ajuste: AjustePreco): string {
  if (ajuste.tipo === 'Nenhum' || ajuste.valor === 0) return 'Sem ajuste';
  const delta = deltaAjuste(base, ajuste);
  const sinal = delta >= 0 ? '+' : '−';
  const abs = Math.abs(delta).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = Math.abs(deltaAjustePercentual(base, ajuste)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return `${sinal} R$ ${abs} / un (${sinal}${pct}%)`;
}

/**
 * Converte um preço-alvo digitado pelo usuário no ajuste equivalente. Deixa a
 * UI aceitar "quero pagar R$ 27,00" e guardar a procedência (base 29,00 com
 * desconto de R$ 2,00) em vez de perder a referência.
 */
export function ajusteParaPrecoAlvo(base: number, alvo: number, tipo: TipoAjuste = 'Valor'): AjustePreco {
  if (round2(alvo) === round2(base)) return AJUSTE_NEUTRO;
  if (tipo === 'Percentual') {
    if (base <= 0) return AJUSTE_NEUTRO;
    return { tipo: 'Percentual', valor: round2(((alvo - base) / base) * 100) };
  }
  return { tipo: 'Valor', valor: round2(alvo - base) };
}

// ============================================================
// Cotações
// ============================================================

/** Dias corridos desde a cotação. */
export function idadeCotacao(cotacao: CotacaoFornecedor, hoje = new Date()): number {
  const data = new Date(`${cotacao.dataCotacao}T00:00:00`);
  return Math.max(0, Math.floor((hoje.getTime() - data.getTime()) / 86_400_000));
}

export function cotacaoVencida(cotacao: CotacaoFornecedor, hoje = new Date()): boolean {
  return idadeCotacao(cotacao, hoje) > (cotacao.validadeDias ?? 30);
}

export type MelhorPreco = {
  preco: number;
  fornecedorId?: string;
  origem: FonteEfetivaPreco;
  nivel: NivelPreco;
  /** Dias desde a origem do preço. Idade não rebaixa nível — só informa. */
  diasIdade?: number;
  /** A cotação vencedora, quando o preço veio de uma e ela está carregada. */
  cotacao?: CotacaoFornecedor;
  /** Havia cotação mais barata, mas fora do prazo de validade. */
  ignoradasPorVencimento: number;
};

/**
 * Preço efetivo de um insumo — agora apenas LENDO o que o banco resolveu.
 *
 * Esta função calculava a regra por conta própria e discordava do banco: o card
 * mostrava "melhor cotação R$ 32" enquanto a composição que usava o insumo era
 * orçada com os R$ 38 do SINAPI, porque `fn_custo_composicao` somava
 * `preco_referencia`. Duas verdades para o mesmo número.
 *
 * Desde 20260726230000 a resolução mora em `fn_preco_vigente` e chega pronta em
 * `v_catalogo_insumos`. A regra também MUDOU nesse movimento: cotação vencida
 * não é mais descartada em favor do SINAPI — ela desce para o nível 2
 * ("Praticado"), porque um preço real de um fornecedor real vale mais que a
 * média nacional. Por isso `origem` tem quatro valores e não dois.
 */
export function melhorPreco(insumo: InsumoCatalogo, hoje = new Date()): MelhorPreco {
  const cotacoes = insumo.cotacoesFornecedores ?? [];
  // Continua sendo conta de tela: quantas cotações o usuário cadastrou que
  // estão fora do prazo e abaixo do preço em uso — o aviso de "revalide esta
  // cotação". Não decide preço nenhum.
  const ignoradasPorVencimento = cotacoes.filter(
    (c) => cotacaoVencida(c, hoje) && c.precoUnitario < insumo.precoVigente
  ).length;

  return {
    preco: insumo.precoVigente,
    fornecedorId: insumo.precoFornecedorId ?? insumo.fornecedorPadraoId,
    origem: insumo.precoFonteEfetiva,
    nivel: insumo.precoNivel,
    diasIdade: insumo.precoDiasIdade,
    cotacao: insumo.precoFornecedorId
      ? cotacoes.find((c) => c.fornecedorId === insumo.precoFornecedorId && c.precoUnitario === insumo.precoVigente)
      : undefined,
    ignoradasPorVencimento,
  };
}

// ============================================================
// Taxonomia
// ============================================================

/**
 * Ponte única entre a categoria do catálogo (5 valores) e a categoria de custo
 * do orçamento (7 valores). Estava duplicada inline no CatalogoTab.
 */
const MAPA_CATEGORIA: Record<InsumoCatalogo['categoria'], CategoriaCusto> = {
  'Material': 'Materiais',
  'Mão de Obra': 'Mão de Obra',
  'Equipamento': 'Equipamentos',
  'Serviço': 'Terceiros',
  'Taxa': 'Administração',
};

export function categoriaCustoDoInsumo(categoria: InsumoCatalogo['categoria']): CategoriaCusto {
  return MAPA_CATEGORIA[categoria] ?? 'Materiais';
}

/**
 * Normalização de busca — precisa bater com `fn_normaliza_busca` no banco
 * (minúsculas + sem acento), senão o filtro sobre `catalogo_insumos.busca`
 * erra em qualquer termo acentuado.
 */
export function normalizaBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
