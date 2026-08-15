/**
 * O recorte da carteira de propostas — busca, status, validade e ordem.
 *
 * ## Por que ele não mora na lista
 *
 * Dois motivos, e o segundo é o que obriga a ter um arquivo:
 *
 * 1. **A lista desmonta.** Abrir uma proposta substitui a carteira pela tela
 *    dela, então o estado tem de viver acima das duas (`PropostasTab`) — senão
 *    voltar da proposta devolve a carteira sem busca, sem status e na ordem
 *    padrão, a cada ida e volta. Enquanto o detalhe era um painel ao lado, a
 *    lista nunca desmontava e um `useState` local bastava.
 * 2. **Fast Refresh.** `FILTROS_INICIAIS` é um valor, e um arquivo de
 *    componente que exporta valor além do componente perde o hot reload
 *    inteiro ("export is incompatible") — o Vite avisa, mas só no console, e o
 *    sintoma que se sente é a tela recarregando do zero a cada tecla.
 */

export type FiltroValidade = 'Todas' | 'Vigentes' | 'A vencer' | 'Vencidas';
export type OrdenacaoCarteira =
  | 'Recentes'
  | 'Maior valor'
  | 'Menor valor'
  | 'Validade'
  | 'Cliente';

export interface FiltrosCarteira {
  busca: string;
  status: string;
  validade: FiltroValidade;
  ordenacao: OrdenacaoCarteira;
}

export const FILTROS_INICIAIS: FiltrosCarteira = {
  busca: '',
  status: 'Todas',
  validade: 'Todas',
  ordenacao: 'Recentes',
};

/** Na ordem do funil comercial: nasce em elaboração, vai ao cliente, é decidida. */
export const STATUS_FILTRO = ['Todas', 'Elaboração', 'Enviada', 'Aprovada', 'Rejeitada'] as const;

export const ORDENS: { id: OrdenacaoCarteira; label: string }[] = [
  { id: 'Recentes', label: 'Mais recentes' },
  { id: 'Maior valor', label: 'Maior valor' },
  { id: 'Menor valor', label: 'Menor valor' },
  { id: 'Validade', label: 'Validade mais próxima' },
  { id: 'Cliente', label: 'Cliente (A–Z)' },
];
