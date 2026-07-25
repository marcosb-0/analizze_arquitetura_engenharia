/**
 * Prazo de execução da proposta.
 *
 * A coluna é um inteiro de dias corridos (ver 20260726120001). Era texto
 * livre, e o resultado é que cada proposta dizia o prazo de um jeito — "90
 * dias", "3 meses", "A definir" — sem ordenar, sem somar e sem virar data de
 * término na conversão em obra.
 *
 * A exibição continua sendo em dias, com o equivalente em meses só como apoio
 * de leitura: o número contratado é o de dias, e traduzir "45 dias" para "1,5
 * mês" no documento entregue ao cliente trocaria a unidade acordada.
 */

/** Rótulo do prazo. `fallback` cobre a proposta que ainda não o definiu. */
export function formatarPrazo(dias?: number | null, fallback = 'A definir'): string {
  if (!dias || dias <= 0) return fallback;
  const base = dias === 1 ? '1 dia' : `${dias} dias`;

  // Só arredonda para mês quando é múltiplo exato de 30 — "≈ 1,4 mês" não
  // ajuda ninguém, e um número quebrado ao lado do prazo real só polui.
  if (dias >= 30 && dias % 30 === 0) {
    const meses = dias / 30;
    return `${base} (${meses === 1 ? '1 mês' : `${meses} meses`})`;
  }
  return base;
}

/** Só o número, para colunas estreitas e para o documento impresso. */
export function formatarPrazoCurto(dias?: number | null, fallback = 'A definir'): string {
  if (!dias || dias <= 0) return fallback;
  return dias === 1 ? '1 dia' : `${dias} dias`;
}
