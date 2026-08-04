/**
 * @vitest-environment jsdom
 *
 * `usePresenca` é a única peça que o `AnimatePresence` fazia e o CSS não faz
 * sozinho (§4.7). Se ele errar, o modo de falha é feio e silencioso: o diálogo
 * fica montado para sempre — com a armadilha de foco ligada e a rolagem da
 * página travada — e a única pista é que o app "congelou".
 *
 * Nada disso aparece em `tsc`, no build, nem numa passada visual rápida: o
 * diálogo some da vista, e o nó fantasma fica atrás.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffect } from 'react';
import { usePresenca } from './usePresenca';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePresenca', () => {
  it('nasce montado quando já abre aberto', () => {
    const { result } = renderHook(() => usePresenca(true, 150));
    expect(result.current).toEqual({ montado: true, saindo: false });
  });

  it('nasce desmontado quando abre fechado', () => {
    const { result } = renderHook(() => usePresenca(false, 150));
    expect(result.current).toEqual({ montado: false, saindo: false });
  });

  it('monta na hora ao abrir', () => {
    const { result, rerender } = renderHook(({ a }) => usePresenca(a, 150), {
      initialProps: { a: false },
    });
    rerender({ a: true });
    expect(result.current.montado).toBe(true);
    // Entrar não tem espera: o elemento precisa existir para a animação de
    // entrada rodar sobre ele.
    expect(result.current.saindo).toBe(false);
  });

  it('segura o nó durante a saída e só então desmonta', () => {
    const { result, rerender } = renderHook(({ a }) => usePresenca(a, 150), {
      initialProps: { a: true },
    });

    rerender({ a: false });
    expect(result.current).toEqual({ montado: true, saindo: true });

    act(() => void vi.advanceTimersByTime(149));
    expect(result.current.montado).toBe(true); // ainda animando

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ montado: false, saindo: false });
  });

  /**
   * O caso que pisca: fechar e reabrir antes de a saída terminar — clique duplo
   * no ✕, ou um `onClose` que reabre. Sem cancelar o timer anterior, ele dispara
   * DEPOIS da reabertura e desmonta um diálogo que está aberto.
   *
   * O estado final se conserta sozinho (o efeito remonta no render seguinte), e
   * é por isso que a primeira versão deste teste passava sem o `clearTimeout` —
   * ela só olhava o valor no fim. O estrago está no meio: um desmonte, mesmo de
   * um quadro, **destrói o estado dos filhos**, e o formulário do diálogo perde
   * tudo o que foi digitado. Por isso aqui se observa a SEQUÊNCIA de estados
   * commitados, não o último.
   */
  it('reabrir durante a saída não desmonta em nenhum quadro', () => {
    const commitados: boolean[] = [];
    const { result, rerender } = renderHook(
      ({ a }) => {
        const p = usePresenca(a, 150);
        useEffect(() => {
          commitados.push(p.montado);
        });
        return p;
      },
      { initialProps: { a: true } }
    );

    rerender({ a: false });
    act(() => void vi.advanceTimersByTime(100));
    rerender({ a: true });
    commitados.length = 0; // a partir daqui o diálogo está aberto de novo

    act(() => void vi.advanceTimersByTime(500));

    expect(commitados).not.toContain(false);
    expect(result.current).toEqual({ montado: true, saindo: false });
  });

  it('não agenda nada quando já está fechado e desmontado', () => {
    const { result, rerender } = renderHook(({ a }) => usePresenca(a, 150), {
      initialProps: { a: false },
    });
    rerender({ a: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toEqual({ montado: false, saindo: false });
  });
});
