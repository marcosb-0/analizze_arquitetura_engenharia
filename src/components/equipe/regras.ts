/** Regras da aba Equipe compartilhadas entre lista, ficha e formulário. */
import { Funcionario } from '../../types';

/** O que a lista precisa saber de cada pessoa além da ficha. */
export interface SinaisColaborador {
  frentes: number;
  docsVencidos: number;
  docsAVencer: number;
  /** Ativo sem salário: a folha não libera o pagamento. */
  semSalario: boolean;
}

export type Situacao = 'Todos' | 'Ativo' | 'Inativo' | 'Pendencias';

/** Frentes acima disto marcam a pessoa como sobrecarregada — mesma régua de antes. */
export const LIMITE_FRENTES = 2;

export const temPendencia = (f: Funcionario, s: SinaisColaborador | undefined) =>
  f.status === 'Ativo' && !!s && (s.docsVencidos > 0 || s.docsAVencer > 0 || s.semSalario);

/**
 * Campo numérico opcional do formulário, nas três respostas que ele tem:
 * `undefined` = em branco (herda a empresa, ou não recebe o benefício),
 * `null` = digitado e inválido, número = o valor. Separar as duas ausências é
 * o que permite avisar "isso não é um número" sem tratar campo vazio como erro.
 * Aceita vírgula porque o teclado brasileiro a entrega — o salário também, que
 * antes era `type="number"` e recusava "2.500,00" em silêncio.
 */
export function parseOpcional(valor: string): number | undefined | null {
  const limpo = valor.trim();
  if (!limpo) return undefined;
  // "2.500,00" → 2500.00: com vírgula presente, o ponto é separador de milhar.
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * O mesmo, para reais: "2.500" sem vírgula é dois mil e quinhentos, não dois e
 * meio — ninguém escreve salário com três casas decimais. Fora desse formato
 * exato (grupos de três após o ponto), vale a leitura de `parseOpcional`.
 */
export function parseDinheiro(valor: string): number | undefined | null {
  const limpo = valor.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ''));
  return parseOpcional(limpo);
}
