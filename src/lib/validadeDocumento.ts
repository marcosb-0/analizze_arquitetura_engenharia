import { FuncionarioDocumento, SituacaoValidade } from '../types';

/** Janela em que um ASO/NR já entra como "a vencer" e precisa ser reagendado. */
export const DIAS_ALERTA_VENCIMENTO = 30;

/** Meia-noite local de hoje, para comparar com datas sem hora do banco. */
function hojeLocal(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/**
 * Dias restantes até o vencimento: 0 vence hoje, negativo já venceu.
 * Retorna null quando a data é ausente ou inválida.
 */
export function diasAteVencimento(validade?: string): number | null {
  if (!validade) return null;
  const alvo = new Date(`${validade}T00:00:00`);
  if (isNaN(alvo.getTime())) return null;
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((alvo.getTime() - hojeLocal().getTime()) / msPorDia);
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

export function resumirDocumentos(docs: FuncionarioDocumento[]): ResumoDocumentos {
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
