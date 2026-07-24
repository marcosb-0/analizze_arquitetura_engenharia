import { supabase } from '../lib/supabaseClient';
import { Proposta, RevisaoProposta } from '../types';

function fromRow(row: {
  id: string; numero: string; cliente_id: string; descricao: string; valor_estimado: number;
  bdi_percentual: number; prazo_execucao: string | null; data_validade: string | null;
  status: Proposta['status']; qtd_itens?: number; valor_itens?: number; valor_calculado?: number;
}, revisoes: RevisaoProposta[]): Proposta {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    descricao: row.descricao,
    valorEstimado: row.valor_estimado,
    bdiPercentual: row.bdi_percentual ?? 0,
    qtdItens: row.qtd_itens ?? 0,
    valorItens: row.valor_itens ?? 0,
    valorCalculado: row.valor_calculado ?? row.valor_estimado,
    prazoExecucao: row.prazo_execucao ?? '',
    dataValidade: row.data_validade ?? '',
    status: row.status,
    revisoes,
  };
}

export const propostasService = {
  async list(): Promise<Proposta[]> {
    // v_propostas acrescenta a contagem e a soma dos itens — o que permite à
    // UI mostrar lado a lado o valor gravado e o total calculado dos itens.
    const [{ data: propostas, error: propError }, { data: revisoes, error: revError }] = await Promise.all([
      supabase.from('v_propostas').select('*').order('created_at', { ascending: false }),
      supabase.from('revisoes_proposta').select('*').order('versao', { ascending: true }),
    ]);
    if (propError) throw propError;
    if (revError) throw revError;

    const revisoesByProposta = new Map<string, RevisaoProposta[]>();
    for (const r of revisoes) {
      const list = revisoesByProposta.get(r.proposta_id) ?? [];
      list.push({ versao: r.versao, data: r.data, valor: r.valor, alteracoes: r.alteracoes ?? '' });
      revisoesByProposta.set(r.proposta_id, list);
    }

    return propostas.map((p) => fromRow(p, revisoesByProposta.get(p.id) ?? []));
  },

  async add(proposta: Proposta): Promise<Proposta> {
    const { data, error } = await supabase
      .from('propostas')
      .insert({
        id: proposta.id,
        numero: proposta.numero,
        cliente_id: proposta.clienteId,
        descricao: proposta.descricao,
        valor_estimado: proposta.valorEstimado,
        bdi_percentual: proposta.bdiPercentual,
        prazo_execucao: proposta.prazoExecucao,
        data_validade: proposta.dataValidade || null,
        status: proposta.status,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data, []);
  },

  async updateStatus(id: string, status: Proposta['status']): Promise<void> {
    const { error } = await supabase.from('propostas').update({ status }).eq('id', id);
    if (error) throw error;
  },

  /**
   * Mudar o BDI dispara o recálculo de valor_estimado no banco (trigger
   * trg_proposta_bdi_sync) quando a proposta tem itens. Devolve o valor
   * recalculado para o estado local não precisar adivinhar.
   */
  async updateBdi(id: string, bdiPercentual: number): Promise<{ valorEstimado: number; valorCalculado: number }> {
    const { error } = await supabase.from('propostas').update({ bdi_percentual: bdiPercentual }).eq('id', id);
    if (error) throw error;

    const { data, error: readError } = await supabase
      .from('v_propostas')
      .select('valor_estimado, valor_calculado')
      .eq('id', id)
      .single();
    if (readError) throw readError;
    return { valorEstimado: data.valor_estimado, valorCalculado: data.valor_calculado };
  },

  /** Total dos itens + BDI, para refletir no estado local após mexer nos itens. */
  async refreshTotais(id: string): Promise<{ valorEstimado: number; valorItens: number; valorCalculado: number; qtdItens: number }> {
    const { data, error } = await supabase
      .from('v_propostas')
      .select('valor_estimado, valor_itens, valor_calculado, qtd_itens')
      .eq('id', id)
      .single();
    if (error) throw error;
    return {
      valorEstimado: data.valor_estimado,
      valorItens: data.valor_itens,
      valorCalculado: data.valor_calculado,
      qtdItens: data.qtd_itens,
    };
  },

  async remove(id: string): Promise<void> {
    const { data: linkedProjeto, error: checkError } = await supabase
      .from('projetos')
      .select('id')
      .eq('proposta_id', id)
      .limit(1);
    if (checkError) throw checkError;
    if (linkedProjeto && linkedProjeto.length > 0) {
      throw new Error('Esta proposta já foi convertida em obra e não pode ser excluída.');
    }

    const { error } = await supabase.from('propostas').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Adding a revision also updates the proposta's headline valor_estimado to
   * match the new revision (mirrors the original prototype's behavior).
   */
  async addRevision(propostaId: string, revision: RevisaoProposta): Promise<void> {
    const { error: revError } = await supabase.from('revisoes_proposta').insert({
      proposta_id: propostaId,
      versao: revision.versao,
      data: revision.data,
      valor: revision.valor,
      alteracoes: revision.alteracoes,
    });
    if (revError) throw revError;

    const { error: updateError } = await supabase
      .from('propostas')
      .update({ valor_estimado: revision.valor })
      .eq('id', propostaId);
    if (updateError) throw updateError;
  },
};
