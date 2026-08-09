/**
 * As medidas que a grade e a linha do tempo precisam compartilhar.
 *
 * `ALTURA_LINHA` é o número mais importante do Gantt: os dois painéis rolam
 * juntos porque cada linha ocupa exatamente a mesma altura nos dois, e a
 * coordenada Y de uma barra (e, na Fase 3, das setas) é `índice × ALTURA_LINHA`.
 * Se um dos lados calcular a altura pelo conteúdo, a grade e o gráfico
 * descolam — e o desalinhamento cresce a cada linha, então só fica óbvio no fim
 * de uma obra grande.
 */
export const ALTURA_LINHA = 34;

/** As duas faixas do cabeçalho (mês/ano em cima, grão do zoom embaixo). */
export const ALTURA_CABECALHO = 44;

/** Folga em dias corridos antes da primeira barra e depois da última. */
export const FOLGA_DIAS = { dia: 3, semana: 7, mes: 21 } as const;

/**
 * Acima disto o Gantt abre recolhido no primeiro nível.
 *
 * Não há virtualização de linhas de propósito: ela quebraria as coordenadas
 * analíticas do SVG das setas (Fase 3) e obrigaria a MEDIR o DOM a cada quadro
 * de arraste. Uma obra tem dezenas de etapas; o teto existe para o caso raro
 * não travar a aba.
 */
export const LIMITE_LINHAS_ABERTAS = 250;
