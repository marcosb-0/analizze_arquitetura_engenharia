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
  /** Dados de pagamento — para onde o salário é transferido (20260726120003). */
  pix_tipo: 'CPF' | 'CNPJ' | 'E-mail' | 'Telefone' | 'Aleatória' | null;
  pix_chave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: 'Corrente' | 'Poupança' | 'Pagamento' | null;
  titular: string | null;
  created_at: string;
  updated_at: string;
}

type EmpresaConfigRow = {
  id: string;
  /** Sempre true — unique + check garantem a linha única. */
  singleton: boolean;
  razao_social: string;
  cnpj: string | null;
  crea: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  responsavel_tecnico: string | null;
  texto_escopo: string | null;
  condicoes: string[];
  logo_path: string | null;
  created_at: string;
  updated_at: string;
}

type FuncionarioDocumentoRow = {
  id: string;
  funcionario_id: string;
  nome: string;
  storage_path: string;
  content_type: string;
  tamanho_bytes: number | null;
  validade: string | null;
  criado_por: string | null;
  created_at: string;
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
  /** DERIVADO por fn_sync_valor_proposta — não escrever direto. */
  valor_estimado: number;
  /** O número digitado pelo usuário; vale quando a proposta não tem itens. */
  valor_manual: number;
  bdi_percentual: number;
  bdi_visivel_pdf: boolean;
  /** Dias corridos. Nulo = ainda não definido (20260726120001). */
  prazo_execucao_dias: number | null;
  data_validade: string | null;
  status: 'Elaboração' | 'Enviada' | 'Aprovada' | 'Rejeitada';
  data_envio: string | null;
  motivo_rejeicao: string | null;
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
  /** Total congelado (itens + BDI), ou o valor digitado quando não há itens. */
  valor: number;
  valor_itens: number;
  bdi_percentual: number;
  alteracoes: string | null;
  created_at: string;
}

/** Cópia congelada de um item da proposta — ver 20260725120000. */
type ItemRevisaoPropostaRow = {
  id: string;
  revisao_id: string;
  catalogo_insumo_id: string | null;
  descricao: string;
  unidade: string;
  categoria: CategoriaCustoDb;
  quantidade: number;
  preco_unitario: number;
  total: number;
  ordem: number;
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
  /**
   * 'Composicao' é escrita SÓ pelo banco: quando o item tem componentes, a
   * trigger fn_catalogo_insumo_before_write sobrescreve preço e fonte com o
   * valor derivado. Mandar outra coisa daqui não dá erro — é ignorado.
   */
  preco_fonte: 'SINAPI' | 'Fornecedor' | 'Manual' | 'Composicao';
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
  fonte: 'SINAPI' | 'Fornecedor' | 'Manual' | 'Composicao';
  created_at: string;
}

// Componentes de uma composição. O `coeficiente` é a quantidade do insumo por
// UMA unidade da composição.
type ComposicaoItemRow = {
  id: string;
  composicao_id: string;
  insumo_id: string;
  coeficiente: number;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------
// Retornos das RPCs da base de referência SINAPI. Não são tabelas —
// o schema `referencia` não é exposto pelo PostgREST.
// ---------------------------------------------------------------

type SinapiResultadoBusca = {
  codigo: number;
  tipo: 'INSUMO' | 'COMPOSICAO';
  descricao: string;
  unidade: string | null;
  grupo: string | null;
  /** Nulo quando o SINAPI não publica preço para esta UF/regime. */
  preco: number | null;
  /** COM CUSTO / SEM CUSTO — só composição. */
  situacao: string | null;
  qtd_componentes: number;
  /** Já existe no catálogo com a MESMA chave (código, UF, mês, desonerado). */
  ja_adotado: boolean;
  /** Total de resultados antes da paginação (janela, repetido em toda linha). */
  total: number;
}

type SinapiLinhaCusto = {
  /** 1 = componente direto. Só o nível 1 soma o custo publicado. */
  nivel: number;
  item: number;
  descricao: string;
  unidade: string | null;
  tipo: 'INSUMO' | 'COMPOSICAO';
  coeficiente: number;
  /** Coeficiente multiplicado ao longo do caminho até aqui. */
  coef_acumulado: number;
  preco_unitario: number | null;
  /** `trunc(coef_acumulado x preco, 2)` — o SINAPI trunca, não arredonda. */
  custo: number | null;
}

type SinapiAdocao = {
  /** id em `catalogo_insumos` do item adotado. */
  insumo_id: string;
  codigo: number;
  descricao: string;
  modo: 'item' | 'expandido';
  /** true = o item já estava no catálogo e foi reusado, não sobrescrito. */
  ja_existia: boolean;
  itens_criados: number;
  itens_reusados: number;
  ignorados: { codigo: number; descricao: string; motivo: string }[];
  custo_sinapi: number | null;
  /** No modo expandido é o preço derivado pelo gatilho, não o oficial. */
  custo_catalogo: number;
  /** `custo_catalogo - custo_sinapi`. Nulo quando o SINAPI não publica custo. */
  diferenca: number | null;
}

// ---------------------------------------------------------------
// Exclusão de insumo do catálogo. Ver 20260731120000.
// ---------------------------------------------------------------

type CatalogoUsosInsumo = {
  descricao: string;
  /** Os quatro abaixo bloqueiam a exclusão — são vínculos de outra entidade. */
  itens_orcamento: number;
  insumos_projeto: number;
  itens_proposta: number;
  /** Composições que usam este item como componente. */
  em_composicoes: number;
  /** Os três abaixo são dados do próprio insumo e vão junto na exclusão. */
  cotacoes: number;
  pontos_historico: number;
  /** Componentes desta composição (arestas em que ela é o pai). */
  componentes: number;
  pode_excluir: boolean;
}

type CatalogoExclusao = {
  descricao: string;
  /** O que foi apagado em cascata junto com o insumo. */
  cotacoes: number;
  pontos_historico: number;
  componentes: number;
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
  /** Por que foi recusada. Null nas rejeições anteriores a 20260728120000. */
  motivo_rejeicao: string | null;
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
  /** Em que tela a categoria aparece (20260727120000). */
  escopo: 'empresa' | 'obra';
  criado_por: string | null;
  created_at: string;
}

type DocumentoRow = {
  id: string;
  /** Nulo = documento da empresa, exibido na aba Documentos (20260727120000). */
  projeto_id: string | null;
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
  /** Nulo só nas versões anteriores a 20260727120000; a app sempre envia. */
  content_type: string | null;
  /** Vencimento desta emissão. Nulo = documento sem validade. */
  validade: string | null;
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
      funcionario_documentos: Table<FuncionarioDocumentoRow, WithOptionalId<FuncionarioDocumentoRow, 'id' | 'created_at'>>;
      // `numero` é omitido no insert — quem numera é trg_propostas_set_numero.
      // `singleton` idem: o default true é o que garante a linha única.
      empresa_config: Table<
        EmpresaConfigRow,
        WithOptionalId<EmpresaConfigRow, 'id' | 'singleton' | 'condicoes' | 'created_at' | 'updated_at'> & {
          singleton?: boolean;
          condicoes?: string[];
        }
      >;
      clientes: Table<ClienteRow, WithOptionalId<ClienteRow, 'id' | 'created_at' | 'updated_at'>>;
      cliente_documentos: Table<ClienteDocumentoRow, WithOptionalId<ClienteDocumentoRow, 'id' | 'created_at'>>;
      fornecedores: Table<FornecedorRow, WithOptionalId<FornecedorRow, 'id' | 'created_at' | 'updated_at'>>;
      propostas: Table<PropostaRow, WithOptionalId<PropostaRow, 'id' | 'bdi_percentual' | 'created_at' | 'updated_at'> & { bdi_percentual?: number }>;
      revisoes_proposta: Table<RevisaoPropostaRow, WithOptionalId<RevisaoPropostaRow, 'id' | 'created_at'>>;
      // Escrita apenas via fn_registrar_revisao_proposta; o Insert existe para
      // completude do tipo, não porque a UI deva montar snapshot à mão.
      itens_revisao_proposta: Table<ItemRevisaoPropostaRow, WithOptionalId<ItemRevisaoPropostaRow, 'id' | 'created_at'>>;
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
      composicao_itens: Table<ComposicaoItemRow, WithOptionalId<ComposicaoItemRow, 'id' | 'created_at' | 'updated_at'>>;
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
          /** Componentes diretos, quando o item é uma composição. */
          qtd_componentes: number;
          /** Em quantas composições este item entra como componente. */
          usado_em_composicoes: number;
          /** Insumo desativado ainda somando preço dentro desta composição. */
          tem_componente_inativo: boolean;
        };
        Relationships: never[];
      };
      v_composicao_itens: {
        Row: ComposicaoItemRow & {
          insumo_descricao: string;
          insumo_unidade: string;
          insumo_categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
          insumo_tipo_item: 'Insumo' | 'Composicao';
          insumo_codigo_sinapi: string | null;
          insumo_preco_referencia: number;
          insumo_ativo: boolean;
          custo_total: number;
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
      /**
       * Base de referência SINAPI (schema `referencia`, exposto como view porque
       * o PostgREST só alcança `public`). Ver 20260730100000.
       *
       * Sem preço de propósito: preço existe por (publicação, UF, regime) e view
       * não recebe parâmetro. Para buscar com preço, use a RPC `sinapi_buscar`.
       */
      v_sinapi_item: {
        Row: {
          codigo: number;
          tipo: 'INSUMO' | 'COMPOSICAO';
          descricao: string;
          unidade: string | null;
          /** Classificação (insumo) ou Grupo (composição). */
          grupo: string | null;
          /** C = coletado, CR = coeficiente de representatividade. Só insumo. */
          origem_preco: string | null;
          /** false = item conhecido só pelo Analítico, sem preço publicado. */
          visto_em_preco: boolean;
          busca: string | null;
        };
        Relationships: never[];
      };
      v_sinapi_composicao_item: {
        Row: {
          publicacao_id: number;
          composicao: number;
          item: number;
          coeficiente: number;
          situacao: string | null;
          item_tipo: 'INSUMO' | 'COMPOSICAO';
          item_descricao: string;
          item_unidade: string | null;
          item_grupo: string | null;
        };
        Relationships: never[];
      };
      v_sinapi_publicacao: {
        Row: {
          id: number;
          mes_referencia: string;
          data_emissao: string;
          importado_em: string;
          /** A mais recente que fechou a importação. */
          vigente: boolean;
        };
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
        /** `p_motivo` é opcional no banco (default null) — ver 20260728120000. */
        Args: { p_medicao_id: string; p_motivo?: string | null };
        Returns: MedicaoObraRow;
      };
      fn_duplicar_proposta: {
        Args: { p_proposta_id: string; p_descricao?: string | null };
        /** id da proposta criada. */
        Returns: string;
      };
      fn_registrar_revisao_proposta: {
        Args: {
          p_proposta_id: string;
          p_alteracoes: string;
          /** Só considerado quando a proposta não tem itens. */
          p_valor?: number | null;
          /** Dia local de quem registra — o banco roda em UTC. */
          p_data?: string | null;
        };
        /** id da revisão criada. */
        Returns: string;
      };
      /** Busca na base SINAPI com preço resolvido. Ver 20260730100000. */
      sinapi_buscar: {
        Args: {
          p_termo?: string | null;
          p_uf?: string;
          /** SD = sem desoneração, CD = com desoneração, SE = sem encargos. */
          p_regime?: string;
          p_tipo?: 'INSUMO' | 'COMPOSICAO' | null;
          /** Omitido = publicação vigente. */
          p_publicacao?: number | null;
          p_limite?: number;
          p_offset?: number;
        };
        Returns: SinapiResultadoBusca[];
      };
      /**
       * Abre uma composição do SINAPI item por item. Filtre `nivel = 1` para o
       * detalhamento oficial — a soma de `custo` nesse nível reproduz o custo
       * publicado. Níveis maiores explicam as subcomposições e NÃO devem ser
       * somados junto.
       */
      sinapi_custo_expandido: {
        Args: {
          p_composicao: number;
          p_publicacao?: number | null;
          p_uf?: string;
          p_regime?: string;
        };
        Returns: SinapiLinhaCusto[];
      };
      /** Copia um item do SINAPI para o catálogo. Ver 20260730110000. */
      sinapi_adotar: {
        Args: {
          p_codigo: number;
          /** 'item' preserva o custo publicado; 'expandido' cria os componentes. */
          p_modo?: 'item' | 'expandido';
          p_publicacao?: number | null;
          p_uf?: string;
          /** Só 'SD' ou 'CD' — o catálogo não representa 'SE'. */
          p_regime?: string;
        };
        Returns: SinapiAdocao;
      };
      /**
       * Onde o insumo está sendo usado. Serve para a tela explicar por que a
       * exclusão está bloqueada; a autoridade é a própria exclusão, que refaz
       * a contagem. Ver 20260731120000.
       */
      catalogo_usos_insumo: {
        Args: { p_id: string };
        Returns: CatalogoUsosInsumo;
      };
      /**
       * Único caminho de exclusão definitiva — DELETE em catalogo_insumos está
       * revogado de `authenticated`. Levanta erro (mensagem pronta para toast)
       * quando o insumo tem qualquer uso.
       */
      catalogo_excluir_insumo: {
        Args: { p_id: string };
        Returns: CatalogoExclusao;
      };
    };
  };
}
