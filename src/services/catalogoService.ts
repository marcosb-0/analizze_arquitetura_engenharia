import { supabase } from '../lib/supabaseClient';
import { garantirEscrita, semPermissao } from './escrita';
import { InsumoCatalogo, CotacaoFornecedor, PontoHistoricoPreco, ComponenteComposicao } from '../types';
import { normalizaBusca } from '../lib/preco';

/**
 * Catálogo de insumos.
 *
 * Duas mudanças estruturais em relação à versão anterior:
 *
 * 1. A listagem é PAGINADA e não traz mais o histórico de preços. Antes, cada
 *    montagem da tela puxava três tabelas inteiras sem limite — e o PostgREST
 *    corta em 1000 linhas SEM erro, o que truncava a série histórica em
 *    silêncio e desenhava gráficos errados. O histórico agora vem sob demanda,
 *    por insumo, em `carregarDetalhe`.
 *
 * 2. Nada aqui escreve em catalogo_historico_precos. A trigger
 *    trg_log_preco_catalogo grava a série a cada mudança de preco_referencia,
 *    de modo que nenhum caminho de escrita consegue pular o histórico.
 *
 * 3. Composição não tem preço próprio. `preco_referencia` de um item com
 *    componentes é SEMPRE recalculado pelo banco (Σ coeficiente × preço, com
 *    composições auxiliares expandidas até as folhas). Toda função daqui que
 *    mexe em componente relê a composição do servidor em vez de calcular o
 *    preço novo no cliente — duas contas paralelas divergiriam na primeira
 *    diferença de arredondamento.
 */

/** Teto por página. O PostgREST corta em 1000 de qualquer jeito; ser explícito evita truncamento invisível. */
export const CATALOGO_PAGINA = 60;

type LinhaCatalogo = {
  id: string; codigo_sinapi: string | null; descricao: string; unidade: string; preco_referencia: number;
  categoria: InsumoCatalogo['categoria']; tipo: InsumoCatalogo['tipo']; tipo_item: InsumoCatalogo['tipoItem'];
  preco_fonte: InsumoCatalogo['precoFonte']; uf: string | null; mes_referencia: string | null;
  desonerado: boolean | null; fornecedor_padrao_id: string | null; composicao: string | null;
  aplicacao: string | null; ativo: boolean; data_atualizacao_preco: string;
  obras_utilizando?: number; pontos_historico?: number;
  qtd_componentes?: number; usado_em_composicoes?: number; tem_componente_inativo?: boolean;
  // Cadeia de preço resolvida no banco (fn_preco_vigente). Opcionais porque
  // nem toda leitura vem de v_catalogo_insumos — o retorno de um insert em
  // catalogo_insumos traz só as colunas da tabela.
  preco_vigente?: number; preco_nivel?: InsumoCatalogo['precoNivel'];
  preco_fonte_efetiva?: InsumoCatalogo['precoFonteEfetiva'];
  preco_fornecedor_id?: string | null; preco_data_origem?: string | null;
  preco_dias_idade?: number | null;
};

type LinhaComponente = {
  id: string; composicao_id: string; insumo_id: string; coeficiente: number;
  observacao: string | null; insumo_descricao: string; insumo_unidade: string;
  insumo_categoria: InsumoCatalogo['categoria']; insumo_tipo_item: InsumoCatalogo['tipoItem'];
  insumo_codigo_sinapi: string | null; insumo_preco_referencia: number;
  insumo_ativo: boolean; custo_total: number;
};

function componenteFromRow(row: LinhaComponente): ComponenteComposicao {
  return {
    id: row.id,
    composicaoId: row.composicao_id,
    insumoId: row.insumo_id,
    coeficiente: row.coeficiente,
    observacao: row.observacao ?? undefined,
    insumoDescricao: row.insumo_descricao,
    insumoUnidade: row.insumo_unidade,
    insumoCategoria: row.insumo_categoria,
    insumoTipoItem: row.insumo_tipo_item,
    insumoCodigoSINAPI: row.insumo_codigo_sinapi ?? undefined,
    insumoPrecoReferencia: row.insumo_preco_referencia,
    insumoAtivo: row.insumo_ativo,
    custoTotal: row.custo_total,
  };
}

function fromRow(
  row: LinhaCatalogo,
  cotacoesFornecedores: CotacaoFornecedor[] = [],
  historicoPrecos: PontoHistoricoPreco[] = []
): InsumoCatalogo {
  return {
    id: row.id,
    codigoSINAPI: row.codigo_sinapi ?? undefined,
    descricao: row.descricao,
    unidade: row.unidade,
    precoReferencia: row.preco_referencia,
    categoria: row.categoria,
    tipo: row.tipo,
    tipoItem: row.tipo_item,
    precoFonte: row.preco_fonte,
    uf: row.uf ?? undefined,
    mesReferencia: row.mes_referencia ?? undefined,
    desonerado: row.desonerado ?? undefined,
    fornecedorPadraoId: row.fornecedor_padrao_id ?? undefined,
    composicao: row.composicao ?? undefined,
    aplicacao: row.aplicacao ?? undefined,
    ativo: row.ativo,
    dataAtualizacaoPreco: row.data_atualizacao_preco,
    historicoPrecos,
    cotacoesFornecedores,
    obrasUtilizando: row.obras_utilizando ?? 0,
    pontosHistorico: row.pontos_historico ?? 0,
    qtdComponentes: row.qtd_componentes ?? 0,
    usadoEmComposicoes: row.usado_em_composicoes ?? 0,
    temComponenteInativo: row.tem_componente_inativo ?? false,
    // Cadeia resolvida no banco. O fallback para `preco_referencia` cobre as
    // leituras que não vêm da view (ex.: retorno de um insert em
    // catalogo_insumos), onde estas colunas não existem.
    precoVigente: row.preco_vigente ?? row.preco_referencia,
    precoNivel: row.preco_nivel ?? 4,
    precoFonteEfetiva: row.preco_fonte_efetiva ?? 'Referência',
    precoFornecedorId: row.preco_fornecedor_id ?? undefined,
    precoDataOrigem: row.preco_data_origem ?? undefined,
    precoDiasIdade: row.preco_dias_idade ?? undefined,
  };
}

function cotacaoFromRow(c: {
  id: string; fornecedor_id: string; preco_unitario: number; data_cotacao: string;
  prazo_entrega_dias: number | null; observacao: string | null; validade_dias: number; ativa: boolean;
}): CotacaoFornecedor {
  return {
    id: c.id,
    fornecedorId: c.fornecedor_id,
    precoUnitario: c.preco_unitario,
    dataCotacao: c.data_cotacao,
    prazoEntregaDias: c.prazo_entrega_dias ?? undefined,
    observacao: c.observacao ?? undefined,
    validadeDias: c.validade_dias,
    ativa: c.ativa,
  };
}

/** Retorno de `usos` — os quatro primeiros contadores bloqueiam a exclusão. */
export type UsosInsumo = {
  descricao: string;
  itensOrcamento: number;
  insumosProjeto: number;
  itensProposta: number;
  emComposicoes: number;
  cotacoes: number;
  pontosHistorico: number;
  componentes: number;
  podeExcluir: boolean;
};

/** O que foi apagado em cascata junto com o insumo. */
export type ResultadoExclusao = {
  descricao: string;
  cotacoes: number;
  pontosHistorico: number;
  componentes: number;
};

export type FiltroCatalogo = {
  busca?: string;
  categoria?: InsumoCatalogo['categoria'];
  tipo?: InsumoCatalogo['tipo'];
  /** undefined = todos; true = só ativos; false = só inativos. */
  ativo?: boolean;
  pagina?: number;
};

export const catalogoService = {
  /**
   * Página do catálogo + as cotações vigentes DOS ITENS DESTA PÁGINA (não do
   * catálogo inteiro), para o card já conseguir mostrar o melhor preço.
   */
  async list(filtro: FiltroCatalogo = {}): Promise<{ itens: InsumoCatalogo[]; total: number }> {
    const pagina = filtro.pagina ?? 0;
    const de = pagina * CATALOGO_PAGINA;

    let query = supabase
      .from('v_catalogo_insumos')
      .select('*', { count: 'exact' })
      .order('descricao', { ascending: true })
      .range(de, de + CATALOGO_PAGINA - 1);

    // `busca` é normalizada por trigger no banco (minúscula, sem acento); o
    // termo precisa passar pela mesma normalização ou "concreto"/"cerâmica"
    // deixam de casar. Índice trigram cobre o ilike.
    const termo = normalizaBusca(filtro.busca ?? '');
    if (termo) query = query.ilike('busca', `%${termo}%`);
    if (filtro.categoria) query = query.eq('categoria', filtro.categoria);
    if (filtro.tipo) query = query.eq('tipo', filtro.tipo);
    if (filtro.ativo !== undefined) query = query.eq('ativo', filtro.ativo);

    const { data, error, count } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return { itens: [], total: count ?? 0 };

    const ids = data.map((i) => i.id);
    const { data: cotacoes, error: cotacoesError } = await supabase
      .from('v_cotacoes_atuais')
      .select('*')
      .in('catalogo_id', ids);
    if (cotacoesError) throw cotacoesError;

    const cotacoesPorInsumo = new Map<string, CotacaoFornecedor[]>();
    for (const c of cotacoes ?? []) {
      const lista = cotacoesPorInsumo.get(c.catalogo_id) ?? [];
      lista.push(cotacaoFromRow(c));
      cotacoesPorInsumo.set(c.catalogo_id, lista);
    }

    return {
      itens: data.map((i) => fromRow(i, cotacoesPorInsumo.get(i.id) ?? [])),
      total: count ?? data.length,
    };
  },

  /**
   * Série histórica + todas as cotações (inclusive as desativadas) de UM insumo.
   * Só é carregado ao abrir o detalhe — é o que evita arrastar a base inteira.
   *
   * `incluirComponentes` só é ligado para composição: buscar a lista para um
   * insumo simples é uma ida ao servidor que volta vazia por construção.
   */
  async carregarDetalhe(insumoId: string, incluirComponentes = false): Promise<{
    historicoPrecos: PontoHistoricoPreco[];
    cotacoes: CotacaoFornecedor[];
    componentes: ComponenteComposicao[];
  }> {
    const componentes = incluirComponentes ? await this.listarComponentes(insumoId) : [];
    const [{ data: historico, error: histError }, { data: cotacoes, error: cotError }] = await Promise.all([
      supabase
        .from('catalogo_historico_precos')
        .select('*')
        .eq('catalogo_id', insumoId)
        .order('data', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('cotacoes_fornecedores')
        .select('*')
        .eq('catalogo_id', insumoId)
        .order('data_cotacao', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    if (histError) throw histError;
    if (cotError) throw cotError;

    return {
      historicoPrecos: (historico ?? []).map((h) => ({ data: h.data, preco: h.preco, fonte: h.fonte })),
      cotacoes: (cotacoes ?? []).map(cotacaoFromRow),
      componentes,
    };
  },

  async add(item: InsumoCatalogo): Promise<InsumoCatalogo> {
    const { data, error } = await supabase
      .from('catalogo_insumos')
      .insert({
        id: item.id,
        codigo_sinapi: item.codigoSINAPI,
        descricao: item.descricao,
        unidade: item.unidade,
        preco_referencia: item.precoReferencia,
        categoria: item.categoria,
        tipo: item.tipo,
        tipo_item: item.tipoItem,
        preco_fonte: item.precoFonte,
        uf: item.uf,
        mes_referencia: item.mesReferencia,
        desonerado: item.desonerado,
        fornecedor_padrao_id: item.fornecedorPadraoId,
        composicao: item.composicao,
        aplicacao: item.aplicacao,
        ativo: item.ativo,
        data_atualizacao_preco: item.dataAtualizacaoPreco,
      })
      .select()
      .single();
    if (error) throw error;
    // O primeiro ponto do histórico é gravado pela trigger — não replicamos aqui.
    return fromRow(data);
  },

  /**
   * Edição completa. Se `preco_referencia` mudar, a trigger no banco acrescenta
   * o ponto ao histórico e atualiza `data_atualizacao_preco` — por isso a data
   * não é enviada: quem manda é o servidor.
   */
  async update(item: InsumoCatalogo): Promise<InsumoCatalogo> {
    const { data, error } = await supabase
      .from('catalogo_insumos')
      .update({
        codigo_sinapi: item.codigoSINAPI ?? null,
        descricao: item.descricao,
        unidade: item.unidade,
        preco_referencia: item.precoReferencia,
        categoria: item.categoria,
        tipo: item.tipo,
        tipo_item: item.tipoItem,
        preco_fonte: item.precoFonte,
        uf: item.uf ?? null,
        mes_referencia: item.mesReferencia ?? null,
        desonerado: item.desonerado ?? null,
        fornecedor_padrao_id: item.fornecedorPadraoId ?? null,
        composicao: item.composicao ?? null,
        aplicacao: item.aplicacao ?? null,
        ativo: item.ativo,
      })
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, item.cotacoesFornecedores, item.historicoPrecos);
  },

  /**
   * Soft-delete, e o caminho padrão de saída: apagar um insumo usado zerava
   * itens_orcamento.catalogo_insumo_id (FK on delete set null) e destruía a
   * procedência de todo orçamento que veio dele.
   */
  async setAtivo(id: string, ativo: boolean): Promise<void> {
    const { data, error } = await supabase
      .from('catalogo_insumos').update({ ativo }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ativar ou desativar insumos do catálogo'));
  },

  /**
   * Onde o insumo está sendo usado. Chamado ao abrir a confirmação de exclusão,
   * para o diálogo dizer o que vai junto (histórico, cotações) ou por que está
   * bloqueado — em vez de oferecer um botão que falha depois do clique.
   */
  async usos(id: string): Promise<UsosInsumo> {
    const { data, error } = await supabase.rpc('catalogo_usos_insumo', { p_id: id });
    if (error) throw error;
    if (!data) throw new Error('Não foi possível verificar os usos deste insumo.');
    return {
      descricao: data.descricao,
      itensOrcamento: data.itens_orcamento,
      insumosProjeto: data.insumos_projeto,
      itensProposta: data.itens_proposta,
      emComposicoes: data.em_composicoes,
      cotacoes: data.cotacoes,
      pontosHistorico: data.pontos_historico,
      componentes: data.componentes,
      podeExcluir: data.pode_excluir,
    };
  },

  /**
   * Exclusão definitiva. DELETE está revogado em catalogo_insumos, então o único
   * caminho é a RPC — que recusa, com mensagem pronta para o toast, quando o
   * insumo aparece em orçamento, obra, proposta ou como componente de alguma
   * composição. Só sai do banco o que nunca deixou rastro; junto vão o histórico
   * de preços, as cotações e os componentes DA composição excluída.
   */
  async excluir(id: string): Promise<ResultadoExclusao> {
    const { data, error } = await supabase.rpc('catalogo_excluir_insumo', { p_id: id });
    if (error) throw error;
    if (!data) throw new Error('A exclusão não devolveu resultado.');
    return {
      descricao: data.descricao,
      cotacoes: data.cotacoes,
      pontosHistorico: data.pontos_historico,
      componentes: data.componentes,
    };
  },

  async addCotacao(insumoId: string, quote: CotacaoFornecedor): Promise<CotacaoFornecedor> {
    const { data, error } = await supabase
      .from('cotacoes_fornecedores')
      .insert({
        catalogo_id: insumoId,
        fornecedor_id: quote.fornecedorId,
        preco_unitario: quote.precoUnitario,
        data_cotacao: quote.dataCotacao,
        prazo_entrega_dias: quote.prazoEntregaDias,
        observacao: quote.observacao,
        validade_dias: quote.validadeDias,
      })
      .select()
      .single();
    if (error) throw error;
    return cotacaoFromRow(data);
  },

  /**
   * Tira a cotação de circulação preservando o registro — a tabela é
   * insert-only e o DELETE está revogado. Cotação antiga é dado de negociação,
   * não lixo.
   */
  async desativarCotacao(cotacaoId: string): Promise<void> {
    const { data, error } = await supabase
      .from('cotacoes_fornecedores').update({ ativa: false }).eq('id', cotacaoId).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('desativar cotações'));
  },

  /**
   * Promove o preço de uma cotação a preço de referência do catálogo. É o
   * caminho que o schema original chamava de "bind-price divergence" e que
   * nunca havia sido implementado: a trigger registra o ponto no histórico com
   * fonte 'Fornecedor'.
   */
  async adotarPrecoDaCotacao(insumoId: string, preco: number): Promise<InsumoCatalogo> {
    const { data, error } = await supabase
      .from('catalogo_insumos')
      .update({ preco_referencia: preco, preco_fonte: 'Fornecedor' })
      .eq('id', insumoId)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  // ==========================================================
  // COMPOSIÇÃO — componentes com coeficiente
  // ==========================================================

  /** Componentes diretos de uma composição, com o insumo já resolvido. */
  async listarComponentes(composicaoId: string): Promise<ComponenteComposicao[]> {
    const { data, error } = await supabase
      .from('v_composicao_itens')
      .select('*')
      .eq('composicao_id', composicaoId)
      .order('insumo_categoria', { ascending: true })
      .order('insumo_descricao', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(componenteFromRow);
  },

  /**
   * Relê a composição depois de qualquer mexida em componente. O preço novo é
   * calculado por trigger no banco; ler de volta é a única forma de a tela
   * mostrar o mesmo número que ficou gravado.
   */
  async recarregarInsumo(insumoId: string): Promise<InsumoCatalogo> {
    const { data, error } = await supabase
      .from('v_catalogo_insumos')
      .select('*')
      .eq('id', insumoId)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * O banco recusa: componente em item que não é composição, auto-referência e
   * ciclo (composição que já contém, direta ou indiretamente, a composição de
   * destino). O erro vem com mensagem em português e sobe para o toast.
   */
  async addComponente(
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ): Promise<{ componentes: ComponenteComposicao[]; composicao: InsumoCatalogo }> {
    const { error } = await supabase
      .from('composicao_itens')
      .insert({
        composicao_id: composicaoId,
        insumo_id: entrada.insumoId,
        coeficiente: entrada.coeficiente,
        observacao: entrada.observacao ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return this.estadoDaComposicao(composicaoId);
  },

  async updateComponente(
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ): Promise<{ componentes: ComponenteComposicao[]; composicao: InsumoCatalogo }> {
    // `.select()` + contagem: um write recusado pela RLS volta como sucesso com
    // zero linhas, e sem isto a tela mostraria um coeficiente que não foi salvo.
    const { data, error } = await supabase
      .from('composicao_itens')
      .update({ coeficiente: patch.coeficiente, observacao: patch.observacao ?? null })
      .eq('id', componenteId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi alterada — sem permissão para editar esta composição.');
    }
    return this.estadoDaComposicao(composicaoId);
  },

  async removerComponente(
    componenteId: string,
    composicaoId: string
  ): Promise<{ componentes: ComponenteComposicao[]; composicao: InsumoCatalogo }> {
    const { data, error } = await supabase
      .from('composicao_itens')
      .delete()
      .eq('id', componenteId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Nenhuma linha foi removida — sem permissão para editar esta composição.');
    }
    return this.estadoDaComposicao(composicaoId);
  },

  /** Lista + composição relidas juntas, para a tela nunca ficar meio atualizada. */
  async estadoDaComposicao(
    composicaoId: string
  ): Promise<{ componentes: ComponenteComposicao[]; composicao: InsumoCatalogo }> {
    const [componentes, composicao] = await Promise.all([
      this.listarComponentes(composicaoId),
      this.recarregarInsumo(composicaoId),
    ]);
    return { componentes, composicao };
  },

  /**
   * Candidatos a componente: busca paginada como a listagem principal, menos a
   * própria composição. Ciclo mais profundo é barrado pelo banco — filtrar toda
   * a subárvore aqui exigiria baixar o grafo inteiro no cliente.
   */
  async buscarCandidatos(termo: string, excluirId: string): Promise<InsumoCatalogo[]> {
    let query = supabase
      .from('v_catalogo_insumos')
      .select('*')
      .eq('ativo', true)
      .neq('id', excluirId)
      .order('descricao', { ascending: true })
      .limit(30);

    const normalizado = normalizaBusca(termo);
    if (normalizado) query = query.ilike('busca', `%${normalizado}%`);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((i) => fromRow(i));
  },

  /**
   * Insumos de mão de obra ativos, para a ficha do colaborador escolher qual
   * cargo do catálogo ele representa (ver funcionarios.catalogo_mao_de_obra_id).
   *
   * Lista própria e não o `list()` paginado de propósito: a aba Equipe não pode
   * mexer no filtro do Catálogo, que é estado compartilhado da outra tela. São
   * poucas dezenas de insumos de mão de obra, então cabe em uma página só.
   *
   * `tipo_item = 'Insumo'` porque composição de mão de obra é equipe montada,
   * não uma pessoa — é o mesmo recorte que a trigger do banco exige.
   */
  async listarMaoDeObra(): Promise<InsumoCatalogo[]> {
    const { data, error } = await supabase
      .from('v_catalogo_insumos')
      .select('*')
      .eq('ativo', true)
      .eq('categoria', 'Mão de Obra')
      .eq('tipo_item', 'Insumo')
      .order('descricao', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((i) => fromRow(i));
  },
};
