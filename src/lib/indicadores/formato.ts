/** Formatação dos números do painel de indicadores. */

export const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Moeda curta para KPI e eixo — "R$ 1,2 mi", "R$ 48,5 mil". O valor inteiro
 * vai no `title`/dica, então nada se perde; o que se ganha é o número caber
 * na coluna de um celular.
 */
export function dinheiroCurto(valor: number): string {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `${sinal}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return dinheiro(valor);
}

export const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');

export function decimal(valor: number, casas = 2): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function percentual(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
}

/** "+12%", "−3%", com o sinal de menos tipográfico. */
export function variacaoTexto(v: number): string {
  const abs = Math.abs(v);
  const corpo = abs >= 10 ? Math.round(abs).toLocaleString('pt-BR') : abs.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${corpo}%`;
}

export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;
