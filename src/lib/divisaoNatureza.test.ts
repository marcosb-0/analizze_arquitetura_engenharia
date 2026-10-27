import { describe, expect, it } from 'vitest';
import type { ItemProposta } from '../types';
import {
  dividirPorNatureza, LinhaParaDividir, materialDaLinha, naturezasForaDaModalidade, valorContratadoDaLinha,
} from './divisaoNatureza';

type Pesos = ItemProposta['pesos'];
const SEM: Pesos = { maoDeObra: 0, material: 0, terceirizado: 0, outros: 0 };
const item = (id: string, pesos: Partial<Pesos> = {}, categoria: ItemProposta['categoria'] = 'Serviços') =>
  ({ id, categoria, pesos: { ...SEM, ...pesos } });
const linha = (i: ReturnType<typeof item>, total: number): LinhaParaDividir => ({ item: i, total });
const mapa = (r: [string, number][]) => Object.fromEntries(r);

describe('divisão por natureza (pesos gravados pelo banco)', () => {
  it('reparte o valor da linha na proporção dos pesos', () => {
    // Emboço: 30 de mão de obra + 10 de material → 75% / 25% do valor de venda.
    const r = dividirPorNatureza([linha(item('emb', { maoDeObra: 30, material: 10 }), 1000)]);
    expect(mapa(r)).toEqual({ 'Mão de obra': 750, Material: 250 });
  });

  it('item sem pesos cai na categoria dele', () => {
    expect(mapa(dividirPorNatureza([linha(item('a', {}, 'Materiais'), 10)]))).toEqual({ Material: 10 });
    expect(mapa(dividirPorNatureza([linha(item('b', {}, 'Terceiros'), 10)]))).toEqual({ 'Serviços terceirizados': 10 });
  });

  it('cada linha fecha ao centavo, com o resíduo na maior fatia', () => {
    const tres = item('x', { maoDeObra: 1, material: 1, terceirizado: 1 });
    const r = dividirPorNatureza([linha(tres, 100), linha(tres, 100)]);
    expect(r.reduce((s, [, v]) => s + v, 0)).toBeCloseTo(200, 2);
  });

  it('com naturezas de fora, reparte só entre as que ficam', () => {
    const r = dividirPorNatureza([linha(item('emb', { maoDeObra: 30, material: 10, terceirizado: 10 }), 400)], ['Material']);
    expect(mapa(r)).toEqual({ 'Mão de obra': 300, 'Serviços terceirizados': 100 });
  });
});

/**
 * Espelho de `fn_material_da_linha` / `fn_valor_contratado_linha`. Se uma das
 * duas mudar sem a outra, o PDF e o valor gravado voltam a discordar.
 */
describe('recorte da modalidade (paridade com o banco)', () => {
  it('só mão de obra: tira round(total × material / soma)', () => {
    const emb = item('emb', { maoDeObra: 30, material: 10 });
    expect(materialDaLinha(emb, 1000)).toBe(250);
    expect(valorContratadoDaLinha(emb, 1000, 'mao_de_obra')).toBe(750);
    // 100 × 1/3 = 33,333… → 33,33
    expect(materialDaLinha(item('t', { maoDeObra: 2, material: 1 }), 100)).toBe(33.33);
  });

  it('material avulso sem composição sai inteiro; serviço sem composição fica', () => {
    expect(valorContratadoDaLinha(item('cim', {}, 'Materiais'), 200, 'mao_de_obra')).toBe(0);
    expect(valorContratadoDaLinha(item('calha', {}, 'Serviços'), 1000, 'mao_de_obra')).toBe(1000);
  });

  it('mão de obra e material, ou sem modalidade, não tira nada', () => {
    const emb = item('emb', { maoDeObra: 30, material: 10 });
    expect(valorContratadoDaLinha(emb, 1000, 'mao_de_obra_material')).toBe(1000);
    expect(valorContratadoDaLinha(emb, 1000, undefined)).toBe(1000);
    expect(naturezasForaDaModalidade('mao_de_obra')).toEqual(['Material']);
    expect(naturezasForaDaModalidade('mao_de_obra_material')).toEqual([]);
  });
});
