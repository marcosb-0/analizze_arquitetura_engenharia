import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { MargemObra, InsumoProjeto, AjustePreco } from '../types';

/**
 * Quantitativo de insumos por obra — a tabela `insumos_projeto` existia desde o
 * schema inicial e não era usada por nenhuma linha da aplicação. Sem ela, a
 * vinculação catálogo → orçamento guardava quantidade e preço unitário dentro
 * de uma string de descrição e só persistia o total.
 *
 * Aqui o preço é sempre `preco_unitario_base` + ajuste; `preco_unitario` e
 * `valor_total` são derivados no banco (coluna GENERATED + view) e por isso
 * nunca aparecem nos payloads de escrita. Alterar o ajuste recalcula
 * automaticamente o `valor_orcado` do item de orçamento vinculado, via trigger.
 */

type LinhaInsumoProjeto = {
  id: string; projeto_id: string; catalogo_insumo_id: string; item_orcamento_id: string | null;
  quantidade: number; preco_unitario_base: number; ajuste_tipo: AjustePreco['tipo'];
  ajuste_valor: number; ajuste_motivo: string | null; preco_unitario: number;
  fornecedor_id: string | null; etapa_vinculada_id: string | null; quantidade_executada: number;
  status: InsumoProjeto['status']; observacoes: string | null;
  valor_total: number; valor_ajuste: number; percentual_executado: number;
  insumo_descricao: string; insumo_unidade: string; insumo_preco_referencia: number;
  preco_nivel: 1 | 2 | 3 | 4 | null;
  preco_fonte_efetiva: 'Cotação' | 'Folha' | 'Praticado' | 'Estimado' | 'Referência' | null;
  preco_data_origem: string | null;
  custo_origem: number | null;
  ajuste_origem_tipo: 'Nenhum' | 'Percentual' | 'Valor' | null;
  ajuste_origem_valor: number | null;
  bdi_aplicado: number | null;
  valor_total_custo: number | null;
  margem_valor: number | null;
  margem_percentual: number | null;
};

function fromRow(row: LinhaInsumoProjeto): InsumoProjeto {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    catalogoInsumoId: row.catalogo_insumo_id,
    itemOrcamentoId: row.item_orcamento_id ?? undefined,
    quantidade: row.quantidade,
    precoUnitarioBase: row.preco_unitario_base,
    precoNivel: row.preco_nivel ?? undefined,
    precoFonteEfetiva: row.preco_fonte_efetiva ?? undefined,
    precoDataOrigem: row.preco_data_origem ?? undefined,
    // Item A1. `?? undefined` e nunca `?? 0`: ausente aqui significa que o custo
    // não é conhecido, e zero afirmaria que o item não custou nada — margem de
    // 100% sobre um número inventado.
    custoOrigem: row.custo_origem ?? undefined,
    ajusteOrigem: row.ajuste_origem_tipo
      ? { tipo: row.ajuste_origem_tipo, valor: row.ajuste_origem_valor ?? 0 }
      : undefined,
    bdiAplicado: row.bdi_aplicado ?? undefined,
    valorTotalCusto: row.valor_total_custo ?? undefined,
    margemValor: row.margem_valor ?? undefined,
    margemPercentual: row.margem_percentual ?? undefined,
    ajuste: {
      tipo: row.ajuste_tipo,
      valor: row.ajuste_valor,
      motivo: row.ajuste_motivo ?? undefined,
    },
    precoUnitario: row.preco_unitario,
    valorTotal: row.valor_total,
    valorAjuste: row.valor_ajuste,
    fornecedorId: row.fornecedor_id ?? undefined,
    etapaVinculadaId: row.etapa_vinculada_id ?? undefined,
    quantidadeExecutada: row.quantidade_executada,
    percentualExecutado: row.percentual_executado,
    status: row.status,
    observacoes: row.observacoes ?? undefined,
    insumoDescricao: row.insumo_descricao,
    insumoUnidade: row.insumo_unidade,
    insumoPrecoReferencia: row.insumo_preco_referencia,
  };
}

export type NovoInsumoProjeto = {
  projetoId: string;
  catalogoInsumoId: string;
  itemOrcamentoId?: string;
  quantidade: number;
  precoUnitarioBase: number;
  ajuste: AjustePreco;
  fornecedorId?: string;
  etapaVinculadaId?: string;
  observacoes?: string;
};

export const insumosProjetoService = {
  /** Os insumos de UMA obra — item 23, peça 2. Só o console os consome. */
  async list(projetoId: string): Promise<InsumoProjeto[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_insumos_projeto')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(novo: NovoInsumoProjeto): Promise<InsumoProjeto> {
    const { data, error } = await supabase
      .from('insumos_projeto')
      .insert({
        projeto_id: novo.projetoId,
        catalogo_insumo_id: novo.catalogoInsumoId,
        item_orcamento_id: novo.itemOrcamentoId,
        quantidade: novo.quantidade,
        preco_unitario_base: novo.precoUnitarioBase,
        ajuste_tipo: novo.ajuste.tipo,
        ajuste_valor: novo.ajuste.valor,
        ajuste_motivo: novo.ajuste.motivo,
        fornecedor_id: novo.fornecedorId,
        etapa_vinculada_id: novo.etapaVinculadaId,
        observacoes: novo.observacoes,
        status: 'Orçado',
      })
      .select('id')
      .single();
    if (error) throw error;
    return this.getById(data.id);
  },

  async getById(id: string): Promise<InsumoProjeto> {
    const { data, error } = await supabase.from('v_insumos_projeto').select('*').eq('id', id).single();
    if (error) throw error;
    return fromRow(data);
  },

  /**
   * O ajuste de preço DESTE orçamento. Não toca em catalogo_insumos — o preço
   * de referência global permanece o que era.
   */
  async atualizarAjuste(id: string, ajuste: AjustePreco): Promise<InsumoProjeto> {
    const { data, error } = await supabase
      .from('insumos_projeto')
      .update({
        ajuste_tipo: ajuste.tipo,
        ajuste_valor: ajuste.valor,
        ajuste_motivo: ajuste.motivo ?? null,
      })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ajustar o preço deste insumo'));
    return this.getById(id);
  },

  async atualizarQuantidade(id: string, quantidade: number): Promise<InsumoProjeto> {
    const { data, error } = await supabase
      .from('insumos_projeto').update({ quantidade }).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('alterar a quantidade deste insumo'));
    return this.getById(id);
  },

  /**
   * Traz o preço base de volta ao valor de referência atual do catálogo,
   * mantendo o ajuste. Usado quando o insumo teve o preço atualizado e o
   * orçamento ainda carrega a foto antiga.
   */
  async ressincronizarBase(id: string, novaBase: number): Promise<InsumoProjeto> {
    const { data, error } = await supabase
      .from('insumos_projeto')
      .update({ preco_unitario_base: novaBase })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('ressincronizar o preço base'));
    return this.getById(id);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('insumos_projeto').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover insumos da obra'));
  },

  /**
   * A margem de TODAS as obras, para o resultado consolidado do financeiro.
   *
   * É a exceção deliberada à regra do §4.2 (leitura de núcleo exige
   * `projetoId`): esta tela é, por definição, a comparação entre obras, e é a
   * mesma forma que `listResultadoObra` já usa ao lado. A view agrega por obra,
   * então o volume é uma linha por obra, não uma por insumo.
   */
  async margensDasObras(): Promise<MargemObra[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('v_margem_obra').select('*').order('projeto_id', { ascending: true }).range(de, ate)
    );
    return linhas.map((d) => ({
      projetoId: d.projeto_id,
      itensTotal: d.itens_total,
      itensConhecidos: d.itens_conhecidos,
      vendaTotal: d.venda_total,
      custoTotal: d.custo_total ?? undefined,
      margemValor: d.margem_valor ?? undefined,
      margemPercentual: d.margem_percentual ?? undefined,
    }));
  },

  /**
   * A margem real da obra (item A1) — venda contra custo de origem.
   *
   * Exige `projetoId` pela mesma razão do §4.2: leitura de núcleo sem escopo de
   * obra carrega o banco inteiro e trunca em silêncio.
   *
   * Devolve `null` quando a obra não tem nenhum insumo vinculado — que é
   * diferente de "margem zero" e diferente de "custo desconhecido". Os três
   * estados existem e a tela trata cada um.
   */
  async margemDaObra(projetoId: string): Promise<MargemObra | null> {
    const { data, error } = await supabase
      .from('v_margem_obra')
      .select('*')
      .eq('projeto_id', projetoId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      projetoId: data.projeto_id,
      itensTotal: data.itens_total,
      itensConhecidos: data.itens_conhecidos,
      vendaTotal: data.venda_total,
      custoTotal: data.custo_total ?? undefined,
      margemValor: data.margem_valor ?? undefined,
      margemPercentual: data.margem_percentual ?? undefined,
    };
  },
};
