import type { Role } from '../database.types';
import type { SituacaoProjeto, StatusContrato } from '../../types';
import type { Intervalo, PresetPeriodo } from './periodo';

/**
 * As linhas que o painel de indicadores lê — estreitas de propósito.
 *
 * Cada uma é a projeção mínima de uma tabela ou view que já existe; nenhuma
 * coluna aqui é calculada no cliente. O que o painel deriva (variação, saldo,
 * curva prevista) sai de `calculos.ts`, sobre estas linhas.
 */

/** Um boletim de medição (`v_medicao_recente`, todas as datas). */
export interface MedicaoBI {
  id: string;
  projetoId: string;
  etapaId: string;
  etapaNome?: string;
  data: string;
  /** Avanço DESTE boletim, não o acumulado da etapa. */
  percentual: number;
  quantidade?: number;
  /** Unidade da META da etapa — vem da etapa, não do boletim. */
  unidade?: string;
  status: 'Pendente' | 'Aprovada' | 'Rejeitada';
  /** Soma de `medicao_item_orcamento`: só o boletim APROVADO tem valor. */
  valor: number;
}

/** Uma etapa-folha do cronograma (`v_etapas_cronograma`, `eh_folha`). */
export interface EtapaBI {
  id: string;
  projetoId: string;
  nome: string;
  dataInicio?: string;
  dataFim?: string;
  baselineFim?: string;
  /** Já com o teto de 100 que a view aplica. */
  percentualExecutado: number;
  quantidadePrevista?: number;
  quantidadeExecutada: number;
  unidade?: string;
  responsavelId?: string;
  /**
   * Peso da etapa no avanço da obra: Σ (peso_percentual/100 × valor_orçado) dos
   * itens vinculados — a mesma conta de `v_resumo_obra`. Zero sem vínculo.
   */
  peso: number;
}

export interface ContratoBI {
  id: string;
  numero: string;
  projetoId?: string;
  clienteId: string;
  objeto: string;
  valorTotal: number;
  status: StatusContrato;
  dataAssinatura?: string;
}

/** Um lançamento de RECEITA de faturamento de obra. */
export interface FaturamentoBI {
  id: string;
  projetoId?: string;
  medicaoId?: string;
  descricao: string;
  valor: number;
  data: string;
  vencimento: string;
  pago: boolean;
}

export interface RejeicaoBI {
  medicaoId: string;
  motivo?: string;
}

export interface DadosBI {
  medicoes: MedicaoBI[];
  etapas: EtapaBI[];
  contratos: ContratoBI[];
  faturamentos: FaturamentoBI[];
  rejeicoes: RejeicaoBI[];
}

/**
 * O que o papel enxerga — decide quais KPIs existem, e não só quais são zero.
 *
 * A distinção é a do `feedback_ausencia_de_policy_corrompe_calculo`: sem
 * policy, a RLS não recusa, ela devolve VAZIO. `campo` não lê
 * `medicao_item_orcamento`, então para ele todo boletim vale R$ 0; `gestao` não
 * lê o razão, então para ele nada foi recebido. Mostrar esses zeros seria
 * afirmar uma coisa falsa com a cara de um número.
 */
export interface AcessoBI {
  /** Valor em R$ das medições (`medicao_item_orcamento`). */
  valores: boolean;
  /** Faturamento e recebimento (`lancamentos_financeiros`). */
  razao: boolean;
  /** `contratos`. */
  contratos: boolean;
}

export function acessoDoPapel(role?: Role | null): AcessoBI {
  return {
    valores: role === 'admin' || role === 'gestao' || role === 'financeiro',
    razao: role === 'admin' || role === 'financeiro',
    contratos: role === 'admin' || role === 'gestao',
  };
}

export type CategoriaBI = 'geral' | 'obras' | 'financeiro' | 'medicoes' | 'produtividade' | 'prazos' | 'qualidade';

export interface FiltrosBI {
  periodo: PresetPeriodo;
  /** Só vale com `periodo === 'personalizado'`. */
  personalizado: Intervalo;
  obraId: string | null;
  contratoId: string | null;
  responsavelId: string | null;
  situacao: SituacaoProjeto | null;
  comparar: boolean;
}
