// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useArraste, type ModoArraste, type PontaBarra } from './useArraste';
import { criarEscala } from './escalaTempo';
import type { Dependencia, EtapaCronograma, MudancasCronograma } from '../../../types';

/**
 * ARMADILHA, e ela custa uma tarde a quem não souber: **o jsdom não implementa
 * `setPointerCapture`, `releasePointerCapture` nem `hasPointerCapture`**. Eles
 * não existem no protótipo de `Element`, então uma chamada direta explode com
 * "is not a function". O código de produção já usa `?.` nas duas primeiras (a
 * captura é um reforço, não um requisito de correção), mas o teste precisa do
 * dublê mesmo assim para verificar que ela é PEDIDA.
 *
 * O que estes testes trancam são as guardas que impedem escrita indevida —
 * arraste desistido, gesto abaixo do limiar, Escape, alvo inválido. Cada uma
 * delas, se cair, vira uma gravação silenciosa no cronograma da obra.
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

/** O dublê do alvo do evento. */
function alvoFalso() {
  const capturas: number[] = [];
  return {
    capturas,
    elemento: {
      setPointerCapture: (id: number) => capturas.push(id),
      releasePointerCapture: () => {},
      hasPointerCapture: () => true,
      closest: () => null,
    },
  };
}

function eventoFalso(clientX: number, elemento: unknown, button = 0) {
  return {
    button,
    clientX,
    clientY: 40,
    pointerId: 1,
    currentTarget: elemento,
    stopPropagation: () => {},
  } as unknown as React.PointerEvent;
}

const escala = criarEscala('2026-08-01', '2026-09-30', 'dia');
const PX_DIA = escala.pxPorDia;

function montar(
  folhas: EtapaCronograma[],
  dependencias: Dependencia[] = [],
  habilitado = true
) {
  const aoConcluir = vi.fn<(m: MudancasCronograma, n: number) => void>();
  const hook = renderHook(() =>
    useArraste({ escala, folhas, dependencias, habilitado, aoConcluir })
  );
  return { hook, aoConcluir };
}

/** Executa um gesto completo: pressiona, move e solta. */
function arrastar(
  hook: ReturnType<typeof renderHook<ReturnType<typeof useArraste>, unknown>>,
  etapaAlvo: EtapaCronograma,
  modo: ModoArraste,
  dx: number,
  opcoes: { soltar?: boolean; ponta?: PontaBarra } = {}
) {
  const { elemento } = alvoFalso();
  const alcas = hook.result.current.alcas(etapaAlvo, modo, opcoes.ponta) as Record<
    string,
    (e: React.PointerEvent) => void
  >;
  act(() => alcas.onPointerDown?.(eventoFalso(100, elemento)));
  act(() => alcas.onPointerMove?.(eventoFalso(100 + dx, elemento)));
  if (opcoes.soltar !== false) {
    act(() => alcas.onPointerUp?.(eventoFalso(100 + dx, elemento)));
  }
  return { alcas, elemento };
}

beforeEach(() => vi.restoreAllMocks());

describe('captura de ponteiro', () => {
  it('pede a captura ao pressionar', () => {
    // Sem ela, arrastar para fora da área do gráfico interrompe o gesto no meio.
    const { hook } = montar([etapa('a', '2026-08-10', '2026-08-14')]);
    const { elemento, capturas } = alvoFalso();
    const alcas = hook.result.current.alcas(
      etapa('a', '2026-08-10', '2026-08-14'),
      'mover'
    ) as Record<string, (e: React.PointerEvent) => void>;
    act(() => alcas.onPointerDown?.(eventoFalso(100, elemento)));
    expect(capturas).toEqual([1]);
  });

  it('ignora o botão secundário', () => {
    // Capturar o ponteiro no botão direito prende o gesto num estado sem saída,
    // porque o menu do navegador rouba o `pointerup`.
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    const { elemento } = alvoFalso();
    const alcas = hook.result.current.alcas(a, 'mover') as Record<
      string,
      (e: React.PointerEvent) => void
    >;
    act(() => alcas.onPointerDown?.(eventoFalso(100, elemento, 2)));
    act(() => alcas.onPointerMove?.(eventoFalso(300, elemento)));
    act(() => alcas.onPointerUp?.(eventoFalso(300, elemento)));
    expect(aoConcluir).not.toHaveBeenCalled();
  });
});

describe('as guardas contra escrita indevida', () => {
  it('não escreve abaixo do limiar de 4px', () => {
    // É o que mantém o CLIQUE funcionando: sem o limiar, todo clique numa barra
    // viraria um arraste de zero dias.
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'mover', 3);
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it('não escreve quando o deslocamento arredonda para zero dias', () => {
    // Passou do limiar mas não chegou a meio dia: o arraste foi desistido, e
    // gravá-lo seria uma escrita que a pessoa não pediu. Mesma guarda de
    // Quadro.tsx ao soltar o card na própria coluna.
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'mover', Math.floor(PX_DIA * 0.4));
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it('Escape cancela sem escrever nada', () => {
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'mover', PX_DIA * 5, { soltar: false });
    expect(hook.result.current.estado).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(hook.result.current.estado).toBeNull();
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it('não devolve alças quando o papel não pode editar', () => {
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook } = montar([a], [], false);
    expect(hook.result.current.alcas(a, 'mover')).toEqual({});
  });

  it('ligar sem alvo válido sob o cursor não escreve', () => {
    // No jsdom `elementFromPoint` devolve null, que é exatamente o caso "soltei
    // no vazio" — e ele não pode virar uma ligação.
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const b = etapa('b', '2026-08-20', '2026-08-24');
    const { hook, aoConcluir } = montar([a, b]);
    arrastar(hook, a, 'ligar', PX_DIA * 10, { ponta: 'fim' });
    expect(aoConcluir).not.toHaveBeenCalled();
  });
});

describe('mover e redimensionar', () => {
  it('move a barra pelo número de dias arrastado, com snap ao dia', () => {
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'mover', PX_DIA * 3);

    expect(aoConcluir).toHaveBeenCalledTimes(1);
    const [mudancas, reagendadas] = aoConcluir.mock.calls[0];
    expect(mudancas.etapas?.[0]).toEqual({
      id: 'a',
      dataInicio: '2026-08-13',
      dataFim: '2026-08-17',
    });
    expect(reagendadas).toBe(0);
  });

  it('arredonda para o dia mais próximo em vez de truncar', () => {
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'mover', PX_DIA * 2.6);
    expect(aoConcluir.mock.calls[0][0].etapas?.[0].dataInicio).toBe('2026-08-13');
  });

  it('redimensionar pelo fim muda só a data de fim', () => {
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'redim-fim', PX_DIA * 2);
    expect(aoConcluir.mock.calls[0][0].etapas?.[0]).toEqual({
      id: 'a',
      dataInicio: '2026-08-10',
      dataFim: '2026-08-16',
    });
  });

  it('redimensionar pelo início não deixa a barra virar do avesso', () => {
    // Arrastar o início para depois do fim é o gesto exagerado que trava em
    // duração mínima, em vez de gravar um período negativo.
    const a = etapa('a', '2026-08-10', '2026-08-14');
    const { hook, aoConcluir } = montar([a]);
    arrastar(hook, a, 'redim-inicio', PX_DIA * 30);
    const patch = aoConcluir.mock.calls[0][0].etapas?.[0];
    expect(patch?.dataInicio).toBe('2026-08-14');
    expect(patch?.dataFim).toBe('2026-08-14');
  });
});

describe('prévia e reagendamento das sucessoras', () => {
  const cadeia = () => [
    etapa('a', '2026-08-10', '2026-08-14'),
    etapa('b', '2026-08-17', '2026-08-21'),
  ];
  const fs: Dependencia[] = [
    {
      id: 'a->b',
      projetoId: 'obra-1',
      predecessoraId: 'a',
      sucessoraId: 'b',
      tipo: 'FS',
      atrasoDias: 0,
    },
  ];

  it('a prévia mostra a sucessora na posição nova ANTES de soltar', () => {
    const nos = cadeia();
    const { hook } = montar(nos, fs);
    arrastar(hook, nos[0], 'mover', PX_DIA * 7, { soltar: false });

    const previsao = hook.result.current.estado?.previsao;
    expect(previsao?.movidas).toContain('b');
    expect(previsao?.porEtapa.get('b')?.inicio).toBe('2026-08-24');
  });

  it('ao soltar, o diff leva a arrastada E as sucessoras, e informa quantas', () => {
    // As duas coisas na MESMA chamada: em chamadas separadas, uma falha no meio
    // deixaria a ligação gravada com datas que a contradizem.
    const nos = cadeia();
    const { hook, aoConcluir } = montar(nos, fs);
    arrastar(hook, nos[0], 'mover', PX_DIA * 7);

    const [mudancas, reagendadas] = aoConcluir.mock.calls[0];
    expect(mudancas.etapas?.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(reagendadas).toBe(1);
  });

  it('sucessora com data FIXADA não é movida', () => {
    const nos = [
      etapa('a', '2026-08-10', '2026-08-14'),
      etapa('b', '2026-08-17', '2026-08-21', { agendamento: 'manual' }),
    ];
    const { hook, aoConcluir } = montar(nos, fs);
    arrastar(hook, nos[0], 'mover', PX_DIA * 7);

    const [mudancas, reagendadas] = aoConcluir.mock.calls[0];
    expect(mudancas.etapas?.map((e) => e.id)).toEqual(['a']);
    expect(reagendadas).toBe(0);
  });
});
