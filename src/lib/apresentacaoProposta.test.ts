import { describe, it, expect } from 'vitest';
import { APRESENTACAO_PADRAO, bdiPodeSerLinha, lerApresentacao, precisaDeComposicoes } from './apresentacaoProposta';

describe('lerApresentacao', () => {
  it('`{}` é o documento de sempre — proposta antiga não muda de cara', () => {
    expect(lerApresentacao({})).toEqual(APRESENTACAO_PADRAO);
    expect(APRESENTACAO_PADRAO).toMatchObject({ nivel: 'itens', precoUnitario: true, materiais: true, resumoCategoria: true });
  });

  it('não confia no jsonb: tipo errado ou lixo vira padrão', () => {
    expect(lerApresentacao(null)).toEqual(APRESENTACAO_PADRAO);
    expect(lerApresentacao([1, 2])).toEqual(APRESENTACAO_PADRAO);
    expect(lerApresentacao({ nivel: 'tudo', materiais: 'sim' })).toEqual(APRESENTACAO_PADRAO);
  });

  it('respeita o que foi gravado', () => {
    expect(lerApresentacao({ nivel: 'global', materiais: false })).toEqual({
      ...APRESENTACAO_PADRAO,
      nivel: 'global',
      materiais: false,
    });
  });
});

describe('bdiPodeSerLinha', () => {
  it('só onde há parciais somando até o total', () => {
    expect(bdiPodeSerLinha({ ...APRESENTACAO_PADRAO, nivel: 'global' })).toBe(false);
    expect(bdiPodeSerLinha({ ...APRESENTACAO_PADRAO, nivel: 'categoria' })).toBe(true);
    expect(bdiPodeSerLinha({ ...APRESENTACAO_PADRAO, nivel: 'itens' })).toBe(true);
    expect(bdiPodeSerLinha({ ...APRESENTACAO_PADRAO, nivel: 'itens', precoUnitario: false })).toBe(false);
  });
});

describe('precisaDeComposicoes', () => {
  it('não busca composição que não vai para o papel', () => {
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, materiais: false, resumoCategoria: false })).toBe(false);
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, nivel: 'global', materiais: false, composicao: true })).toBe(false);
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, materiais: false, composicao: true })).toBe(true);
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, nivel: 'global' })).toBe(true);
  });

  it('a divisão por natureza também abre as composições', () => {
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, nivel: 'categoria', materiais: false })).toBe(true);
    expect(precisaDeComposicoes({ ...APRESENTACAO_PADRAO, materiais: false, composicao: false, resumoCategoria: true })).toBe(true);
  });
});
