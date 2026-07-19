import { supabase } from '../lib/supabaseClient';
import { InsumoCatalogo, CotacaoFornecedor } from '../types';

function fromRow(
  row: {
    id: string; codigo_sinapi: string | null; descricao: string; unidade: string; preco_referencia: number;
    categoria: InsumoCatalogo['categoria']; tipo: InsumoCatalogo['tipo']; fornecedor_padrao_id: string | null;
    composicao: string | null; aplicacao: string | null; ativo: boolean; data_atualizacao_preco: string;
  },
  historicoPrecos: InsumoCatalogo['historicoPrecos'],
  cotacoesFornecedores: CotacaoFornecedor[]
): InsumoCatalogo {
  return {
    id: row.id,
    codigoSINAPI: row.codigo_sinapi ?? undefined,
    descricao: row.descricao,
    unidade: row.unidade,
    precoReferencia: row.preco_referencia,
    categoria: row.categoria,
    tipo: row.tipo,
    fornecedorPadraoId: row.fornecedor_padrao_id ?? undefined,
    composicao: row.composicao ?? undefined,
    aplicacao: row.aplicacao ?? undefined,
    ativo: row.ativo,
    dataAtualizacaoPreco: row.data_atualizacao_preco,
    historicoPrecos,
    cotacoesFornecedores,
  };
}

export const catalogoService = {
  async list(): Promise<InsumoCatalogo[]> {
    const [
      { data: insumos, error: insumosError },
      { data: historico, error: historicoError },
      { data: cotacoes, error: cotacoesError },
    ] = await Promise.all([
      supabase.from('catalogo_insumos').select('*').order('created_at', { ascending: false }),
      supabase.from('catalogo_historico_precos').select('*').order('data', { ascending: true }),
      // v_cotacoes_atuais = latest quote per supplier (full history stays in
      // cotacoes_fornecedores — business-rule fix #5).
      supabase.from('v_cotacoes_atuais').select('*').order('data_cotacao', { ascending: false }),
    ]);
    if (insumosError) throw insumosError;
    if (historicoError) throw historicoError;
    if (cotacoesError) throw cotacoesError;

    const historicoByInsumo = new Map<string, InsumoCatalogo['historicoPrecos']>();
    for (const h of historico) {
      const list = historicoByInsumo.get(h.catalogo_id) ?? [];
      list.push({ data: h.data, preco: h.preco, fonte: h.fonte });
      historicoByInsumo.set(h.catalogo_id, list);
    }

    const cotacoesByInsumo = new Map<string, CotacaoFornecedor[]>();
    for (const c of cotacoes) {
      const list = cotacoesByInsumo.get(c.catalogo_id) ?? [];
      list.push({
        id: c.id,
        fornecedorId: c.fornecedor_id,
        precoUnitario: c.preco_unitario,
        dataCotacao: c.data_cotacao,
        prazoEntregaDias: c.prazo_entrega_dias ?? undefined,
        observacao: c.observacao ?? undefined,
      });
      cotacoesByInsumo.set(c.catalogo_id, list);
    }

    return insumos.map((i) => fromRow(i, historicoByInsumo.get(i.id) ?? [], cotacoesByInsumo.get(i.id) ?? []));
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
        fornecedor_padrao_id: item.fornecedorPadraoId,
        composicao: item.composicao,
        aplicacao: item.aplicacao,
        ativo: item.ativo,
        data_atualizacao_preco: item.dataAtualizacaoPreco,
      })
      .select()
      .single();
    if (error) throw error;

    const initialPrice = item.historicoPrecos[0];
    let historicoPrecos: InsumoCatalogo['historicoPrecos'] = [];
    if (initialPrice) {
      const { error: histError } = await supabase.from('catalogo_historico_precos').insert({
        catalogo_id: data.id,
        data: initialPrice.data,
        preco: initialPrice.preco,
        fonte: initialPrice.fonte,
      });
      if (histError) throw histError;
      historicoPrecos = [initialPrice];
    }

    return fromRow(data, historicoPrecos, []);
  },

  /** Scalar-only update (e.g. toggling `ativo`) — cotações/histórico go through their own dedicated methods. */
  async update(item: InsumoCatalogo): Promise<void> {
    const { error } = await supabase
      .from('catalogo_insumos')
      .update({
        codigo_sinapi: item.codigoSINAPI,
        descricao: item.descricao,
        unidade: item.unidade,
        preco_referencia: item.precoReferencia,
        categoria: item.categoria,
        tipo: item.tipo,
        fornecedor_padrao_id: item.fornecedorPadraoId,
        composicao: item.composicao,
        aplicacao: item.aplicacao,
        ativo: item.ativo,
        data_atualizacao_preco: item.dataAtualizacaoPreco,
      })
      .eq('id', item.id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('catalogo_insumos').delete().eq('id', id);
    if (error) throw error;
  },

  async addCotacao(insumoId: string, quote: CotacaoFornecedor): Promise<void> {
    const { error } = await supabase.from('cotacoes_fornecedores').insert({
      id: quote.id,
      catalogo_id: insumoId,
      fornecedor_id: quote.fornecedorId,
      preco_unitario: quote.precoUnitario,
      data_cotacao: quote.dataCotacao,
      prazo_entrega_dias: quote.prazoEntregaDias,
      observacao: quote.observacao,
    });
    if (error) throw error;
  },

  async removeCotacao(cotacaoId: string): Promise<void> {
    const { error } = await supabase.from('cotacoes_fornecedores').delete().eq('id', cotacaoId);
    if (error) throw error;
  },
};
