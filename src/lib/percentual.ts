/**
 * `medicoes_obra.percentual_medido` virou `numeric(8,4)` em 20260815100001: a
 * resolução de um boletim derivado de quantidade é relativa à meta da etapa, e
 * com 2 casas o mesmo boletim de 1 m² numa etapa de 20.000 m² passava numa
 * segunda-feira e era recusado na terça.
 *
 * O preço disso é que quatro telas que interpolavam o número cru passariam a
 * imprimir "+33.3333%". Este helper é o que mantém o efeito visível em zero:
 * mostra o que a pessoa reconhece (33,33%) e só abre as casas extras quando
 * escondê-las seria mentira — um boletim de 0,004% não pode virar "0%".
 */

/** Casas mostradas quando o número é grande o bastante para dispensar as outras. */
const CASAS_PADRAO = 2;
/** Teto: é a precisão que o banco realmente guarda. */
const CASAS_MAXIMAS = 4;

export function formatarPercentual(valor: number, sufixo = '%'): string {
  if (!Number.isFinite(valor)) return `0${sufixo}`;

  // Abre casas só quando as duas padrão zerariam um número que não é zero. Um
  // "0%" ao lado de um boletim que a pessoa acabou de lançar é pior que um
  // número comprido.
  const arredondado = Math.abs(Number(valor.toFixed(CASAS_PADRAO)));
  const casas = arredondado === 0 && valor !== 0 ? CASAS_MAXIMAS : CASAS_PADRAO;

  return (
    valor.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 }) +
    sufixo
  );
}
