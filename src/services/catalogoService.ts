import { supabase } from '../lib/supabaseClient';
import { InsumoCatalogo, CotacaoFornecedor, PontoHistoricoPreco } from '../types';
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
};

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
   */
  async carregarDetalhe(insumoId: string): Promise<{
    historicoPrecos: PontoHistoricoPreco[];
    cotacoes: CotacaoFornecedor[];
  }> {
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
   * Soft-delete. DELETE está revogado no banco: apagar um insumo zerava
   * itens_orcamento.catalogo_insumo_id (FK on delete set null) e destruía a
   * procedência de todo orçamento que veio dele.
   */
  async setAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase.from('catalogo_insumos').update({ ativo }).eq('id', id);
    if (error) throw error;
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
    const { error } = await supabase.from('cotacoes_fornecedores').update({ ativa: false }).eq('id', cotacaoId);
    if (error) throw error;
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
};
