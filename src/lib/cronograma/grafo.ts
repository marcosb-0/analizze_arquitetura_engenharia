import { Dependencia } from '../../types';

/** Um ciclo encontrado, na ordem em que fecha. */
export interface Ciclo {
  ids: string[];
}

/**
 * Predecessoras indexadas pela sucessora — o formato que o forward pass lê.
 */
export function indexarPorSucessora(deps: Dependencia[]): Map<string, Dependencia[]> {
  const mapa = new Map<string, Dependencia[]>();
  for (const d of deps) {
    const atual = mapa.get(d.sucessoraId);
    if (atual) atual.push(d);
    else mapa.set(d.sucessoraId, [d]);
  }
  return mapa;
}

/** Sucessoras indexadas pela predecessora — o formato do backward pass. */
export function indexarPorPredecessora(deps: Dependencia[]): Map<string, Dependencia[]> {
  const mapa = new Map<string, Dependencia[]>();
  for (const d of deps) {
    const atual = mapa.get(d.predecessoraId);
    if (atual) atual.push(d);
    else mapa.set(d.predecessoraId, [d]);
  }
  return mapa;
}

/**
 * Ordenação topológica por Kahn.
 *
 * Kahn e não busca em profundidade porque **o resultado parcial de Kahn já é a
 * resposta**: os nós que sobram com grau de entrada > 0 no fim são exatamente os
 * que estão presos num ciclo, e é isso que a mensagem de erro precisa dizer.
 * Com DFS seria preciso um segundo mecanismo (pilha de visita) só para
 * reconstruir o mesmo conjunto.
 *
 * Empate resolvido pela ordem de entrada da lista `ids`, que é a ordem da EAP —
 * assim duas etapas independentes saem sempre na mesma sequência, e o
 * agendamento não muda de resultado entre dois carregamentos.
 */
export function ordenarTopologicamente(
  ids: string[],
  deps: Dependencia[]
): { ordem: string[]; ciclo: Ciclo | null } {
  const presentes = new Set(ids);
  // Aresta com uma ponta fora da lista é ignorada, e não tratada como erro: a
  // lista dada é só de FOLHAS, e uma dependência órfã (etapa recém-excluída,
  // ou escondida pela RLS) não pode impedir o resto de ser agendado.
  const arestas = deps.filter((d) => presentes.has(d.predecessoraId) && presentes.has(d.sucessoraId));

  const grau = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const d of arestas) grau.set(d.sucessoraId, (grau.get(d.sucessoraId) ?? 0) + 1);

  const porPredecessora = indexarPorPredecessora(arestas);
  const fila = ids.filter((id) => grau.get(id) === 0);
  const ordem: string[] = [];

  while (fila.length > 0) {
    const atual = fila.shift()!;
    ordem.push(atual);
    for (const d of porPredecessora.get(atual) ?? []) {
      const restante = (grau.get(d.sucessoraId) ?? 0) - 1;
      grau.set(d.sucessoraId, restante);
      if (restante === 0) fila.push(d.sucessoraId);
    }
  }

  if (ordem.length === ids.length) return { ordem, ciclo: null };

  const presos = ids.filter((id) => (grau.get(id) ?? 0) > 0);
  return { ordem, ciclo: { ids: presos } };
}

/**
 * A ligação `candidata` fecharia um ciclo?
 *
 * Chamada a cada movimento do ponteiro enquanto se arrasta uma ligação, para o
 * alvo inválido ficar visivelmente recusado ANTES de soltar — em vez de aceitar
 * o gesto e devolver um toast de erro depois. Por isso é uma travessia simples
 * a partir da sucessora, e não um Kahn completo: aqui só interessa se dá para
 * chegar de volta na predecessora.
 */
export function detectarCiclo(deps: Dependencia[], candidata: Dependencia): Ciclo | null {
  if (candidata.predecessoraId === candidata.sucessoraId) {
    return { ids: [candidata.predecessoraId] };
  }

  const porPredecessora = indexarPorPredecessora(
    // A própria candidata é excluída quando já existe (edição de tipo/atraso):
    // senão ela apareceria como caminho de volta para si mesma.
    deps.filter((d) => d.id !== candidata.id)
  );

  const vistos = new Set<string>();
  const caminho: string[] = [];
  const fila = [candidata.sucessoraId];

  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    caminho.push(atual);
    if (atual === candidata.predecessoraId) {
      return { ids: caminho };
    }
    for (const d of porPredecessora.get(atual) ?? []) fila.push(d.sucessoraId);
  }

  return null;
}
