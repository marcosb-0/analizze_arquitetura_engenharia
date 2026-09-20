import { InsumoCatalogo } from '../../types';

/**
 * As ações que uma linha do catálogo oferece, iguais nas duas visões.
 *
 * Existe como tipo próprio porque tabela e cartão precisam exatamente do mesmo
 * conjunto: declará-lo duas vezes garantiria que uma ação nova entrasse só numa
 * delas — que é como a visão em cartão foi ficando para trás.
 */
export interface AcoesInsumo {
  /** Vazio desabilita "Vincular": não há obra para receber o insumo. */
  temProjetos: boolean;
  /** Id do insumo cujos usos estão sendo consultados antes de oferecer a exclusão. */
  verificandoUsos: string | null;
  onAbrirDetalhe: (id: string) => void;
  onEditar: (item: InsumoCatalogo) => void;
  onVincular: (item: InsumoCatalogo) => void;
  onSetAtivo: (id: string, ativo: boolean) => void;
  onExcluir: (item: InsumoCatalogo) => void;
}

/**
 * Rótulo e cor da procedência do preço.
 *
 * Nível 1 tem DUAS fontes desde 20260810122000 — cotação vigente e folha de
 * pagamento — então o rótulo sai da origem, não do número. Deduzir "Cotação" de
 * "nível 1" diria que existe fornecedor onde existe holerite.
 */
export function rotuloProcedencia(nivel: number, origem: string): string {
  if (nivel === 1) return origem === 'Folha' ? 'Folha da empresa' : 'Cotação firme';
  if (nivel === 2) return 'Praticado';
  if (nivel === 3) return 'Estimado';
  return 'Referência';
}

/**
 * Nível a partir da fonte, para quando só a fonte veio do servidor.
 *
 * `Folha` e `Cotação` são as DUAS fontes do nível 1 — é o caso que motiva esta
 * função existir em vez de um `case` espalhado por cada tela.
 */
export function nivelDaFonte(fonte: string): 1 | 2 | 3 | 4 {
  if (fonte === 'Cotação' || fonte === 'Folha') return 1;
  if (fonte === 'Praticado') return 2;
  if (fonte === 'Estimado') return 3;
  return 4;
}

/** `text-slate-500` é o piso de contraste do projeto — nunca `-400`. */
export function corProcedencia(nivel: number): string {
  if (nivel === 1) return 'text-emerald-600';
  if (nivel === 2) return 'text-sky-600';
  if (nivel === 3) return 'text-slate-500';
  return 'text-amber-600';
}

/**
 * O que o badge de composição diz.
 *
 * Havia um segundo estado, "vazia", para a composição que alguém criou e nunca
 * preencheu — e ele não era teórico: 11 das 12 composições da base real
 * estavam nele. Deixou de ser representável em 20/set/2026, quando o tipo
 * passou a ser consequência e não escolha: um item só é composição porque
 * ganhou um componente, e volta a ser insumo ao perder o último.
 */
export function estadoComposicao(item: InsumoCatalogo): { texto: string; titulo: string } {
  return {
    texto: `${item.qtdComponentes} comp.`,
    titulo: 'Preço calculado a partir dos componentes',
  };
}
