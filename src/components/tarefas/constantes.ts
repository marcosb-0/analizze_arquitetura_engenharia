import type { PrioridadeTarefa, StatusTarefa } from '../../types';

/**
 * O que é só desenho da aba de tarefas. A lógica — ordem, agrupamento,
 * comparação de prazo — mora em `lib/tarefas.ts`, que é testável sem DOM.
 */

/** As opções dos seletores, na ordem em que aparecem. */
export const PRIORIDADES: readonly PrioridadeTarefa[] = ['Alta', 'Média', 'Baixa'];

/**
 * Rótulo curto do cabeçalho da coluna. "Concluída" vira "Feito" porque o
 * cabeçalho é o nome do MONTE, não o estado de um item — e "Feito" cabe na
 * coluna estreita do celular.
 */
export const TITULO_COLUNA: Record<StatusTarefa, string> = {
  'A fazer': 'A fazer',
  'Fazendo': 'Fazendo',
  'Em revisão': 'Em revisão',
  'Concluída': 'Feito',
};

/** A faixa colorida no topo de cada coluna — a cor do status, sem o badge. */
export const BARRA_COLUNA: Record<StatusTarefa, string> = {
  'A fazer': 'bg-slate-300',
  'Fazendo': 'bg-blue-500',
  'Em revisão': 'bg-amber-500',
  'Concluída': 'bg-emerald-500',
};

/**
 * O tipo MIME do arraste.
 *
 * `text/plain` seria aceito por qualquer campo de texto da página — soltar um
 * card num input colaria o UUID. Um tipo próprio faz o navegador recusar o drop
 * em qualquer alvo que não seja uma coluna nossa.
 */
export const MIME_TAREFA = 'application/x-tarefa-id';
