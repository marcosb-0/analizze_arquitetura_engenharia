import { describe, expect, it } from 'vitest';
import { calcularTotaisDocumento } from './documentoProposta';
import { ItemProposta, Proposta } from '../types';

const item = (over: Partial<ItemProposta> & { id: string }): ItemProposta => ({
  propostaId: 'p1',
  descricao: 'Item',
  unidade: 'm²',
  categoria: 'Materiais',
  quantidade: 1,
  precoUnitarioBase: 0,
  ajuste: { tipo: 'Nenhum', valor: 0 },
  precoUnitario: 0,
  ordem: 0,
  qtdComponentes: 0,
  linhasAjustadas: 0,
  pesos: { maoDeObra: 0, material: 0, terceirizado: 0, outros: 0 },
  ...over,
});

const proposta = (over: Partial<Proposta>): Proposta =>
  ({
    id: 'p1',
    numero: 'PROP-001',
    clienteId: 'c1',
    descricao: 'Escopo',
    valorEstimado: 0,
    valorManual: 0,
    bdiPercentual: 0,
    bdiVisivelPdf: false,
    qtdItens: 0,
    valorItens: 0,
    valorCalculado: 0,
    dataValidade: '',
    status: 'Elaboração',
    revisoes: [],
    ...over,
  }) as Proposta;

/** Soma da coluna "Total" como ela aparece impressa. */
const somaDaColuna = (linhas: { total: number }[]) =>
  Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100;

describe('calcularTotaisDocumento', () => {
  it('com BDI em linha separada, não mexe nos preços unitários', () => {
    const itens = [
      item({ id: 'a', quantidade: 3, precoUnitario: 10.5 }),
      item({ id: 'b', quantidade: 2, precoUnitario: 7.25 }),
    ];
    const t = calcularTotaisDocumento(
      proposta({ bdiVisivelPdf: true, bdiPercentual: 20, valorItens: 46, valorCalculado: 55.2 }),
      itens
    );

    expect(t.bdiEmbutido).toBe(false);
    expect(t.linhas.map((l) => l.precoUnitario)).toEqual([10.5, 7.25]);
    expect(t.linhas.map((l) => l.total)).toEqual([31.5, 14.5]);
    expect(t.subtotal).toBe(46);
    expect(t.bdiValor).toBeCloseTo(9.2, 2);
  });

  /**
   * O invariante que o documento comercial não pode violar: a coluna impressa
   * tem de somar o total contratado. Sem a redistribuição do resíduo, estes
   * números fecham em 121,29 contra um total de 121,30.
   */
  it('com BDI embutido, a coluna fecha com o total mesmo quando o arredondamento sobra', () => {
    const itens = [
      item({ id: 'a', quantidade: 3, precoUnitario: 10.11 }),
      item({ id: 'b', quantidade: 7, precoUnitario: 5.33 }),
      item({ id: 'c', quantidade: 1, precoUnitario: 30.07 }),
    ];
    // valorItens = 30.33 + 37.31 + 30.07 = 97.71; ×1,24 = 121,1604 → 121,16
    const t = calcularTotaisDocumento(
      proposta({
        bdiVisivelPdf: false,
        bdiPercentual: 24,
        valorItens: 97.71,
        valorCalculado: 121.16,
      }),
      itens
    );

    expect(t.bdiEmbutido).toBe(true);
    expect(somaDaColuna(t.linhas)).toBe(121.16);
  });

  it('joga o resíduo na linha de maior valor, não na primeira', () => {
    const itens = [
      item({ id: 'pequeno', quantidade: 1, precoUnitario: 0.03 }),
      item({ id: 'grande', quantidade: 1, precoUnitario: 100 }),
    ];
    const t = calcularTotaisDocumento(
      proposta({
        bdiVisivelPdf: false,
        bdiPercentual: 13,
        valorItens: 100.03,
        // Forçado 1 centavo acima da soma linha a linha para isolar o resíduo.
        valorCalculado: 113.05,
      }),
      itens
    );

    expect(somaDaColuna(t.linhas)).toBe(113.05);
    // O pequeno fica intacto: 0,03 × 1,13 = 0,0339 → 0,03.
    expect(t.linhas[0].total).toBe(0.03);
    expect(t.linhas[1].total).toBe(113.02);
  });

  it('sem itens, devolve as linhas vazias sem quebrar no resíduo', () => {
    const t = calcularTotaisDocumento(
      proposta({ bdiVisivelPdf: false, bdiPercentual: 20, valorItens: 0, valorCalculado: 0 }),
      []
    );

    expect(t.linhas).toEqual([]);
  });
});

describe('calcularTotaisDocumento — modalidade "só mão de obra"', () => {
  // Emboço: 30 de mão de obra + 10 de material por unidade → 25% é material.
  // Cimento avulso: material sem composição, sai inteiro.
  const pesos = { maoDeObra: 30, material: 10, terceirizado: 0, outros: 0 };
  const itens = [
    item({ id: 'emb', categoria: 'Serviços', quantidade: 10, precoUnitario: 100, pesos }),
    item({ id: 'cim', categoria: 'Materiais', quantidade: 4, precoUnitario: 50 }),
  ];
  // O que a v_propostas devolve para esta proposta: 750 contratados, 1.200 no orçamento inteiro.
  const doBanco = { modalidade: 'mao_de_obra' as const, bdiPercentual: 10, valorItens: 750, valorCalculado: 825, valorItensCompleto: 1200 };

  it('BDI em linha: tira o material de cada linha e some a linha só de material', () => {
    const t = calcularTotaisDocumento(proposta({ ...doBanco, bdiVisivelPdf: true }), itens);
    expect(t.linhas.map((l) => [l.item.id, l.total, l.precoUnitario])).toEqual([['emb', 750, 75]]);
    expect(t.subtotal).toBe(750);
    expect(t.total).toBe(825);
    expect(t.valorFora).toBe(495);
  });

  it('BDI embutido: a coluna recortada fecha com o total gravado', () => {
    const t = calcularTotaisDocumento(proposta({ ...doBanco, bdiVisivelPdf: false }), itens);
    expect(somaDaColuna(t.linhas)).toBe(825);
    expect(t.linhas).toHaveLength(1);
  });

  it('"mão de obra e material" não tira nada', () => {
    const t = calcularTotaisDocumento(
      proposta({ ...doBanco, modalidade: 'mao_de_obra_material', valorItens: 1200, valorCalculado: 1320, bdiVisivelPdf: true }),
      itens
    );
    expect(t.linhas.map((l) => l.total)).toEqual([1000, 200]);
    expect(t.valorFora).toBe(0);
  });
});
