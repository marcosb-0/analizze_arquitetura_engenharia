import { supabase } from '../lib/supabaseClient';
import { InsumoProjeto, AjustePreco } from '../types';

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
};

function fromRow(row: LinhaInsumoProjeto): InsumoProjeto {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    catalogoInsumoId: row.catalogo_insumo_id,
    itemOrcamentoId: row.item_orcamento_id ?? undefined,
    quantidade: row.quantidade,
    precoUnitarioBase: row.preco_unitario_base,
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
  async list(): Promise<InsumoProjeto[]> {
    const { data, error } = await supabase
      .from('v_insumos_projeto')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(fromRow);
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
    const { error } = await supabase
      .from('insumos_projeto')
      .update({
        ajuste_tipo: ajuste.tipo,
        ajuste_valor: ajuste.valor,
        ajuste_motivo: ajuste.motivo ?? null,
      })
      .eq('id', id);
    if (error) throw error;
    return this.getById(id);
  },

  async atualizarQuantidade(id: string, quantidade: number): Promise<InsumoProjeto> {
    const { error } = await supabase.from('insumos_projeto').update({ quantidade }).eq('id', id);
    if (error) throw error;
    return this.getById(id);
  },

  /**
   * Traz o preço base de volta ao valor de referência atual do catálogo,
   * mantendo o ajuste. Usado quando o insumo teve o preço atualizado e o
   * orçamento ainda carrega a foto antiga.
   */
  async ressincronizarBase(id: string, novaBase: number): Promise<InsumoProjeto> {
    const { error } = await supabase
      .from('insumos_projeto')
      .update({ preco_unitario_base: novaBase })
      .eq('id', id);
    if (error) throw error;
    return this.getById(id);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('insumos_projeto').delete().eq('id', id);
    if (error) throw error;
  },
};
