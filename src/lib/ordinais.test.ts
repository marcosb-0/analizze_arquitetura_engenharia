import { describe, expect, it } from 'vitest';
import { ordinalFeminino, rotuloClausula } from './ordinais';

describe('ordinalFeminino', () => {
  it('escreve por extenso da primeira à vigésima', () => {
    expect(ordinalFeminino(1)).toBe('PRIMEIRA');
    expect(ordinalFeminino(10)).toBe('DÉCIMA');
    expect(ordinalFeminino(11)).toBe('DÉCIMA PRIMEIRA');
    expect(ordinalFeminino(20)).toBe('VIGÉSIMA');
  });

  it('acima de vinte cai no ordinal numérico em vez de compor errado', () => {
    expect(ordinalFeminino(21)).toBe('21ª');
    expect(ordinalFeminino(100)).toBe('100ª');
  });

  it('fora da faixa devolve vazio, não "0ª" nem "-1ª"', () => {
    expect(ordinalFeminino(0)).toBe('');
    expect(ordinalFeminino(-1)).toBe('');
    expect(ordinalFeminino(1.5)).toBe('');
  });
});

describe('rotuloClausula', () => {
  it('monta o rótulo que vai no papel', () => {
    expect(rotuloClausula(1)).toBe('CLÁUSULA PRIMEIRA');
    expect(rotuloClausula(21)).toBe('CLÁUSULA 21ª');
  });

  it('sem número válido não imprime "CLÁUSULA undefined"', () => {
    expect(rotuloClausula(0)).toBe('CLÁUSULA');
  });
});
