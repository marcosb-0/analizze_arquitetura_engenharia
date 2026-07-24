/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TipoPessoa = 'CPF' | 'CNPJ';

export interface Cliente {
  id: string;
  nome: string;
  tipoPessoa: TipoPessoa;
  cpfCnpj: string;
  telefone: string;
  email: string;
  // Structured address fields
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  // Composed, read-only display string derived from the fields above.
  // Not persisted — the DB only stores the structured parts.
  endereco: string;
  // Only meaningful for CNPJ (pessoa jurídica); empty for CPF
  responsavel: string;
  observacoes: string;
}

export interface ClienteDocumento {
  id: string;
  clienteId: string;
  nome: string;
  contentType: string;
  tamanho: string;
  storagePath: string;
  criadoEm: string;
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
  /**
   * Quando a proposta tem itens, este valor é CALCULADO pelo banco
   * (soma dos itens × BDI) — ver fn_sync_valor_proposta. Sem itens, continua
   * sendo o número digitado, como sempre foi.
   */
  valorEstimado: number;
  /** Benefícios e Despesas Indiretas, aplicado sobre a soma dos itens. */
  bdiPercentual: number;
  /** Derivados de v_propostas — só leitura. */
  qtdItens: number;
  valorItens: number;
  valorCalculado: number;
  prazoExecucao: string;
  dataValidade: string;
  status: 'Elaboração' | 'Enviada' | 'Aprovada' | 'Rejeitada';
  revisoes: RevisaoProposta[];
}

/**
 * Ajuste de preço de um item DENTRO de um orçamento/proposta específico.
 * Negativo = desconto, positivo = acréscimo. Nunca altera o catálogo global —
 * o preço de referência do insumo permanece intocado. Ver src/lib/preco.ts.
 */
export type TipoAjuste = 'Nenhum' | 'Percentual' | 'Valor';

export interface AjustePreco {
  tipo: TipoAjuste;
  /** Percentual em %, Valor em R$ por unidade. */
  valor: number;
  motivo?: string;
}

/**
 * Item de uma proposta comercial. Mesmo contrato de preço de InsumoProjeto:
 * base congelada + ajuste desta proposta, preço final derivado no banco.
 */
export interface ItemProposta {
  id: string;
  propostaId: string;
  /** Procedência no catálogo; undefined = item avulso digitado à mão. */
  catalogoInsumoId?: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaCusto;
  quantidade: number;
  precoUnitarioBase: number;
  ajuste: AjustePreco;
  /** Derivado (GENERATED no banco) — base + ajuste. */
  precoUnitario: number;
  fornecedorId?: string;
  observacoes?: string;
  ordem: number;
}

export type CategoriaFornecedor = 'Material' | 'Mão de Obra' | 'Equipamentos' | 'Serviços Terceirizados';

export interface CompraFornecedor {
  id: string;
  data: string;
  item: string;
  valor: number;
  pago: boolean;
  contaId: string;
}

export interface Fornecedor {
  id: string;
  empresa: string;
  tipoPessoa: TipoPessoa;
  /** Masked document, formatted according to tipoPessoa. Empty when unknown. */
  cpfCnpj: string;
  contato: string;
  telefone: string;
  email: string;
  categoria: CategoriaFornecedor;
  cidade: string;
  observacoes: string;
  /** Free-text tags of what this supplier sells: 'areia', 'brita', 'andaimes'. */
  fornece: string[];
  documentos: string[];
  avaliacao: number; // 1 to 5; 0 = não avaliado
  ativo: boolean;
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
  catalogoInsumoId?: string; // procedência: insumo do catálogo que originou o item
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

// --- Conversão Proposta -> Obra (wizard) ---
// Payload editável que o wizard monta a partir da proposta real, substituindo
// os percentuais/datas fixos de fn_criar_projeto_padrao. Cada item aponta,
// opcionalmente, para a etapa (via `etapaRef`) que a medição fará avançar.
export interface ConversaoEtapaInput {
  ref: number;
  nome: string;
  dataInicio: string;
  dataFim: string;
  responsavelId?: string;
}

export interface ConversaoItemInput {
  categoria: CategoriaCusto;
  descricao: string;
  valorOrcado: number;
  valorContratado: number;
  etapaRef: number | null;
  /**
   * Procedência herdada dos itens da proposta. Quando presente, a RPC cria
   * também a linha em insumos_projeto, preservando quantidade, preço base e o
   * ajuste negociado — em vez de jogar fora o quantitativo na conversão.
   */
  catalogoInsumoId?: string;
  quantidade?: number;
  precoUnitarioBase?: number;
  ajuste?: AjustePreco;
  fornecedorId?: string;
}

export interface ConversaoObraPayload {
  nome: string;
  endereco: string;
  dataInicio: string;
  dataFim: string;
  responsavelId?: string;
  etapas: ConversaoEtapaInput[];
  itens: ConversaoItemInput[];
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

export type StatusMedicao = 'Pendente' | 'Aprovada' | 'Rejeitada';

export interface MedicaoObra {
  id: string;
  projetoId: string;
  dataMedicao: string;
  etapaId: string; // vinculada ao cronograma
  percentualMedido: number; // percentual medido desta vez
  valorMedido: number; // valor financeiro medido nesta vez (só após aprovação)
  fotos: string[];
  observacoes: string;
  status: StatusMedicao; // Pendente até admin/gestão aprovar; fan-out só na aprovação
  aprovadoPor?: string;
  aprovadoEm?: string;
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

export type FontePreco = 'SINAPI' | 'Fornecedor' | 'Manual';

export interface CotacaoFornecedor {
  id?: string;
  fornecedorId: string;
  precoUnitario: number;
  dataCotacao: string;
  prazoEntregaDias?: number;
  observacao?: string;
  /** Dias de validade a partir de dataCotacao. Vencida não concorre a melhor preço. */
  validadeDias: number;
  /** Soft-delete: a tabela é insert-only, cotação sai de cena com ativa = false. */
  ativa: boolean;
}

export interface PontoHistoricoPreco {
  data: string;
  preco: number;
  fonte: FontePreco;
}

export interface InsumoCatalogo {
  id: string;
  codigoSINAPI?: string;
  descricao: string;
  unidade: string;
  precoReferencia: number;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  tipo: 'SINAPI' | 'Proprio';
  /** Insumo simples ou composição (lista de insumos com coeficientes). */
  tipoItem: 'Insumo' | 'Composicao';
  /** De onde veio o preço vigente — é o que a trigger registra no histórico. */
  precoFonte: FontePreco;
  /** Identidade SINAPI: sem UF + mês + regime de desoneração, o preço é ambíguo. */
  uf?: string;
  mesReferencia?: string;
  desonerado?: boolean;
  fornecedorPadraoId?: string;
  fornecedoresAlternativos?: string[];
  cotacoesFornecedores?: CotacaoFornecedor[];
  composicao?: string;
  aplicacao?: string;
  ativo: boolean;
  dataAtualizacaoPreco: string;
  /**
   * Carregado sob demanda (drawer de detalhe), não na listagem — a série
   * inteira de todos os insumos não cabe numa resposta só.
   */
  historicoPrecos: PontoHistoricoPreco[];
  /** Derivados de v_catalogo_insumos — só leitura. */
  obrasUtilizando: number;
  pontosHistorico: number;
}

/**
 * Quantitativo de um insumo dentro de uma obra: o que antes se perdia numa
 * string ("Cimento (10 saco) via Casa X"). É o que permite recalcular o
 * orçamento quando o preço muda e montar curva ABC.
 */
export interface InsumoProjeto {
  id: string;
  projetoId: string;
  catalogoInsumoId: string;
  /** Item de orçamento que este insumo alimenta (valor_orcado = Σ qtd × preço). */
  itemOrcamentoId?: string;
  quantidade: number;
  /** Foto do preço de origem na vinculação. Nunca muda sozinho. */
  precoUnitarioBase: number;
  ajuste: AjustePreco;
  /** Derivado (GENERATED no banco) — base + ajuste. */
  precoUnitario: number;
  valorTotal: number;
  valorAjuste: number;
  fornecedorId?: string;
  etapaVinculadaId?: string;
  quantidadeExecutada: number;
  percentualExecutado: number;
  status: 'Orçado' | 'Contratado' | 'Entregue' | 'Aplicado';
  observacoes?: string;
  /** Denormalizados de v_insumos_projeto para exibição. */
  insumoDescricao: string;
  insumoUnidade: string;
  insumoPrecoReferencia: number;
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

// Which profiles (usuários) têm acesso a qual obra — base do RLS do papel
// 'campo' (app mobile só enxerga as obras onde o usuário está alocado aqui).
export interface ProjetoEquipeMembro {
  id: string;
  projetoId: string;
  profileId: string;
  papel?: string;
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
  medicaoId?: string; // Medição que originou o lançamento (faturamento de obra)
}
