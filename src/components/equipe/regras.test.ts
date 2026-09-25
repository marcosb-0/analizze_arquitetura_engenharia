import { describe, expect, it } from 'vitest';
import { parseDinheiro, parseOpcional, temPendencia } from './regras';
import type { Funcionario } from '../../types';

describe('parseOpcional', () => {
  it('em branco é ausência, não zero', () => {
    expect(parseOpcional('')).toBeUndefined();
    expect(parseOpcional('   ')).toBeUndefined();
  });
  it('aceita o formato brasileiro, com milhar e vírgula', () => {
    expect(parseOpcional('2.500,00')).toBe(2500);
    expect(parseOpcional('82,27')).toBe(82.27);
    expect(parseOpcional('0')).toBe(0);
  });
  it('ponto sem vírgula continua decimal', () => {
    expect(parseOpcional('3500.50')).toBe(3500.5);
  });
  it('texto que não é número volta null, para a validação falar', () => {
    expect(parseOpcional('abc')).toBeNull();
    expect(parseOpcional('1,2,3')).toBeNull();
  });
});

describe('parseDinheiro', () => {
  it('ponto em grupos de três é milhar', () => {
    expect(parseDinheiro('2.500')).toBe(2500);
    expect(parseDinheiro('1.250.000')).toBe(1250000);
  });
  it('o resto segue a leitura comum', () => {
    expect(parseDinheiro('2.500,50')).toBe(2500.5);
    expect(parseDinheiro('2500.5')).toBe(2500.5);
    expect(parseDinheiro('')).toBeUndefined();
    expect(parseDinheiro('x')).toBeNull();
  });
});

describe('temPendencia', () => {
  const ativo = { status: 'Ativo' } as Funcionario;
  const sinais = { frentes: 0, docsVencidos: 0, docsAVencer: 0, semSalario: false };
  it('desligado nunca tem pendência', () => {
    expect(temPendencia({ status: 'Inativo' } as Funcionario, { ...sinais, semSalario: true })).toBe(false);
  });
  it('documento ou salário faltando contam', () => {
    expect(temPendencia(ativo, sinais)).toBe(false);
    expect(temPendencia(ativo, { ...sinais, docsAVencer: 1 })).toBe(true);
    expect(temPendencia(ativo, { ...sinais, semSalario: true })).toBe(true);
  });
});
