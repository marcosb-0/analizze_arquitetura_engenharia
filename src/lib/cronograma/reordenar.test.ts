import { describe, it, expect } from 'vitest';
import {
  desindentar,
  indentar,
  mover,
  moverEntreIrmaos,
  movimentoValido,
} from './reordenar';
import type { EtapaCronograma } from '../../types';

/**
 * Reordenar a EAP tem que produzir um conjunto MÍNIMO de linhas, e uma ordem
 * densa começando em 1 — o `unique (projeto, pai, ordem)` do banco é deferrable
 * e só perdoa duplicata dentro da transação, não um buraco permanente.
 *
 * Estes testes trancam três coisas: a numeração final, o tamanho do patch (uma
 * linha a mais é uma linha a mais para o `get diagnostics` cobrar), e as duas
 * recusas que impedem um ramo de sumir da árvore.
 */
const etapa = (
  id: string,
  extra: Partial<EtapaCronograma> = {}
): EtapaCronograma => ({
  id,
  projetoId: 'obra-1',
  nome: `Etapa ${id}`,
  dataInicio: '2026-01-01',
  dataFim: '2026-12-31',
  responsavelId: '',
  percentualExecutado: 0,
  quantidadeExecutada: 0,
  status: 'Não Iniciado',
  parentId: '',
  ordem: 1,
  ehMarco: false,
  agendamento: 'manual',
  baselineInicio: '',
  baselineFim: '',
  baselineEm: '',
  nivel: 0,
  wbsCodigo: '',
  ehFolha: true,
  inicioEfetivo: '2026-01-01',
  fimEfetivo: '2026-12-31',
  updatedAt: '2026-08-09T10:00:00Z',
  ...extra,
});

/** Três raízes: a(1), b(2), c(3). */
const planas = (): EtapaCronograma[] => [
  etapa('a', { ordem: 1 }),
  etapa('b', { ordem: 2 }),
  etapa('c', { ordem: 3 }),
];

/** grupo(1) > [x(1.1), y(1.2)] ; solta(2) */
const comGrupo = (): EtapaCronograma[] => [
  etapa('grupo', { ordem: 1, ehFolha: false }),
  etapa('x', { parentId: 'grupo', ordem: 1 }),
  etapa('y', { parentId: 'grupo', ordem: 2 }),
  etapa('solta', { ordem: 2 }),
];

describe('movimentoValido', () => {
  it('aceita a raiz sempre', () => {
    expect(movimentoValido(comGrupo(), 'grupo', null)).toBe(true);
  });

  it('recusa soltar a etapa dentro dela mesma', () => {
    expect(movimentoValido(comGrupo(), 'grupo', 'grupo')).toBe(false);
  });

  it('recusa soltar um grupo dentro de uma subetapa dele', () => {
    // Sem esta recusa o ramo vira um ciclo, e a CTE da view — que desce a partir
    // das raízes — simplesmente não o alcança: a obra apareceria sem cronograma
    // nenhum, e sem erro.
    expect(movimentoValido(comGrupo(), 'grupo', 'x')).toBe(false);
  });
});

describe('mover', () => {
  it('renumera densamente a partir de 1', () => {
    const patches = mover(planas(), 'c', { paiId: null, indice: 0 });
    expect(patches).toEqual([
      { id: 'c', parentId: null, ordem: 1 },
      { id: 'a', parentId: null, ordem: 2 },
      { id: 'b', parentId: null, ordem: 3 },
    ]);
  });

  it('emite só as linhas que mudaram', () => {
    // Trocar b e c não deve tocar em a.
    const patches = mover(planas(), 'c', { paiId: null, indice: 1 });
    expect(patches.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('não emite nada quando a posição não muda', () => {
    // A guarda que impede todo arraste desistido de virar escrita.
    expect(mover(planas(), 'b', { paiId: null, indice: 1 })).toEqual([]);
  });

  it('renumera as DUAS listas ao mudar de pai', () => {
    const patches = mover(comGrupo(), 'x', { paiId: null, indice: 2 });
    const porId = new Map(patches.map((p) => [p.id, p]));
    // x virou raiz na 3ª posição...
    expect(porId.get('x')).toEqual({ id: 'x', parentId: null, ordem: 3 });
    // ...e y fechou o buraco que ela deixou no grupo.
    expect(porId.get('y')).toEqual({ id: 'y', parentId: 'grupo', ordem: 1 });
  });

  it('recusa o movimento inválido devolvendo vazio', () => {
    expect(mover(comGrupo(), 'grupo', { paiId: 'x', indice: 0 })).toEqual([]);
  });

  it('trata o índice fora da lista como o fim dela', () => {
    const patches = mover(planas(), 'a', { paiId: null, indice: 99 });
    expect(patches.find((p) => p.id === 'a')?.ordem).toBe(3);
  });
});

describe('indentar', () => {
  it('vira subetapa do irmão anterior, no fim das filhas dele', () => {
    const patches = indentar(comGrupo(), 'solta');
    expect(patches).toContainEqual({ id: 'solta', parentId: 'grupo', ordem: 3 });
  });

  it('não faz nada na primeira linha da lista', () => {
    // Não há irmão anterior sob quem ficar — inventar um pai seria pior.
    expect(indentar(comGrupo(), 'grupo')).toEqual([]);
    expect(indentar(comGrupo(), 'x')).toEqual([]);
  });
});

describe('desindentar', () => {
  it('vira o irmão logo depois do antigo pai', () => {
    const patches = desindentar(comGrupo(), 'x');
    const porId = new Map(patches.map((p) => [p.id, p]));
    expect(porId.get('x')).toEqual({ id: 'x', parentId: null, ordem: 2 });
    // `solta` era a 2ª raiz e desceu para a 3ª.
    expect(porId.get('solta')?.ordem).toBe(3);
  });

  it('deixa os irmãos seguintes onde estão', () => {
    // MS Project e Word os adotariam como filhos da etapa desindentada. Aqui uma
    // tecla move UMA linha: `y` continua dentro de `grupo`.
    const patches = desindentar(comGrupo(), 'x');
    const y = patches.find((p) => p.id === 'y');
    expect(y?.parentId).toBe('grupo');
  });

  it('não faz nada numa etapa que já é raiz', () => {
    expect(desindentar(comGrupo(), 'solta')).toEqual([]);
  });
});

describe('moverEntreIrmaos', () => {
  it('sobe uma posição dentro da mesma lista', () => {
    const patches = moverEntreIrmaos(planas(), 'c', -1);
    const porId = new Map(patches.map((p) => [p.id, p]));
    expect(porId.get('c')?.ordem).toBe(2);
    expect(porId.get('b')?.ordem).toBe(3);
  });

  it('não escapa do grupo nas pontas da lista', () => {
    // Subir a primeira filha não a tira do grupo — isso é desindentar, e
    // misturar as duas coisas na mesma tecla é o que faz uma linha "sumir".
    expect(moverEntreIrmaos(comGrupo(), 'x', -1)).toEqual([]);
    expect(moverEntreIrmaos(comGrupo(), 'y', 1)).toEqual([]);
  });
});
