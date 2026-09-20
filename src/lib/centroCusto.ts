import { CentroCusto } from '../types';

/**
 * Helpers da árvore de centros de custo (20260920015643).
 *
 * A hierarquia já vem resolvida do banco em `v_centros_custo` (`nivel`,
 * `caminho`), então aqui não se remonta árvore nenhuma: só se lê o que o
 * Postgres derivou. `caminho` é o que torna isso barato — `'1000 / 1100 / 1110'`.
 */

/** O separador que `v_centros_custo` usa entre os códigos do caminho. */
const SEPARADOR = ' / ';

/**
 * Os ids do centro pedido MAIS os de toda a sua subárvore.
 *
 * É o que faz filtrar por um centro sintético significar alguma coisa: o
 * agrupador nunca tem lançamento próprio, então "Administrativo" sem os filhos
 * devolveria sempre lista vazia.
 *
 * A comparação inclui o separador de propósito. Sem ele, o prefixo de `'110'`
 * casaria com `'1100'` e a subárvore de um centro engoliria a do vizinho.
 */
export function comDescendentes(centros: CentroCusto[], centroId: string): Set<string> {
  const alvo = centros.find((c) => c.id === centroId);
  if (!alvo) return new Set([centroId]);

  const prefixo = alvo.caminho + SEPARADOR;
  const ids = new Set([alvo.id]);
  for (const c of centros) {
    if (c.caminho.startsWith(prefixo)) ids.add(c.id);
  }
  return ids;
}
