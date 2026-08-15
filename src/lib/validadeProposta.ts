import { Proposta } from '../types';
import { diasAte } from './data';
import type { TomChip } from '../components/ui';

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

/**
 * O TOM do selo de validade — `null` nas duas situações que não sinalizam nada.
 *
 * Era um mapa de classes Tailwind (`CORES_VALIDADE`) com a pill montada à mão
 * nos dois arquivos que o liam, e com dois âmbares diferentes: `text-amber-800`
 * para "vence hoje" e `-700` para "a vencer", uma diferença que ninguém
 * distingue e que ninguém escolheu. Agora é um `TomChip` e quem desenha é o
 * `<Chip>`, como todo o resto do app.
 */
export const TOM_VALIDADE: Record<SituacaoValidadeProposta, TomChip | null> = {
  vencida: 'negativo',
  'vence-hoje': 'atencao',
  'a-vencer': 'atencao',
  vigente: null,
  'sem-validade': null,
};
