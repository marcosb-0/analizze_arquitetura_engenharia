import { supabase } from '../lib/supabaseClient';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';

function fromRow(row: {
  id: string; projeto_id: string; categoria: ItemOrcamento['categoria']; descricao: string;
  valor_orcado: number; valor_contratado: number; fornecedor_id: string | null; valor_executado: number;
}): ItemOrcamento {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    categoria: row.categoria,
    descricao: row.descricao,
    valorOrcado: row.valor_orcado,
    valorContratado: row.valor_contratado,
    valorExecutado: row.valor_executado,
    fornecedorId: row.fornecedor_id ?? undefined,
  };
}

function alteracaoFromRow(row: {
  id: string; projeto_id: string; data: string; item: string; descricao: string | null; tipo: AlteracaoOrcamento['tipo']; valor: number;
}): AlteracaoOrcamento {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    data: row.data,
    item: row.item,
    descricao: row.descricao ?? '',
    tipo: row.tipo,
    valor: row.valor,
  };
}

export const orcamentoService = {
  async list(): Promise<ItemOrcamento[]> {
    // valor_executado is always derived from medicao_item_orcamento (fix #1) —
    // never clamped to valor_orcado, so overruns stay visible instead of hidden.
    const { data, error } = await supabase.from('v_itens_orcamento').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data.map(fromRow);
  },

  async add(item: ItemOrcamento): Promise<ItemOrcamento> {
    const { data, error } = await supabase
      .from('itens_orcamento')
      .insert({
        id: item.id,
        projeto_id: item.projetoId,
        categoria: item.categoria,
        descricao: item.descricao,
        valor_orcado: item.valorOrcado,
        valor_contratado: item.valorContratado,
        fornecedor_id: item.fornecedorId,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow({ ...data, valor_executado: 0 });
  },

  async listAlteracoes(): Promise<AlteracaoOrcamento[]> {
    const { data, error } = await supabase.from('alteracoes_orcamento').select('*').order('data', { ascending: false });
    if (error) throw error;
    return data.map(alteracaoFromRow);
  },

  async addAlteracao(alt: AlteracaoOrcamento): Promise<AlteracaoOrcamento> {
    const { data, error } = await supabase
      .from('alteracoes_orcamento')
      .insert({ id: alt.id, projeto_id: alt.projetoId, data: alt.data, item: alt.item, descricao: alt.descricao, tipo: alt.tipo, valor: alt.valor })
      .select()
      .single();
    if (error) throw error;
    return alteracaoFromRow(data);
  },
};
