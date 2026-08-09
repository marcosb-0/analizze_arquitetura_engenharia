import { describe, expect, it } from 'vitest';
import { SecaoImprimivel, corpoEmLinhas, ehLista, montarDocumento } from './secoesProposta';

const secao = (over: Partial<SecaoImprimivel>): SecaoImprimivel => ({
  titulo: 'Seção',
  corpo: 'Texto qualquer.',
  posicao: 'antes',
  ordem: 0,
  ...over,
});

describe('montarDocumento', () => {
  it('numera as seções na sequência do papel, com os valores no meio', () => {
    const doc = montarDocumento([
      secao({ titulo: 'Objeto', ordem: 10 }),
      secao({ titulo: 'Premissas', ordem: 20 }),
      secao({ titulo: 'Garantia', posicao: 'depois', ordem: 10 }),
      secao({ titulo: 'Condições', posicao: 'depois', ordem: 20 }),
    ]);

    expect(doc.antes.map((s) => [s.numero, s.titulo])).toEqual([
      [1, 'Objeto'],
      [2, 'Premissas'],
    ]);
    expect(doc.numeroDosValores).toBe(3);
    expect(doc.depois.map((s) => [s.numero, s.titulo])).toEqual([
      [4, 'Garantia'],
      [5, 'Condições'],
    ]);
  });

  it('ordena por `ordem`, não pela ordem de chegada', () => {
    const doc = montarDocumento([
      secao({ titulo: 'Terceira', ordem: 30 }),
      secao({ titulo: 'Primeira', ordem: 10 }),
      secao({ titulo: 'Segunda', ordem: 20 }),
    ]);
    expect(doc.antes.map((s) => s.titulo)).toEqual(['Primeira', 'Segunda', 'Terceira']);
  });

  it('descarta seção sem texto — e ela não consome número', () => {
    const doc = montarDocumento([
      secao({ titulo: 'Objeto', ordem: 10 }),
      secao({ titulo: 'Ainda vou escrever', corpo: '   \n  ', ordem: 20 }),
      secao({ titulo: 'Premissas', ordem: 30 }),
    ]);

    expect(doc.antes.map((s) => [s.numero, s.titulo])).toEqual([
      [1, 'Objeto'],
      [2, 'Premissas'],
    ]);
    // O bloco de valores é o 3, não o 4: a seção em branco não entrou na conta.
    expect(doc.numeroDosValores).toBe(3);
  });

  it('sem nenhuma seção, os valores são o bloco 1', () => {
    const doc = montarDocumento([]);
    expect(doc).toEqual({ antes: [], depois: [], numeroDosValores: 1 });
  });

  it('só seções depois dos valores: a numeração começa neles', () => {
    const doc = montarDocumento([secao({ titulo: 'Condições', posicao: 'depois', ordem: 10 })]);
    expect(doc.numeroDosValores).toBe(1);
    expect(doc.depois).toEqual([{ numero: 2, titulo: 'Condições', corpo: 'Texto qualquer.' }]);
  });
});

describe('corpoEmLinhas', () => {
  it('quebra em linhas, aparando e descartando as vazias', () => {
    expect(corpoEmLinhas('  Uma  \n\n Duas \n   \nTrês')).toEqual(['Uma', 'Duas', 'Três']);
  });

  it('corpo vazio não vira uma linha vazia', () => {
    expect(corpoEmLinhas('   \n  ')).toEqual([]);
  });
});

describe('ehLista', () => {
  it('uma frase única é parágrafo, não lista de um item', () => {
    expect(ehLista('Parágrafo corrido de escopo.')).toBe(false);
  });

  it('duas linhas ou mais viram marcadores', () => {
    expect(ehLista('Primeira condição\nSegunda condição')).toBe(true);
  });
});
