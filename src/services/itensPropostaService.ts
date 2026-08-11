import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { ItemProposta, AjustePreco, CategoriaCusto } from '../types';

/**
 * Itens de proposta — o caminho que faltava para orçar ANTES de vender.
 *
 * Até então a proposta era um único número digitado e o catálogo só conseguia
 * alimentar o orçamento de uma obra já existente. Agora a proposta é montada
 * item a item a partir do catálogo, e `propostas.valor_estimado` passa a ser
 * calculado pelo banco (soma dos itens × BDI) sempre que houver itens.
 *
 * Mesmo contrato de preço de insumos_projeto: base congelada + ajuste desta
 * proposta; `preco_unitario` é GENERATED e nunca vai no payload de escrita.
 */

type LinhaItemProposta = {
  id: string; proposta_id: string; catalogo_insumo_id: string | null; descricao: string;
  unidade: string; categoria: CategoriaCusto; quantidade: number; preco_unitario_base: number;
  ajuste_tipo: AjustePreco['tipo']; ajuste_valor: number; ajuste_motivo: string | null;
  preco_unitario: number; fornecedor_id: string | null; observacoes: string | null; ordem: number;
};

function fromRow(row: LinhaItemProposta): ItemProposta {
  return {
    id: row.id,
    propostaId: row.proposta_id,
    catalogoInsumoId: row.catalogo_insumo_id ?? undefined,
    descricao: row.descricao,
    unidade: row.unidade,
    categoria: row.categoria,
    quantidade: row.quantidade,
    precoUnitarioBase: row.preco_unitario_base,
    ajuste: {
      tipo: row.ajuste_tipo,
      valor: row.ajuste_valor,
      motivo: row.ajuste_motivo ?? undefined,
    },
    precoUnitario: row.preco_unitario,
    fornecedorId: row.fornecedor_id ?? undefined,
    observacoes: row.observacoes ?? undefined,
    ordem: row.ordem,
  };
}

export type NovoItemProposta = {
  propostaId: string;
  catalogoInsumoId?: string;
  descricao: string;
  unidade: string;
  categoria: CategoriaCusto;
  quantidade: number;
  precoUnitarioBase: number;
  ajuste: AjustePreco;
  fornecedorId?: string;
  observacoes?: string;
  ordem?: number;
};

export const itensPropostaService = {
  /**
   * `propostaId` é OBRIGATÓRIO (§2.3 da auditoria). O parâmetro era opcional e o
   * comentário admitia que a varredura completa só serviria a "rotinas
   * administrativas" — que não existem: a única chamada do app sempre passou a
   * proposta. Opcional, ele era uma varredura da tabela inteira a uma linha de
   * distância, do mesmo tipo que o §4.2 fechou nas quatro leituras do núcleo.
   */
  async list(propostaId: string): Promise<ItemProposta[]> {
    // Em blocos mesmo no caminho por proposta: uma proposta grande passa de 1000
    // itens sem nada de excepcional, e é a composição que vira o valor vendido.
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('itens_proposta')
        .select('*')
        .eq('proposta_id', propostaId)
        .order('ordem', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async add(novo: NovoItemProposta): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .insert({
        proposta_id: novo.propostaId,
        catalogo_insumo_id: novo.catalogoInsumoId,
        descricao: novo.descricao,
        unidade: novo.unidade,
        categoria: novo.categoria,
        quantidade: novo.quantidade,
        preco_unitario_base: novo.precoUnitarioBase,
        ajuste_tipo: novo.ajuste.tipo,
        ajuste_valor: novo.ajuste.valor,
        ajuste_motivo: novo.ajuste.motivo,
        fornecedor_id: novo.fornecedorId,
        observacoes: novo.observacoes,
        ordem: novo.ordem ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /** O ajuste desta proposta. O catálogo global não é tocado. */
  async atualizarAjuste(id: string, ajuste: AjustePreco): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .update({
        ajuste_tipo: ajuste.tipo,
        ajuste_valor: ajuste.valor,
        ajuste_motivo: ajuste.motivo ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async atualizarQuantidade(id: string, quantidade: number): Promise<ItemProposta> {
    const { data, error } = await supabase
      .from('itens_proposta')
      .update({ quantidade })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from('itens_proposta').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('remover itens da proposta'));
  },
};
