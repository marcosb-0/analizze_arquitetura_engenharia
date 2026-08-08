import type { PrioridadeTarefa, StatusTarefa, Tarefa } from '../types';
import { hojeISO } from './data';

/**
 * As regras da tela de tarefas, fora dela.
 *
 * Estão aqui, e não dentro dos componentes, porque são o que dá para errar sem o
 * teste perceber: a comparação de prazo (armadilha do `date`), a ordem dentro da
 * coluna e o recorte de "minhas do dia". O componente fica só com o desenho.
 *
 * REGRA QUE ATRAVESSA O ARQUIVO INTEIRO: `prazo` é `YYYY-MM-DD` e é comparado
 * como **string**, nunca convertido para `Date`. `new Date('2026-08-12')` é
 * meia-noite UTC, que em UTC-3 é dia 11 — e o bug aparece só para quem abre o
 * app à noite, que é quando ninguém está testando. Comparação lexicográfica de
 * ISO é comparação cronológica, e não tem fuso para errar.
 */

/** As colunas do quadro, na ordem em que aparecem. */
export const COLUNAS: readonly StatusTarefa[] = ['A fazer', 'Fazendo', 'Em revisão', 'Concluída'];

/** Quanto tempo uma tarefa concluída fica visível na última coluna. */
export const DIAS_NA_COLUNA_FEITO = 14;

const PESO_PRIORIDADE: Record<PrioridadeTarefa, number> = { Alta: 0, 'Média': 1, Baixa: 2 };

/** Onde o prazo caiu em relação a hoje. `hoje` é injetável para o teste fixar o dia. */
export type SituacaoPrazo = 'atrasada' | 'hoje' | 'futura' | 'sem-prazo';

export function situacaoPrazo(prazo: string | undefined, hoje = hojeISO()): SituacaoPrazo {
  if (!prazo) return 'sem-prazo';
  if (prazo < hoje) return 'atrasada';
  if (prazo === hoje) return 'hoje';
  return 'futura';
}

/**
 * Ordem dentro de uma coluna: prazo mais apertado primeiro, prioridade como
 * desempate, e a mais nova por último critério.
 *
 * Tarefa SEM prazo vai para o fim, não para o começo. Ordenar string com
 * `undefined` no meio é justamente o que colocaria "algum dia" acima de "hoje".
 */
export function ordenarTarefas(tarefas: readonly Tarefa[]): Tarefa[] {
  return [...tarefas].sort((a, b) => {
    if (a.prazo !== b.prazo) {
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo < b.prazo ? -1 : 1;
    }
    const prio = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
    if (prio !== 0) return prio;
    // Mais recente primeiro, como o resto do app faz nas listas de cadastro.
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/**
 * Uma tarefa concluída ainda merece lugar na coluna "Feito"?
 *
 * Sem este corte a coluna cresce para sempre e, depois de alguns meses, é a
 * única que o usuário rola — o quadro deixa de mostrar trabalho e passa a
 * mostrar arquivo. Concluída sem `concluidaEm` (linha antiga, ou o instante em
 * que o otimista ainda não voltou do servidor) conta como recente: sumir da tela
 * no gesto de concluir seria pior que ficar um dia a mais.
 */
export function concluidaRecente(t: Tarefa, hoje = hojeISO(), dias = DIAS_NA_COLUNA_FEITO): boolean {
  if (!t.concluidaEm) return true;
  const limite = new Date(`${hoje}T00:00:00`);
  limite.setDate(limite.getDate() - dias);
  return t.concluidaEm.slice(0, 10) >= isoLocal(limite);
}

/** `YYYY-MM-DD` de um Date local — `toISOString()` daria o dia UTC. */
function isoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** As colunas do quadro já montadas, ordenadas e com o corte da coluna "Feito". */
export function agruparPorStatus(
  tarefas: readonly Tarefa[],
  hoje = hojeISO()
): Record<StatusTarefa, Tarefa[]> {
  const grupos = { 'A fazer': [], 'Fazendo': [], 'Em revisão': [], 'Concluída': [] } as Record<StatusTarefa, Tarefa[]>;
  for (const t of tarefas) {
    if (t.status === 'Concluída' && !concluidaRecente(t, hoje)) continue;
    grupos[t.status].push(t);
  }
  for (const coluna of COLUNAS) grupos[coluna] = ordenarTarefas(grupos[coluna]);
  return grupos;
}

/** Os blocos da lista "minhas do dia", na ordem em que a tela os empilha. */
export const BLOCOS_DO_DIA = [
  { chave: 'atrasada', titulo: 'Atrasadas' },
  { chave: 'hoje', titulo: 'Para hoje' },
  { chave: 'futura', titulo: 'Em breve' },
  { chave: 'sem-prazo', titulo: 'Sem prazo' },
] as const;

/**
 * A pauta de uma pessoa: o que é dela e ainda não fechou, agrupado por urgência.
 *
 * Inclui o que não tem prazo, num bloco próprio. A alternativa — mostrar só
 * "vence hoje ou venceu" — esconderia toda tarefa sem data, que é a maioria das
 * tarefas de escritório que este módulo existe para registrar. Um to-do que
 * omite itens em silêncio é pior que não ter to-do.
 */
export function minhasDoDia(
  tarefas: readonly Tarefa[],
  meuId: string | undefined,
  hoje = hojeISO()
): Record<SituacaoPrazo, Tarefa[]> {
  const blocos: Record<SituacaoPrazo, Tarefa[]> = { atrasada: [], hoje: [], futura: [], 'sem-prazo': [] };
  if (!meuId) return blocos;
  for (const t of tarefas) {
    if (t.status === 'Concluída' || t.responsavelId !== meuId) continue;
    blocos[situacaoPrazo(t.prazo, hoje)].push(t);
  }
  for (const chave of Object.keys(blocos) as SituacaoPrazo[]) {
    blocos[chave] = ordenarTarefas(blocos[chave]);
  }
  return blocos;
}

/** Quantas tarefas abertas são minhas — o número do menu lateral. */
export function contarMinhasAbertas(tarefas: readonly Tarefa[], meuId: string | undefined): number {
  if (!meuId) return 0;
  return tarefas.filter((t) => t.responsavelId === meuId && t.status !== 'Concluída').length;
}
