import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';

function fromRow(row: {
  id: string; projeto_id: string; categoria: ItemOrcamento['categoria']; descricao: string;
  valor_orcado: number; valor_contratado: number; fornecedor_id: string | null; valor_executado: number;
  catalogo_insumo_id?: string | null;
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
    catalogoInsumoId: row.catalogo_insumo_id ?? undefined,
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

/**
 * ESCOPO POR OBRA — item 23, peça 2 (§4.2).
 *
 * As duas leituras daqui recebem `projetoId` e **não têm caminho global**. Não é
 * parâmetro opcional por descuido: depois que o painel e a lista de obras
 * passaram a ler `v_resumo_obra`, o único consumidor de linha de orçamento é o
 * console — e o console abre uma obra por vez. Um `list()` sem argumento
 * significaria "traga o orçamento de todas as obras", que é exatamente o que
 * esta peça veio remover; deixá-lo disponível é deixar o caminho de volta aberto.
 */
export const orcamentoService = {
  async list(projetoId: string): Promise<ItemOrcamento[]> {
    // valor_executado is always derived from medicao_item_orcamento (fix #1) —
    // never clamped to valor_orcado, so overruns stay visible instead of hidden.
    // `.order('id')` é desempate estável entre blocos — sem ele, itens criados no
    // mesmo instante podem repetir ou pular. Ver paginacao.ts.
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('v_itens_orcamento')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(fromRow);
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
        catalogo_insumo_id: item.catalogoInsumoId,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow({ ...data, valor_executado: 0 });
  },

  async listAlteracoes(projetoId: string): Promise<AlteracaoOrcamento[]> {
    const linhas = await buscarTudo((de, ate) =>
      supabase
        .from('alteracoes_orcamento')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('data', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );
    return linhas.map(alteracaoFromRow);
  },

  // `addAlteracao` foi removida (§2.3 da auditoria). Existia, era exposta pelo
  // hook e nunca chamada por nenhuma tela: `alteracoes_orcamento` é LIDA pelo
  // painel e nunca foi escrita pelo app. Escrita sem chamador não é recurso
  // pronto — é código que ninguém exercita e que dá a impressão de que o
  // histórico de alterações existe. Quando a tela existir, o insert volta com
  // ela, e aí passa por revisão de verdade.
};
