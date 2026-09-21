/**
 * Hand-written to match supabase/migrations/*.sql. Once the project is linked,
 * prefer regenerating with `npx supabase gen types typescript --linked` and
 * replacing this file — kept in sync manually until then.
 */

export type Role = 'admin' | 'gestao' | 'financeiro' | 'campo';

/**
 * As colunas do quadro kanban, na ordem em que aparecem (20260808100000).
 * A ordem do union é a ordem da tela — ver COLUNAS em components/tarefas.
 */
export type StatusTarefa = 'A fazer' | 'Fazendo' | 'Em revisão' | 'Concluída';

/** Mesmo vocabulário de `notificacoes.prioridade`, de propósito. */
export type PrioridadeTarefa = 'Alta' | 'Média' | 'Baixa';

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

/**
 * Colunas `not null` que o BANCO preenche — por `default` ou por trigger.
 *
 * `OptionalNullable` cobre só o caso `null` (coluna anulável = omissível). Faltava
 * o outro: uma coluna `not null default 0` é obrigatória na LEITURA e opcional na
 * ESCRITA, e o tipo não tinha como dizer isso. O resultado é que oito colunas
 * eram exigidas em todo insert mesmo com o banco preenchendo-as — e o único
 * motivo de ninguém ter percebido é que `strict` estava desligado e os erros não
 * apareciam (§3.1 da auditoria).
 *
 * O padrão `Omit` + re-adicionar como opcional já existia à mão em
 * `propostas.bdi_percentual` e `contas_financeiras.ativa`. Aqui ele ganha nome,
 * para o próximo default de banco não virar uma nona exceção silenciosa.
 *
 * Confirmado em `information_schema.columns` antes de aplicar: as oito são
 * `is_nullable = 'NO'` com `column_default` preenchido, salvo `propostas.numero`,
 * que não tem default e é atribuída por `trg_propostas_set_numero`.
 */
type ComDefaultDoBanco<Insert, K extends keyof Insert> = Omit<Insert, K> & { [P in K]?: Insert[P] };

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
  /**
   * Quando um admin liberou este acesso pela primeira vez.
   *
   * `null` é o estado "nunca aprovado", e é o que separa as duas leituras de
   * `active = false`: quem acabou de se cadastrar está AGUARDANDO liberação;
   * quem já usava e foi desligado teve o acesso REVOGADO. As duas mensagens
   * mandam a pessoa para conversas diferentes.
   *
   * Só a administração escreve (guarda em `fn_profile_protege_privilegio`), e o
   * carimbo é da trigger — a tela nunca envia esta coluna.
   */
  aprovado_em: string | null;
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
  /**
   * Insumo de mão de obra do catálogo que representa este cargo (20260726221330).
   * Null para quem não é mão de obra direta. Uma trigger garante que o alvo é
   * um insumo (não composição) de categoria 'Mão de Obra'.
   */
  catalogo_mao_de_obra_id: string | null;
  /**
   * Lotação: centro de custo padrão da folha deste funcionário (20260920015643).
   * Null = a tela da folha pergunta em qual centro a rodada cai.
   */
  centro_custo_id: string | null;
  /**
   * Custo além do salário (20260810140000). Nulo tem DOIS sentidos aqui:
   * em `encargos_percentual` e `jornada_mensal_horas` significa "herda
   * `empresa_config`"; nos quatro benefícios significa "não recebe", e soma
   * zero. Ver `src/lib/custoHora.ts`, que espelha `fn_custo_hora_folha`.
   */
  encargos_percentual: number | null;
  /**
   * Qual coluna de `encargos_rubricas` vale para esta pessoa. `not null default
   * 'Mensalista'` no banco, e o default não é preferência: `salario_base` é
   * MENSAL e a jornada de 220 h já inclui o repouso semanal, então
   * `salário ÷ 220` já é custo-hora de mensalista. Marcar 'Horista' sem trocar
   * a jornada para as horas efetivamente trabalhadas cobra repouso, feriado e
   * dias de chuva duas vezes.
   */
  regime_encargos: 'Horista' | 'Mensalista';
  jornada_mensal_horas: number | null;
  vale_transporte_mensal: number | null;
  vale_alimentacao_mensal: number | null;
  plano_saude_mensal: number | null;
  outros_beneficios_mensal: number | null;
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
  /**
   * Encargos sociais sobre o salário base, em %. NULO = não configurado, e a
   * fonte de preço 'Folha' fica desligada (a cadeia segue no catálogo). Nunca
   * tratar como 0: mão de obra sem encargos parece 40-90% mais barata do que é.
   */
  encargos_sociais_percentual: number | null;
  /**
   * 'Direto' usa `encargos_sociais_percentual`; 'Rubricas' usa o total de
   * `fn_encargos_totais()` conforme o regime da ficha. O escalar acima nunca é
   * sobrescrito, então voltar para 'Direto' restaura os preços anteriores.
   */
  encargos_modo: 'Direto' | 'Rubricas';
  /** Horas mensais para converter salário em custo/hora. Padrão CLT 220. */
  jornada_mensal_horas: number;
  /** Só na conversão coeficiente (H/un) ⇄ produtividade (un/dia). Não é custo. */
  jornada_diaria_horas: number;
  created_at: string;
  updated_at: string;
}

/**
 * Uma rubrica de encargo social (estrutura SINAPI). Somadas por
 * `fn_encargos_totais()` produzem o percentual que a cadeia de preço consome.
 *
 * Três estados diferentes convivem nas colunas de percentual, e confundi-los é
 * o modo de falha desta tabela:
 *   - número           → respondida
 *   - `null`           → NÃO respondida (o grupo inteiro fica sem total)
 *   - `aplica_* false` → "não incide" (resposta completa; a tela mostra traço)
 */
type EncargosRubricaRow = {
  codigo: string;
  grupo: 'A' | 'B' | 'C' | 'D';
  descricao: string;
  percentual_horista: number | null;
  percentual_mensalista: number | null;
  aplica_horista: boolean;
  aplica_mensalista: boolean;
  /** Só grupo D, conjunto fechado. Grupo D nunca tem percentual digitado. */
  formula: 'A*B' | 'A*B-A1*B4' | 'A*C2+A8*C1' | null;
  ordem: number;
  ativo: boolean;
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
  /** GENERATED: `cnpj`/`cpf` só com dígitos. Ver 20260803100002. Nunca escrever. */
  documento_digitos: string;
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

/**
 * A categoria do CATÁLOGO — cinco valores, contra os sete de `CategoriaCustoDb`.
 * A ponte entre as duas mora em `fn_categoria_custo_do_catalogo` (banco) e em
 * `categoriaCustoDoInsumo` (lib/preco.ts).
 */
type CategoriaInsumoDb = 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';

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

/**
 * Uma linha da composição de um item de proposta — a composição ADAPTADA àquela
 * obra (20260815191910). Os campos `*_referencia` guardam de onde ela partiu:
 * editar aqui não altera o catálogo.
 */
type ItemPropostaComposicaoRow = {
  id: string;
  item_proposta_id: string;
  catalogo_insumo_id: string | null;
  descricao: string;
  unidade: string;
  categoria: CategoriaInsumoDb;
  coeficiente: number;
  coeficiente_referencia: number | null;
  preco_unitario: number;
  preco_unitario_referencia: number | null;
  /** GENERATED — coeficiente × preço. Só para exibir; o total soma exato. */
  custo: number;
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

type PosicaoSecaoDb = 'antes' | 'depois';
type EscopoModeloDb = 'proposta' | 'contrato' | 'ambos';

/** Biblioteca de textos reutilizáveis da empresa — ver 20260810100000. */
type ModeloTextoRow = {
  id: string;
  titulo: string;
  corpo: string;
  categoria: string;
  escopo: EscopoModeloDb;
  posicao: PosicaoSecaoDb;
  ordem: number;
  padrao: boolean;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Um bloco do descritivo DESTA proposta — ver 20260810100001.
 *
 * Nasce por trigger, copiado dos modelos `padrao`. `modelo_id` é procedência
 * sem integridade forte: o modelo pode ser aposentado e a seção emitida
 * continua legível.
 */
type PropostaSecaoRow = {
  id: string;
  proposta_id: string;
  titulo: string;
  corpo: string;
  posicao: PosicaoSecaoDb;
  ordem: number;
  modelo_id: string | null;
  created_at: string;
  updated_at: string;
}

/** O que foi assinado — ver 20260811100000. */
type ContratoRow = {
  id: string;
  numero: string;
  /** `not null` desde 20260812100000: contrato sem proposta deixou de existir. */
  proposta_id: string;
  projeto_id: string | null;
  cliente_id: string;
  objeto: string;
  valor_total: number;
  prazo_execucao_dias: number | null;
  data_inicio: string | null;
  data_assinatura: string | null;
  forma_pagamento: string | null;
  reajuste: string | null;
  indice_reajuste: string | null;
  multa_percentual: number | null;
  juros_mora_percentual: number | null;
  garantia_meses: number | null;
  foro: string | null;
  observacoes: string | null;
  status: 'Minuta' | 'Emitido' | 'Assinado' | 'Encerrado';
  created_at: string;
  updated_at: string;
}

type ContratoClausulaRow = {
  id: string;
  contrato_id: string;
  titulo: string;
  corpo: string;
  ordem: number;
  modelo_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Cópia congelada de uma seção do descritivo — ver 20260810100002. */
type SecaoRevisaoPropostaRow = {
  id: string;
  revisao_id: string;
  titulo: string;
  corpo: string;
  posicao: PosicaoSecaoDb;
  ordem: number;
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
  /** Ver 20260801120000. A view foi recriada com colunas explícitas para expor isto. */
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

// Árvore organizacional de centros de custo (20260920015643), no modelo
// Kostenstelle do SAP: dimensão obrigatória de todo lançamento do razão, e
// separada da `categoria`, que é a NATUREZA do gasto.
type CentroCustoRow = {
  id: string;
  /** Código do plano de centros. Gerado pelo banco para o centro de uma obra. */
  codigo: string;
  nome: string;
  /** Null só na raiz da árvore. */
  pai_id: string | null;
  /** `Sintetico` agrupa e NÃO recebe lançamento; `Analitico` é o único postável. */
  tipo: 'Sintetico' | 'Analitico';
  natureza: 'Administrativo' | 'Operacional' | 'Comercial' | 'Obra';
  /**
   * Preenchido => este é o centro de uma obra, criado por `trg_projeto_cria_centro`.
   * Volta a null quando a obra é apagada, e aí o centro fica inativo guardando
   * o histórico. O cliente nunca escreve este campo.
   */
  projeto_id: string | null;
  responsavel_id: string | null;
  ativo: boolean;
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
  /** NOT NULL no banco, com default current_date; backfill = `data`. Ver 20260731160000. */
  data_vencimento: string;
  pago: boolean;
  conta_id: string;
  /**
   * A dimensão organizacional, obrigatória desde 20260920015643. É a única que
   * o cliente escolhe.
   */
  centro_custo_id: string;
  /**
   * DERIVADO do centro por `trg_z_lancamento_deriva_projeto` — está fora do
   * Insert de propósito. Enviá-lo não tem efeito: a trigger o sobrescreve.
   */
  projeto_id: string | null;
  funcionario_id: string | null;
  fornecedor_id: string | null;
  competencia: string | null;
  medicao_id: string | null;
  /**
   * Quem lançou. Preenchido por `trg_lancamento_set_autoria` a partir do JWT — o
   * cliente nunca envia, e enviar não teria efeito. Null nos lançamentos
   * anteriores a 20260803100001, que não têm autor conhecido.
   */
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

// Retorno de fn_custo_por_centro(). Cada centro traz o que foi lançado NELE e,
// nas colunas `_arvore`, o acumulado da sua subárvore. Não há rateio: o custo
// indireto para no centro dele e nunca encosta na margem da obra.
type CustoPorCentroRow = {
  centro_id: string;
  codigo: string;
  nome: string;
  pai_id: string | null;
  tipo: 'Sintetico' | 'Analitico';
  natureza: 'Administrativo' | 'Operacional' | 'Comercial' | 'Obra';
  projeto_id: string | null;
  ativo: boolean;
  nivel: number;
  caminho: string;
  despesa_lancada: number;
  despesa_paga: number;
  receita_lancada: number;
  receita_recebida: number;
  despesa_lancada_arvore: number;
  despesa_paga_arvore: number;
  receita_lancada_arvore: number;
  receita_recebida_arvore: number;
}

// Retorno de fn_resultado_obra(). Não é tabela nem view: é função SECURITY
// DEFINER, porque `gestao` não lê lancamentos_financeiros e uma view invoker
// devolveria zeros no lugar das colunas de razão.
type ResultadoObraRow = {
  projeto_id: string;
  projeto_nome: string;
  situacao: string;
  cliente_nome: string | null;
  proposta_valor: number | null;
  bdi_percentual: number | null;
  valor_orcado: number;
  valor_executado: number;
  receita_faturada: number;
  receita_recebida: number;
  despesa_lancada: number;
  despesa_paga: number;
  a_faturar: number;
  resultado_competencia: number;
  resultado_caixa: number;
}

/**
 * Domínio canônico de unidade de medida (20260920132016).
 *
 * O `codigo` É a grafia oficial — `m²`, não `M2`. Não existe tabela de
 * sinônimos de propósito: apelido aceito é segunda grafia com carimbo oficial,
 * e foi a grafia livre que pôs `UN` e `un` lado a lado no catálogo.
 *
 * Só leitura no app: sem grant de escrita, unidade nova entra por migration.
 */
type UnidadeMedidaRow = {
  codigo: string;
  nome: string;
  grupo: 'contagem' | 'comprimento' | 'área' | 'volume' | 'massa' | 'tempo' | 'global';
  ordem: number;
}

type CatalogoInsumoRow = {
  id: string;
  /**
   * Identificador humano (MAT-0001, MO-0007...), gerado por categoria e
   * IMUTÁVEL. Escrito SÓ pelo banco: a trigger trg_catalogo_codigo o preenche no
   * INSERT e RECUSA qualquer UPDATE que o mude. Por isso ele não aparece no
   * payload de escrita de `catalogoService.add`/`update`.
   */
  codigo: string;
  descricao: string;
  unidade: string;
  preco_referencia: number;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  tipo_item: 'Insumo' | 'Composicao';
  /**
   * 'Composicao' é escrita SÓ pelo banco: quando o item tem componentes, a
   * trigger fn_catalogo_insumo_before_write sobrescreve preço e fonte com o
   * valor derivado. Mandar outra coisa daqui não dá erro — é ignorado.
   */
  preco_fonte: 'Fornecedor' | 'Manual' | 'Composicao';
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
  fonte: 'Fornecedor' | 'Manual' | 'Composicao';
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

/**
 * Uma linha da árvore analítica de composição (20260810124000).
 *
 * SOMAR APENAS as linhas com `eh_folha`. A linha de uma subcomposição traz o
 * subtotal da subárvore dela para explicar de onde vem o número; somá-la junto
 * das folhas conta o mesmo dinheiro duas vezes.
 */
type CatalogoLinhaExpandida = {
  nivel: number;
  /** Chave de travessia: `order by ordem` põe cada pai colado nos filhos. */
  ordem: string[];
  /** Ids do topo até este nó — o prefixo identifica a subárvore. */
  caminho: string[];
  componente_id: string;
  pai_id: string;
  insumo_id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  tipo_item: 'Insumo' | 'Composicao';
  ativo: boolean;
  /** Motivo do ajuste de índice, quando houver. */
  observacao: string | null;
  coeficiente: number;
  /** Produto dos coeficientes do caminho: quanto deste insumo por 1 un. do topo. */
  coef_acumulado: number;
  eh_folha: boolean;
  /** Mão de obra medida em hora — é o que entra no HH. */
  eh_hora: boolean;
  preco_unitario: number;
  preco_nivel: 1 | 2 | 3 | 4;
  preco_fonte: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência';
  custo: number;
}

type CatalogoAgregadosComposicao = {
  composicao_id: string;
  custo_total: number;
  /** Horas de mão de obra por UMA unidade da composição. */
  hh_por_unidade: number;
  /** MO que não é medida em hora (mensalista, empreitada) e ficou fora do HH. */
  hh_fora_de_hora: number;
  custo_mao_de_obra: number;
  custo_material: number;
  custo_equipamento: number;
  custo_servico: number;
  custo_taxa: number;
  qtd_folhas: number;
  folhas_sem_preco: number;
  folhas_inativas: number;
  profundidade: number;
}

type CatalogoLinhaHH = {
  insumo_id: string;
  descricao: string;
  unidade: string;
  eh_hora: boolean;
  coef_acumulado: number;
  preco_unitario: number;
  preco_fonte: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência';
  custo: number;
  /** Zero = cargo orçado pelo preço do catálogo, não pela folha da empresa. */
  funcionarios_vinculados: number;
}

type ObraExplosaoInsumo = {
  insumo_id: string;
  descricao: string;
  unidade: string;
  categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
  quantidade: number;
  preco_unitario: number;
  preco_fonte: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência';
  custo: number;
  hh: number;
  participacao: number;
  custo_acumulado: number;
  classe_abc: 'A' | 'B' | 'C';
  origens: number;
}

type EtapaHH = {
  hh_total: number;
  custo_mao_de_obra: number;
  custo_total: number;
  /** `ponderado` é aproximado: o peso do vínculo reparte valor, não hora. */
  origem: 'direto' | 'ponderado' | 'vazio';
  insumos_com_hh: number;
  insumos_sem_hh: number;
  hh_por_cargo: {
    insumo_id: string; descricao: string; unidade: string; horas: number; custo: number;
  }[];
}

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
  // EAP — 20260809100000
  parent_id: string | null;
  ordem: number;
  eh_marco: boolean;
  agendamento: 'manual' | 'automatico';
  baseline_inicio: string | null;
  baseline_fim: string | null;
  baseline_em: string | null;
  baseline_por: string | null;
  // Meta quantitativa — 20260815100000. As duas são null juntas (constraint
  // `etapas_cronograma_quantidade_pareada`): null = etapa medida em percentual.
  quantidade_prevista: number | null;
  unidade: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Sequenciamento entre etapas-folha (20260809110000). `projeto_id` é
 * denormalizado de propósito — ver o cabeçalho da migration.
 */
type EtapaDependenciaRow = {
  id: string;
  projeto_id: string;
  predecessora_id: string;
  sucessora_id: string;
  tipo: 'FS' | 'SS' | 'FF' | 'SF';
  atraso_dias: number;
  created_at: string;
  criado_por: string | null;
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
  /**
   * Quanto foi executado NESTE boletim — incremento, não leitura acumulada.
   * Null quando a etapa não tem meta (20260815100000).
   */
  quantidade_medida: number | null;
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
  /**
   * O CUSTO, e a conta que leva dele até a venda (20260812230038, item A1).
   *
   * `preco_unitario_base` acima é preço de VENDA em obra vinda de conversão — o
   * wizard multiplica o BDI e grava o resultado, porque é ele que alimenta
   * `itens_orcamento.valor_orcado` e o razão. Estas quatro guardam o que era
   * descartado, e juntas reconstroem a aritmética:
   *
   *   (custo_origem ⊕ ajuste_origem) × (1 + bdi_aplicado/100) = preco_unitario
   *
   * `null` significa **desconhecido**, nunca zero: linha anterior à migration,
   * ou item cujo custo nunca foi registrado. Zerar produziria margem de 100%.
   */
  custo_origem: number | null;
  ajuste_origem_tipo: TipoAjusteDb | null;
  ajuste_origem_valor: number | null;
  bdi_aplicado: number | null;
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

/** Tarefas do dia a dia da empresa (20260808100000). */
type TarefaRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  responsavel_id: string | null;
  /** `default auth.uid()` — o insert nunca manda. */
  criado_por: string;
  /** Nulo = tarefa da empresa; preenchido = tarefa daquela obra. */
  projeto_id: string | null;
  /**
   * Coluna `date`, não timestamptz. Nunca passar por `new Date()`: o construtor
   * lê '2026-08-12' como UTC e a tela mostra 11/08 no Brasil. Ver formatarDataBR.
   */
  prazo: string | null;
  /** Mantida por trg_tarefa_estado. A aplicação lê, nunca escreve. */
  concluida_em: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Database
// ============================================================

export type Database = {
  public: {
    Tables: {
      compromissos_custo: Table<{
        id: string; projeto_id: string; etapa_id: string; descricao: string; valor: number;
        situacao: 'Ativo' | 'Cancelado'; criado_por: string | null; criado_em: string;
        cancelado_por: string | null; cancelado_em: string | null; motivo_cancelamento: string | null;
      }, { projeto_id: string; etapa_id: string; descricao: string; valor: number }, {
        situacao?: 'Cancelado'; cancelado_por?: string; cancelado_em?: string; motivo_cancelamento?: string;
      }>;
      revisoes_plano_obra: Table<{
        id: string; projeto_id: string; numero: number; motivo: string;
        itens: unknown; etapas: unknown; vinculos: unknown; dependencias: unknown;
        receita_orcada: number; custo_orcado: number | null; aprovado_por: string | null; aprovado_em: string;
      }, never>;
      profiles: Table<ProfileRow, { id: string; email?: string | null; full_name?: string | null; role?: Role; funcionario_id?: string | null; active?: boolean }>;
      // `regime_encargos` é `not null default 'Mensalista'`: obrigatório na
      // leitura, omissível na escrita, o caso que `ComDefaultDoBanco` nomeia.
      funcionarios: Table<
        FuncionarioRow,
        ComDefaultDoBanco<
          WithOptionalId<FuncionarioRow, 'id' | 'created_at' | 'updated_at'>,
          'regime_encargos'
        >
      >;
      // Rubrica nova entra por MIGRATION: INSERT e DELETE não são concedidos a
      // ninguém no banco, e `Insert: never` põe a mesma decisão no tipo.
      //
      // A escrita não passa por aqui — vai pelo RPC `encargos_rubricas_salvar`,
      // que faz um UPDATE só. A primeira tentativa foi `upsert`, e ela morria
      // com `permission denied`: upsert é INSERT ... ON CONFLICT e exige o
      // privilégio de INSERT mesmo quando toda linha cai no ramo do UPDATE.
      // O `never` está aqui para ninguém refazer esse caminho.
      encargos_rubricas: Table<
        EncargosRubricaRow,
        never,
        Partial<
          Pick<
            EncargosRubricaRow,
            | 'percentual_horista'
            | 'percentual_mensalista'
            | 'aplica_horista'
            | 'aplica_mensalista'
            | 'ativo'
            | 'formula'
          >
        >
      >;
      funcionario_documentos: Table<FuncionarioDocumentoRow, WithOptionalId<FuncionarioDocumentoRow, 'id' | 'created_at'>>;
      // `numero` é omitido no insert — quem numera é trg_propostas_set_numero.
      // `singleton` idem: o default true é o que garante a linha única.
      // As duas jornadas são `not null` com default no banco (220 h e 8 h):
      // obrigatórias na leitura, omissíveis na escrita — é exatamente o caso
      // que `ComDefaultDoBanco` existe para nomear.
      empresa_config: Table<
        EmpresaConfigRow,
        ComDefaultDoBanco<
          WithOptionalId<EmpresaConfigRow, 'id' | 'singleton' | 'condicoes' | 'created_at' | 'updated_at'>,
          'jornada_mensal_horas' | 'jornada_diaria_horas' | 'encargos_modo'
        > & {
          singleton?: boolean;
          condicoes?: string[];
        }
      >;
      clientes: Table<ClienteRow, WithOptionalId<ClienteRow, 'id' | 'created_at' | 'updated_at'>>;
      cliente_documentos: Table<ClienteDocumentoRow, WithOptionalId<ClienteDocumentoRow, 'id' | 'created_at'>>;
      // `documento_digitos` é GENERATED — fora do Insert/Update por construção.
      fornecedores: Table<
        FornecedorRow,
        WithOptionalId<FornecedorRow, 'id' | 'documento_digitos' | 'created_at' | 'updated_at'>
      >;
      // `numero` vem de trg_propostas_set_numero; `valor_estimado` de
      // trg_propostas_valor_inicial; `bdi_percentual` e `bdi_visivel_pdf` têm
      // default. Nenhum deles é montado pelo cliente — ver propostasService.add.
      propostas: Table<
        PropostaRow,
        ComDefaultDoBanco<
          WithOptionalId<PropostaRow, 'id' | 'created_at' | 'updated_at'>,
          'numero' | 'valor_estimado' | 'bdi_percentual' | 'bdi_visivel_pdf'
        >
      >;
      revisoes_proposta: Table<RevisaoPropostaRow, WithOptionalId<RevisaoPropostaRow, 'id' | 'created_at'>>;
      // Escrita apenas via fn_registrar_revisao_proposta; o Insert existe para
      // completude do tipo, não porque a UI deva montar snapshot à mão.
      itens_revisao_proposta: Table<ItemRevisaoPropostaRow, WithOptionalId<ItemRevisaoPropostaRow, 'id' | 'created_at'>>;
      secoes_revisao_proposta: Table<SecaoRevisaoPropostaRow, WithOptionalId<SecaoRevisaoPropostaRow, 'id' | 'created_at'>>;
      // Insert `never`, e é a regra do processo escrita no tipo: contrato nasce
      // só por `fn_gerar_contrato_from_proposta`, sobre uma proposta aprovada.
      // A RLS de 20260812100000 recusa o insert direto em tempo de execução;
      // aqui ele nem compila. `proposta_id` e `cliente_id` também saem do
      // Update — vêm da proposta, e trocá-los desligaria o contrato do que o
      // cliente aceitou.
      contratos: Table<
        ContratoRow,
        never,
        Partial<Omit<
          ContratoRow,
          'id' | 'numero' | 'proposta_id' | 'cliente_id' | 'created_at' | 'updated_at'
        >>
      >;
      // `modelo_id` fora do omit: é anulável, e `OptionalNullable` já o torna
      // opcional — omiti-lo apagaria a procedência do Insert.
      contrato_clausulas: Table<
        ContratoClausulaRow,
        ComDefaultDoBanco<
          WithOptionalId<ContratoClausulaRow, 'id' | 'created_at' | 'updated_at'>,
          'corpo' | 'ordem'
        >,
        Partial<Omit<ContratoClausulaRow, 'id' | 'contrato_id' | 'created_at' | 'updated_at'>>
      >;
      // `corpo`, `categoria`, `escopo`, `posicao`, `ordem`, `padrao` e `ativo`
      // têm default no banco — o formulário da biblioteca manda só o que o
      // usuário preencheu. Update precisa alcançar todos eles: aposentar um
      // modelo é um update de `ativo`, e marcar como padrão, de `padrao`.
      modelos_texto: Table<
        ModeloTextoRow,
        ComDefaultDoBanco<
          WithOptionalId<ModeloTextoRow, 'id' | 'created_at' | 'updated_at'>,
          'corpo' | 'categoria' | 'escopo' | 'posicao' | 'ordem' | 'padrao' | 'ativo'
        >,
        Partial<Omit<ModeloTextoRow, 'id' | 'created_at' | 'updated_at'>>
      >;
      // `corpo`, `posicao` e `ordem` têm default. `modelo_id` NÃO entra no omit:
      // é anulável, então `OptionalNullable` já o torna opcional — omiti-lo aqui
      // o apagaria do Insert e a seção nasceria sem procedência.
      proposta_secoes: Table<
        PropostaSecaoRow,
        ComDefaultDoBanco<
          WithOptionalId<PropostaSecaoRow, 'id' | 'created_at' | 'updated_at'>,
          'corpo' | 'posicao' | 'ordem'
        >,
        Partial<Omit<PropostaSecaoRow, 'id' | 'proposta_id' | 'created_at' | 'updated_at'>>
      >;
      // preco_unitario é GENERATED — fora do Insert/Update por construção.
      itens_proposta: Table<
        ItemPropostaRow,
        ComDefaultDoBanco<
          WithOptionalId<ItemPropostaRow, 'id' | 'preco_unitario' | 'created_at' | 'updated_at'>,
          never
        >
      >;
      // `custo` é GENERATED; os quatro `*_referencia`/origem são opcionais no
      // Insert porque uma linha acrescentada à mão na proposta não tem de onde
      // partir — ver o cabeçalho da tabela.
      itens_proposta_composicao: Table<
        ItemPropostaComposicaoRow,
        ComDefaultDoBanco<
          WithOptionalId<ItemPropostaComposicaoRow, 'id' | 'custo' | 'created_at' | 'updated_at'>,
          'catalogo_insumo_id' | 'coeficiente_referencia'
            | 'preco_unitario_referencia' | 'unidade' | 'ordem'
        >,
        Partial<Omit<ItemPropostaComposicaoRow, 'id' | 'item_proposta_id' | 'custo' | 'created_at' | 'updated_at'>>
      >;
      // `ativa` nasce true por default, então é opcional no Insert — mas precisa
      // continuar no Update, porque desativar conta é justamente um update dela.
      // Sem o terceiro parâmetro o Update herdaria o Insert e proibiria o campo.
      contas_financeiras: Table<
        ContaFinanceiraRow,
        ComDefaultDoBanco<WithOptionalId<ContaFinanceiraRow, 'id' | 'created_at' | 'updated_at'>, 'ativa'>,
        Partial<Omit<ContaFinanceiraRow, 'id' | 'created_at' | 'updated_at'>>
      >;
      // `data_vencimento` tem `default current_date` (20260731160000): a compra de
      // fornecedor não a informa e vence no dia do lançamento.
      // `projeto_id` sai do Insert (e, por tabela, do Update): desde
      // 20260920015643 ele é derivado do centro de custo por trigger. Mandá-lo
      // não dá erro — é silenciosamente sobrescrito, que é pior. Aqui nem compila.
      lancamentos_financeiros: Table<
        LancamentoFinanceiroRow,
        ComDefaultDoBanco<
          WithOptionalId<
            Omit<LancamentoFinanceiroRow, 'projeto_id'>,
            'id' | 'criado_por' | 'created_at' | 'updated_at'
          >,
          'data_vencimento'
        >
      >;
      // O centro de uma OBRA nasce por trigger, com código de sequência: os dois
      // campos ficam fora do Insert que um humano faz.
      centros_custo: Table<
        CentroCustoRow,
        WithOptionalId<
          Omit<CentroCustoRow, 'projeto_id'>,
          'id' | 'ativo' | 'created_at' | 'updated_at'
        >,
        Partial<Omit<CentroCustoRow, 'id' | 'projeto_id' | 'created_at' | 'updated_at'>>
      >;
      // Só leitura: o banco não dá INSERT/UPDATE/DELETE a `authenticated`, e
      // `never` no Insert é o tipo dizendo a mesma coisa. `catalogo_sequencia`
      // NÃO aparece neste mapa de propósito — ela não tem grant nenhum e só
      // fn_proximo_codigo_catalogo a alcança; listá-la sugeriria um caminho que
      // não existe.
      unidades_medida: Table<UnidadeMedidaRow, never>;
      // `busca` é mantida por trigger; enviá-la num insert seria sobrescrita
      // em seguida — fica de fora do Insert de propósito.
      //
      // `codigo` sai dos DOIS lados da escrita, e por motivos diferentes: no
      // Insert porque quem o atribui é trg_catalogo_codigo (mandá-lo daqui
      // furaria a sequência por categoria), e no Update porque a mesma trigger
      // RECUSA a alteração com exceção. Deixá-lo no Update daria ao TypeScript
      // a bênção para escrever algo que o banco derruba em tempo de execução.
      catalogo_insumos: Table<
        CatalogoInsumoRow,
        WithOptionalId<CatalogoInsumoRow, 'id' | 'codigo' | 'busca' | 'created_at' | 'updated_at'>,
        Partial<WithOptionalId<CatalogoInsumoRow, 'id' | 'codigo' | 'busca' | 'created_at' | 'updated_at'>>
      >;
      catalogo_fornecedores_alternativos: Table<CatalogoFornecedorAlternativoRow, CatalogoFornecedorAlternativoRow>;
      catalogo_historico_precos: Table<CatalogoHistoricoPrecoRow, WithOptionalId<CatalogoHistoricoPrecoRow, 'id' | 'created_at'>>;
      // `ativa` nasce true por default; desativar cotação é update (a tabela é
      // insert-only e o DELETE está revogado — ver catalogoService.desativarCotacao).
      cotacoes_fornecedores: Table<
        CotacaoFornecedorRow,
        ComDefaultDoBanco<WithOptionalId<CotacaoFornecedorRow, 'id' | 'created_at'>, 'ativa'>
      >;
      composicao_itens: Table<ComposicaoItemRow, WithOptionalId<ComposicaoItemRow, 'id' | 'created_at' | 'updated_at'>>;
      projetos: Table<ProjetoRow, WithOptionalId<ProjetoRow, 'id' | 'created_at' | 'updated_at'>>;
      projeto_equipe: Table<ProjetoEquipeRow, WithOptionalId<ProjetoEquipeRow, 'id' | 'created_at'>>;
      itens_orcamento: Table<ItemOrcamentoRow, WithOptionalId<ItemOrcamentoRow, 'id' | 'created_at' | 'updated_at'>>;
      alteracoes_orcamento: Table<AlteracaoOrcamentoRow, WithOptionalId<AlteracaoOrcamentoRow, 'id' | 'created_at'>>;
      // `ordem` é preenchida por trg_etapa_ordem_padrao (fim da lista de
      // irmãos); `eh_marco` e `agendamento` têm default. As três são not null
      // na leitura e omissíveis na escrita.
      etapas_cronograma: Table<
        EtapaCronogramaRow,
        ComDefaultDoBanco<
          WithOptionalId<EtapaCronogramaRow, 'id' | 'created_at' | 'updated_at'>,
          'ordem' | 'eh_marco' | 'agendamento'
        >
      >;
      etapa_orcamento_vinculo: Table<EtapaOrcamentoVinculoRow, WithOptionalId<EtapaOrcamentoVinculoRow, 'id' | 'created_at'>>;
      // `tipo` nasce 'FS' e `atraso_dias` nasce 0.
      etapa_dependencia: Table<
        EtapaDependenciaRow,
        ComDefaultDoBanco<
          WithOptionalId<EtapaDependenciaRow, 'id' | 'created_at'>,
          'tipo' | 'atraso_dias'
        >
      >;
      // `status` nasce 'Pendente' e `data_medicao` = current_date: o boletim é
      // lançado no dia e a aprovação é outro caminho (fn_aprovar_medicao).
      //
      // `percentual_medido` sai do insert por um motivo que não é "default do
      // banco": quando a etapa tem meta quantitativa, quem o preenche é
      // `fn_medicao_deriva_percentual` a partir de `quantidade_medida`, e o
      // NOT NULL da coluna é avaliado DEPOIS dos triggers BEFORE. Sem soltá-lo
      // aqui, o modo quantidade não compila — e a saída tentadora (mandar um
      // percentual qualquer que o trigger sobrescreve) funciona e esconde a
      // intenção.
      medicoes_obra: Table<
        MedicaoObraRow,
        ComDefaultDoBanco<
          WithOptionalId<MedicaoObraRow, 'id' | 'created_at'>,
          'status' | 'data_medicao' | 'percentual_medido' | 'quantidade_medida'
        >
      >;
      medicao_item_orcamento: Table<MedicaoItemOrcamentoRow, never>;
      // preco_unitario é GENERATED. `quantidade_executada` nasce 0 e SÓ é
      // escrita pelo cliente: nenhuma trigger de medição a alimenta, e a
      // medição por unidade (20260815100000) tampouco passou a alimentá-la —
      // insumo não é serviço, e ratear a quantidade de uma etapa entre os
      // insumos dela seria inventar número.
      insumos_projeto: Table<
        InsumoProjetoRow,
        ComDefaultDoBanco<
          WithOptionalId<InsumoProjetoRow, 'id' | 'preco_unitario' | 'created_at' | 'updated_at'>,
          'quantidade_executada'
        >
      >;
      documento_categorias: Table<DocumentoCategoriaRow, WithOptionalId<DocumentoCategoriaRow, 'id' | 'created_at'>>;
      documentos: Table<DocumentoRow, WithOptionalId<DocumentoRow, 'id' | 'created_at'>>;
      documento_versoes: Table<DocumentoVersaoRow, WithOptionalId<DocumentoVersaoRow, 'id' | 'created_at'>>;
      medicao_fotos: Table<MedicaoFotoRow, WithOptionalId<MedicaoFotoRow, 'id' | 'created_at'>>;
      notificacoes: Table<NotificacaoRow, WithOptionalId<NotificacaoRow, 'id' | 'created_at'>>;
      // `criado_por`, `concluida_em` e os dois timestamps saem do insert: o
      // primeiro tem `default auth.uid()` e os outros três são da trigger.
      // `status` e `prioridade` têm default e entram por ComDefaultDoBanco.
      tarefas: Table<
        TarefaRow,
        ComDefaultDoBanco<
          WithOptionalId<TarefaRow, 'id' | 'criado_por' | 'concluida_em' | 'created_at' | 'updated_at'>,
          'status' | 'prioridade'
        >
      >;
    };
    Views: {
      /**
       * A árvore de centros achatada (20260920015643): `nivel` para indentar,
       * `caminho` para ordenar em ordem de árvore, `tem_filhos` para decidir o
       * que é agrupador na tela. NÃO traz o nome do responsável de propósito —
       * `financeiro` não tem policy de select em `profiles` e o join invoker
       * devolveria branco em silêncio; o nome sai de `fn_pessoas_atribuiveis`.
       */
      v_centros_custo: {
        Row: CentroCustoRow & {
          nivel: number;
          caminho: string;
          tem_filhos: boolean;
          projeto_nome: string | null;
        };
        Relationships: never[];
      };
      v_itens_orcamento: { Row: ItemOrcamentoRow & { valor_executado: number }; Relationships: never[] };
      /**
       * Composição do orçamento por firmeza de preço (20260726234500). Uma
       * linha por (obra, nível). `nivel` 0 = linha anterior ao rastreamento de
       * procedência — não é o mesmo que "referência".
       */
      v_confianca_orcamento_obra: {
        Row: {
          projeto_id: string;
          nivel: 0 | 1 | 2 | 3 | 4;
          fonte: 'Cotação' | 'Praticado' | 'Estimado' | 'Referência' | 'Sem procedência';
          itens: number;
          valor: number | null;
          origem_mais_antiga: string | null;
          idade_media_dias: number | null;
        };
        Relationships: never[];
      };
      /**
       * O item de proposta com os agregados da composição desta obra
       * (20260815191910). `custo_composicao` é `null` quando o item não tem
       * composição — que é diferente de custar zero.
       */
      v_itens_proposta: {
        Row: Omit<ItemPropostaRow, 'created_at' | 'updated_at'> & {
          preco_nivel: 0 | 1 | 2 | 3 | 4 | null;
          preco_fonte_efetiva: 'Cotação' | 'Praticado' | 'Estimado' | 'Referência' | null;
          preco_data_origem: string | null;
          qtd_componentes: number;
          custo_composicao: number | null;
          linhas_ajustadas: number;
        };
        Relationships: never[];
      };
      v_confianca_proposta: {
        Row: {
          proposta_id: string;
          nivel: 0 | 1 | 2 | 3 | 4;
          fonte: 'Cotação' | 'Praticado' | 'Estimado' | 'Referência' | 'Sem procedência';
          itens: number;
          valor: number | null;
          origem_mais_antiga: string | null;
          idade_media_dias: number | null;
        };
        Relationships: never[];
      };
      /**
       * A view resolve a ÁRVORE da EAP: nivel, ordem_path (pré-ordem, e a única
       * ordenação estável para paginar), wbs_codigo e eh_folha.
       *
       * `percentual_executado` continua valendo para FOLHA — grupo não tem
       * medição, então cai em 0 aqui de propósito. O percentual do grupo é
       * rolado no cliente por `calcularAvancoFisico`, para não existir uma
       * terceira cópia da mesma média ponderada.
       */
      v_etapas_cronograma: {
        Row: EtapaCronogramaRow & {
          nivel: number;
          ordem_path: number[];
          wbs_codigo: string;
          eh_folha: boolean;
          inicio_efetivo: string | null;
          fim_efetivo: string | null;
          percentual_executado: number;
          /** Soma das quantidades APROVADAS. Não é clampada: overrun aparece. */
          quantidade_executada: number;
          status: 'Não Iniciado' | 'Em Andamento' | 'Concluído' | 'Atrasado';
        };
        Relationships: never[];
      };
      /**
       * Os quatro agregados do §4.2 (20260804110000). O painel e a lista de
       * obras leem daqui em vez de baixar o núcleo inteiro para somar.
       */
      v_resumo_obra: {
        Row: {
          projeto_id: string;
          itens_total: number;
          valor_orcado: number;
          valor_contratado: number;
          valor_executado: number;
          etapas_total: number;
          etapas_atrasadas: number;
          etapas_concluidas: number;
          avanco_fisico: number;
          medicoes_total: number;
          medicoes_pendentes: number;
        };
        Relationships: never[];
      };
      v_desvio_categoria_obra: {
        Row: {
          projeto_id: string;
          categoria: ItemOrcamentoRow['categoria'];
          planejado: number;
          executado: number;
          excesso: number;
        };
        Relationships: never[];
      };
      v_etapa_atrasada: {
        Row: {
          etapa_id: string;
          projeto_id: string;
          etapa_nome: string;
          data_fim: string;
          dias_atraso: number;
        };
        Relationships: never[];
      };
      v_medicao_recente: {
        Row: {
          id: string;
          projeto_id: string;
          etapa_id: string;
          /** Null quando a etapa foi apagada (o join é `left`). */
          etapa_nome: string | null;
          data_medicao: string;
          percentual_medido: number;
          quantidade_medida: number | null;
          /** Vem da ETAPA, não do boletim: é a meta que define a linguagem. */
          unidade: string | null;
          observacoes: string | null;
          status: MedicaoObraRow['status'];
          valor_medido: number;
        };
        Relationships: never[];
      };
      v_contas_financeiras: { Row: ContaFinanceiraRow & { saldo_atual: number }; Relationships: never[] };
      v_compras_fornecedor: {
        Row: { id: string; fornecedor_id: string; data: string; item: string; valor: number; pago: boolean; projeto_id: string | null; conta_id: string; centro_custo_id: string };
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
          /**
           * Cadeia de preço resolvida no banco (fn_preco_vigente, 20260726230000).
           * `preco_referencia` continua sendo o preço GRAVADO; estes campos dizem
           * quanto o insumo vale de fato hoje e de onde esse número veio.
           * Nível: 1 firme (cotação vigente OU folha) · 2 praticado ·
           * 3 estimado · 4 referência.
           */
          preco_vigente: number;
          preco_nivel: 1 | 2 | 3 | 4;
          preco_fonte_efetiva: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência';
          /** Fornecedor da cotação que ganhou; null quando o preço não veio de uma. */
          preco_fornecedor_id: string | null;
          preco_data_origem: string | null;
          preco_dias_idade: number | null;
        };
        Relationships: never[];
      };
      v_composicao_itens: {
        Row: ComposicaoItemRow & {
          insumo_descricao: string;
          insumo_unidade: string;
          insumo_categoria: 'Material' | 'Mão de Obra' | 'Equipamento' | 'Serviço' | 'Taxa';
          insumo_tipo_item: 'Insumo' | 'Composicao';
          /** Preço ARMAZENADO no cadastro. Para insumo folha é só o nível 3/4 da cadeia. */
          insumo_preco_referencia: number;
          insumo_ativo: boolean;
          /**
           * Preço que de fato entra na conta (`fn_preco_vigente`), e a mesma base
           * que `fn_custo_composicao` usa. Divergia de `custo_total` até
           * 20260810120000 — a linha multiplicava `preco_referencia` e o total
           * já somava o vigente, então uma cotação ativa abria um buraco de reais
           * entre as duas, que a tela explicava como arredondamento.
           */
          insumo_preco_vigente: number;
          insumo_preco_nivel: 1 | 2 | 3 | 4;
          insumo_preco_fonte: 'Cotação' | 'Praticado' | 'Estimado' | 'Referência';
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
          /** Procedência congelada no vínculo (20260726234500). Null nas linhas anteriores. */
          preco_nivel: 1 | 2 | 3 | 4 | null;
          preco_fonte_efetiva: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência' | null;
          preco_data_origem: string | null;
          /**
           * Margem por item (20260812230038). NULAS quando `custo_origem` é
           * nulo — sem custo conhecido não existe margem, e a tela precisa
           * dizer isso em vez de mostrar um número inventado.
           */
          valor_total_custo: number | null;
          margem_valor: number | null;
          margem_percentual: number | null;
        };
        Relationships: never[];
      };
      /** Margem real por obra (20260812230038, item A1). */
      v_margem_obra: {
        Row: {
          projeto_id: string;
          itens_total: number;
          /**
           * Quantos itens têm custo conhecido. A tela precisa deste número:
           * margem apurada sobre 3 de 40 itens é verdadeira sobre a amostra e
           * mentirosa como "a margem da obra".
           */
          itens_conhecidos: number;
          venda_total: number;
          custo_total: number | null;
          margem_valor: number | null;
          margem_percentual: number | null;
        };
        Relationships: never[];
      };
      v_propostas: {
        Row: PropostaRow & {
          qtd_itens: number;
          valor_itens: number;
          valor_calculado: number;
          /** Seções COM texto (20260810100001) — alimenta a pendência de descritivo. */
          qtd_secoes: number;
        };
        Relationships: never[];
      };
      v_contratos: {
        // `proposta_numero` não é anulável: a view passou a fazer join interno
        // com propostas em 20260812100000.
        Row: ContratoRow & { qtd_clausulas: number; proposta_numero: string };
        Relationships: never[];
      };
    };
    Functions: {
      // Custo realizado por centro (20260920015643). SECURITY DEFINER pelo mesmo
      // motivo de fn_resultado_obra: `gestao` não lê lancamentos_financeiros e
      // uma view invoker somaria ZERO para ela em vez de recusar. As colunas
      // `_arvore` são o acumulado da subárvore — é o que o sintético mostra.
      fn_custo_por_centro: {
        Args: { p_de?: string | null; p_ate?: string | null };
        Returns: CustoPorCentroRow[];
      };
      fn_aprovar_plano_obra: { Args: { p_projeto_id: string; p_motivo: string }; Returns: number };
      fn_current_role: { Args: Record<string, never>; Returns: Role };
      fn_has_projeto_access: { Args: { p_projeto_id: string }; Returns: boolean };
      // O seletor de responsável de tarefa. Existe como RPC porque `financeiro`
      // e `campo` não têm policy de select em `profiles` e receberiam uma lista
      // vazia sem erro nenhum — ver 20260808100000_tarefas.sql.
      fn_pessoas_atribuiveis: {
        Args: Record<string, never>;
        Returns: { id: string; full_name: string; role: Role }[];
      };
      // fn_criar_projeto_padrao foi removida do banco em
      // 20260802100004_remove_fn_criar_projeto_padrao.sql — substituída por
      // fn_criar_projeto_from_proposta, que recebe o payload revisado no wizard.
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
      /** Promove a composição AJUSTADA da proposta a item do catálogo. Nunca automática. */
      proposta_item_salvar_no_catalogo: {
        Args: { p_item_id: string };
        Returns: {
          catalogo_insumo_id: string;
          /**
           * false quando o item de topo foi REUSADO por nome+unidade em vez de
           * criado (20260920132733). Antes disso a função inseria sempre, e
           * salvar o mesmo item duas vezes criava dois insumos idênticos.
           */
          item_criado: boolean;
          componentes: number;
          itens_criados: number;
          itens_reusados: number;
          /** O custo na proposta e o custo com que o catálogo ficou — podem divergir. */
          custo_proposta: number;
          custo_catalogo: number;
          /**
           * Preço da proposta ≠ preço já cadastrado. O catálogo NÃO é
           * sobrescrito; a divergência é relatada para a tela dizer o que ficou
           * de fora. Inclui o item de topo desde 20260920132733.
           */
          precos_divergentes: {
            descricao: string;
            preco_proposta: number;
            preco_catalogo: number;
          }[];
          /**
           * Componentes que já estavam na composição do catálogo e NÃO vieram
           * desta proposta. Relatados, nunca apagados: reusar por nome pode
           * alcançar uma composição montada por outra pessoa.
           */
          componentes_extra: {
            descricao: string;
            codigo: string;
            coeficiente: number;
          }[];
        };
      };
      /** Copia para a proposta a composição do item de catálogo que a originou. */
      proposta_item_copiar_composicao_catalogo: {
        Args: { p_item_id: string };
        Returns: number;
      };
      // Devolve só o id: o contrato é relido pela view, que traz os derivados.
      // Irmã da anterior e independente dela — obra e contrato são decisões
      // separadas, e uma obra pode começar antes da assinatura.
      fn_gerar_contrato_from_proposta: {
        Args: { p_proposta_id: string; p_payload?: Record<string, unknown> };
        Returns: string;
      };
      // A escrita em lote do cronograma. Existe porque reordenar irmãos esbarra
      // no `unique (projeto, pai, ordem)` deferrable, que só relaxa DENTRO de
      // uma transação — e o PostgREST abre uma por chamada. `p_versao` é o
      // token de concorrência otimista (max(updated_at) da obra).
      fn_aplicar_cronograma: {
        Args: {
          p_projeto_id: string;
          p_mudancas: Record<string, unknown>;
          p_versao?: string | null;
        };
        Returns: {
          etapas: Database['public']['Views']['v_etapas_cronograma']['Row'][];
          dependencias: EtapaDependenciaRow[];
          versao: string | null;
        };
      };
      // Congela data_inicio/data_fim como linha de base. Devolve o número de
      // etapas carimbadas.
      fn_salvar_baseline: { Args: { p_projeto_id: string }; Returns: number };
      fn_gerar_lancamento_medicao: {
        Args: { p_medicao_id: string; p_conta_id: string; p_pago?: boolean };
        Returns: LancamentoFinanceiroRow;
      };
      // Resultado por obra: razão contra razão. `valor_orcado`/`valor_executado`
      // são contexto de execução e nunca entram nos dois `resultado_*`.
      conta_usos: {
        Args: { p_conta_id: string };
        Returns: {
          nome: string; ativa: boolean; lancamentos: number; saldo_atual: number;
          pode_excluir: boolean; pode_desativar: boolean;
        };
      };
      conta_excluir: {
        Args: { p_conta_id: string };
        Returns: { nome: string; excluida: boolean };
      };
      fn_resultado_obra: {
        Args: Record<string, never>;
        Returns: ResultadoObraRow[];
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
       * As três abaixo são `returns table`, então `Returns` é ARRAY — ao
       * contrário das duas acima, que devolvem jsonb. Todas barram quem não é
       * admin/gestão com exceção, não com lista vazia: silêncio aqui viraria
       * uma composição que parece não ter componentes.
       */
      catalogo_composicao_expandida: {
        Args: { p_id: string };
        Returns: CatalogoLinhaExpandida[];
      };
      catalogo_composicao_agregados: {
        Args: { p_ids: string[] };
        Returns: CatalogoAgregadosComposicao[];
      };
      catalogo_composicao_hh: {
        Args: { p_id: string };
        Returns: CatalogoLinhaHH[];
      };
      /**
       * Travada em admin+gestão, e não em `fn_has_projeto_access` como as
       * policies de `insumos_projeto`: o preço de mão de obra deriva da folha
       * de pagamento, e liberar para `campo` exporia salário.
       */
      obra_explosao_insumos: {
        Args: { p_projeto_id: string };
        Returns: ObraExplosaoInsumo[];
      };
      etapa_hh: {
        Args: { p_etapa_id: string };
        Returns: EtapaHH[];
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
      // Acha-ou-cria o cargo de mão de obra de uma ficha (20260920205835).
      // Devolve o id do insumo — o mesmo para dois colaboradores no mesmo
      // cargo, que é o que mantém a regra do maior custo/hora.
      funcionario_cargo_no_catalogo: {
        Args: { p_cargo: string };
        Returns: string;
      };
      // Grava a tabela de encargos inteira num UPDATE só (20260920201048).
      // Não é `upsert` de propósito: upsert é INSERT ... ON CONFLICT e exigiria
      // privilégio de INSERT, que ninguém tem nesta tabela — rubrica nova entra
      // por migration. O statement único também é exigência de
      // `trg_propaga_custo_rubricas`, que é `for each statement`.
      encargos_rubricas_salvar: {
        Args: {
          p_rubricas: (Pick<EncargosRubricaRow, 'codigo'> &
            Partial<
              Pick<
                EncargosRubricaRow,
                | 'percentual_horista'
                | 'percentual_mensalista'
                | 'aplica_horista'
                | 'aplica_mensalista'
                | 'ativo'
                | 'formula'
              >
            >)[];
        };
        Returns: EncargosRubricaRow[];
      };
    };
  };
}
