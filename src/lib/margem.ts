import type { AjustePreco } from '../types';

/**
 * A CONTA QUE LEVA DO CUSTO ATÉ O PREÇO DE VENDA — e que o banco faz.
 *
 * Este arquivo existe pelo mesmo motivo de `lib/preco.ts` e `lib/avanco.ts`:
 * espelhar em TypeScript uma regra cuja autoridade é o Postgres, para que ela
 * possa ser testada sem banco e para que a divergência apareça num teste em vez
 * de aparecer numa tela.
 *
 * A cadeia, desde o item A1 (`20260812230038`):
 *
 *   (custo ⊕ ajuste) × (1 + BDI/100) = preço de venda
 *
 * O `⊕` é `ajuste_tipo`: soma quando é `Valor`, multiplicação quando é
 * `Percentual`, nada quando é `Nenhum`. Do lado do banco, os dois primeiros
 * termos vivem na coluna GENERATED `insumos_projeto.preco_unitario`, e o BDI é
 * aplicado pelo assistente de conversão antes de gravar.
 *
 * ## Por que ausência de custo não é custo zero
 *
 * `custoOrigem` é opcional, e nas linhas anteriores à migration ele não existe.
 * Toda função aqui devolve `undefined` nesse caso, nunca um número. Zerar
 * pareceria conservador e é o contrário: um custo zero produz margem de 100%, e
 * uma obra inteira sem custo registrado apareceria como a mais lucrativa da
 * lista. O §3.1 da auditoria de catálogo descreve exatamente essa classe de
 * erro — um rótulo que não descreve o número ao lado dele.
 */

/** Arredonda para centavos como o Postgres: `round(x, 2)` em `numeric`. */
function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** O preço depois da negociação, antes do BDI. */
export function precoNegociado(custo: number, ajuste?: AjustePreco): number {
  if (!ajuste || ajuste.tipo === 'Nenhum') return centavos(custo);
  if (ajuste.tipo === 'Percentual') return centavos(custo * (1 + ajuste.valor / 100));
  return centavos(custo + ajuste.valor);
}

/** O preço de venda: negociado com o BDI por cima. */
export function precoDeVenda(custo: number, ajuste?: AjustePreco, bdiPercentual = 0): number {
  return centavos(precoNegociado(custo, ajuste) * (1 + bdiPercentual / 100));
}

/**
 * Margem unitária em reais. `undefined` quando o custo é desconhecido.
 *
 * Recebe a venda em vez de recalculá-la de propósito: quem chama tem
 * `preco_unitario`, que é o número que o banco gravou e o que o financeiro
 * usou. Recalcular aqui poderia divergir por um centavo de arredondamento e
 * produzir uma margem que não bate com o razão.
 */
export function margemUnitaria(venda: number, custo?: number): number | undefined {
  if (custo == null) return undefined;
  return centavos(venda - custo);
}

/** Margem sobre a VENDA, em %. `undefined` sem custo, ou com venda zerada. */
export function margemPercentual(venda: number, custo?: number): number | undefined {
  if (custo == null || venda <= 0) return undefined;
  return centavos(((venda - custo) / venda) * 100);
}

/**
 * O quanto da obra a margem descreve.
 *
 * Existe porque a resposta honesta a "qual a margem desta obra" às vezes é
 * "sobre 3 dos 40 itens, 22%". Apresentar os 22% sozinhos seria verdadeiro e
 * enganoso ao mesmo tempo.
 */
export function cobertura(itensConhecidos: number, itensTotal: number): number {
  if (itensTotal <= 0) return 0;
  return centavos((itensConhecidos / itensTotal) * 100);
}

/** A margem descreve o orçamento inteiro? Abaixo disso, a tela precisa avisar. */
export function margemEhParcial(itensConhecidos: number, itensTotal: number): boolean {
  return itensTotal > 0 && itensConhecidos < itensTotal;
}
