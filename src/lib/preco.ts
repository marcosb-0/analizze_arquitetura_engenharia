import { CotacaoFornecedor, InsumoCatalogo, AjustePreco, TipoAjuste, CategoriaCusto } from '../types';

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

/** Espelha `round(x, 2)` do Postgres — meio-para-cima, não o meio-par do JS. */
function round2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export const AJUSTE_NEUTRO: AjustePreco = { tipo: 'Nenhum', valor: 0 };

/**
 * Aplica o ajuste sobre a base. Valor negativo = desconto, positivo = acréscimo.
 * Nunca devolve preço negativo (o banco tem a mesma CHECK).
 */
export function aplicarAjuste(base: number, ajuste: AjustePreco): number {
  const bruto =
    ajuste.tipo === 'Percentual' ? base * (1 + ajuste.valor / 100)
    : ajuste.tipo === 'Valor'    ? base + ajuste.valor
    :                              base;
  return Math.max(0, round2(bruto));
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
  origem: 'Cotação' | 'Referência';
  cotacao?: CotacaoFornecedor;
  /** Havia cotação mais barata, mas fora do prazo de validade. */
  ignoradasPorVencimento: number;
};

/**
 * Melhor preço utilizável de um insumo. Diferente da versão anterior (que
 * pegava a mais barata sem olhar data, deixando uma cotação de meses atrás
 * vencer uma de ontem), cotação vencida não concorre — mas é contada, para a
 * UI poder avisar em vez de silenciar.
 */
export function melhorPreco(insumo: InsumoCatalogo, hoje = new Date()): MelhorPreco {
  const cotacoes = insumo.cotacoesFornecedores ?? [];
  const vigentes = cotacoes.filter((c) => !cotacaoVencida(c, hoje));
  const vencidasMaisBaratas = cotacoes.filter(
    (c) => cotacaoVencida(c, hoje) && c.precoUnitario < (vigentes.length ? Math.min(...vigentes.map((v) => v.precoUnitario)) : insumo.precoReferencia)
  );

  if (vigentes.length === 0) {
    return {
      preco: insumo.precoReferencia,
      fornecedorId: insumo.fornecedorPadraoId,
      origem: 'Referência',
      ignoradasPorVencimento: vencidasMaisBaratas.length,
    };
  }

  const melhor = [...vigentes].sort((a, b) => a.precoUnitario - b.precoUnitario)[0];
  return {
    preco: melhor.precoUnitario,
    fornecedorId: melhor.fornecedorId,
    origem: 'Cotação',
    cotacao: melhor,
    ignoradasPorVencimento: vencidasMaisBaratas.length,
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
