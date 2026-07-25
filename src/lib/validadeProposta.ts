import { Proposta } from '../types';
import { diasAte } from './data';

/**
 * Vigência comercial da proposta. A data de validade existia no cadastro mas
 * não produzia nenhum efeito: uma proposta vencida continuava indistinguível
 * das demais na lista e seguia para aprovação e conversão em obra sem aviso.
 *
 * Aqui só se classifica — vencer NÃO bloqueia nada. Prorrogar validade é
 * negociação corriqueira, então o vencimento avisa em vez de impedir.
 */

/** Antecedência em que a proposta entra em "a vencer" e pede follow-up. */
export const DIAS_ALERTA_VALIDADE = 7;

export type SituacaoValidadeProposta = 'sem-validade' | 'vencida' | 'vence-hoje' | 'a-vencer' | 'vigente';

export function situacaoValidade(proposta: Proposta): SituacaoValidadeProposta {
  // Aprovada e rejeitada já saíram da mesa: cobrar validade delas seria ruído.
  if (proposta.status === 'Aprovada' || proposta.status === 'Rejeitada') return 'vigente';

  const dias = diasAte(proposta.dataValidade);
  if (dias === null) return 'sem-validade';
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'vence-hoje';
  if (dias <= DIAS_ALERTA_VALIDADE) return 'a-vencer';
  return 'vigente';
}

/** Rótulo curto para o chip da lista. `null` quando não há o que sinalizar. */
export function rotuloValidade(proposta: Proposta): string | null {
  const dias = diasAte(proposta.dataValidade);
  switch (situacaoValidade(proposta)) {
    case 'vencida':
      return `Vencida há ${Math.abs(dias!)}d`;
    case 'vence-hoje':
      return 'Vence hoje';
    case 'a-vencer':
      return `Vence em ${dias}d`;
    default:
      return null;
  }
}

export const CORES_VALIDADE: Record<SituacaoValidadeProposta, string> = {
  vencida: 'bg-rose-50 text-rose-700 border border-rose-200',
  'vence-hoje': 'bg-amber-50 text-amber-800 border border-amber-200',
  'a-vencer': 'bg-amber-50 text-amber-700 border border-amber-200',
  vigente: '',
  'sem-validade': '',
};
