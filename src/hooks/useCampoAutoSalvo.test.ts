/**
 * @vitest-environment jsdom
 *
 * O caso que dá nome a este arquivo é uma perda de DADO, e ela era invisível
 * para o `tsc`, para o build e para qualquer passada visual: o usuário digita,
 * o texto aparece na tela, e três caracteres depois some — reescrito pela
 * resposta atrasada da gravação anterior.
 *
 * Medido no app antes da correção, digitando dez caracteres seguidos numa seção
 * do descritivo: sobraram três. Os testes abaixo reproduzem exatamente essa
 * corrida com o relógio parado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCampoAutoSalvo } from './useCampoAutoSalvo';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Uma tecla: o campo emite `change` com o texto INTEIRO, como o DOM faz. */
const digitar = (campo: { onChange: (e: { target: { value: string } }) => void }, texto: string) =>
  act(() => campo.onChange({ target: { value: texto } }));

describe('useCampoAutoSalvo', () => {
  it('mostra o valor que chega de fora', () => {
    const { result } = renderHook(() => useCampoAutoSalvo({ valor: 'Escopo', aoSalvar: vi.fn() }));
    expect(result.current.value).toBe('Escopo');
  });

  it('não grava uma vez por tecla — espera o silêncio', () => {
    const aoSalvar = vi.fn();
    const { result } = renderHook(() => useCampoAutoSalvo({ valor: '', aoSalvar, atraso: 600 }));

    for (const t of ['a', 'ab', 'abc', 'abcd']) digitar(result.current, t);
    expect(aoSalvar).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(600));
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    expect(aoSalvar).toHaveBeenCalledWith('abcd');
  });

  /**
   * O CASO DO DEFEITO. `valor` volta atrás porque a resposta de uma gravação
   * anterior chegou tarde; enquanto o campo está em edição, ele ignora.
   */
  it('valor atrasado que chega de fora NÃO reescreve o que está sendo digitado', () => {
    const { result, rerender } = renderHook(
      ({ valor }) => useCampoAutoSalvo({ valor, aoSalvar: vi.fn() }),
      { initialProps: { valor: 'CREA' } }
    );

    act(() => result.current.onFocus());
    digitar(result.current, 'CREAabcdefghij');

    // A resposta do servidor para a tecla de três caracteres atrás.
    rerender({ valor: 'CREAabc' });

    expect(result.current.value).toBe('CREAabcdefghij');
  });

  it('fora de edição, o valor de fora manda — recarga e rollback aparecem na tela', () => {
    const { result, rerender } = renderHook(
      ({ valor }) => useCampoAutoSalvo({ valor, aoSalvar: vi.fn() }),
      { initialProps: { valor: 'antes' } }
    );

    rerender({ valor: 'depois' });
    expect(result.current.value).toBe('depois');
  });

  it('sair do campo grava na hora, sem esperar o relógio', () => {
    const aoSalvar = vi.fn();
    const { result } = renderHook(() => useCampoAutoSalvo({ valor: '', aoSalvar }));

    act(() => result.current.onFocus());
    digitar(result.current, 'texto');
    act(() => result.current.onBlur());

    expect(aoSalvar).toHaveBeenCalledWith('texto');
    // E o temporizador pendente não grava de novo o mesmo texto.
    act(() => vi.advanceTimersByTime(2000));
    expect(aoSalvar).toHaveBeenCalledTimes(1);
  });

  it('entrar e sair sem digitar não escreve no banco', () => {
    const aoSalvar = vi.fn();
    const { result } = renderHook(() => useCampoAutoSalvo({ valor: 'igual', aoSalvar }));

    act(() => result.current.onFocus());
    act(() => result.current.onBlur());

    expect(aoSalvar).not.toHaveBeenCalled();
  });

  /**
   * "Voltar para a carteira" é um botão a dois centímetros do descritivo, e o
   * `blur` não cobre toda saída de tela. Sem esta descarga, o último parágrafo
   * digitado ia embora sem aviso — que é o mesmo prejuízo do defeito original,
   * por outro caminho.
   */
  it('desmontar com gravação pendente grava antes de sumir', () => {
    const aoSalvar = vi.fn();
    const { result, unmount } = renderHook(() => useCampoAutoSalvo({ valor: '', aoSalvar }));

    digitar(result.current, 'parágrafo inteiro');
    expect(aoSalvar).not.toHaveBeenCalled();

    unmount();
    expect(aoSalvar).toHaveBeenCalledWith('parágrafo inteiro');
  });

  it('cada tecla adia a gravação, em vez de acumular uma por tecla', () => {
    const aoSalvar = vi.fn();
    const { result } = renderHook(() => useCampoAutoSalvo({ valor: '', aoSalvar, atraso: 600 }));

    digitar(result.current, 'a');
    act(() => vi.advanceTimersByTime(500));
    digitar(result.current, 'ab');
    act(() => vi.advanceTimersByTime(500));
    expect(aoSalvar).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(100));
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    expect(aoSalvar).toHaveBeenCalledWith('ab');
  });
});
