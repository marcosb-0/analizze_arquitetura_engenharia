/**
 * Do HH previsto ao prazo sugerido.
 *
 * O HH vem pronto do banco (`etapa_hh`), somado sobre a cadeia de preço e a
 * árvore de composição. O que esta função faz é dividir esse número pela
 * equipe que o usuário diz que vai alocar — aritmética sobre entradas que ele
 * escolhe, não uma segunda apuração do que o servidor já calculou.
 *
 * A sugestão NUNCA sobrescreve o prazo agendado. O CPM roda no cliente
 * (ver `lib/cronograma/agendar.ts`), e um prazo mexido por baixo rearranjaria
 * o caminho crítico sem ninguém ter pedido. O botão de aplicar é do usuário.
 */

export interface SugestaoDuracao {
  /** Dias ÚTEIS de trabalho, arredondados para cima. */
  dias: number;
  /** Horas que a equipe entrega por dia — `tamanhoEquipe × jornadaDiaria`. */
  capacidadeDiaria: number;
}

/**
 * `null` quando não dá para sugerir: sem HH, sem equipe ou sem jornada não há
 * conta a fazer. Devolver 0 ou Infinity aqui viraria "0 dias" na tela, que é
 * uma afirmação falsa em vez de uma ausência.
 */
export function sugerirDuracao(
  hhTotal: number,
  tamanhoEquipe: number,
  jornadaDiaria: number
): SugestaoDuracao | null {
  if (!Number.isFinite(hhTotal) || hhTotal <= 0) return null;
  if (!Number.isFinite(tamanhoEquipe) || tamanhoEquipe <= 0) return null;
  if (!Number.isFinite(jornadaDiaria) || jornadaDiaria <= 0) return null;

  const capacidadeDiaria = tamanhoEquipe * jornadaDiaria;
  // Teto e não arredondamento: meio dia de serviço ainda ocupa um dia de obra.
  return { dias: Math.ceil(hhTotal / capacidadeDiaria), capacidadeDiaria };
}

/**
 * Caminho inverso: dado um prazo já agendado, quanta gente ele exige.
 *
 * Responde a pergunta que o cronograma levanta na prática — "consigo fazer
 * isto nos 10 dias que prometi?" — sem obrigar o usuário a testar tamanhos de
 * equipe um a um.
 */
export function equipeNecessaria(
  hhTotal: number,
  dias: number,
  jornadaDiaria: number
): number | null {
  if (!Number.isFinite(hhTotal) || hhTotal <= 0) return null;
  if (!Number.isFinite(dias) || dias <= 0) return null;
  if (!Number.isFinite(jornadaDiaria) || jornadaDiaria <= 0) return null;
  return Math.ceil(hhTotal / (dias * jornadaDiaria));
}
