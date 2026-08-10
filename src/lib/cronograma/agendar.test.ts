import { describe, it, expect } from 'vitest';
import { agendar, patchesDe } from './agendar';
import { calcularFolgas } from './caminhoCritico';
import { detectarCiclo, ordenarTopologicamente } from './grafo';
import { SEM_FERIADOS } from './calendario';
import type { Dependencia, EtapaCronograma, TipoDependencia } from '../../types';

/**
 * O forward pass decide onde cada frente da obra começa. Um erro de um dia aqui
 * desloca a cadeia inteira, e o resultado continua parecendo um cronograma
 * plausível — não há sintoma até alguém conferir contra o campo.
 *
 * O calendário usado é `SEM_FERIADOS` na maioria dos casos, para os números
 * serem verificáveis a olho; os casos de feriado estão marcados.
 *
 * Referência de calendário (2026): 10/08 é uma segunda-feira.
 */
const etapa = (
  id: string,
  dataInicio: string,
  dataFim: string,
  extra: Partial<EtapaCronograma> = {}
): EtapaCronograma => ({
  id,
  projetoId: 'obra-1',
  nome: `Etapa ${id}`,
  dataInicio,
  dataFim,
  responsavelId: '',
  percentualExecutado: 0,
  quantidadeExecutada: 0,
  status: 'Não Iniciado',
  parentId: '',
  ordem: 1,
  ehMarco: false,
  agendamento: 'automatico',
  baselineInicio: '',
  baselineFim: '',
  baselineEm: '',
  nivel: 0,
  wbsCodigo: '',
  ehFolha: true,
  inicioEfetivo: dataInicio,
  fimEfetivo: dataFim,
  updatedAt: '2026-08-09T10:00:00Z',
  ...extra,
});

const liga = (
  predecessoraId: string,
  sucessoraId: string,
  tipo: TipoDependencia = 'FS',
  atrasoDias = 0
): Dependencia => ({
  id: `${predecessoraId}->${sucessoraId}`,
  projetoId: 'obra-1',
  predecessoraId,
  sucessoraId,
  tipo,
  atrasoDias,
});

const semFeriado = { calendario: SEM_FERIADOS };

describe('ordenarTopologicamente', () => {
  it('coloca a predecessora antes da sucessora', () => {
    const { ordem, ciclo } = ordenarTopologicamente(['c', 'a', 'b'], [liga('a', 'b'), liga('b', 'c')]);
    expect(ciclo).toBeNull();
    expect(ordem).toEqual(['a', 'b', 'c']);
  });

  it('devolve o conjunto preso quando há ciclo — é a mensagem de erro', () => {
    const { ordem, ciclo } = ordenarTopologicamente(
      ['a', 'b', 'c'],
      [liga('a', 'b'), liga('b', 'c'), liga('c', 'a')]
    );
    expect(ordem).toEqual([]);
    expect(ciclo?.ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('um ciclo não impede o resto da obra de ser ordenado', () => {
    const { ordem, ciclo } = ordenarTopologicamente(
      ['livre', 'a', 'b'],
      [liga('a', 'b'), liga('b', 'a')]
    );
    expect(ordem).toEqual(['livre']);
    expect(ciclo?.ids.sort()).toEqual(['a', 'b']);
  });

  it('ignora aresta cuja ponta não está na lista', () => {
    // Acontece de verdade: a lista é só de folhas, e uma etapa pode ter sido
    // excluída ou estar escondida pela RLS. Travar tudo por causa disso seria
    // pior do que agendar o que dá.
    const { ordem, ciclo } = ordenarTopologicamente(['a'], [liga('fantasma', 'a')]);
    expect(ciclo).toBeNull();
    expect(ordem).toEqual(['a']);
  });
});

describe('detectarCiclo', () => {
  it('acusa a ligação que fecha o laço', () => {
    const deps = [liga('a', 'b'), liga('b', 'c')];
    expect(detectarCiclo(deps, liga('c', 'a'))).not.toBeNull();
  });

  it('libera a ligação que não fecha', () => {
    expect(detectarCiclo([liga('a', 'b')], liga('a', 'c'))).toBeNull();
  });

  it('acusa a autoligação', () => {
    expect(detectarCiclo([], liga('a', 'a'))).not.toBeNull();
  });

  it('não conta a própria ligação como caminho de volta ao editá-la', () => {
    // Mudar o atraso de uma ligação existente não pode virar "criaria ciclo".
    const existente = liga('a', 'b');
    expect(detectarCiclo([existente], { ...existente, atrasoDias: 3 })).toBeNull();
  });
});

describe('agendar — os quatro tipos de vínculo', () => {
  it('FS empurra a sucessora para o dia útil seguinte ao fim', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-12'), etapa('b', '2026-08-10', '2026-08-11')];
    const r = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado });
    expect(r.porEtapa.get('b')?.inicio).toBe('2026-08-13');
    // Duração preservada: b tinha 2 dias úteis.
    expect(r.porEtapa.get('b')?.fim).toBe('2026-08-14');
  });

  it('FS pula o fim de semana', () => {
    // a termina na sexta 14/08; b começa na segunda 17/08.
    const nos = [etapa('a', '2026-08-10', '2026-08-14'), etapa('b', '2026-08-10', '2026-08-10')];
    const r = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado });
    expect(r.porEtapa.get('b')?.inicio).toBe('2026-08-17');
  });

  it('SS alinha os inícios', () => {
    const nos = [etapa('a', '2026-08-17', '2026-08-21'), etapa('b', '2026-08-10', '2026-08-11')];
    const r = agendar({ nos, dependencias: [liga('a', 'b', 'SS')], ...semFeriado });
    expect(r.porEtapa.get('b')?.inicio).toBe('2026-08-17');
  });

  it('FF alinha os fins, e o início volta pela duração', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-21'), etapa('b', '2026-08-10', '2026-08-12')];
    const r = agendar({ nos, dependencias: [liga('a', 'b', 'FF')], ...semFeriado });
    const b = r.porEtapa.get('b');
    expect(b?.fim).toBe('2026-08-21');
    // b tem 3 dias úteis: 19, 20 e 21 de agosto.
    expect(b?.inicio).toBe('2026-08-19');
  });

  it('atraso positivo afasta e negativo antecipa', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-12'), etapa('b', '2026-08-10', '2026-08-10')];

    const comAtraso = agendar({ nos, dependencias: [liga('a', 'b', 'FS', 2)], ...semFeriado });
    expect(comAtraso.porEtapa.get('b')?.inicio).toBe('2026-08-17');

    const comAntecipacao = agendar({ nos, dependencias: [liga('a', 'b', 'FS', -1)], ...semFeriado });
    expect(comAntecipacao.porEtapa.get('b')?.inicio).toBe('2026-08-12');
  });

  it('o máximo entre predecessoras manda — basta uma atrasar', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-11'),
      etapa('b', '2026-08-10', '2026-08-20'),
      etapa('c', '2026-08-10', '2026-08-10'),
    ];
    const r = agendar({ nos, dependencias: [liga('a', 'c'), liga('b', 'c')], ...semFeriado });
    expect(r.porEtapa.get('c')?.inicio).toBe('2026-08-21');
  });
});

describe('agendar — feriado, marco e modo manual', () => {
  it('atravessa o feriado com o calendário brasileiro', () => {
    // 07/09/2026 (Independência) é uma segunda. a termina na sexta 04/09;
    // sem feriado b começaria em 07/09, com feriado começa em 08/09.
    const nos = [etapa('a', '2026-09-01', '2026-09-04'), etapa('b', '2026-09-01', '2026-09-01')];
    expect(agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado }).porEtapa.get('b')?.inicio)
      .toBe('2026-09-07');
    expect(agendar({ nos, dependencias: [liga('a', 'b')] }).porEtapa.get('b')?.inicio)
      .toBe('2026-09-08');
  });

  it('marco não ganha duração ao ser empurrado', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-12'),
      etapa('m', '2026-08-10', '2026-08-10', { ehMarco: true }),
    ];
    const r = agendar({ nos, dependencias: [liga('a', 'm')], ...semFeriado });
    const m = r.porEtapa.get('m');
    expect(m?.inicio).toBe('2026-08-13');
    expect(m?.fim).toBe('2026-08-13');
  });

  it('etapa manual NÃO é movida, mas continua valendo como predecessora', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-20'),
      etapa('b', '2026-08-10', '2026-08-11', { agendamento: 'manual' }),
      etapa('c', '2026-08-10', '2026-08-10'),
    ];
    const r = agendar({ nos, dependencias: [liga('a', 'b'), liga('b', 'c')], ...semFeriado });
    // b ficou onde a pessoa fixou...
    expect(r.porEtapa.get('b')?.inicio).toBe('2026-08-10');
    // ...e c continua sendo empurrada por ela.
    expect(r.porEtapa.get('c')?.inicio).toBe('2026-08-12');
  });

  it('marca a restrição violada da etapa manual em vez de corrigi-la', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-20'),
      etapa('b', '2026-08-10', '2026-08-11', { agendamento: 'manual' }),
    ];
    const b = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado }).porEtapa.get('b');
    expect(b?.restricaoViolada).toBe(true);
    expect(b?.diasDeConflito).toBeGreaterThan(0);
  });

  it('etapa manual em data válida não acende aviso', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-12'),
      etapa('b', '2026-08-20', '2026-08-21', { agendamento: 'manual' }),
    ];
    const b = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado }).porEtapa.get('b');
    expect(b?.restricaoViolada).toBe(false);
  });

  it('não agenda nada quando há ciclo', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-11'), etapa('b', '2026-08-12', '2026-08-13')];
    const r = agendar({ nos, dependencias: [liga('a', 'b'), liga('b', 'a')], ...semFeriado });
    expect(r.ciclo).not.toBeNull();
    expect(r.porEtapa.size).toBe(0);
  });
});

describe('patchesDe', () => {
  it('só entra quem de fato mudou de data', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-12'), etapa('b', '2026-08-13', '2026-08-14')];
    // b já está exatamente onde a ligação FS a colocaria.
    const r = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado });
    expect(patchesDe(r)).toEqual([]);
  });

  it('devolve início e fim novos de quem foi empurrada', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-12'), etapa('b', '2026-08-10', '2026-08-10')];
    const r = agendar({ nos, dependencias: [liga('a', 'b')], ...semFeriado });
    expect(patchesDe(r)).toEqual([{ id: 'b', dataInicio: '2026-08-13', dataFim: '2026-08-13' }]);
  });
});

describe('calcularFolgas', () => {
  it('a cadeia mais longa é crítica e o ramo curto tem folga', () => {
    // longa: a(5d) → b(5d). curta: c(1d), que também depende de a.
    const nos = [
      etapa('a', '2026-08-10', '2026-08-14'),
      etapa('b', '2026-08-17', '2026-08-21'),
      etapa('c', '2026-08-17', '2026-08-17'),
    ];
    const deps = [liga('a', 'b'), liga('a', 'c')];
    const r = agendar({ nos, dependencias: deps, ...semFeriado });
    const folgas = calcularFolgas(nos.map((e) => e.id), deps, r, SEM_FERIADOS);

    expect(folgas.get('a')?.critica).toBe(true);
    expect(folgas.get('b')?.critica).toBe(true);
    expect(folgas.get('c')?.critica).toBe(false);
    expect(folgas.get('c')?.folgaTotal).toBeGreaterThan(0);
  });

  it('sem ligação nenhuma, só quem termina por último é crítico', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-14'), etapa('b', '2026-08-10', '2026-08-11')];
    const r = agendar({ nos, dependencias: [], ...semFeriado });
    const folgas = calcularFolgas(['a', 'b'], [], r, SEM_FERIADOS);
    expect(folgas.get('a')?.critica).toBe(true);
    expect(folgas.get('b')?.folgaTotal).toBeGreaterThan(0);
  });

  it('devolve vazio quando há ciclo — não há folga a calcular', () => {
    const nos = [etapa('a', '2026-08-10', '2026-08-11'), etapa('b', '2026-08-12', '2026-08-13')];
    const deps = [liga('a', 'b'), liga('b', 'a')];
    const r = agendar({ nos, dependencias: deps, ...semFeriado });
    expect(calcularFolgas(['a', 'b'], deps, r, SEM_FERIADOS).size).toBe(0);
  });
});
