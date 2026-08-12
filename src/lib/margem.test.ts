/**
 * A MARGEM, E A ARITMÉTICA QUE O BANCO FAZ.
 *
 * Os números do primeiro bloco não são inventados: são os oito itens da
 * PROP-2026-001 (BDI 35%), conferidos contra o banco numa conversão executada
 * dentro de uma transação que foi revertida. Se este teste passar e o banco
 * discordar, um dos dois mudou sem o outro — que é exatamente o que ele existe
 * para acusar.
 */
import { describe, it, expect } from 'vitest';
import {
  cobertura,
  margemEhParcial,
  margemPercentual,
  margemUnitaria,
  precoDeVenda,
  precoNegociado,
} from './margem';

describe('a conta que leva do custo até a venda', () => {
  /** custo, ajuste, venda esperada — medidos no banco com BDI 35%. */
  const PROP_2026_001: [number, number, number][] = [
    [234.12, 0, 316.06],
    [116.67, 0, 157.5],
    [114.32, 0, 154.33],
    [85.01, 0, 114.76],
    [39.6, 6, 61.56], // o único com negociação: +R$ 6,00 sobre o custo
    [14.78, 0, 19.95],
    [4.52, 0, 6.1],
    [0.71, 0, 0.96],
  ];

  it.each(PROP_2026_001)('custo %s com ajuste %s vira venda %s', (custo, ajuste, venda) => {
    const negociado = ajuste === 0 ? undefined : { tipo: 'Valor' as const, valor: ajuste };
    expect(precoDeVenda(custo, negociado, 35)).toBe(venda);
  });

  it('percentual e valor não são a mesma coisa', () => {
    expect(precoNegociado(100, { tipo: 'Valor', valor: 10 })).toBe(110);
    expect(precoNegociado(100, { tipo: 'Percentual', valor: 10 })).toBe(110);
    // Coincidem em 100 e divergem em qualquer outro número — o teste acima
    // sozinho passaria com a implementação trocada.
    expect(precoNegociado(200, { tipo: 'Valor', valor: 10 })).toBe(210);
    expect(precoNegociado(200, { tipo: 'Percentual', valor: 10 })).toBe(220);
  });

  it('sem BDI a venda é o preço negociado', () => {
    expect(precoDeVenda(39.6, { tipo: 'Valor', valor: 6 })).toBe(45.6);
  });
});

describe('custo desconhecido não vira margem', () => {
  it('margem em reais é indefinida, nunca a venda inteira', () => {
    expect(margemUnitaria(316.06, undefined)).toBeUndefined();
  });

  it('margem percentual é indefinida, nunca 100%', () => {
    expect(margemPercentual(316.06, undefined)).toBeUndefined();
  });

  it('custo ZERO é um valor legítimo e continua produzindo margem', () => {
    // A distinção que o `?? 0` apagaria: zero é uma afirmação, ausente é a falta
    // de uma. Um item doado custa zero e tem margem de 100% de verdade.
    expect(margemUnitaria(50, 0)).toBe(50);
    expect(margemPercentual(50, 0)).toBe(100);
  });

  it('venda zerada não divide por zero', () => {
    expect(margemPercentual(0, 0)).toBeUndefined();
  });
});

describe('a margem diz sobre quanto do orçamento ela fala', () => {
  it('margem sobre 3 de 40 itens é parcial, e a cobertura o diz', () => {
    expect(margemEhParcial(3, 40)).toBe(true);
    expect(cobertura(3, 40)).toBe(7.5);
  });

  it('orçamento inteiro coberto não é parcial', () => {
    expect(margemEhParcial(8, 8)).toBe(false);
    expect(cobertura(8, 8)).toBe(100);
  });

  it('obra sem itens não é "parcial", é vazia', () => {
    expect(margemEhParcial(0, 0)).toBe(false);
    expect(cobertura(0, 0)).toBe(0);
  });
});

describe('a margem da obra real, somada', () => {
  it('bate com o que a view devolveu: 22.045,02 de venda e 28,10% de margem', () => {
    const itens: [number, number, number][] = [
      // custo, ajuste, quantidade
      [234.12, 0, 4],
      [85.01, 0, 4],
      [0.71, 0, 80],
      [39.6, 6, 80],
      [116.67, 0, 80],
      [114.32, 0, 8],
      [14.78, 0, 50],
      [4.52, 0, 80],
    ];
    const venda = itens.reduce((s, [c, a, q]) => {
      const aj = a === 0 ? undefined : { tipo: 'Valor' as const, valor: a };
      return s + Math.round(q * precoDeVenda(c, aj, 35) * 100) / 100;
    }, 0);
    const custo = itens.reduce((s, [c, , q]) => s + Math.round(q * c * 100) / 100, 0);

    expect(Math.round(venda * 100) / 100).toBe(22045.02);
    expect(Math.round(custo * 100) / 100).toBe(15850.08);
    expect(margemPercentual(venda, custo)).toBe(28.1);
  });
});
