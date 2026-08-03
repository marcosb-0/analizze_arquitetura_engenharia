/**
 * O que mais de uma peça do módulo financeiro precisa enxergar.
 *
 * As listas de categoria são lidas pelo filtro do razão e pelo diálogo de
 * lançamento; os filtros do razão são estado do `EmpresaTab` porque o painel
 * também os escreve (o card de vencidos joga o usuário no razão já filtrado).
 */

export const CATEGORIAS_DESPESA = [
  'Salários',
  'Fornecedores',
  'Aluguel Escritório',
  'Energia/Água/Internet',
  'Marketing/Vendas',
  'Impostos/Taxas',
  'Ferramentas/EPIs',
  'Outros',
];

export const CATEGORIAS_RECEITA = ['Aporte Capital', 'Faturamento Obra', 'Rendimento', 'Outros'];

export interface FiltrosRazao {
  busca: string;
  tipo: 'Todos' | 'Receita' | 'Despesa';
  /** "Vencido" é recorte de pendente, não uma situação própria do registro. */
  status: 'Todos' | 'Pago' | 'Pendente' | 'Vencido';
  categoria: string;
  conta: string;
  /** Período, sempre `YYYY-MM-DD`. Vazio = sem limite daquele lado. */
  de: string;
  ate: string;
}

export const FILTROS_RAZAO_PADRAO: FiltrosRazao = {
  busca: '',
  tipo: 'Todos',
  status: 'Todos',
  categoria: 'Todos',
  conta: 'Todos',
  de: '',
  ate: '',
};
