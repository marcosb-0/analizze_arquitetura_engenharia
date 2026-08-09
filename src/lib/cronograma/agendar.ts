import { Dependencia, EtapaCronograma } from '../../types';
import { CALENDARIO_BR, Calendario, duracaoDiasUteis, somarDiasUteis } from './calendario';
import { Ciclo, indexarPorSucessora, ordenarTopologicamente } from './grafo';

/**
 * O forward pass: dadas as ligações, onde cada etapa PODE começar.
 *
 * Tudo em dias ÚTEIS, via `calendario.ts` — uma etapa de 10 dias úteis que
 * começa numa quarta não termina 10 dias corridos depois, e um cronograma que
 * ignora isso nasce com duas semanas de otimismo.
 */

export interface DatasCalculadas {
  inicio: string;
  fim: string;
  /**
   * A etapa é `manual` e a data fixada é ANTERIOR à mais cedo possível — ou
   * seja, o plano promete algo que as predecessoras não permitem.
   *
   * O motor não corrige: só marca. Mover à força uma data que alguém digitou é
   * como se perde a confiança na ferramenta; a tela mostra o aviso e a pessoa
   * decide.
   */
  restricaoViolada: boolean;
  /** Quantos dias úteis de atraso a restrição violada representa. */
  diasDeConflito: number;
}

export interface ResultadoAgendamento {
  porEtapa: Map<string, DatasCalculadas>;
  /** Ids cujas datas mudaram em relação à entrada. */
  movidas: string[];
  /** Diferente de `null` ⇒ nada foi agendado. */
  ciclo: Ciclo | null;
}

export interface EntradaAgendamento {
  /** SÓ FOLHAS — grupo tem datas roladas, não calculadas. */
  nos: EtapaCronograma[];
  dependencias: Dependencia[];
  calendario?: Calendario;
}

/** Duração em dias úteis, preservada quando a etapa é empurrada. */
function duracaoDe(etapa: EtapaCronograma, cal: Calendario): number {
  if (etapa.ehMarco) return 0;
  const d = duracaoDiasUteis(etapa.dataInicio, etapa.dataFim, cal);
  return d > 0 ? d : 1;
}

/** Recoloca o fim a partir do início, preservando a duração em dias úteis. */
function fimDe(inicio: string, duracao: number, cal: Calendario): string {
  if (duracao <= 0) return inicio;
  return somarDiasUteis(inicio, duracao - 1, cal);
}

/**
 * Agenda a obra.
 *
 * Nós `manual` não são movidos — ficam onde a pessoa fixou e continuam valendo
 * como predecessora. É o comportamento do MS Project, e é o certo: a alternativa
 * é o cronograma "consertar" datas negociadas com o cliente.
 */
export function agendar({
  nos,
  dependencias,
  calendario = CALENDARIO_BR,
}: EntradaAgendamento): ResultadoAgendamento {
  const cal = calendario;
  const porId = new Map(nos.map((e) => [e.id, e]));
  const { ordem, ciclo } = ordenarTopologicamente(
    nos.map((e) => e.id),
    dependencias
  );

  if (ciclo) return { porEtapa: new Map(), movidas: [], ciclo };

  const porSucessora = indexarPorSucessora(dependencias);
  const porEtapa = new Map<string, DatasCalculadas>();

  for (const id of ordem) {
    const etapa = porId.get(id);
    if (!etapa) continue;

    const duracao = duracaoDe(etapa, cal);
    // Etapa sem data ainda não tem de onde partir; o mais cedo possível vira a
    // única resposta, e sem predecessora ela fica como está (string vazia).
    let inicio = etapa.dataInicio;
    let fim = etapa.dataFim || etapa.dataInicio;

    // O mais cedo possível é o MÁXIMO sobre todas as predecessoras: basta uma
    // não ter terminado para a sucessora não poder começar.
    let maisCedo: string | null = null;

    for (const dep of porSucessora.get(id) ?? []) {
      const p = porEtapa.get(dep.predecessoraId);
      if (!p) continue;

      let candidato: string | null = null;
      switch (dep.tipo) {
        case 'FS':
          // Um dia útil DEPOIS do fim, mais o atraso.
          candidato = somarDiasUteis(p.fim, 1 + dep.atrasoDias, cal);
          break;
        case 'SS':
          candidato = somarDiasUteis(p.inicio, dep.atrasoDias, cal);
          break;
        case 'FF':
          // A restrição é sobre o FIM; o início vem de volta pela duração.
          candidato = somarDiasUteis(
            somarDiasUteis(p.fim, dep.atrasoDias, cal),
            -(duracao - 1),
            cal
          );
          break;
        case 'SF':
          candidato = somarDiasUteis(
            somarDiasUteis(p.inicio, dep.atrasoDias, cal),
            -(duracao - 1),
            cal
          );
          break;
      }
      if (candidato && (maisCedo === null || candidato > maisCedo)) maisCedo = candidato;
    }

    let restricaoViolada = false;
    let diasDeConflito = 0;

    if (maisCedo !== null) {
      if (etapa.agendamento === 'automatico') {
        inicio = maisCedo;
        fim = fimDe(inicio, duracao, cal);
      } else if (inicio && inicio < maisCedo) {
        // Fixada antes do possível: mantém a data e acende o aviso.
        restricaoViolada = true;
        diasDeConflito = duracaoDiasUteis(inicio, maisCedo, cal) - 1;
      } else if (!inicio) {
        // Nunca teve data: usar o mais cedo é a única resposta sensata, e não
        // contraria ninguém — não havia data para preservar.
        inicio = maisCedo;
        fim = fimDe(inicio, duracao, cal);
      }
    }

    porEtapa.set(id, { inicio, fim, restricaoViolada, diasDeConflito });
  }

  const movidas = ordem.filter((id) => {
    const antes = porId.get(id);
    const depois = porEtapa.get(id);
    return !!antes && !!depois && (antes.dataInicio !== depois.inicio || antes.dataFim !== depois.fim);
  });

  return { porEtapa, movidas, ciclo: null };
}

/**
 * O que `agendar` produziu, no formato que `fn_aplicar_cronograma` grava.
 *
 * Só as etapas que de fato mudaram — uma linha a mais no payload é uma linha a
 * mais para a contagem do `get diagnostics` cobrar do outro lado.
 */
export function patchesDe(resultado: ResultadoAgendamento) {
  return resultado.movidas.map((id) => {
    const d = resultado.porEtapa.get(id)!;
    return { id, dataInicio: d.inicio, dataFim: d.fim };
  });
}
