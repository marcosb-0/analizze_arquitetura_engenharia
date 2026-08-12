/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StatusTarefa, PrioridadeTarefa } from './lib/database.types';

export type { StatusTarefa, PrioridadeTarefa };

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

/**
 * Onde a seção sai no documento: antes ou depois da tabela de valores.
 *
 * Uma lista só não bastaria — "Condições comerciais" e "Garantia" impressas
 * acima do preço invertem a ordem de leitura de um documento técnico.
 */
export type PosicaoSecao = 'antes' | 'depois';

/** Onde o modelo pode ser usado. `contrato` existe para a fase seguinte. */
export type EscopoModelo = 'proposta' | 'contrato' | 'ambos';

/**
 * Texto reutilizável da empresa: escopo, premissas, exclusões, cláusulas.
 *
 * É MODELO, não texto emitido. Quando entra numa proposta, é COPIADO para uma
 * `SecaoProposta` — editar o modelo depois não altera nenhum documento já
 * emitido, que é exatamente o oposto do que acontecia quando o texto vivia em
 * `empresa_config` e era lido na hora de imprimir.
 */
export interface ModeloTexto {
  id: string;
  titulo: string;
  corpo: string;
  /** O "tipo de obra" (Reforma, Retrofit...). Livre, definido pelo negócio. */
  categoria: string;
  escopo: EscopoModelo;
  posicao: PosicaoSecao;
  ordem: number;
  /** Entra automaticamente em toda proposta nova. */
  padrao: boolean;
  /** Aposentado sai das listas mas segue nomeando a procedência das cópias. */
  ativo: boolean;
}

export type NovoModeloTexto = Omit<ModeloTexto, 'id' | 'ativo'>;

/**
 * Um bloco do descritivo técnico DESTA proposta — o que sai no papel.
 *
 * Nasce copiado dos modelos marcados como padrão (trigger
 * `trg_propostas_semear_secoes`) e daí em diante pertence à proposta.
 */
export interface SecaoProposta {
  id: string;
  propostaId: string;
  titulo: string;
  corpo: string;
  posicao: PosicaoSecao;
  ordem: number;
  /** De qual modelo veio, quando veio de um. Só procedência. */
  modeloId?: string;
}

/** Bloco do descritivo congelado no momento em que a revisão foi registrada. */
export interface SecaoRevisaoProposta {
  titulo: string;
  corpo: string;
  posicao: PosicaoSecao;
  ordem: number;
}

/** Linha congelada do orçamento no momento em que a revisão foi registrada. */
export interface ItemRevisaoProposta {
  /** Procedência, quando veio do catálogo. Serve de chave estável no diff. */
  catalogoInsumoId?: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaCusto;
  quantidade: number;
  precoUnitario: number;
  total: number;
  ordem: number;
}

export interface RevisaoProposta {
  id?: string;
  versao: number;
  data: string;
  /** Total congelado (itens + BDI), ou o valor digitado quando não há itens. */
  valor: number;
  valorItens: number;
  bdiPercentual: number;
  alteracoes: string;
  /**
   * Snapshot da composição. Vazio nas revisões anteriores a
   * 20260725120000_revisao_proposta_snapshot e nas propostas sem itens — a UI
   * cai no comparativo só financeiro nesses casos.
   */
  itens: ItemRevisaoProposta[];
  /**
   * Snapshot do descritivo. Vazio nas revisões anteriores a
   * 20260810100002_revisao_congela_secoes — antes dela, uma revisão que mexia
   * só no texto produzia um congelamento idêntico ao anterior.
   */
  secoes: SecaoRevisaoProposta[];
}

// ============================================================
// Contrato
// ============================================================

/**
 * O ciclo do contrato. `Minuta` é o rascunho; `Emitido` foi para o cliente;
 * `Assinado` tem data de assinatura; `Encerrado` cumpriu ou foi rescindido.
 */
export type StatusContrato = 'Minuta' | 'Emitido' | 'Assinado' | 'Encerrado';

/**
 * O que foi assinado — em oposição à proposta, que é o que foi oferecido.
 *
 * Nasce SEMPRE de uma proposta aprovada, herdando o descritivo negociado como
 * cláusulas, e a partir daí tem vida própria: a proposta pode ser reaberta, o
 * contrato assinado não muda por causa disso.
 */
export interface Contrato {
  id: string;
  numero: string;
  /** A proposta aprovada que o originou. Não há contrato sem ela. */
  propostaId: string;
  /** A obra que executa este contrato, quando já existe. */
  projetoId?: string;
  clienteId: string;
  objeto: string;
  valorTotal: number;
  prazoExecucaoDias?: number;
  dataInicio?: string;
  /** A data que a proposta nunca teve. É ela que separa minuta de assinado. */
  dataAssinatura?: string;
  formaPagamento?: string;
  reajuste?: string;
  indiceReajuste?: string;
  multaPercentual?: number;
  jurosMoraPercentual?: number;
  garantiaMeses?: number;
  foro?: string;
  observacoes?: string;
  status: StatusContrato;
  /** Derivados de v_contratos — só leitura. */
  qtdClausulas: number;
  propostaNumero: string;
}

/**
 * O que a edição do contrato alcança — e não existe payload de criação, porque
 * o cliente não cria contrato: quem o cria é `fn_gerar_contrato_from_proposta`.
 *
 * Fora daqui, de propósito: `propostaId` e `clienteId` (vêm da proposta e mudá-
 * los desligaria o contrato do que foi aceito), `numero` e `status` (do banco e
 * da RPC de situação) e os derivados da view.
 */
export type EdicaoContrato = Omit<
  Contrato,
  'id' | 'numero' | 'qtdClausulas' | 'propostaId' | 'propostaNumero' | 'clienteId' | 'status'
>;

/**
 * Uma cláusula deste contrato.
 *
 * Sem `posicao`, ao contrário de `SecaoProposta`: contrato não tem tabela de
 * valores no meio do texto, então a numeração é corrida da primeira à última.
 */
export interface ClausulaContrato {
  id: string;
  contratoId: string;
  titulo: string;
  corpo: string;
  ordem: number;
  modeloId?: string;
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
  /**
   * O número digitado na criação da proposta. Preservado mesmo enquanto os
   * itens mandam no valor — remover todos os itens devolve a proposta a ele.
   */
  valorManual: number;
  /** Benefícios e Despesas Indiretas, aplicado sobre a soma dos itens. */
  bdiPercentual: number;
  /**
   * No documento impresso, o BDI sai como linha própria (true) ou embutido
   * nos preços unitários (false). O total é o mesmo nos dois casos.
   */
  bdiVisivelPdf: boolean;
  /** Derivados de v_propostas — só leitura. */
  qtdItens: number;
  valorItens: number;
  valorCalculado: number;
  /**
   * Quantas seções do descritivo têm texto. Só a contagem: a lista precisa
   * saber se o descritivo existe, e o texto em si chega quando a proposta abre.
   */
  qtdSecoes: number;
  /**
   * Prazo de execução em dias corridos. Ausente enquanto não for definido —
   * era texto livre ("90 dias", "12 meses", "A definir") e por isso não
   * ordenava, não somava e não virava data de término na conversão em obra.
   */
  prazoExecucaoDias?: number;
  dataValidade: string;
  status: 'Elaboração' | 'Enviada' | 'Aprovada' | 'Rejeitada';
  /** Quando foi enviada ao cliente — mede há quanto tempo espera resposta. */
  dataEnvio?: string;
  /** Por que o cliente recusou. */
  motivoRejeicao?: string;
  revisoes: RevisaoProposta[];
}

/**
 * Payload de criação. `numero` não entra: quem numera é o banco
 * (trg_propostas_set_numero), por ano e sem reaproveitar número excluído.
 * `valorEstimado` também fica de fora — é derivado; o que se digita é
 * `valorManual`. Os demais campos de v_propostas são só leitura.
 */
export type NovaProposta = Omit<
  Proposta,
  | 'numero'
  | 'revisoes'
  | 'qtdItens'
  | 'valorItens'
  | 'valorCalculado'
  | 'qtdSecoes'
  | 'valorEstimado'
  // Escolha de apresentação do documento, feita na hora de emitir e não no
  // cadastro. Nasce visível, como sempre foi.
  | 'bdiVisivelPdf'
>;

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

/**
 * Campos de planejamento editáveis de uma obra. `situacao` fica de fora: tem
 * caminho próprio (com a confirmação de avanço incompleto ao finalizar).
 */
export interface EdicaoObra {
  nome?: string;
  clienteId?: string;
  responsavelInternoId?: string;
  enderecoObra?: string;
  dataInicio?: string;
  dataFim?: string;
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

/** Uma etapa automática segue as predecessoras; uma manual foi fixada à mão. */
export type ModoAgendamento = 'manual' | 'automatico';

export interface EtapaCronograma {
  id: string;
  projetoId: string;
  nome: EtapaNome | string;
  dataInicio: string;
  dataFim: string;
  responsavelId: string; // ID do Funcionário
  percentualExecutado: number; // derivado das medições — não editável diretamente
  status: StatusEtapa; // derivado das medições — não editável diretamente

  // --- Meta quantitativa (20260815100000) ---
  /**
   * Quanto a etapa tem para executar, na sua própria unidade (200 m² de
   * reboco). Ausente = a etapa é medida em percentual, como antes — o modo é
   * híbrido de propósito, porque "Mobilização" não tem unidade nenhuma.
   *
   * Anda em par com `unidade`: as duas presentes ou as duas ausentes.
   */
  quantidadePrevista?: number;
  unidade?: string;
  /**
   * Soma das quantidades já APROVADAS. Derivada na view e não clampada: um
   * overrun tem que aparecer, do mesmo jeito que aparece em `valorExecutado`.
   */
  quantidadeExecutada: number;

  // --- EAP (20260809100000) ---
  /** Etapa-grupo à qual esta pertence. String vazia = raiz. */
  parentId: string;
  /** Posição entre os irmãos, densa e começando em 1. */
  ordem: number;
  ehMarco: boolean;
  agendamento: ModoAgendamento;
  baselineInicio: string;
  baselineFim: string;
  /** Quando a linha de base vigente foi salva. Vazio = nunca. */
  baselineEm: string;

  // --- Derivados da árvore, resolvidos em v_etapas_cronograma ---
  /** 0 na raiz. */
  nivel: number;
  /** Código da EAP: "1", "1.2", "1.2.3". Derivado, nunca armazenado. */
  wbsCodigo: string;
  /**
   * Só a folha é unidade de trabalho: ela vincula orçamento, recebe medição e
   * entra nos agregados. Grupo é soma — ver fn_execucao_so_em_folha.
   */
  ehFolha: boolean;
  /** Datas do grupo roladas dos descendentes; na folha, as próprias. */
  inicioEfetivo: string;
  fimEfetivo: string;
  /**
   * Carimbo da última escrita, mantido pela trigger `trg_set_updated_at`.
   *
   * Está aqui por um motivo só: o maior deles na obra é o token de concorrência
   * otimista de `fn_aplicar_cronograma`. Sem ele, dois planejadores na mesma
   * obra se sobrescrevem em silêncio — cada um manda um diff calculado sobre um
   * estado que o outro já mudou, e o último a salvar vence sem que ninguém veja.
   */
  updatedAt: string;
}

/**
 * Campos editáveis de uma etapa. `percentualExecutado` e `status` ficam de fora
 * porque são derivados das medições (v_etapas_cronograma) e não têm caminho de
 * escrita.
 *
 * `parentId` e `ordem` também ficam de fora, e por outro motivo: mover uma etapa
 * na EAP renumera os irmãos, e o `unique` de (projeto, pai, ordem) é deferrable
 * — as N linhas só podem ser gravadas na MESMA transação. Esse caminho é
 * `cronogramaService.aplicar`.
 */
export interface EdicaoEtapa {
  nome?: string;
  dataInicio?: string;
  dataFim?: string;
  responsavelId?: string;
  ehMarco?: boolean;
  agendamento?: ModoAgendamento;
  /**
   * `null` LIMPA a meta e devolve a etapa ao modo percentual; `undefined` é "não
   * mexer", como nos demais campos. A distinção existe porque as duas ações são
   * pedidas pela mesma tela, e `0` não serve como sinal — a constraint recusa
   * quantidade zero.
   */
  quantidadePrevista?: number | null;
  unidade?: string | null;
}

/**
 * O tipo de vínculo entre duas atividades.
 *
 * FS (fim→início) é o caso comum: a sucessora só começa quando a predecessora
 * termina. SS começam juntas, FF terminam juntas, SF existe por completude.
 */
export type TipoDependencia = 'FS' | 'SS' | 'FF' | 'SF';

export interface Dependencia {
  id: string;
  projetoId: string;
  predecessoraId: string;
  sucessoraId: string;
  tipo: TipoDependencia;
  /** Atraso (positivo) ou antecipação (negativo), em dias úteis. */
  atrasoDias: number;
}

/** Uma linha da EAP reposicionada. Ver `src/lib/cronograma/reordenar.ts`. */
export interface PatchOrdem {
  id: string;
  parentId: string | null;
  ordem: number;
}

/** Uma etapa reagendada pelo motor ou pelo arraste. */
export interface PatchDatas {
  id: string;
  dataInicio: string | null;
  dataFim: string | null;
  agendamento?: ModoAgendamento;
  ehMarco?: boolean;
}

/**
 * O diff que `fn_aplicar_cronograma` aplica numa transação só. Arrastar uma
 * barra produz uma etapa movida mais N sucessoras reagendadas: gravar isso em
 * chamadas separadas deixaria o cronograma com uma ligação que as datas
 * contradizem, caso a segunda falhe.
 */
export interface MudancasCronograma {
  etapas?: PatchDatas[];
  ordens?: PatchOrdem[];
  depCriadas?: Dependencia[];
  /** Ids de `etapa_dependencia`. */
  depRemovidas?: string[];
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
  status: 'Ativo' | 'Inativo';
  observacoes: string;
  salarioBase?: number;
  /**
   * Para onde o salário é transferido. A folha calculava o valor e registrava
   * o lançamento, mas o dado que executa o pagamento vivia fora do sistema.
   */
  dadosPagamento: DadosPagamento;
  /**
   * Insumo de mão de obra do catálogo correspondente ao cargo (PEDREIRO,
   * SERVENTE...). `cargo` é texto livre e não cruza com nada; este vínculo é o
   * que permite comparar o HH apontado com o coeficiente da composição e
   * derivar o custo/hora real a partir da folha. Ausente = não é mão de obra
   * direta (administrativo, engenharia).
   */
  catalogoMaoDeObraId?: string;
  /**
   * Encargos sociais desta pessoa, em %. Ausente = herda o percentual da
   * empresa (`EmpresaConfig.encargosSociaisPercentual`). Nunca ler como 0:
   * ausente nos dois níveis significa "não sei", e o custo/hora não existe.
   */
  encargosPercentual?: number;
  /**
   * Horas trabalhadas por mês. Ausente = herda a jornada da empresa (220 h).
   * É o divisor do custo/hora, e é o que separa meio período de integral.
   */
  jornadaMensalHoras?: number;
  /**
   * O que a empresa paga além do salário. Sempre presente como objeto (mesmo
   * padrão de `dadosPagamento`); cada valor ausente é "não recebe" e soma
   * zero — aqui, ao contrário dos encargos, não há o que herdar da empresa.
   */
  beneficios: Beneficios;
}

export interface Beneficios {
  valeTransporte?: number;
  valeAlimentacao?: number;
  planoSaude?: number;
  outros?: number;
}

export type TipoChavePix = 'CPF' | 'CNPJ' | 'E-mail' | 'Telefone' | 'Aleatória';
export type TipoConta = 'Corrente' | 'Poupança' | 'Pagamento';

export interface DadosPagamento {
  pixTipo?: TipoChavePix;
  pixChave?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: TipoConta;
  /** Só quando a conta não é do próprio colaborador (cônjuge, MEI). */
  titular?: string;
}

/**
 * Arquivo real (Storage) anexado à ficha do colaborador. `validade` cobre
 * ASO e treinamentos de NR, que vencem e precisam ser reapresentados.
 */
export interface FuncionarioDocumento {
  id: string;
  funcionarioId: string;
  nome: string;
  contentType: string;
  tamanho: string;
  storagePath: string;
  validade?: string; // 'YYYY-MM-DD'; ausente = documento sem vencimento
  criadoEm: string;
}

export type SituacaoValidade = 'sem-validade' | 'vigente' | 'a-vencer' | 'vencido';

export type StatusMedicao = 'Pendente' | 'Aprovada' | 'Rejeitada';

/**
 * Foto do boletim. Guarda o `storage_path` além do nome: sem ele a tela só
 * conseguia listar nomes de arquivo, nunca exibir a imagem.
 */
export interface FotoMedicao {
  nome: string;
  storagePath: string;
}

export interface MedicaoObra {
  id: string;
  projetoId: string;
  dataMedicao: string;
  etapaId: string; // vinculada ao cronograma
  percentualMedido: number; // percentual medido desta vez
  /**
   * Quanto foi executado neste boletim, na unidade da etapa. Ausente quando a
   * etapa não tem meta — aí `percentualMedido` foi digitado direto.
   *
   * Quando está presente, `percentualMedido` é DERIVADO dela pelo servidor
   * (fn_medicao_deriva_percentual): quantidade é a entrada, percentual continua
   * sendo a fonte de verdade a jusante.
   */
  quantidadeMedida?: number;
  valorMedido: number; // valor financeiro medido nesta vez (só após aprovação)
  fotos: FotoMedicao[];
  observacoes: string;
  status: StatusMedicao; // Pendente até admin/gestão aprovar; fan-out só na aprovação
  /**
   * Justificativa da recusa. Ausente enquanto o boletim não foi rejeitado e nas
   * rejeições feitas antes da coluna existir.
   */
  motivoRejeicao?: string;
  aprovadoPor?: string;
  aprovadoEm?: string;
}

/**
 * O boletim que sai do formulário, antes de o servidor derivar o que falta.
 *
 * União discriminada, e não dois campos opcionais: a etapa é medida em
 * quantidade OU em percentual, nunca nos dois, e mandar ambos faria o trigger
 * ignorar um deles em silêncio. O tipo é que impede o formulário de tentar.
 *
 * Mora aqui, e não no modal, porque o mesmo literal estava copiado em CINCO
 * lugares (`AcoesContext` duas vezes, `useMedicoes`, `medicoesService` e o
 * próprio modal) — cinco chances de acrescentar um campo em quatro deles.
 */
interface BaseNovaMedicao {
  projetoId: string;
  etapaId: string;
  observacoes: string;
}

export type NovaMedicao = BaseNovaMedicao &
  (
    | { percentualMedido: number; quantidadeMedida?: undefined }
    | { quantidadeMedida: number; percentualMedido?: undefined }
  );

export const CORES_CATEGORIA_DOCUMENTO = ['rose', 'orange', 'amber', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'purple', 'pink', 'slate'] as const;
export type CorCategoriaDocumento = typeof CORES_CATEGORIA_DOCUMENTO[number];

/**
 * Dono do documento, e por consequência a tela em que ele vive: 'empresa' na
 * aba Documentos, 'obra' no console da obra. Documento de funcionário e de
 * cliente não passam por aqui — moram em FuncionarioDocumento e
 * ClienteDocumento, nas respectivas fichas.
 */
export type EscopoDocumento = 'empresa' | 'obra';

export interface DocumentoCategoria {
  id: string;
  nome: string;
  cor: CorCategoriaDocumento;
  escopo: EscopoDocumento;
  createdAt: string;
}

export interface DocumentoVersao {
  versao: string;
  autor: string;
  data: string;
  descricao: string;
  storagePath: string;
  contentType?: string;
  /** 'YYYY-MM-DD'; ausente = esta emissão não vence. */
  validade?: string;
}

export interface Documento {
  id: string;
  nome: string;
  tipo: string;
  /** Nulo = documento da empresa; preenchido = documento daquela obra. */
  projetoId: string | null;
  dataCriacao: string;
  versao: string;
  /** Soma de TODAS as versões — é o que o documento ocupa no bucket. Número, e
   *  não string formatada, porque a tela precisa somar isso. */
  tamanhoBytes: number;
  /** Espelham a versão mais recente — a "atual" do documento. */
  contentType?: string;
  validade?: string;
  historicoVersoes?: DocumentoVersao[];
}

/**
 * 'Composicao' = preço derivado da lista de componentes. Nunca é escolhida pelo
 * usuário: o banco a impõe assim que a composição tem componentes.
 */
export type FontePreco = 'SINAPI' | 'Fornecedor' | 'Manual' | 'Composicao';

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

/**
 * Um componente dentro de uma composição. `coeficiente` é a quantidade do
 * insumo por UMA unidade da composição (0,35 sc de cimento por m² de alvenaria).
 *
 * O insumo referenciado pode ser ele mesmo uma composição — composição auxiliar,
 * como no SINAPI. Nesse caso o preço dele já é o custo derivado, então
 * `custoTotal` vale em qualquer nível.
 */
export interface ComponenteComposicao {
  id: string;
  composicaoId: string;
  insumoId: string;
  coeficiente: number;
  /**
   * Coeficiente publicado pelo SINAPI na adoção. Ausente = índice próprio.
   * Diferente de `coeficiente` = ajustado pela produtividade da equipe, e
   * `observacao` diz por quê. Não entra em cálculo: existe para a tela mostrar
   * a distância contra o publicado e oferecer o retorno a ele.
   */
  coeficienteReferencia?: number;
  observacao?: string;
  /** Vindos de v_composicao_itens — só leitura. */
  insumoDescricao: string;
  insumoUnidade: string;
  insumoCategoria: InsumoCatalogo['categoria'];
  insumoTipoItem: InsumoCatalogo['tipoItem'];
  insumoCodigoSINAPI?: string;
  /** Preço ARMAZENADO no cadastro do insumo — não é o que entra na conta. */
  insumoPrecoReferencia: number;
  insumoAtivo: boolean;
  /**
   * Preço vigente pela cadeia de 4 níveis, e a base real de `custoTotal`.
   * Para exibir "coeficiente × preço" use ESTE, não `insumoPrecoReferencia`:
   * um insumo com cotação ativa tem os dois diferentes, e mostrar o de
   * cadastro faz a multiplicação da tela não fechar com o custo ao lado.
   */
  insumoPrecoVigente: number;
  insumoPrecoNivel: NivelPreco;
  insumoPrecoFonte: FonteEfetivaPreco;
  /** coeficiente × insumoPrecoVigente. */
  custoTotal: number;
}

/**
 * Uma linha da árvore analítica de uma composição, já expandida até as folhas.
 *
 * REGRA QUE NÃO PODE SER ESQUECIDA: só somar linhas com `ehFolha`. A linha de
 * uma subcomposição carrega o subtotal da subárvore dela, para a tela poder
 * explicar de onde vêm os R$ 2,15 da argamassa — somá-la junto das folhas
 * conta o mesmo dinheiro duas vezes.
 */
export interface LinhaComposicaoExpandida {
  nivel: number;
  /** Chave de travessia da árvore; o servidor já devolve ordenado por ela. */
  ordem: string[];
  /** Ids do topo até este nó. O prefixo identifica a subárvore. */
  caminho: string[];
  componenteId: string;
  paiId: string;
  insumoId: string;
  descricao: string;
  codigoSINAPI?: string;
  unidade: string;
  categoria: InsumoCatalogo['categoria'];
  tipoItem: InsumoCatalogo['tipoItem'];
  ativo: boolean;
  /** Motivo do ajuste de índice. */
  observacao?: string;
  coeficiente: number;
  /** Índice publicado pelo SINAPI; ausente quando o índice é próprio. */
  coeficienteReferencia?: number;
  /** Produto dos coeficientes do caminho: quanto deste insumo por 1 un. do topo. */
  coefAcumulado: number;
  ehFolha: boolean;
  /** Mão de obra medida em hora — é o que entra no HH. */
  ehHora: boolean;
  precoUnitario: number;
  precoNivel: NivelPreco;
  precoFonte: FonteEfetivaPreco;
  custo: number;
}

/**
 * HH e quebra de custo de uma composição, calculados no banco.
 *
 * Percentuais não vêm daqui de propósito: são `custoCategoria / custoTotal`,
 * divisão de dois números que já estão neste objeto. Uma terceira cópia do
 * mesmo dado é uma terceira chance de divergir.
 */
export interface AgregadosComposicao {
  composicaoId: string;
  custoTotal: number;
  /** Horas de mão de obra por UMA unidade da composição. */
  hhPorUnidade: number;
  /** MO fora de hora (mensalista, empreitada): entra no custo, não no HH. */
  hhForaDeHora: number;
  custoMaoDeObra: number;
  custoMaterial: number;
  custoEquipamento: number;
  custoServico: number;
  custoTaxa: number;
  qtdFolhas: number;
  folhasSemPreco: number;
  folhasInativas: number;
  profundidade: number;
}

/**
 * Uma linha do consumo real de insumos da obra — a composição já explodida
 * até o insumo final e somada com as outras linhas do orçamento.
 *
 * `custo` é a PREÇO DE HOJE, não com o preço congelado no orçamento: a
 * pergunta aqui é "quanto vou gastar para comprar isto", que é diferente de
 * "com que preço isto foi orçado".
 */
export interface LinhaExplosaoInsumo {
  insumoId: string;
  descricao: string;
  unidade: string;
  categoria: InsumoCatalogo['categoria'];
  quantidade: number;
  precoUnitario: number;
  precoFonte: FonteEfetivaPreco;
  custo: number;
  /** Horas, quando é mão de obra medida em hora; 0 nos demais. */
  hh: number;
  participacao: number;
  custoAcumulado: number;
  /** A concentra 80% do custo, B vai até 95%, C é a cauda. */
  classeAbc: 'A' | 'B' | 'C';
  /** Quantas linhas do orçamento consomem este insumo. */
  origens: number;
}

/**
 * HH previsto de uma etapa do cronograma.
 *
 * `origem` diz de onde veio o número, e a tela DEVE mostrar isso:
 * - `direto`: há insumo amarrado à etapa (`etapa_vinculada_id`). Preciso.
 * - `ponderado`: rateio pelo `peso_percentual` do vínculo com o orçamento.
 *   Aproximado por construção — o peso reparte valor, não hora.
 * - `vazio`: nada vinculado.
 */
export interface HHDaEtapa {
  hhTotal: number;
  custoMaoDeObra: number;
  custoTotal: number;
  origem: 'direto' | 'ponderado' | 'vazio';
  insumosComHH: number;
  /** Insumos que não têm mão de obra em hora — o HH não os cobre. */
  insumosSemHH: number;
  hhPorCargo: { insumoId: string; descricao: string; unidade: string; horas: number; custo: number }[];
}

/** Mão de obra de uma composição, agrupada por cargo. */
export interface LinhaHH {
  insumoId: string;
  descricao: string;
  unidade: string;
  ehHora: boolean;
  coefAcumulado: number;
  precoUnitario: number;
  precoFonte: FonteEfetivaPreco;
  custo: number;
  /** Zero = este cargo é orçado pelo SINAPI, não pela sua folha. */
  funcionariosVinculados: number;
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
  /**
   * Componentes da composição. Carregados sob demanda junto do histórico
   * (drawer de detalhe), pelo mesmo motivo: a lista de todos os itens não cabe
   * numa resposta só.
   */
  componentes?: ComponenteComposicao[];
  /** Derivados de v_catalogo_insumos — só leitura. */
  obrasUtilizando: number;
  pontosHistorico: number;
  qtdComponentes: number;
  usadoEmComposicoes: number;
  /**
   * HH e quebra de custo, expandidos até as folhas. Presente só em composição
   * POVOADA — `list()` só pede os agregados para os ids que têm componentes,
   * porque a RPC expande árvore recursivamente e pedi-la para insumo simples
   * seria uma ida ao servidor que volta vazia por construção.
   */
  agregados?: AgregadosComposicao;
  /**
   * Há insumo desativado dentro desta composição. Não é proibido — o preço dele
   * continua entrando na conta — mas a tela precisa avisar.
   */
  temComponenteInativo: boolean;
  /**
   * Cadeia de preço resolvida pelo banco (fn_preco_vigente, 20260726230000).
   *
   * `precoReferencia` é o preço GRAVADO no item; `precoVigente` é quanto ele
   * vale de fato hoje, considerando cotação e histórico. Os dois divergem
   * sempre que existe cotação — e é `precoVigente` que entra no custo das
   * composições e no orçamento.
   *
   * Nível: 1 cotação vigente · 2 praticado (cotação vencida ou histórico de
   * fornecedor) · 3 estimado (digitado) · 4 referência SINAPI.
   */
  precoVigente: number;
  precoNivel: NivelPreco;
  precoFonteEfetiva: FonteEfetivaPreco;
  /** Fornecedor da cotação vencedora; ausente quando o preço não veio de uma. */
  precoFornecedorId?: string;
  precoDataOrigem?: string;
  /** Dias desde a origem do preço. A idade não rebaixa o nível — só informa. */
  precoDiasIdade?: number;
}

export type NivelPreco = 1 | 2 | 3 | 4;
/**
 * `Folha` e `Cotação` são as duas fontes do nível 1 — preço firme, contratado.
 * Folha só aparece em insumo de mão de obra com funcionário ativo vinculado e
 * encargos configurados em `empresa_config`, e vem ANTES da cotação: o salário
 * é pago com ou sem a obra, e uma cotação de empreiteiro mais barata é uma
 * decisão diferente (terceirizar), não um preço melhor para o mesmo insumo.
 */
export type FonteEfetivaPreco = 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência';

// ============================================================
// Base de referência SINAPI
// ============================================================
// Dado público, somente leitura, num schema separado (`referencia`) e NUNCA alvo
// de FK. Nada aqui entra num orçamento diretamente: o que a empresa usa é
// ADOTADO, isto é, copiado para `InsumoCatalogo`. Ver 20260730100000.

/** SD = sem desoneração, CD = com desoneração, SE = sem encargos sociais. */
export type RegimeSINAPI = 'SD' | 'CD' | 'SE';

/**
 * Só SD e CD podem ser adotados: `catalogo_insumos.desonerado` é booleano e não
 * representa "sem encargos sociais".
 */
export type RegimeAdotavel = 'SD' | 'CD';

export const REGIMES_SINAPI: { valor: RegimeSINAPI; rotulo: string; adotavel: boolean }[] = [
  { valor: 'SD', rotulo: 'Sem desoneração', adotavel: true },
  { valor: 'CD', rotulo: 'Com desoneração', adotavel: true },
  { valor: 'SE', rotulo: 'Sem encargos sociais', adotavel: false },
];

export interface PublicacaoSINAPI {
  id: number;
  /** Primeiro dia do mês, como o banco devolve (ex.: '2026-06-01'). */
  mesReferencia: string;
  dataEmissao: string;
  vigente: boolean;
}

export interface ResultadoSINAPI {
  codigo: number;
  tipo: 'INSUMO' | 'COMPOSICAO';
  descricao: string;
  unidade?: string;
  /** Classificação (insumo) ou Grupo (composição). */
  grupo?: string;
  /** Nulo quando o SINAPI não publica preço nesta UF/regime — não é zero. */
  preco: number | null;
  /** 'SEM CUSTO' = o SINAPI não calculou custo para esta composição. */
  situacao?: string;
  qtdComponentes: number;
  /**
   * Já está no catálogo com a MESMA chave (código, UF, mês, desonerado). Adotar
   * de novo é inofensivo — reusa —, mas a tela avisa antes do clique.
   */
  jaAdotado: boolean;
}

/** Uma linha do detalhamento de uma composição do SINAPI. */
export interface LinhaCustoSINAPI {
  /** 1 = componente direto. SÓ o nível 1 soma o custo publicado. */
  nivel: number;
  item: number;
  descricao: string;
  unidade?: string;
  tipo: 'INSUMO' | 'COMPOSICAO';
  coeficiente: number;
  coefAcumulado: number;
  precoUnitario: number | null;
  custo: number | null;
}

/** O que a adoção devolve. Os dois custos vêm para a tela poder comparar. */
export interface ResultadoAdocao {
  insumoId: string;
  codigo: number;
  descricao: string;
  modo: 'item' | 'expandido';
  jaExistia: boolean;
  itensCriados: number;
  itensReusados: number;
  ignorados: { codigo: number; descricao: string; motivo: string }[];
  custoSinapi: number | null;
  /** No modo expandido é o preço derivado pelo gatilho, não o oficial. */
  custoCatalogo: number;
  /** Positivo = o catálogo ficou acima do SINAPI. Centavos, por arredondamento. */
  diferenca: number | null;
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
  /**
   * Firmeza do preço no momento em que a base foi congelada (20260726234500).
   * Ausente nas linhas anteriores ao rastreamento — que NÃO é o mesmo que
   * "referência": é "não sabemos".
   */
  precoNivel?: NivelPreco;
  precoFonteEfetiva?: FonteEfetivaPreco;
  precoDataOrigem?: string;
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
  /**
   * Conta inativa sai dos seletores e do total em caixa, mas continua nomeando
   * os lançamentos históricos dela. Desativar exige saldo zero — regra do banco
   * (trg_conta_valida_desativacao), não da tela.
   */
  ativa: boolean;
}

export type RoleAcesso = 'admin' | 'gestao' | 'financeiro' | 'campo';

export interface Acesso {
  id: string;
  email: string;
  fullName: string;
  role: RoleAcesso;
  funcionarioId?: string;
  active: boolean;
  /**
   * Quando um admin liberou este acesso pela primeira vez; ausente = nunca
   * liberado. É o que separa as duas leituras de `active: false` — quem está na
   * FILA (cadastro novo, desde 20260812190802) de quem foi REVOGADO. A tela
   * chamava os dois de "Revogado".
   */
  aprovadoEm?: string;
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

/**
 * Tarefa do dia a dia da empresa (20260808100000).
 *
 * `StatusTarefa` e `PrioridadeTarefa` são IMPORTADOS de database.types em vez de
 * redeclarados aqui como `RoleAcesso` faz com `Role`. Aquela duplicata é dívida
 * conhecida — as colunas do kanban não vão nascer com uma segunda cópia que o
 * dia da coluna nova deixa para trás.
 */
export interface Tarefa {
  id: string;
  titulo: string;
  descricao?: string;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  /** Sem responsável = "sem dono", que a tela mostra como convite a atribuir. */
  responsavelId?: string;
  criadoPor: string;
  /** Ausente = tarefa da empresa. Presente = tarefa daquela obra. */
  projetoId?: string;
  /**
   * `YYYY-MM-DD`. Compare como STRING (`prazo <= hojeISO()`) e exiba com
   * `formatarDataBR` — `new Date(prazo)` volta um dia no fuso do Brasil.
   */
  prazo?: string;
  /** Instante em que foi para "Concluída". Só o banco escreve. */
  concluidaEm?: string;
  createdAt: string;
}

/** Uma pessoa que pode receber tarefa — vem de `fn_pessoas_atribuiveis()`. */
export interface PessoaAtribuivel {
  id: string;
  /** Já resolvido no banco: nome, ou o e-mail quando o cadastro não tem nome. */
  nome: string;
  role: RoleAcesso;
}

export interface LancamentoFinanceiro {
  id: string;
  tipo: 'Receita' | 'Despesa';
  descricao: string;
  valor: number;
  data: string;
  /** Vencimento (YYYY-MM-DD). Nunca vazio: no banco é NOT NULL e nasce igual a `data`. */
  dataVencimento: string;
  categoria: 'Salários' | 'Fornecedores' | 'Aluguel Escritório' | 'Energia/Água/Internet' | 'Marketing/Vendas' | 'Impostos/Taxas' | 'Ferramentas/EPIs' | 'Aporte Capital' | 'Faturamento Obra' | 'Rendimento' | 'Outros';
  pago: boolean;
  contaId: string;
  projetoId?: string; // Vinculado a uma Obra opcionalmente
  funcionarioId?: string; // Vinculado a um funcionário (Ex: Salário) opcionalmente
  fornecedorId?: string; // Vinculado a um fornecedor opcionalmente
  competencia?: string; // YYYY-MM, usado para folha de pagamento (fix #7)
  medicaoId?: string; // Medição que originou o lançamento (faturamento de obra)
}

/**
 * Resultado financeiro de uma obra, calculado no servidor (fn_resultado_obra).
 *
 * Os dois `resultado*` vêm SÓ do razão — dinheiro que entrou contra dinheiro que
 * saiu. `valorOrcado` e `valorExecutado` são contexto de execução física e nunca
 * entram na conta: `despesaLancada` (saída real) e `valorExecutado` (valor de
 * orçamento correspondente ao avanço medido) são medidas diferentes do mesmo
 * custo, e somá-las contaria custo em dobro.
 *
 * `propostaValor`/`bdiPercentual` existem para a tela conseguir explicar margem
 * zero: o faturamento por medição deriva de `itens_orcamento.valor_orcado`, que
 * é custo quando o item tem insumos vinculados — o BDI da proposta não chega ao
 * razão por esse caminho.
 */
export interface ResultadoObra {
  projetoId: string;
  projetoNome: string;
  situacao: string;
  clienteNome?: string;
  propostaValor?: number;
  bdiPercentual?: number;
  valorOrcado: number;
  valorExecutado: number;
  receitaFaturada: number;
  receitaRecebida: number;
  despesaLancada: number;
  despesaPaga: number;
  aFaturar: number;
  resultadoCompetencia: number;
  resultadoCaixa: number;
}

/**
 * Identidade da empresa impressa nas propostas. Vive no banco (empresa_config,
 * linha única) porque antes era constante de código: trocar um telefone no
 * documento entregue ao cliente exigia deploy, e logotipo não existia.
 */
export interface EmpresaConfig {
  id: string;
  razaoSocial: string;
  cnpj: string;
  crea: string;
  endereco: string;
  telefone: string;
  email: string;
  site: string;
  responsavelTecnico: string;
  /**
   * Parâmetros de custo-hora da mão de obra própria (20260810121000). Não são
   * timbre — são o que converte salário da folha em preço por hora e destrava a
   * fonte `Folha` da cadeia de preço. Moram aqui porque `empresa_config` é linha
   * única, e um segundo editor dela criaria duas telas escrevendo por cima.
   *
   * `null` em encargos significa NÃO CONFIGURADO, e desliga a fonte `Folha`.
   * Nunca substituir por 0: são coisas diferentes, e o 0 mentiria em silêncio.
   */
  encargosSociaisPercentual: number | null;
  jornadaMensalHoras: number;
  jornadaDiariaHoras: number;
  /*
   * `textoEscopo` e `condicoes[]` saíram daqui em 20260810100000. Eram lidos ao
   * vivo na impressão, então toda proposta saía com o mesmo texto e editá-los
   * reescrevia retroativamente documento já entregue ao cliente. Viraram
   * `ModeloTexto`, e o que a proposta imprime é a cópia dela (`SecaoProposta`).
   * O que restou aqui é só o timbre: quem emite, não o que se promete.
   */
  /** Caminho no bucket `empresa`; vazio quando não há logo. */
  logoPath: string;
  /** URL pública derivada de `logoPath` — não persistida. */
  logoUrl: string;
}

// ============================================================
// Confiança de preço do orçamento
// ============================================================

/**
 * Uma fatia do orçamento agrupada pela firmeza do preço que a originou
 * (v_confianca_orcamento_obra / v_confianca_proposta, 20260726234500).
 *
 * `nivel` 0 = linha anterior ao rastreamento de procedência. Não é o mesmo que
 * "referência": é "não sabemos", e misturar as duas coisas inventaria história.
 */
export interface FatiaConfiancaPreco {
  nivel: 0 | NivelPreco;
  fonte: FonteEfetivaPreco | 'Sem procedência';
  itens: number;
  valor: number;
  idadeMediaDias?: number;
}

// ============================================================
// Resumo por obra — o §4.2 agregado no servidor
// ============================================================

/**
 * Uma linha de `v_resumo_obra` (migração 20260804110000).
 *
 * Existe para que o painel e a lista de obras parem de baixar orçamento,
 * cronograma, vínculos e medições de TODAS as obras só para somar. Os números
 * são os mesmos que a conta no cliente dava — a view é `security_invoker` e lê
 * exatamente as mesmas views, então o que este papel enxerga não muda.
 *
 * `avancoFisico` é `calcularAvancoFisico` de `lib/avanco.ts` feito em SQL. Se as
 * duas implementações divergirem, a mesma obra volta a aparecer com dois números
 * em duas telas — que é o defeito que aquele arquivo existe para ter matado.
 */
export interface ResumoObra {
  projetoId: string;
  itensTotal: number;
  valorOrcado: number;
  valorContratado: number;
  valorExecutado: number;
  etapasTotal: number;
  etapasAtrasadas: number;
  etapasConcluidas: number;
  /** 0 a 100, ponderado pelo orçado que cada etapa consome. */
  avancoFisico: number;
  medicoesTotal: number;
  medicoesPendentes: number;
}

/** Categoria estourada de uma obra (`v_desvio_categoria_obra`). Já vem filtrada. */
export interface DesvioCategoria {
  projetoId: string;
  categoria: CategoriaCusto;
  planejado: number;
  executado: number;
  excesso: number;
}

/**
 * Atividade com prazo vencido (`v_etapa_atrasada`).
 *
 * `diasAtraso` vem pronto do servidor de propósito: `dataFim` é coluna `date`, e
 * calcular a diferença no cliente com `new Date()` erra um dia por fuso — a
 * armadilha que já pegou 9 telas apesar de `formatarDataBR` existir.
 */
export interface EtapaAtrasada {
  etapaId: string;
  projetoId: string;
  etapaNome: string;
  dataFim: string;
  diasAtraso: number;
}

/**
 * Boletim para o feed do painel (`v_medicao_recente`), com o nome da etapa e o
 * valor já somado. Sem ele, mostrar TRÊS boletins custava três tabelas inteiras.
 */
export interface MedicaoRecente {
  id: string;
  projetoId: string;
  etapaId: string;
  /** Null quando a etapa foi apagada; a tela mostra "Geral". */
  etapaNome?: string;
  dataMedicao: string;
  percentualMedido: number;
  /** Presentes juntas quando a etapa tem meta: "+2 m²" em vez de "+1,6667%". */
  quantidadeMedida?: number;
  unidade?: string;
  valorMedido: number;
  observacoes: string;
  status: StatusMedicao;
}
