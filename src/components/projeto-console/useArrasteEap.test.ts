// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useArrasteEap } from './useArrasteEap';
import type { EtapaCronograma, PatchOrdem } from '../../types';

/**
 * As mesmas duas armadilhas do teste de `gantt/useArraste`, e uma terceira:
 *
 * 1. o jsdom não implementa `setPointerCapture` / `hasPointerCapture` — daí o
 *    dublê de elemento;
 * 2. `document.elementFromPoint` também não existe lá, e é justamente ele que
 *    descobre a linha sob o cursor. Sem dublê, todo gesto cai no caso "soltei
 *    fora da tabela" e os testes passariam sem exercitar nada;
 * 3. `getBoundingClientRect` devolve zeros no jsdom, então a FRAÇÃO vertical
 *    (que decide antes/dentro/depois) tem de vir do dublê também.
 *
 * O que se tranca aqui são as guardas contra escrita indevida — abaixo do
 * limiar, Escape, alvo recusado, destino igual à origem. Cada uma delas, se
 * cair, vira uma reordenação silenciosa da EAP de uma obra real.
 */

const etapa = (id: string, extra: Partial<EtapaCronograma> = {}): EtapaCronograma => ({
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
  updatedAt: '2026-08-10T10:00:00Z',
  ...extra,
});

/** grupo(1) > [x(1.1)] ; solta(2) ; comOrcamento(3) */
const EAP = (): EtapaCronograma[] => [
  etapa('grupo', { ordem: 1, ehFolha: false }),
  etapa('x', { parentId: 'grupo', ordem: 1, nivel: 1 }),
  etapa('solta', { ordem: 2 }),
  etapa('comOrcamento', { ordem: 3 }),
];

/** O elemento que recebe o gesto (a alça). */
function alcaFalsa() {
  return {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
  };
}

function eventoFalso(elemento: unknown, clientY = 0, button = 0) {
  return {
    button,
    clientX: 50,
    clientY,
    pointerId: 1,
    currentTarget: elemento,
    stopPropagation: () => {},
  } as unknown as React.PointerEvent;
}

/**
 * Finge que sob o ponteiro está a linha de `alvoId`, com 40px de altura
 * começando no y=0. `clientY` do evento passa então a ser a fração direta: 4 é
 * o topo (antes), 20 é o meio (dentro), 36 é a base (depois).
 */
function sobOCursor(alvoId: string | null) {
  const linha = {
    dataset: { etapaLinha: alvoId ?? '' },
    getBoundingClientRect: () => ({ top: 0, height: 40 }) as DOMRect,
  };
  document.elementFromPoint = (() =>
    alvoId === null ? null : { closest: () => linha }) as typeof document.elementFromPoint;
}

function montar(etapas = EAP(), comExecucao = new Set<string>(), habilitado = true) {
  const aoSoltar = vi.fn<(p: PatchOrdem[], arrastadaId: string) => void>();
  const hook = renderHook(() => useArrasteEap({ etapas, comExecucao, habilitado, aoSoltar }));
  return { hook, aoSoltar };
}

/** Um gesto completo: pressiona no y=0, move até `y` e solta. */
function arrastar(
  hook: ReturnType<typeof renderHook<ReturnType<typeof useArrasteEap>, unknown>>,
  arrastada: EtapaCronograma,
  y: number,
  opcoes: { soltar?: boolean } = {}
) {
  const elemento = alcaFalsa();
  const alcas = hook.result.current.alcas(arrastada) as Record<
    string,
    (e: React.PointerEvent) => void
  >;
  act(() => alcas.onPointerDown?.(eventoFalso(elemento, 0)));
  act(() => alcas.onPointerMove?.(eventoFalso(elemento, y)));
  if (opcoes.soltar !== false) act(() => alcas.onPointerUp?.(eventoFalso(elemento, y)));
  return alcas;
}

const original = document.elementFromPoint;
beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  document.elementFromPoint = original;
});

describe('as guardas contra escrita indevida', () => {
  it('não escreve abaixo do limiar de 4px', () => {
    // É o que mantém o CLIQUE funcionando na célula do nome.
    sobOCursor('grupo');
    const { hook, aoSoltar } = montar();
    arrastar(hook, etapa('solta', { ordem: 2 }), 3);
    expect(aoSoltar).not.toHaveBeenCalled();
  });

  it('não escreve ao soltar fora de qualquer linha', () => {
    sobOCursor(null);
    const { hook, aoSoltar } = montar();
    arrastar(hook, etapa('solta', { ordem: 2 }), 30);
    expect(aoSoltar).not.toHaveBeenCalled();
  });

  it('não escreve quando o destino é a posição em que a etapa já está', () => {
    // `mover` devolve patch vazio, e o gesto desistido não pode virar RPC.
    sobOCursor('x');
    const { hook, aoSoltar } = montar();
    arrastar(hook, EAP()[1], 36);
    expect(aoSoltar).not.toHaveBeenCalled();
    expect(hook.result.current.estado).toBeNull();
  });

  it('Escape cancela sem escrever nada', () => {
    sobOCursor('grupo');
    const { hook, aoSoltar } = montar();
    arrastar(hook, EAP()[2], 20, { soltar: false });
    expect(hook.result.current.estado).not.toBeNull();

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(hook.result.current.estado).toBeNull();
    expect(aoSoltar).not.toHaveBeenCalled();
  });

  it('não devolve alças quando o papel não pode editar', () => {
    expect(montar(EAP(), new Set(), false).hook.result.current.alcas(EAP()[2])).toEqual({});
  });

  it('ignora o botão secundário', () => {
    sobOCursor('grupo');
    const { hook, aoSoltar } = montar();
    const elemento = alcaFalsa();
    const alcas = hook.result.current.alcas(EAP()[2]) as Record<
      string,
      (e: React.PointerEvent) => void
    >;
    act(() => alcas.onPointerDown?.(eventoFalso(elemento, 0, 2)));
    act(() => alcas.onPointerMove?.(eventoFalso(elemento, 20)));
    act(() => alcas.onPointerUp?.(eventoFalso(elemento, 20)));
    expect(aoSoltar).not.toHaveBeenCalled();
  });
});

describe('o destino que o gesto escolhe', () => {
  it('o miolo da linha põe a etapa DENTRO do grupo', () => {
    sobOCursor('grupo');
    const { hook, aoSoltar } = montar();
    arrastar(hook, EAP()[2], 20);
    // As DUAS listas viajam no mesmo patch: `solta` entra no grupo e a raiz
    // fecha o buraco que ela deixou — é por isso que a gravação é em lote.
    expect(aoSoltar).toHaveBeenCalledWith(
      [
        { id: 'solta', parentId: 'grupo', ordem: 2 },
        { id: 'comOrcamento', parentId: null, ordem: 2 },
      ],
      'solta'
    );
  });

  it('a borda de cima põe como IRMÃ, antes do alvo', () => {
    sobOCursor('x');
    const { hook, aoSoltar } = montar();
    arrastar(hook, EAP()[2], 4);
    expect(aoSoltar).toHaveBeenCalledWith(
      expect.arrayContaining([{ id: 'solta', parentId: 'grupo', ordem: 1 }]),
      'solta'
    );
  });

  it('some com a zona "dentro" quando o alvo não pode virar grupo', () => {
    // Frente com orçamento vinculado: o miolo vira "depois", e o motivo aparece
    // como AVISO — não como recusa vermelha piscando a cada linha atravessada.
    sobOCursor('comOrcamento');
    const { hook } = montar(EAP(), new Set(['comOrcamento']));
    arrastar(hook, EAP()[2], 20, { soltar: false });
    const estado = hook.result.current.estado;
    expect(estado?.posicao).toBe('depois');
    expect(estado?.recusa).toBe('');
    expect(estado?.aviso).toMatch(/orçamento|medição/);
  });

  it('recusa soltar o grupo dentro de uma frente dele, e não escreve', () => {
    sobOCursor('x');
    const { hook, aoSoltar } = montar();
    arrastar(hook, EAP()[0], 20, { soltar: false });
    expect(hook.result.current.estado?.recusa).not.toBe('');

    const elemento = alcaFalsa();
    const alcas = hook.result.current.alcas(EAP()[0]) as Record<
      string,
      (e: React.PointerEvent) => void
    >;
    act(() => alcas.onPointerUp?.(eventoFalso(elemento, 20)));
    expect(aoSoltar).not.toHaveBeenCalled();
  });
});
