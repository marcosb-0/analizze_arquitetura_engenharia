import { describe, expect, it } from 'vitest';
import { CATEGORIAS_CUSTO, rotuloCategoriaCusto, rotuloCategoriaInsumo } from './categorias';

describe('rótulos de categoria', () => {
  it('"Serviço" do catálogo é lido como serviço PRÓPRIO', () => {
    expect(rotuloCategoriaInsumo('Serviço')).toBe('Serviço próprio');
    expect(rotuloCategoriaInsumo('Serviço terceirizado')).toBe('Serviço terceirizado');
  });

  it('"Terceiros" do orçamento é lido como serviço terceirizado', () => {
    expect(rotuloCategoriaCusto('Serviços')).toBe('Serviços próprios');
    expect(rotuloCategoriaCusto('Terceiros')).toBe('Serviços terceirizados');
  });

  it('texto fora do domínio passa como está (revisão congelada, desvio)', () => {
    expect(rotuloCategoriaCusto('Categoria antiga')).toBe('Categoria antiga');
  });

  it('o seletor oferece as oito categorias do check do banco', () => {
    expect(CATEGORIAS_CUSTO).toHaveLength(8);
    expect(new Set(CATEGORIAS_CUSTO).size).toBe(8);
  });
});
