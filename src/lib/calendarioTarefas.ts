import type { Tarefa } from '../types';
import { dataLocal, formatarISO } from './data';
import { ordenarTarefas } from './tarefas';

/**
 * A aritmética do calendário de tarefas, fora da tela.
 *
 * Mesmo motivo de `lib/tarefas.ts`: o que dá para errar aqui não aparece no
 * `tsc` nem no build, aparece na virada do mês para quem abre o app à noite.
 *
 * REGRA QUE ATRAVESSA O ARQUIVO: uma data é `YYYY-MM-DD` e só vira `Date` pelo
 * caminho de `lib/data.ts` (`dataLocal`, que anexa `T00:00:00`, e `formatarISO`,
 * que lê os campos LOCAIS). `new Date('2026-08-01')` é meia-noite UTC — dia 31
 * de julho em UTC-3 —, e uma grade de mês construída assim começa no dia errado
 * exatamente nos meses em que o dia 1º cai perto da borda da semana.
 *
 * A SEMANA COMEÇA NO DOMINGO. É a convenção do calendário de parede brasileiro
 * e a mesma do Notion; quem confere um prazo procura a coluna onde sempre
 * esteve, e "que dia da semana é dia 12" não é pergunta que a tela deva mudar.
 */

/** Cabeçalho das sete colunas. Minúsculo porque é rótulo, não título. */
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** O primeiro dia do mês a que a data pertence — a âncora que a tela guarda. */
export function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Anda `meses` a partir da âncora, sempre caindo no dia 1º.
 *
 * `setMonth` sobre o dia 1º é seguro; sobre o dia 31 não seria — 31/mar + 1 mês
 * daria 1º/mai, porque abril não tem 31. Como a âncora é sempre o dia 1º (o
 * `inicioDoMes` acima garante), o caso não existe, e é por isso que ele existe.
 */
export function deslocarMes(ancora: string, meses: number): string {
  const d = dataLocal(inicioDoMes(ancora))!;
  d.setMonth(d.getMonth() + meses);
  return formatarISO(d);
}

/** "agosto de 2026" — o título da grade. */
export function rotuloMes(ancora: string): string {
  const d = dataLocal(ancora);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** 'YYYY-MM' — para saber se um dia da grade pertence ao mês exibido. */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * As semanas do mês, cada uma com sete dias `YYYY-MM-DD`.
 *
 * Sempre semanas INTEIRAS: a grade começa no domingo anterior ao dia 1º e
 * termina no sábado seguinte ao último dia, então as bordas trazem dias do mês
 * vizinho — que a tela pinta mais claro, mas continua mostrando. Esconder a
 * tarefa de 31/jul só porque a pessoa está olhando agosto é perder justamente o
 * prazo que está vencendo na virada.
 *
 * O número de semanas VARIA (4 a 6): fevereiro de um ano não bissexto começando
 * no domingo tem 4; um mês de 31 dias começando no sábado tem 6. Forçar 6 fixas
 * acrescentaria uma faixa vazia em quase todo mês.
 */
export function gradeDoMes(ancora: string): string[][] {
  const primeiro = dataLocal(inicioDoMes(ancora))!;
  const ultimo = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0);

  // Recua até o domingo. `getDay()` já é 0 no domingo, então a conta é direta.
  const cursor = new Date(primeiro);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  const semanas: string[][] = [];
  // O sábado da última semana: enquanto o cursor não passou do último dia do
  // mês, ainda há semana a emitir.
  while (cursor <= ultimo) {
    const semana: string[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push(formatarISO(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

/**
 * As tarefas indexadas pelo dia do prazo, mais as que não têm prazo nenhum.
 *
 * As sem prazo saem numa lista à parte porque não têm célula onde morar: no
 * calendário elas vivem no trilho "Sem data", de onde se arrasta para um dia.
 * Somem da grade, não do módulo.
 *
 * Concluída COM prazo continua aparecendo no dia dela. É o contrário do
 * `agruparPorStatus`, que corta a concluída antiga da coluna "Feito" para ela
 * não virar cemitério — aqui a data já separa o passado do presente sozinha, e
 * o calendário sem o que foi feito perde a metade da história.
 */
export function agruparPorPrazo(tarefas: readonly Tarefa[]): {
  porDia: Record<string, Tarefa[]>;
  semPrazo: Tarefa[];
} {
  const porDia: Record<string, Tarefa[]> = {};
  const semPrazo: Tarefa[] = [];

  for (const t of tarefas) {
    if (!t.prazo) {
      semPrazo.push(t);
      continue;
    }
    // `slice(0,10)` e não a string inteira: `prazo` é coluna `date` e chega
    // como 'YYYY-MM-DD', mas um dia alguém troca a origem por um timestamptz e
    // a chave passaria a carregar a hora — a grade ficaria vazia sem erro.
    const dia = t.prazo.slice(0, 10);
    (porDia[dia] ??= []).push(t);
  }

  for (const dia of Object.keys(porDia)) porDia[dia] = ordenarTarefas(porDia[dia]);
  return { porDia, semPrazo: ordenarTarefas(semPrazo) };
}
