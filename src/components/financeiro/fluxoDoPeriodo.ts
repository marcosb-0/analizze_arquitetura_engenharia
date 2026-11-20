import type { LancamentoFinanceiro } from '../../types';
import { comparar, type Comparado } from '../../lib/indicadores/calculos';
import { baldesDoIntervalo, dentro, indiceDoBalde, type Intervalo } from '../../lib/indicadores/periodo';

export interface FluxoDoPeriodo {
  recebido: Comparado;
  pago: Comparado;
  resultado: Comparado;
  /** Lançados no período e ainda não quitados. */
  pendenteReceber: number;
  pendentePagar: number;
  baldes: { rotulo: string; receitas: number; despesas: number }[];
  /** Despesas efetivadas no período, maior primeiro. */
  porCategoria: { name: string; value: number; percent: number }[];
}

/**
 * O que a Visão geral do Financeiro recorta pelo período: entradas e saídas
 * pela `data` do lançamento. Não há data de baixa no razão, então "recebido no
 * período" é o lançado no período que já está quitado — a mesma regra dos
 * Indicadores. Saldo em caixa e contas em aberto são posição, não fluxo, e
 * ficam fora daqui.
 */
export function fluxoDoPeriodo(lancamentos: LancamentoFinanceiro[], intervalo: Intervalo, anterior: Intervalo): FluxoDoPeriodo {
  const soma = (iv: Intervalo, tipo: LancamentoFinanceiro['tipo'], pago: boolean) =>
    lancamentos.reduce((t, l) => (l.tipo === tipo && l.pago === pago && dentro(l.data, iv) ? t + l.valor : t), 0);

  const recebido = soma(intervalo, 'Receita', true);
  const pago = soma(intervalo, 'Despesa', true);
  const recebidoAntes = soma(anterior, 'Receita', true);
  const pagoAntes = soma(anterior, 'Despesa', true);

  const fatias = baldesDoIntervalo(intervalo);
  const baldes = fatias.map((b) => ({ rotulo: b.rotulo, receitas: 0, despesas: 0 }));
  const categorias = new Map<string, number>();
  for (const l of lancamentos) {
    if (!l.pago || !dentro(l.data, intervalo)) continue;
    const i = indiceDoBalde(fatias, l.data);
    if (i >= 0) baldes[i][l.tipo === 'Receita' ? 'receitas' : 'despesas'] += l.valor;
    if (l.tipo === 'Despesa') categorias.set(l.categoria, (categorias.get(l.categoria) ?? 0) + l.valor);
  }

  return {
    recebido: comparar(recebido, recebidoAntes),
    pago: comparar(pago, pagoAntes),
    resultado: comparar(recebido - pago, recebidoAntes - pagoAntes),
    pendenteReceber: soma(intervalo, 'Receita', false),
    pendentePagar: soma(intervalo, 'Despesa', false),
    baldes,
    porCategoria: [...categorias]
      .map(([name, value]) => ({ name, value, percent: pago > 0 ? (value / pago) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
  };
}
