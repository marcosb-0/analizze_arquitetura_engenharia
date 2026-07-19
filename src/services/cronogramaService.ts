import { supabase } from '../lib/supabaseClient';
import { EtapaCronograma, EtapaOrcamentoVinculo } from '../types';

function fromRow(row: {
  id: string; projeto_id: string; nome: string; data_inicio: string | null; data_fim: string | null;
  responsavel_id: string | null; percentual_executado: number; status: EtapaCronograma['status'];
}): EtapaCronograma {
  return {
    id: row.id,
    projetoId: row.projeto_id,
    nome: row.nome,
    dataInicio: row.data_inicio ?? '',
    dataFim: row.data_fim ?? '',
    responsavelId: row.responsavel_id ?? '',
    percentualExecutado: row.percentual_executado,
    status: row.status,
  };
}

function vinculoFromRow(row: { id: string; etapa_id: string; item_orcamento_id: string; peso_percentual: number }): EtapaOrcamentoVinculo {
  return { id: row.id, etapaId: row.etapa_id, itemOrcamentoId: row.item_orcamento_id, pesoPercentual: row.peso_percentual };
}

export const cronogramaService = {
  async list(): Promise<EtapaCronograma[]> {
    // percentual_executado/status are always derived from medicoes_obra (fix #1)
    // — there is deliberately no direct-write path for either anymore.
    const { data, error } = await supabase.from('v_etapas_cronograma').select('*').order('data_inicio', { ascending: true });
    if (error) throw error;
    return data.map(fromRow);
  },

  async add(etapa: EtapaCronograma): Promise<EtapaCronograma> {
    const { data, error } = await supabase
      .from('etapas_cronograma')
      .insert({
        id: etapa.id,
        projeto_id: etapa.projetoId,
        nome: etapa.nome,
        data_inicio: etapa.dataInicio || null,
        data_fim: etapa.dataFim || null,
        responsavel_id: etapa.responsavelId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow({ ...data, percentual_executado: 0, status: 'Não Iniciado' });
  },

  async listVinculos(): Promise<EtapaOrcamentoVinculo[]> {
    const { data, error } = await supabase.from('etapa_orcamento_vinculo').select('*');
    if (error) throw error;
    return data.map(vinculoFromRow);
  },

  async addVinculo(vinculo: EtapaOrcamentoVinculo): Promise<EtapaOrcamentoVinculo> {
    const { data, error } = await supabase
      .from('etapa_orcamento_vinculo')
      .insert({ id: vinculo.id, etapa_id: vinculo.etapaId, item_orcamento_id: vinculo.itemOrcamentoId, peso_percentual: vinculo.pesoPercentual })
      .select()
      .single();
    if (error) throw error;
    return vinculoFromRow(data);
  },

  async removeVinculo(id: string): Promise<void> {
    const { error } = await supabase.from('etapa_orcamento_vinculo').delete().eq('id', id);
    if (error) throw error;
  },
};
