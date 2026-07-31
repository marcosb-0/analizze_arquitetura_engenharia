import { describe, it, expect } from 'vitest';
import {
  AJUSTE_NEUTRO,
  precoUnitarioGerado,
  aplicarAjuste,
  ajusteRecusadoPeloBanco,
  deltaAjuste,
  deltaAjustePercentual,
  ajusteParaPrecoAlvo,
  categoriaCustoDoInsumo,
  normalizaBusca,
} from './preco';
import type { AjustePreco } from '../types';

/**
 * O teste mais valioso do projeto, e a razão é específica: `preco_unitario` é
 * coluna GENERATED em `insumos_projeto` e em `itens_proposta`, então existem duas
 * implementações do mesmo cálculo — uma em plpgsql/SQL e outra aqui. Se as duas
 * divergirem por um centavo, a tela mostra um número e o banco guarda outro, e
 * ninguém descobre até um cliente conferir a planilha.
 *
 * A tabela abaixo NÃO foi calculada à mão nem pelo JavaScript. Cada `esperado` foi
 * produzido pelo próprio Postgres, executando a expressão real da coluna
 * (extraída de `information_schema.columns`) no projeto svgkbqfozxwrbzheshuc:
 *
 *     round(CASE ajuste_tipo
 *       WHEN 'Percentual' THEN base * (1 + valor / 100.0)
 *       WHEN 'Valor'      THEN base + valor
 *       ELSE base
 *     END, 2)
 *
 * Os casos de meio-centavo (0.005, 2.675, 8.165, 3.145, 7.775) estão aqui de
 * propósito: são exatamente onde `round` do Postgres (meio para cima) e o
 * `Math.round` do JavaScript (que sofre com a representação binária — 2.675 é
 * na verdade 2.67499999...) discordam se o código não compensar. É o que o
 * `round2` com `Number.EPSILON` resolve, e é o que este teste protege.
 */
const PARIDADE_COM_POSTGRES: ReadonlyArray<{
  base: number;
  ajuste: AjustePreco;
  esperado: number;
  nota?: string;
}> = [
  { base: 10.0, ajuste: { tipo: 'Nenhum', valor: 0 }, esperado: 10.0 },
  { base: 29.0, ajuste: { tipo: 'Valor', valor: -2.0 }, esperado: 27.0 },
  { base: 29.0, ajuste: { tipo: 'Percentual', valor: -10.0 }, esperado: 26.1 },
  { base: 22.51, ajuste: { tipo: 'Percentual', valor: 0.0212 }, esperado: 22.51 },
  { base: 0.005, ajuste: AJUSTE_NEUTRO, esperado: 0.01, nota: 'meio centavo sobe' },
  { base: 0.015, ajuste: AJUSTE_NEUTRO, esperado: 0.02, nota: 'meio centavo sobe' },
  { base: 0.025, ajuste: AJUSTE_NEUTRO, esperado: 0.03, nota: 'Math.round daria 0.02' },
  { base: 1.005, ajuste: { tipo: 'Valor', valor: 0 }, esperado: 1.01, nota: 'binário: 1.00499999...' },
  { base: 2.675, ajuste: { tipo: 'Valor', valor: 0 }, esperado: 2.68, nota: 'binário: 2.67499999...' },
  { base: 8.165, ajuste: { tipo: 'Valor', valor: 0 }, esperado: 8.17 },
  { base: 3.145, ajuste: { tipo: 'Valor', valor: 0 }, esperado: 3.15 },
  { base: 7.775, ajuste: { tipo: 'Valor', valor: 0 }, esperado: 7.78 },
  { base: 10.0, ajuste: { tipo: 'Percentual', valor: 33.333333 }, esperado: 13.33 },
  { base: 100.0, ajuste: { tipo: 'Percentual', valor: -0.5 }, esperado: 99.5 },
  { base: 19.99, ajuste: { tipo: 'Percentual', valor: 15 }, esperado: 22.99 },
  { base: 0.1, ajuste: { tipo: 'Percentual', valor: 5 }, esperado: 0.11 },
  { base: 1234567.89, ajuste: { tipo: 'Percentual', valor: 7.5 }, esperado: 1327160.48 },
  { base: 1.0, ajuste: { tipo: 'Valor', valor: -1.0 }, esperado: 0.0, nota: 'zero exato passa na CHECK' },
  { base: 33.33, ajuste: { tipo: 'Percentual', valor: -100 }, esperado: 0.0 },
  { base: 1.0, ajuste: { tipo: 'Valor', valor: -1.5 }, esperado: -0.5, nota: 'o banco NÃO limita a zero' },

  // Meio para LONGE de zero no lado negativo. `Math.round(-0.5)` em JS é `-0`
  // (arredonda para +∞), mas `round(-0.005, 2)` no Postgres é `-0.01`. Estes
  // cinco casos cobrem a segunda falha do `round2` antigo, que a versão positiva
  // da tabela não alcançava.
  { base: 0.0, ajuste: { tipo: 'Valor', valor: -0.005 }, esperado: -0.01, nota: 'Math.round daria -0' },
  { base: 0.0, ajuste: { tipo: 'Valor', valor: -0.015 }, esperado: -0.02 },
  { base: 0.0, ajuste: { tipo: 'Valor', valor: -1.005 }, esperado: -1.01 },
  { base: 0.0, ajuste: { tipo: 'Valor', valor: -2.675 }, esperado: -2.68 },
  { base: 0.0, ajuste: { tipo: 'Valor', valor: -8.165 }, esperado: -8.17 },
];

describe('precoUnitarioGerado — paridade com a coluna GENERATED', () => {
  for (const { base, ajuste, esperado, nota } of PARIDADE_COM_POSTGRES) {
    const rotulo =
      `base ${base} ${ajuste.tipo}${ajuste.valor ? ` ${ajuste.valor}` : ''} → ${esperado}` +
      (nota ? ` (${nota})` : '');
    it(rotulo, () => {
      expect(precoUnitarioGerado(base, ajuste)).toBe(esperado);
    });
  }
});

describe('aplicarAjuste — preço de exibição', () => {
  it('acompanha o banco em todo o domínio não negativo', () => {
    for (const { base, ajuste, esperado } of PARIDADE_COM_POSTGRES) {
      if (esperado < 0) continue;
      expect(aplicarAjuste(base, ajuste)).toBe(esperado);
    }
  });

  it('limita a zero onde o banco devolveria negativo — e é por isso que existe o guarda', () => {
    // A divergência é deliberada e documentada: a tela não mostra preço negativo,
    // mas o INSERT correspondente é RECUSADO pela CHECK `preco_unitario >= 0`
    // (verificado no banco: 23514 insumos_projeto_preco_nao_negativo). Quem monta
    // formulário tem de perguntar a `ajusteRecusadoPeloBanco` antes de salvar.
    const base = 1.0;
    const ajuste: AjustePreco = { tipo: 'Valor', valor: -1.5 };

    expect(precoUnitarioGerado(base, ajuste)).toBe(-0.5);
    expect(aplicarAjuste(base, ajuste)).toBe(0);
    expect(ajusteRecusadoPeloBanco(base, ajuste)).toBe(true);
  });

  it('zero exato não é recusado', () => {
    expect(ajusteRecusadoPeloBanco(1.0, { tipo: 'Valor', valor: -1.0 })).toBe(false);
    expect(ajusteRecusadoPeloBanco(33.33, { tipo: 'Percentual', valor: -100 })).toBe(false);
  });
});

describe('deltaAjuste', () => {
  it('mede o acréscimo/desconto por unidade', () => {
    expect(deltaAjuste(29.0, { tipo: 'Valor', valor: -2.0 })).toBe(-2.0);
    expect(deltaAjuste(29.0, { tipo: 'Percentual', valor: -10 })).toBe(-2.9);
    expect(deltaAjuste(10.0, AJUSTE_NEUTRO)).toBe(0);
  });

  it('traduz ajuste em R$ para percentual sobre a base', () => {
    expect(deltaAjustePercentual(29.0, { tipo: 'Valor', valor: -2.9 })).toBe(-10);
  });

  it('não divide por zero quando a base é zero', () => {
    expect(deltaAjustePercentual(0, { tipo: 'Valor', valor: 5 })).toBe(0);
  });
});

describe('ajusteParaPrecoAlvo — o inverso de aplicarAjuste', () => {
  it('preço-alvo igual à base não gera ajuste', () => {
    expect(ajusteParaPrecoAlvo(29.0, 29.0)).toEqual(AJUSTE_NEUTRO);
  });

  it('ida e volta: o ajuste derivado reproduz o alvo', () => {
    for (const [base, alvo] of [
      [29.0, 27.0],
      [10.0, 13.33],
      [100.0, 99.5],
      [19.99, 22.99],
    ] as const) {
      expect(aplicarAjuste(base, ajusteParaPrecoAlvo(base, alvo, 'Valor'))).toBe(alvo);
      expect(aplicarAjuste(base, ajusteParaPrecoAlvo(base, alvo, 'Percentual'))).toBeCloseTo(alvo, 2);
    }
  });

  it('base zero não produz ajuste percentual (divisão por zero)', () => {
    expect(ajusteParaPrecoAlvo(0, 10, 'Percentual')).toEqual(AJUSTE_NEUTRO);
  });
});

describe('normalizaBusca — tem de bater com fn_normaliza_busca no banco', () => {
  it('minúsculas, sem acento, sem espaço nas pontas', () => {
    expect(normalizaBusca('  CONCRETO  ')).toBe('concreto');
    expect(normalizaBusca('Cerâmica')).toBe('ceramica');
    expect(normalizaBusca('AÇO CA-50')).toBe('aco ca-50');
    expect(normalizaBusca('Alvenaria de Vedação')).toBe('alvenaria de vedacao');
  });

  it('preserva números e hífen, que fazem parte do código SINAPI', () => {
    expect(normalizaBusca('88316')).toBe('88316');
    expect(normalizaBusca('CA-60')).toBe('ca-60');
  });
});

describe('categoriaCustoDoInsumo — ponte catálogo (5) → orçamento (7)', () => {
  it('mapeia as cinco categorias do catálogo', () => {
    expect(categoriaCustoDoInsumo('Material')).toBe('Materiais');
    expect(categoriaCustoDoInsumo('Mão de Obra')).toBe('Mão de Obra');
    expect(categoriaCustoDoInsumo('Equipamento')).toBe('Equipamentos');
    expect(categoriaCustoDoInsumo('Serviço')).toBe('Terceiros');
    expect(categoriaCustoDoInsumo('Taxa')).toBe('Administração');
  });
});
