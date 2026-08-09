import { Dependencia } from '../../types';
import { CALENDARIO_BR, Calendario, duracaoDiasUteis, somarDiasUteis } from './calendario';
import { indexarPorPredecessora, ordenarTopologicamente } from './grafo';
import { ResultadoAgendamento } from './agendar';

export interface Folga {
  /** Dias úteis que a etapa pode atrasar sem empurrar a ENTREGA da obra. */
  folgaTotal: number;
  /** Dias úteis que ela pode atrasar sem empurrar a PRÓXIMA etapa. */
  folgaLivre: number;
  critica: boolean;
}

/**
 * O backward pass: quanto cada etapa pode atrasar sem mexer na entrega.
 *
 * É a pergunta que justifica ter um Gantt em vez de uma lista. Numa obra com
 * quarenta frentes, cinco ou seis determinam a data final e o resto tem
 * gordura — e sem esse cálculo toda etapa atrasada parece igualmente grave,
 * o que na prática significa que nenhuma é tratada como grave.
 *
 * `critica` é folga total ≤ 0: atrasar um dia atrasa a obra em um dia.
 */
export function calcularFolgas(
  ids: string[],
  dependencias: Dependencia[],
  resultado: ResultadoAgendamento,
  calendario: Calendario = CALENDARIO_BR
): Map<string, Folga> {
  const folgas = new Map<string, Folga>();
  if (resultado.ciclo) return folgas;

  const { ordem } = ordenarTopologicamente(ids, dependencias);
  const porPredecessora = indexarPorPredecessora(dependencias);

  // O fim do projeto é o fim mais tardio entre todas as etapas — não a data de
  // entrega cadastrada na obra. São coisas diferentes: a folga aqui mede o
  // cronograma contra si mesmo, e comparar com a entrega é outra conta (o
  // "desvio"), que a tela faz à parte.
  let fimDoProjeto = '';
  for (const id of ordem) {
    const d = resultado.porEtapa.get(id);
    if (d?.fim && d.fim > fimDoProjeto) fimDoProjeto = d.fim;
  }
  if (!fimDoProjeto) return folgas;

  /** Fim mais TARDE aceitável, calculado da última etapa para trás. */
  const fimTardio = new Map<string, string>();

  for (const id of [...ordem].reverse()) {
    const atual = resultado.porEtapa.get(id);
    if (!atual) continue;

    const sucessoras = porPredecessora.get(id) ?? [];
    let limite = fimDoProjeto;

    for (const dep of sucessoras) {
      const s = resultado.porEtapa.get(dep.sucessoraId);
      const sTardio = fimTardio.get(dep.sucessoraId);
      if (!s || !sTardio) continue;

      // Espelho de cada restrição do forward pass.
      const duracaoSucessora = duracaoDiasUteis(s.inicio, s.fim, calendario);
      const inicioTardioSucessora = somarDiasUteis(
        sTardio,
        -(Math.max(1, duracaoSucessora) - 1),
        calendario
      );

      let candidato: string;
      switch (dep.tipo) {
        case 'FS':
          candidato = somarDiasUteis(inicioTardioSucessora, -(1 + dep.atrasoDias), calendario);
          break;
        case 'SS':
          // A predecessora não precisa terminar, só começar a tempo — o limite
          // sobre o FIM dela é o início tardio mais a própria duração.
          candidato = somarDiasUteis(
            somarDiasUteis(inicioTardioSucessora, -dep.atrasoDias, calendario),
            Math.max(1, duracaoDiasUteis(atual.inicio, atual.fim, calendario)) - 1,
            calendario
          );
          break;
        case 'FF':
          candidato = somarDiasUteis(sTardio, -dep.atrasoDias, calendario);
          break;
        case 'SF':
          candidato = somarDiasUteis(
            somarDiasUteis(sTardio, -dep.atrasoDias, calendario),
            Math.max(1, duracaoDiasUteis(atual.inicio, atual.fim, calendario)) - 1,
            calendario
          );
          break;
      }
      if (candidato < limite) limite = candidato;
    }

    fimTardio.set(id, limite);

    // Folga total: dias úteis entre o fim calculado e o fim tardio aceitável.
    const folgaTotal =
      limite >= atual.fim
        ? Math.max(0, duracaoDiasUteis(atual.fim, limite, calendario) - 1)
        : -(Math.max(0, duracaoDiasUteis(limite, atual.fim, calendario) - 1));

    // Folga livre: até onde dá para escorregar sem empurrar a PRÓXIMA etapa,
    // mesmo que a obra inteira ainda tivesse gordura.
    let folgaLivre = folgaTotal;
    for (const dep of sucessoras) {
      const s = resultado.porEtapa.get(dep.sucessoraId);
      if (!s) continue;
      const disponivel = Math.max(0, duracaoDiasUteis(atual.fim, s.inicio, calendario) - 2);
      if (disponivel < folgaLivre) folgaLivre = disponivel;
    }

    folgas.set(id, {
      folgaTotal,
      folgaLivre: Math.max(0, folgaLivre),
      critica: folgaTotal <= 0,
    });
  }

  return folgas;
}
