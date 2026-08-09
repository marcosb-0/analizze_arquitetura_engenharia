import { CALENDARIO_BR, duracaoDiasUteis } from './cronograma/calendario';

/**
 * Dias úteis entre duas datas 'YYYY-MM-DD', inclusive nas pontas.
 *
 * Estava dentro de ProjetoConsole. É lógica de calendário pura, sem React e sem
 * nada do console — o lugar dela é aqui, junto de `prazo` e `data`.
 *
 * **Desde 09/ago/2026 desconta também os feriados nacionais**, e a implementação
 * mudou de lugar: quem conta é `duracaoDiasUteis`, em `cronograma/calendario.ts`,
 * onde mora a aritmética que o motor de agendamento também usa. Duas contagens
 * de dia útil no mesmo app divergiriam, e o sintoma seria a coluna "N dias
 * úteis" da tabela discordando da barra que o Gantt desenha logo acima dela.
 *
 * A assinatura ficou igual de propósito, para os chamadores existentes não
 * saberem da troca. O que MUDA visivelmente é o número: um período que atravessa
 * o Carnaval ou a Semana Santa passa a mostrar menos dias — que é o certo, e é o
 * motivo da mudança.
 */
export function getWorkingDays(startDateStr: string, endDateStr: string): number {
  return duracaoDiasUteis(startDateStr, endDateStr, CALENDARIO_BR);
}
