/**
 * Dias úteis entre duas datas 'YYYY-MM-DD', inclusive nas pontas.
 *
 * Estava dentro de ProjetoConsole. É lógica de calendário pura, sem React e sem
 * nada do console — o lugar dela é aqui, junto de `prazo` e `data`.
 *
 * Não conhece feriados: conta só a exclusão de sábado e domingo, que é o que o
 * cronograma da obra usa hoje.
 */
export function getWorkingDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0;
  
  const startParts = startDateStr.split('-');
  const endParts = endDateStr.split('-');
  if (startParts.length !== 3 || endParts.length !== 3) return 0;
  
  const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
  const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (start > end) return 0;
  
  let count = 0;
  const curDate = new Date(start.getTime());
  
  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sunday, 6 = Saturday
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  
  return count;
}
