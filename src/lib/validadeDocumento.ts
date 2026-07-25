import { SituacaoValidade } from '../types';
import { diasAte } from './data';

/** Qualquer documento que possa vencer. */
interface ComValidade {
  validade?: string;
}

/** Janela em que um ASO/NR já entra como "a vencer" e precisa ser reagendado. */
export const DIAS_ALERTA_VENCIMENTO = 30;

/**
 * Dias restantes até o vencimento: 0 vence hoje, negativo já venceu.
 * Retorna null quando a data é ausente ou inválida.
 */
export function diasAteVencimento(validade?: string): number | null {
  return diasAte(validade);
}

export function situacaoValidade(validade?: string): SituacaoValidade {
  const dias = diasAteVencimento(validade);
  if (dias === null) return 'sem-validade';
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_ALERTA_VENCIMENTO) return 'a-vencer';
  return 'vigente';
}

/** Rótulo curto para o chip do documento. */
export function rotuloValidade(validade?: string): string {
  const dias = diasAteVencimento(validade);
  if (dias === null) return 'Sem validade';
  if (dias < 0) return `Vencido há ${Math.abs(dias)}d`;
  if (dias === 0) return 'Vence hoje';
  return `Vence em ${dias}d`;
}

export interface ResumoDocumentos {
  vencidos: number;
  aVencer: number;
}

/**
 * Serve a qualquer coisa que tenha vencimento: documento de funcionário,
 * documento da empresa, documento de obra.
 */
export function resumirDocumentos(docs: ComValidade[]): ResumoDocumentos {
  return docs.reduce<ResumoDocumentos>(
    (acc, doc) => {
      const situacao = situacaoValidade(doc.validade);
      if (situacao === 'vencido') acc.vencidos += 1;
      else if (situacao === 'a-vencer') acc.aVencer += 1;
      return acc;
    },
    { vencidos: 0, aVencer: 0 }
  );
}
