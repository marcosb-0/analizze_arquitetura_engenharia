/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Cliente {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  responsavel: string;
  observacoes: string;
  documentos: string[];
}

export interface RevisaoProposta {
  versao: number;
  data: string;
  valor: number;
  alteracoes: string;
}

export interface Proposta {
  id: string;
  numero: string;
  clienteId: string;
  descricao: string;
  valorEstimado: number;
  prazoExecucao: string;
  dataValidade: string;
  status: 'Elaboração' | 'Enviada' | 'Aprovada' | 'Rejeitada';
  revisoes: RevisaoProposta[];
}

export type CategoriaFornecedor = 'Material' | 'Mão de Obra' | 'Equipamentos' | 'Serviços Terceirizados';

export interface CompraFornecedor {
  id: string;
  data: string;
  item: string;
  valor: number;
  pago: boolean;
}

export interface Fornecedor {
  id: string;
  empresa: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
  categoria: CategoriaFornecedor;
  documentos: string[];
  avaliacao: number; // 1 to 5
  historicoCompras: CompraFornecedor[];
}

export type SituacaoProjeto = 'Planejamento' | 'Em Execução' | 'Pausado' | 'Finalizado';

export interface Projeto {
  id: string;
  nome: string;
  clienteId: string;
  propostaId?: string;
  responsavelInterno: string;
  responsavelInternoId?: string;
  enderecoObra: string;
  dataInicio: string;
  dataFim: string;
  situacao: SituacaoProjeto;
}

export type CategoriaCusto = 'Materiais' | 'Mão de Obra' | 'Equipamentos' | 'Terceiros' | 'Deslocamentos' | 'Administração' | 'Contingências';

export interface ItemOrcamento {
  id: string;
  projetoId: string;
  categoria: CategoriaCusto;
  descricao: string;
  valorOrcado: number;
  valorContratado: number;
  valorExecutado: number;
  fornecedorId?: string;
}

export interface AlteracaoOrcamento {
  id: string;
  projetoId: string;
  data: string;
  item: string;
  descricao: string;
  tipo: 'Aumento' | 'Redução';
  valor: number;
}

export type EtapaNome = 'Fundação' | 'Estrutura' | 'Instalações' | 'Acabamentos' | 'Entrega';
export type StatusEtapa = 'Não Iniciado' | 'Em Andamento' | 'Concluído' | 'Atrasado';

export interface EtapaCronograma {
  id: string;
  projetoId: string;
  nome: EtapaNome | string;
  dataInicio: string;
  dataFim: string;
  responsavelId: string; // ID do Funcionário
  percentualExecutado: number; // derivado das medições — não editável diretamente
  status: StatusEtapa; // derivado das medições — não editável diretamente
}

// Vínculo explícito etapa <-> item de orçamento, com peso percentual.
// Substitui o antigo mapeamento implícito por nome de etapa.
export interface EtapaOrcamentoVinculo {
  id: string;
  etapaId: string;
  itemOrcamentoId: string;
  pesoPercentual: number;
}

export interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  cpf: string;
  telefone: string;
  email: string;
  dataAdmissao: string;
  documentos: string[]; // nomes dos docs entregues (ex: "Contrato de Trabalho", "RG")
  status: 'Ativo' | 'Inativo';
  observacoes: string;
  salarioBase?: number;
}

export interface MedicaoObra {
  id: string;
  projetoId: string;
  dataMedicao: string;
  etapaId: string; // vinculada ao cronograma
  percentualMedido: number; // percentual medido desta vez
  valorMedido: number; // valor financeiro medido nesta vez
  fotos: string[];
  observacoes: string;
}

export const CORES_CATEGORIA_DOCUMENTO = ['rose', 'orange', 'amber', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'purple', 'pink', 'slate'] as const;
export type CorCategoriaDocumento = typeof CORES_CATEGORIA_DOCUMENTO[number];

export interface DocumentoCategoria {
  id: string;
  nome: string;
  cor: CorCategoriaDocumento;
  createdAt: string;
}

export interface DocumentoVersao {
  versao: string;
  autor: string;
  data: string;
  descricao: string;
  storagePath: string;
}

export interface Documento {
  id: string;
  nome: string;
  tipo: string;
  projetoId: string;
  dataCriacao: string;
  versao: string;
  tamanho: string;
  historicoVersoes?: DocumentoVersao[];
}

export interface CotacaoFornecedor {
  id?: string;
  fornecedorId: string;
  precoUnitario: number;
  dataCotacao: string;
  prazoEntregaDias?: number;
  observacao?: string;
}

export interface InsumoCatalogo {
  id: string;
  codigoSINAPI?: string;
  descricao: string;
  unidade: string;
  precoReferencia: number;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  tipo: 'SINAPI' | 'Proprio';
  fornecedorPadraoId?: string;
  fornecedoresAlternativos?: string[];
  cotacoesFornecedores?: CotacaoFornecedor[];
  composicao?: string;
  aplicacao?: string;
  ativo: boolean;
  dataAtualizacaoPreco: string;
  historicoPrecos: {
    data: string;
    preco: number;
    fonte: 'SINAPI' | 'Fornecedor' | 'Manual';
  }[];
}

export interface InsumoProjeto {
  id: string;
  projetoId: string;
  insumoCatalogoId: string;
  quantidade: number;
  precoUnitario: number;
  precoTotal: number;
  fornecedorId?: string;
  etapaVinculadaId?: string;
  quantidadeExecutada: number;
  percentualExecutado: number;
  status: 'Orçado' | 'Contratado' | 'Entregue' | 'Aplicado';
  observacoes?: string;
}

export interface Notificacao {
  id: string;
  tipo: 'Preco' | 'Atraso' | 'Orcamento' | 'Documento' | 'Equipe' | 'Proposta' | 'Sistema';
  titulo: string;
  mensagem: string;
  dataCriacao: string;
  lida: boolean;
  resolvida: boolean;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  acao?: {
    tipo: 'navegar' | 'modal' | 'confirmar';
    destino?: string;
    modalId?: string;
  };
}

export interface ContaFinanceira {
  id: string;
  nome: string;
  banco: string;
  tipo: 'Corrente' | 'Poupança' | 'Caixa Interno';
  saldoInicial: number;
  saldoAtual: number;
}

export type RoleAcesso = 'admin' | 'gestao' | 'financeiro' | 'campo';

export interface Acesso {
  id: string;
  email: string;
  fullName: string;
  role: RoleAcesso;
  funcionarioId?: string;
  active: boolean;
  createdAt: string;
}

export interface LancamentoFinanceiro {
  id: string;
  tipo: 'Receita' | 'Despesa';
  descricao: string;
  valor: number;
  data: string;
  categoria: 'Salários' | 'Fornecedores' | 'Aluguel Escritório' | 'Energia/Água/Internet' | 'Marketing/Vendas' | 'Impostos/Taxas' | 'Ferramentas/EPIs' | 'Aporte Capital' | 'Faturamento Obra' | 'Rendimento' | 'Outros';
  pago: boolean;
  contaId: string;
  projetoId?: string; // Vinculado a uma Obra opcionalmente
  funcionarioId?: string; // Vinculado a um funcionário (Ex: Salário) opcionalmente
  fornecedorId?: string; // Vinculado a um fornecedor opcionalmente
  competencia?: string; // YYYY-MM, usado para folha de pagamento (fix #7)
}
