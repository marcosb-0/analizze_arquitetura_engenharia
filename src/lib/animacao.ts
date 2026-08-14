/**
 * Atraso de entrada escalonada, para listas e grades.
 *
 * ## Por que virou função, e por que o teto importa
 *
 * A fórmula estava escrita à mão em oito telas, com três passos diferentes
 * (20, 30 e 50 ms) e três tetos (200, 300 e 400 ms) para o mesmo gesto — "os
 * itens aparecem em cascata". Ninguém escolheu esses números três vezes; eles
 * foram copiados e derivaram.
 *
 * O TETO é a parte que não pode sumir numa futura simplificação: sem ele, uma
 * lista de 200 insumos faria o último item entrar 4 segundos depois do
 * primeiro, e a tela pareceria travada. Com teto, a cascata é um detalhe de
 * entrada, não uma espera.
 *
 * Devolve string de CSS (`'0.12s'`) porque o consumidor é `animationDelay`, e
 * não o `motion`, que aceitava número em segundos.
 */
export function atrasoEntrada(indice: number, passo = 0.03, teto = 0.3): string {
  return `${Math.min(indice * passo, teto)}s`;
}
