import { describe, it, expect } from 'vitest';
import { sugerirQuantidadeDaEtapa } from './quantidadeEtapa';
import { formatarPercentual } from './percentual';
import type { InsumoProjeto } from '../types';

const insumo = (extra: Partial<InsumoProjeto> = {}): InsumoProjeto => ({
  id: 'i-1',
  projetoId: 'obra-1',
  catalogoInsumoId: 'c-1',
  quantidade: 10,
  precoUnitarioBase: 100,
  ajuste: { tipo: 'Nenhum', valor: 0 },
  precoUnitario: 100,
  valorTotal: 1000,
  valorAjuste: 0,
  quantidadeExecutada: 0,
  percentualExecutado: 0,
  status: 'Orçado',
  insumoDescricao: 'Reboco',
  insumoUnidade: 'm²',
  insumoPrecoReferencia: 100,
  ...extra,
});

describe('sugerirQuantidadeDaEtapa', () => {
  it('soma os insumos amarrados à etapa quando todos falam a mesma unidade', () => {
    const sugestao = sugerirQuantidadeDaEtapa(
      [
        insumo({ id: 'a', etapaVinculadaId: 'e-1', quantidade: 120 }),
        insumo({ id: 'b', etapaVinculadaId: 'e-1', quantidade: 80 }),
        insumo({ id: 'c', etapaVinculadaId: 'e-2', quantidade: 999 }),
      ],
      'e-1'
    );
    expect(sugestao).toEqual({ tipo: 'ok', quantidade: 200, unidade: 'm²', insumos: 2 });
  });

  it('trata "M2" e "m²" como a mesma unidade e devolve a grafia original', () => {
    // `catalogo_insumos.unidade` é texto livre — a mesma razão que obrigou
    // `fn_unidade_e_hora` a aceitar 7 grafias de hora. Normalizar a saída
    // criaria uma terceira grafia que não existe em lugar nenhum.
    const sugestao = sugerirQuantidadeDaEtapa(
      [
        insumo({ id: 'a', etapaVinculadaId: 'e-1', quantidade: 5, insumoUnidade: 'm²' }),
        insumo({ id: 'b', etapaVinculadaId: 'e-1', quantidade: 5, insumoUnidade: ' M² ' }),
      ],
      'e-1'
    );
    expect(sugestao).toEqual({ tipo: 'ok', quantidade: 10, unidade: 'm²', insumos: 2 });
  });

  it('não sugere quando as unidades divergem — somar m² com saco inventa um número', () => {
    const sugestao = sugerirQuantidadeDaEtapa(
      [
        insumo({ id: 'a', etapaVinculadaId: 'e-1', insumoUnidade: 'm²' }),
        insumo({ id: 'b', etapaVinculadaId: 'e-1', insumoUnidade: 'sc' }),
      ],
      'e-1'
    );
    expect(sugestao).toEqual({ tipo: 'unidades-divergentes', unidades: ['m²', 'sc'] });
  });

  it('ignora o insumo ligado à etapa só pelo peso de valor, e não pelo vínculo direto', () => {
    // `etapa_orcamento_vinculo.peso_percentual` reparte VALOR: uma quantidade
    // multiplicada por ele não está em unidade nenhuma.
    expect(sugerirQuantidadeDaEtapa([insumo({ etapaVinculadaId: undefined })], 'e-1')).toEqual({
      tipo: 'sem-insumos',
    });
  });

  it('ignora quantidade zerada e unidade vazia', () => {
    expect(
      sugerirQuantidadeDaEtapa(
        [
          insumo({ id: 'a', etapaVinculadaId: 'e-1', quantidade: 0 }),
          insumo({ id: 'b', etapaVinculadaId: 'e-1', insumoUnidade: '' }),
        ],
        'e-1'
      )
    ).toEqual({ tipo: 'sem-insumos' });
  });

  it('devolve a soma nas 3 casas do banco, sem o resíduo do float', () => {
    const sugestao = sugerirQuantidadeDaEtapa(
      [
        insumo({ id: 'a', etapaVinculadaId: 'e-1', quantidade: 0.1 }),
        insumo({ id: 'b', etapaVinculadaId: 'e-1', quantidade: 0.2 }),
      ],
      'e-1'
    );
    expect(sugestao).toMatchObject({ quantidade: 0.3 });
  });
});

describe('formatarPercentual', () => {
  it('mostra o que a pessoa reconhece, e não as 4 casas que o banco guarda', () => {
    expect(formatarPercentual(33.3333)).toBe('33,33%');
    expect(formatarPercentual(100)).toBe('100%');
    expect(formatarPercentual(25.5)).toBe('25,5%');
  });

  it('abre as casas extras só quando escondê-las viraria um "0%" falso', () => {
    expect(formatarPercentual(0.0042)).toBe('0,0042%');
    expect(formatarPercentual(0)).toBe('0%');
  });
});
