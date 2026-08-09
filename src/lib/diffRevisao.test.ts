import { describe, it, expect } from 'vitest';
import { compararRevisoes } from './diffRevisao';
import type { ItemRevisaoProposta, RevisaoProposta } from '../types';

/**
 * O comparador de revisões é o que responde "por que a proposta subiu de
 * R$ 120.000 para R$ 145.000" numa negociação. A versão anterior só sabia dizer
 * os dois números.
 */

const item = (p: Partial<ItemRevisaoProposta> & { descricao: string }): ItemRevisaoProposta => ({
  unidade: 'un',
  categoria: 'Materiais',
  quantidade: 1,
  precoUnitario: 100,
  total: 100,
  ordem: 0,
  ...p,
});

const revisao = (versao: number, valor: number, itens: ItemRevisaoProposta[], bdi = 20): RevisaoProposta => ({
  versao,
  data: '2026-07-01',
  valor,
  valorItens: itens.reduce((s, i) => s + i.total, 0),
  bdiPercentual: bdi,
  alteracoes: '',
  itens,
  // O diff destas provas é do orçamento; o descritivo congelado não entra nele.
  secoes: [],
});

describe('compararRevisoes', () => {
  it('detecta item incluído', () => {
    const a = revisao(1, 100, [item({ catalogoInsumoId: 'cim', descricao: 'Cimento' })]);
    const b = revisao(2, 300, [
      item({ catalogoInsumoId: 'cim', descricao: 'Cimento' }),
      item({ catalogoInsumoId: 'areia', descricao: 'Areia', total: 200, precoUnitario: 200 }),
    ]);

    const d = compararRevisoes(a, b);
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0]).toMatchObject({ tipo: 'adicionado', descricao: 'Areia', deltaTotal: 200 });
    expect(d.inalterados).toBe(1);
  });

  it('detecta item removido com delta negativo', () => {
    const a = revisao(1, 300, [
      item({ catalogoInsumoId: 'cim', descricao: 'Cimento' }),
      item({ catalogoInsumoId: 'areia', descricao: 'Areia', total: 200 }),
    ]);
    const b = revisao(2, 100, [item({ catalogoInsumoId: 'cim', descricao: 'Cimento' })]);

    const d = compararRevisoes(a, b);
    expect(d.linhas[0]).toMatchObject({ tipo: 'removido', descricao: 'Areia', deltaTotal: -200 });
  });

  it('distingue mudança de quantidade, de preço e de ambos', () => {
    const a = revisao(1, 300, [
      item({ catalogoInsumoId: 'q', descricao: 'Só qtd', quantidade: 1, precoUnitario: 100, total: 100 }),
      item({ catalogoInsumoId: 'p', descricao: 'Só preço', quantidade: 1, precoUnitario: 100, total: 100 }),
      item({ catalogoInsumoId: 'qp', descricao: 'Qtd e preço', quantidade: 1, precoUnitario: 100, total: 100 }),
    ]);
    const b = revisao(2, 600, [
      item({ catalogoInsumoId: 'q', descricao: 'Só qtd', quantidade: 2, precoUnitario: 100, total: 200 }),
      item({ catalogoInsumoId: 'p', descricao: 'Só preço', quantidade: 1, precoUnitario: 150, total: 150 }),
      item({ catalogoInsumoId: 'qp', descricao: 'Qtd e preço', quantidade: 3, precoUnitario: 90, total: 270 }),
    ]);

    const porChave = new Map(compararRevisoes(a, b).linhas.map((l) => [l.chave, l.tipo]));
    expect(porChave.get('q')).toBe('quantidade');
    expect(porChave.get('p')).toBe('preco');
    expect(porChave.get('qp')).toBe('quantidade-e-preco');
  });

  it('compara em centavos: 0.1 + 0.2 não marca item como alterado', () => {
    const a = revisao(1, 100, [item({ catalogoInsumoId: 'x', descricao: 'X', precoUnitario: 0.3, total: 0.3 })]);
    const b = revisao(2, 100, [
      item({ catalogoInsumoId: 'x', descricao: 'X', precoUnitario: 0.1 + 0.2, total: 0.1 + 0.2 }),
    ]);

    const d = compararRevisoes(a, b);
    expect(d.linhas).toHaveLength(0);
    expect(d.inalterados).toBe(1);
  });

  it('pareia item avulso pela descrição normalizada, já que não tem id de catálogo', () => {
    const a = revisao(1, 100, [item({ descricao: '  Mão de obra extra  ' })]);
    const b = revisao(2, 150, [item({ descricao: 'MÃO DE OBRA EXTRA', total: 150, precoUnitario: 150 })]);

    const d = compararRevisoes(a, b);
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0].tipo).toBe('preco');
    expect(d.linhas[0].chave).toBe('avulso:mão de obra extra');
  });

  it('ordena por impacto financeiro absoluto — é por onde se explica a diferença', () => {
    const a = revisao(1, 0, []);
    const b = revisao(2, 1000, [
      item({ catalogoInsumoId: 'pequeno', descricao: 'Pequeno', total: 10 }),
      item({ catalogoInsumoId: 'grande', descricao: 'Grande', total: 900 }),
      item({ catalogoInsumoId: 'medio', descricao: 'Médio', total: 90 }),
    ]);

    expect(compararRevisoes(a, b).linhas.map((l) => l.descricao)).toEqual(['Grande', 'Médio', 'Pequeno']);
  });

  it('um desconto grande vem antes de um acréscimo pequeno (ordena pelo módulo)', () => {
    const a = revisao(1, 1000, [item({ catalogoInsumoId: 'caro', descricao: 'Caro', total: 500 })]);
    const b = revisao(2, 500, [item({ catalogoInsumoId: 'novo', descricao: 'Novo', total: 10 })]);

    const linhas = compararRevisoes(a, b).linhas;
    expect(linhas[0]).toMatchObject({ descricao: 'Caro', deltaTotal: -500 });
    expect(linhas[1]).toMatchObject({ descricao: 'Novo', deltaTotal: 10 });
  });

  it('calcula os deltas de cabeçalho', () => {
    const d = compararRevisoes(revisao(1, 120_000, [], 20), revisao(2, 145_000, [], 25));
    expect(d.deltaValor).toBe(25_000);
    expect(d.deltaPercentual).toBeCloseTo(20.83, 2);
    expect(d.deltaBdi).toBe(5);
  });

  it('não divide por zero quando a revisão anterior valia zero', () => {
    expect(compararRevisoes(revisao(1, 0, []), revisao(2, 500, [])).deltaPercentual).toBe(0);
  });

  it('duas revisões sem snapshot não são comparáveis item a item', () => {
    const d = compararRevisoes(revisao(1, 100, []), revisao(2, 200, []));
    expect(d.comparavel).toBe(false);
    expect(d.parcial).toBe(false);
    expect(d.deltaValor).toBe(100); // o comparativo financeiro ainda funciona
  });

  it('marca como parcial quando só uma das versões tem snapshot', () => {
    // Revisões anteriores a 20260725120000 não guardavam itens: o diff sairia
    // dizendo que TUDO foi incluído, o que é enviesado e precisa ser sinalizado.
    const d = compararRevisoes(revisao(1, 100, []), revisao(2, 200, [item({ descricao: 'X' })]));
    expect(d.comparavel).toBe(true);
    expect(d.parcial).toBe(true);
  });
});
