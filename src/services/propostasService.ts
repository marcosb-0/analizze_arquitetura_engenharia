import { supabase } from '../lib/supabaseClient';
import { Proposta, RevisaoProposta } from '../types';

function fromRow(row: {
  id: string; numero: string; cliente_id: string; descricao: string; valor_estimado: number;
  prazo_execucao: string | null; data_validade: string | null; status: Proposta['status'];
}, revisoes: RevisaoProposta[]): Proposta {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    descricao: row.descricao,
    valorEstimado: row.valor_estimado,
    prazoExecucao: row.prazo_execucao ?? '',
    dataValidade: row.data_validade ?? '',
    status: row.status,
    revisoes,
  };
}

export const propostasService = {
  async list(): Promise<Proposta[]> {
    const [{ data: propostas, error: propError }, { data: revisoes, error: revError }] = await Promise.all([
      supabase.from('propostas').select('*').order('created_at', { ascending: false }),
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
