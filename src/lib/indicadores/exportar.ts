/**
 * Exportação CSV das tabelas do painel de indicadores.
 *
 * Ponto e vírgula e vírgula decimal: é o que o Excel em pt-BR abre em colunas
 * sem assistente de importação. O BOM no início é o que faz ele ler o arquivo
 * como UTF-8 — sem ele "Execução" chega como "ExecuÃ§Ã£o".
 *
 * Os números saem SEM símbolo de moeda nem separador de milhar: quem exporta
 * quer somar a coluna, e "R$ 1.234,56" é texto para a planilha.
 */

export type ValorCelula = string | number | null | undefined;

export interface ColunaCsv<T> {
  titulo: string;
  valor: (linha: T) => ValorCelula;
}

function celula(v: ValorCelula): string {
  if (v === null || v === undefined) return '';
  const texto = typeof v === 'number'
    ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '')
    : v;
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function montarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'));
  return `\uFEFF${[cabecalho, ...corpo].join('\r\n')}`;
}

export function baixarCsv(nome: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // O clique é síncrono, mas o download não: revogar no mesmo tique cancela o
  // arquivo em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
