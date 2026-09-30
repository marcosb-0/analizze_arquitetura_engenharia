import { describe, expect, it } from 'vitest';
import type { ComponenteItemProposta, FolhaComposicao } from '../types';
import { dividirPorNatureza, LinhaParaDividir } from './divisaoNatureza';

const linha = (id: string, total: number, patch: Partial<LinhaParaDividir['item']> = {}): LinhaParaDividir => ({
  item: { id, categoria: 'Serviços', qtdComponentes: 0, ...patch },
  total,
});
const folha = (raizId: string, categoria: FolhaComposicao['categoria'], coeficiente: number, precoUnitario: number): FolhaComposicao => ({
  raizId, insumoId: `${raizId}-${categoria}`, descricao: categoria, unidade: 'un', categoria, coeficiente, precoUnitario,
});
const comp = (itemPropostaId: string, categoria: ComponenteItemProposta['categoria'], coeficiente: number, precoUnitario: number, catalogoInsumoId?: string): ComponenteItemProposta => ({
  id: `${itemPropostaId}-${categoria}-${catalogoInsumoId ?? ''}`, itemPropostaId, descricao: categoria, unidade: 'un', categoria,
  coeficiente, precoUnitario, custo: coeficiente * precoUnitario, ordem: 0, catalogoInsumoId,
});
const mapa = (r: [string, number][]) => Object.fromEntries(r);

describe('divisão por natureza', () => {
  it('serviço próprio do catálogo é aberto em mão de obra e material pelo custo das folhas', () => {
    // Emboço: 30 de mão de obra + 10 de material por m² → 75% / 25% do valor de venda.
    const r = dividirPorNatureza(
      [linha('emb', 1000, { catalogoInsumoId: 'EMB' })],
      [],
      [folha('EMB', 'Mão de Obra', 1, 30), folha('EMB', 'Material', 2, 5)]
    );
    expect(mapa(r)).toEqual({ 'Mão de obra': 750, 'Material': 250 });
  });

  it('a composição adaptada à proposta manda sobre a do catálogo', () => {
    const r = dividirPorNatureza(
      [linha('emb', 100, { catalogoInsumoId: 'EMB', qtdComponentes: 2 })],
      [comp('emb', 'Mão de Obra', 1, 10), comp('emb', 'Material', 1, 10)],
      [folha('EMB', 'Mão de Obra', 1, 90), folha('EMB', 'Material', 1, 10)]
    );
    expect(mapa(r)).toEqual({ 'Mão de obra': 50, 'Material': 50 });
  });

  it('componente que é composição (argamassa) é aberto pelas folhas dele', () => {
    const r = dividirPorNatureza(
      [linha('emb', 100, { qtdComponentes: 2 })],
      [comp('emb', 'Mão de Obra', 1, 50), comp('emb', 'Serviço', 1, 50, 'ARG')],
      [folha('ARG', 'Material', 1, 40), folha('ARG', 'Mão de Obra', 1, 10)]
    );
    expect(mapa(r)).toEqual({ 'Mão de obra': 60, 'Material': 40 });
  });

  it('terceirizado vai para a própria linha, e equipamento não se mistura', () => {
    const r = dividirPorNatureza(
      [
        linha('imp', 500, { categoria: 'Terceiros' }),
        linha('conc', 100, { catalogoInsumoId: 'CON' }),
      ],
      [],
      [folha('CON', 'Material', 1, 80), folha('CON', 'Equipamento', 1, 20)]
    );
    expect(r).toEqual([['Material', 80], ['Serviços terceirizados', 500], ['Equipamentos e outros', 20]]);
  });

  it('sem composição nem preço, cai na categoria do item', () => {
    expect(mapa(dividirPorNatureza([linha('a', 10, { categoria: 'Materiais' })], [], []))).toEqual({ Material: 10 });
    expect(mapa(dividirPorNatureza([linha('b', 10, { catalogoInsumoId: 'X' })], [], [folha('X', 'Material', 1, 0)]))).toEqual({ 'Mão de obra': 10 });
  });

  it('a soma das naturezas fecha com a soma das linhas, ao centavo', () => {
    const linhas = [linha('a', 100, { catalogoInsumoId: 'A' }), linha('b', 33.33, { catalogoInsumoId: 'A' })];
    const r = dividirPorNatureza(linhas, [], [folha('A', 'Mão de Obra', 1, 1), folha('A', 'Material', 1, 1), folha('A', 'Serviço terceirizado', 1, 1)]);
    expect(Math.round(r.reduce((s, [, v]) => s + v, 0) * 100) / 100).toBe(133.33);
  });
});
