/**
 * Hand-written to match supabase/migrations/*.sql. Once the project is linked,
 * prefer regenerating with `npx supabase gen types typescript --linked` and
 * replacing this file — kept in sync manually until then.
 */

export type Role = 'admin' | 'gestao' | 'financeiro' | 'campo';

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: never[];
}

// Nullable columns (type includes `| null`) become optional on insert, matching
// real Postgres semantics (omitted = stored as null) — saves listing every
// nullable field explicitly on every insert call across the services.
type OptionalNullable<T> = { [K in keyof T as null extends T[K] ? K : never]?: T[K] } & {
  [K in keyof T as null extends T[K] ? never : K]: T[K];
};
type WithOptionalId<Row, OmitKeys extends keyof Row> = OptionalNullable<Omit<Row, OmitKeys>> & { id?: string };

// ============================================================
// Row shapes (one interface per table, referenced below to avoid
// self-referential circularity in the Database type).
// ============================================================

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  funcionario_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

type FuncionarioRow = {
  id: string;
  nome: string;
  cargo: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  status: 'Ativo' | 'Inativo';
  observacoes: string | null;
  salario_base: number | null;
  documentos: string[];
  created_at: string;
  updated_at: string;
}

type ClienteRow = {
  id: string;
  nome: string;
  tipo_pessoa: string;
  cpf: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  cep: string | null;
  responsavel: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

type ClienteDocumentoRow = {
  id: string;
  cliente_id: string;
  nome: string;
  storage_path: string;
  content_type: string;
  tamanho_bytes: number | null;
  criado_por: string | null;
  created_at: string;
}

type FornecedorRow = {
  id: string;
  empresa: string;
  tipo_pessoa: string;
  cpf: string | null;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamentos' | 'Serviços Terceirizados';
  cidade: string | null;
  observacoes: string | null;
  fornece: string[];
  avaliacao: number | null;
  documentos: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

type PropostaRow = {
  id: string;
  numero: string;
  cliente_id: string;
  descricao: string;
  valor_estimado: number;
  bdi_percentual: number;
  prazo_execucao: string | null;
  data_validade: string | null;
  status: 'Elaboração' | 'Enviada' | 'Aprovada' | 'Rejeitada';
  created_at: string;
  updated_at: string;
}

type CategoriaCustoDb =
  | 'Materiais' | 'Mão de Obra' | 'Equipamentos' | 'Terceiros'
  | 'Deslocamentos' | 'Administração' | 'Contingências';

type TipoAjusteDb = 'Nenhum' | 'Percentual' | 'Valor';

type ItemPropostaRow = {
  id: string;
  proposta_id: string;
  catalogo_insumo_id: string | null;
  descricao: string;
  unidade: string;
  categoria: CategoriaCustoDb;
  quantidade: number;
  preco_unitario_base: number;
  ajuste_tipo: TipoAjusteDb;
  ajuste_valor: number;
  ajuste_motivo: string | null;
  /** GENERATED no banco — nunca enviar em insert/update. */
  preco_unitario: number;
  fornecedor_id: string | null;
  observacoes: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
}

type RevisaoPropostaRow = {
  id: string;
  proposta_id: string;
  versao: number;
  data: string;
  valor: number;
  alteracoes: string | null;
  created_at: string;
}

type ContaFinanceiraRow = {
  id: string;
  nome: string;
  banco: string | null;
  tipo: 'Corrente' | 'Poupança' | 'Caixa Interno';
  saldo_inicial: number;
  created_at: string;
  updated_at: string;
}

type LancamentoFinanceiroRow = {
  id: string;
  tipo: 'Receita' | 'Despesa';
  descricao: string;
  valor: number;
  data: string;
  categoria:
    | 'Salários' | 'Fornecedores' | 'Aluguel Escritório' | 'Energia/Água/Internet' | 'Marketing/Vendas'
    | 'Impostos/Taxas' | 'Ferramentas/EPIs' | 'Aporte Capital' | 'Faturamento Obra' | 'Rendimento' | 'Outros';
  pago: boolean;
  conta_id: string;
  projeto_id: string | null;
  funcionario_id: string | null;
  fornecedor_id: string | null;
  competencia: string | null;
  medicao_id: string | null;
  created_at: string;
  updated_at: string;
}

type CatalogoInsumoRow = {
  id: string;
  codigo_sinapi: string | null;
  descricao: string;
  unidade: string;
  preco_referencia: number;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  tipo: 'SINAPI' | 'Proprio';
  tipo_item: 'Insumo' | 'Composicao';
  preco_fonte: 'SINAPI' | 'Fornecedor' | 'Manual';
  uf: string | null;
  mes_referencia: string | null;
  desonerado: boolean | null;
  fornecedor_padrao_id: string | null;
  composicao: string | null;
  aplicacao: string | null;
  ativo: boolean;
  data_atualizacao_preco: string;
  /** Mantida pela trigger trg_catalogo_insumo_before_write — nunca escrever. */
  busca: string;
  created_at: string;
  updated_at: string;
}

type CatalogoFornecedorAlternativoRow = {
  catalogo_id: string;
  fornecedor_id: string;
}

type CatalogoHistoricoPrecoRow = {
  id: string;
  catalogo_id: string;
  data: string;
  preco: number;
  fonte: 'SINAPI' | 'Fornecedor' | 'Manual';
  created_at: string;
}

type CotacaoFornecedorRow = {
  id: string;
  catalogo_id: string;
  fornecedor_id: string;
  preco_unitario: number;
  data_cotacao: string;
  prazo_entrega_dias: number | null;
  observacao: string | null;
  validade_dias: number;
  ativa: boolean;
  created_at: string;
}

type ProjetoRow = {
  id: string;
  nome: string;
  cliente_id: string;
  proposta_id: string | null;
  responsavel_interno_id: string | null;
  endereco_obra: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  situacao: 'Planejamento' | 'Em Execução' | 'Pausado' | 'Finalizado';
  created_at: string;
  updated_at: string;
}

type ProjetoEquipeRow = {
  id: string;
  projeto_id: string;
  profile_id: string;
  papel: string | null;
  created_at: string;
}

type ItemOrcamentoRow = {
  id: string;
  projeto_id: string;
  categoria: 'Materiais' | 'Mão de Obra' | 'Equipamentos' | 'Terceiros' | 'Deslocamentos' | 'Administração' | 'Contingências';
  descricao: string;
  valor_orcado: number;
  valor_contratado: number;
  fornecedor_id: string | null;
  catalogo_insumo_id: string | null;
  created_at: string;
  updated_at: string;
}

type AlteracaoOrcamentoRow = {
  id: string;
  projeto_id: string;
  data: string;
  item: string;
  descricao: string | null;
  tipo: 'Aumento' | 'Redução';
  valor: number;
  created_at: string;
}

type EtapaCronogramaRow = {
  id: string;
  projeto_id: string;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  responsavel_id: string | null;
  created_at: string;
  updated_at: string;
}

type EtapaOrcamentoVinculoRow = {
  id: string;
  etapa_id: string;
  item_orcamento_id: string;
  peso_percentual: number;
  created_at: string;
}

type MedicaoObraRow = {
  id: string;
  projeto_id: string;
  etapa_id: string;
  data_medicao: string;
  percentual_medido: number;
  observacoes: string | null;
  criado_por: string | null;
  status: 'Pendente' | 'Aprovada' | 'Rejeitada';
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
}

type MedicaoItemOrcamentoRow = {
  id: string;
  medicao_id: string;
  item_orcamento_id: string;
  valor_aplicado: number;
  created_at: string;
}

type InsumoProjetoRow = {
  id: string;
  projeto_id: string;
  catalogo_insumo_id: string;
  item_orcamento_id: string | null;
  quantidade: number;
  preco_unitario_base: number;
  ajuste_tipo: TipoAjusteDb;
  ajuste_valor: number;
  ajuste_motivo: string | null;
  /** GENERATED no banco — nunca enviar em insert/update. */
  preco_unitario: number;
  fornecedor_id: string | null;
  etapa_vinculada_id: string | null;
  quantidade_executada: number;
  status: 'Orçado' | 'Contratado' | 'Entregue' | 'Aplicado';
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

type DocumentoCategoriaRow = {
  id: string;
  nome: string;
  cor: string;
  criado_por: string | null;
  created_at: string;
}

type DocumentoRow = {
  id: string;
  projeto_id: string;
  nome: string;
  tipo: string;
  criado_por: string | null;
  created_at: string;
}

type DocumentoVersaoRow = {
  id: string;
  documento_id: string;
  versao: string;
  storage_path: string;
  tamanho_bytes: number | null;
  descricao: string | null;
  autor_id: string | null;
  created_at: string;
}

type MedicaoFotoRow = {
  id: string;
  medicao_id: string;
  storage_path: string;
  tirada_por: string | null;
  created_at: string;
}

type NotificacaoRow = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  lida: boolean;
  resolvida: boolean;
  acao_tipo: string | null;
  acao_destino: string | null;
  acao_modal_id: string | null;
  destinatario_id: string | null;
  created_at: string;
}

// ============================================================
// Database
// ============================================================

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, { id: string; email?: string | null; full_name?: string | null; role?: Role; funcionario_id?: string | null; active?: boolean }>;
      funcionarios: Table<FuncionarioRow, WithOptionalId<FuncionarioRow, 'id' | 'created_at' | 'updated_at'>>;
      clientes: Table<ClienteRow, WithOptionalId<ClienteRow, 'id' | 'created_at' | 'updated_at'>>;
      cliente_documentos: Table<ClienteDocumentoRow, WithOptionalId<ClienteDocumentoRow, 'id' | 'created_at'>>;
      fornecedores: Table<FornecedorRow, WithOptionalId<FornecedorRow, 'id' | 'created_at' | 'updated_at'>>;
      propostas: Table<PropostaRow, WithOptionalId<PropostaRow, 'id' | 'bdi_percentual' | 'created_at' | 'updated_at'> & { bdi_percentual?: number }>;
      revisoes_proposta: Table<RevisaoPropostaRow, WithOptionalId<RevisaoPropostaRow, 'id' | 'created_at'>>;
      // preco_unitario é GENERATED — fora do Insert/Update por construção.
      itens_proposta: Table<ItemPropostaRow, WithOptionalId<ItemPropostaRow, 'id' | 'preco_unitario' | 'created_at' | 'updated_at'>>;
      contas_financeiras: Table<ContaFinanceiraRow, WithOptionalId<ContaFinanceiraRow, 'id' | 'created_at' | 'updated_at'>>;
      lancamentos_financeiros: Table<LancamentoFinanceiroRow, WithOptionalId<LancamentoFinanceiroRow, 'id' | 'created_at' | 'updated_at'>>;
      // `busca` é mantida por trigger; enviá-la num insert seria sobrescrita
      // em seguida — fica de fora do Insert de propósito.
      catalogo_insumos: Table<CatalogoInsumoRow, WithOptionalId<CatalogoInsumoRow, 'id' | 'busca' | 'created_at' | 'updated_at'>>;
      catalogo_fornecedores_alternativos: Table<CatalogoFornecedorAlternativoRow, CatalogoFornecedorAlternativoRow>;
      catalogo_historico_precos: Table<CatalogoHistoricoPrecoRow, WithOptionalId<CatalogoHistoricoPrecoRow, 'id' | 'created_at'>>;
      cotacoes_fornecedores: Table<CotacaoFornecedorRow, WithOptionalId<CotacaoFornecedorRow, 'id' | 'created_at'>>;
      projetos: Table<ProjetoRow, WithOptionalId<ProjetoRow, 'id' | 'created_at' | 'updated_at'>>;
      projeto_equipe: Table<ProjetoEquipeRow, WithOptionalId<ProjetoEquipeRow, 'id' | 'created_at'>>;
      itens_orcamento: Table<ItemOrcamentoRow, WithOptionalId<ItemOrcamentoRow, 'id' | 'created_at' | 'updated_at'>>;
      alteracoes_orcamento: Table<AlteracaoOrcamentoRow, WithOptionalId<AlteracaoOrcamentoRow, 'id' | 'created_at'>>;
      etapas_cronograma: Table<EtapaCronogramaRow, WithOptionalId<EtapaCronogramaRow, 'id' | 'created_at' | 'updated_at'>>;
      etapa_orcamento_vinculo: Table<EtapaOrcamentoVinculoRow, WithOptionalId<EtapaOrcamentoVinculoRow, 'id' | 'created_at'>>;
      medicoes_obra: Table<MedicaoObraRow, WithOptionalId<MedicaoObraRow, 'id' | 'created_at'>>;
      medicao_item_orcamento: Table<MedicaoItemOrcamentoRow, never>;
      insumos_projeto: Table<InsumoProjetoRow, WithOptionalId<InsumoProjetoRow, 'id' | 'preco_unitario' | 'created_at' | 'updated_at'>>;
      documento_categorias: Table<DocumentoCategoriaRow, WithOptionalId<DocumentoCategoriaRow, 'id' | 'created_at'>>;
      documentos: Table<DocumentoRow, WithOptionalId<DocumentoRow, 'id' | 'created_at'>>;
      documento_versoes: Table<DocumentoVersaoRow, WithOptionalId<DocumentoVersaoRow, 'id' | 'created_at'>>;
      medicao_fotos: Table<MedicaoFotoRow, WithOptionalId<MedicaoFotoRow, 'id' | 'created_at'>>;
      notificacoes: Table<NotificacaoRow, WithOptionalId<NotificacaoRow, 'id' | 'created_at'>>;
    };
    Views: {
      v_itens_orcamento: { Row: ItemOrcamentoRow & { valor_executado: number }; Relationships: never[] };
      v_etapas_cronograma: {
        Row: EtapaCronogramaRow & {
          percentual_executado: number;
          status: 'Não Iniciado' | 'Em Andamento' | 'Concluído' | 'Atrasado';
        };
        Relationships: never[];
      };
      v_contas_financeiras: { Row: ContaFinanceiraRow & { saldo_atual: number }; Relationships: never[] };
      v_compras_fornecedor: {
        Row: { id: string; fornecedor_id: string; data: string; item: string; valor: number; pago: boolean; projeto_id: string | null; conta_id: string };
        Relationships: never[];
      };
      v_cotacoes_atuais: { Row: CotacaoFornecedorRow; Relationships: never[] };
      v_catalogo_insumos: {
        Row: CatalogoInsumoRow & {
          obras_utilizando: number;
          cotacoes_ativas: number;
          pontos_historico: number;
        };
        Relationships: never[];
      };
      v_insumos_projeto: {
        Row: InsumoProjetoRow & {
          valor_total: number;
          valor_total_base: number;
          valor_ajuste: number;
          percentual_executado: number;
          insumo_descricao: string;
          insumo_unidade: string;
          insumo_categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
          insumo_preco_referencia: number;
        };
        Relationships: never[];
      };
      v_propostas: {
        Row: PropostaRow & { qtd_itens: number; valor_itens: number; valor_calculado: number };
        Relationships: never[];
      };
    };
    Functions: {
      fn_current_role: { Args: Record<string, never>; Returns: Role };
      fn_has_projeto_access: { Args: { p_projeto_id: string }; Returns: boolean };
      fn_criar_projeto_padrao: { Args: { p_proposta_id: string }; Returns: ProjetoRow };
      fn_criar_projeto_manual: {
        Args: {
          p_nome: string;
          p_cliente_id: string;
          p_data_inicio: string;
          p_data_fim: string;
          p_responsavel_id?: string | null;
          p_proposta_id?: string | null;
          p_endereco?: string | null;
        };
        Returns: ProjetoRow;
      };
      fn_criar_projeto_from_proposta: {
        Args: { p_proposta_id: string; p_payload: Record<string, unknown> };
        Returns: ProjetoRow;
      };
      fn_gerar_lancamento_medicao: {
        Args: { p_medicao_id: string; p_conta_id: string; p_pago?: boolean };
        Returns: LancamentoFinanceiroRow;
      };
      fn_aprovar_medicao: {
        Args: { p_medicao_id: string; p_permitir_overrun?: boolean };
        Returns: MedicaoObraRow;
      };
      fn_rejeitar_medicao: {
        Args: { p_medicao_id: string };
        Returns: MedicaoObraRow;
      };
    };
  };
}
