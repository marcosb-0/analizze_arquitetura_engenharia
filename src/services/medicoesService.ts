import { supabase } from '../lib/supabaseClient';
import { MedicaoObra } from '../types';

const BUCKET = 'medicao-fotos';

function storagePathFor(projetoId: string, fileName: string): string {
  return `${projetoId}/${Date.now()}_${fileName}`;
}

export const medicoesService = {
  async list(): Promise<MedicaoObra[]> {
    const [
      { data: medicoes, error: medError },
      { data: aplicados, error: apError },
      { data: fotos, error: fotoError },
    ] = await Promise.all([
      supabase.from('medicoes_obra').select('*').order('data_medicao', { ascending: false }),
      supabase.from('medicao_item_orcamento').select('medicao_id, valor_aplicado'),
      supabase.from('medicao_fotos').select('medicao_id, storage_path'),
    ]);
    if (medError) throw medError;
    if (apError) throw apError;
    if (fotoError) throw fotoError;

    const valorByMedicao = new Map<string, number>();
    for (const a of aplicados) {
      valorByMedicao.set(a.medicao_id, (valorByMedicao.get(a.medicao_id) ?? 0) + a.valor_aplicado);
    }
    const fotosByMedicao = new Map<string, string[]>();
    for (const f of fotos) {
      const list = fotosByMedicao.get(f.medicao_id) ?? [];
      list.push(f.storage_path.split('/').pop() ?? f.storage_path);
      fotosByMedicao.set(f.medicao_id, list);
    }

    return medicoes.map((m) => ({
      id: m.id,
      projetoId: m.projeto_id,
      dataMedicao: m.data_medicao,
      etapaId: m.etapa_id,
      percentualMedido: m.percentual_medido,
      valorMedido: valorByMedicao.get(m.id) ?? 0,
      fotos: fotosByMedicao.get(m.id) ?? [],
      observacoes: m.observacoes ?? '',
    }));
  },

  /**
   * Inserts the medicao row (server-side trigger fan-outs valor per orçamento
   * line via etapa_orcamento_vinculo — fix #1), then uploads any attached
   * photos to real Storage (fix #6, replacing filename-only fakes).
   */
  async add(
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[],
    userId: string
  ): Promise<MedicaoObra> {
    const { data: medRow, error: medError } = await supabase
      .from('medicoes_obra')
      .insert({
        projeto_id: med.projetoId,
        etapa_id: med.etapaId,
        percentual_medido: med.percentualMedido,
        observacoes: med.observacoes,
        criado_por: userId,
      })
      .select()
      .single();
    if (medError) throw medError;

    const fotoNames: string[] = [];
    for (const file of fotos) {
      const path = storagePathFor(med.projetoId, file.name);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error: fotoErr } = await supabase.from('medicao_fotos').insert({ medicao_id: medRow.id, storage_path: path, tirada_por: userId });
      if (fotoErr) throw fotoErr;
      fotoNames.push(file.name);
    }

    const { data: aplicados } = await supabase.from('medicao_item_orcamento').select('valor_aplicado').eq('medicao_id', medRow.id);
    const valorMedido = (aplicados ?? []).reduce((sum, a) => sum + a.valor_aplicado, 0);

    return {
      id: medRow.id,
      projetoId: medRow.projeto_id,
      dataMedicao: medRow.data_medicao,
      etapaId: medRow.etapa_id,
      percentualMedido: medRow.percentual_medido,
      valorMedido,
      fotos: fotoNames,
      observacoes: medRow.observacoes ?? '',
    };
  },
};
