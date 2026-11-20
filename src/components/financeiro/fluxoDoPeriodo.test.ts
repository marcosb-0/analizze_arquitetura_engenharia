import { describe, expect, it } from 'vitest';
import type { LancamentoFinanceiro } from '../../types';
import { fluxoDoPeriodo } from './fluxoDoPeriodo';

const lan = (tipo: 'Receita' | 'Despesa', valor: number, data: string, pago = true, categoria: LancamentoFinanceiro['categoria'] = 'Outros') =>
  ({ id: `${tipo}${valor}${data}`, tipo, valor, data, dataVencimento: data, pago, categoria, descricao: '', contaId: 'c', centroCustoId: 'cc' }) as LancamentoFinanceiro;

describe('fluxoDoPeriodo', () => {
  const atual = { de: '2026-11-01', ate: '2026-11-20' };
  const anterior = { de: '2026-10-01', ate: '2026-10-20' };
  const lancamentos = [
    lan('Receita', 1000, '2026-11-05'),
    lan('Receita', 300, '2026-11-06', false),
    lan('Despesa', 400, '2026-11-20', true, 'Fornecedores'),
    lan('Despesa', 100, '2026-11-01', true, 'Salários'),
    lan('Despesa', 50, '2026-11-02', false),
    lan('Receita', 500, '2026-10-10'),
    lan('Receita', 999, '2026-10-25'), // fora dos dois intervalos
    lan('Despesa', 999, '2026-11-21'),
  ];
  const f = fluxoDoPeriodo(lancamentos, atual, anterior);

  it('soma só o quitado dentro do intervalo, nas duas pontas', () => {
    expect(f.recebido).toEqual({ atual: 1000, anterior: 500, variacao: 100 });
    expect(f.pago.atual).toBe(500);
    expect(f.pago.variacao).toBeNull();
    expect(f.resultado.atual).toBe(500);
  });

  it('separa o pendente lançado no período', () => {
    expect(f.pendenteReceber).toBe(300);
    expect(f.pendentePagar).toBe(50);
  });

  it('distribui por dia e por categoria', () => {
    expect(f.baldes).toHaveLength(20);
    expect(f.baldes[4]).toMatchObject({ receitas: 1000, despesas: 0 });
    expect(f.baldes[19].despesas).toBe(400);
    expect(f.porCategoria.map((c) => [c.name, c.percent])).toEqual([['Fornecedores', 80], ['Salários', 20]]);
  });
});
