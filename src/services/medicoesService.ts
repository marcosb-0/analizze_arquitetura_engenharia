import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { FotoMedicao, MedicaoObra } from '../types';

const BUCKET = 'medicao-fotos';

function storagePathFor(projetoId: string, fileName: string): string {
  return `${projetoId}/${Date.now()}_${fileName}`;
}

export const medicoesService = {
  async list(): Promise<MedicaoObra[]> {
    // As três em blocos: `medicao_item_orcamento` é a que estoura primeiro (uma
    // linha por item de orçamento POR medição), e é justamente a que alimenta
    // `valorMedido`. Truncada, o valor medido de cada boletim fica menor do que é.
    const [medicoes, aplicados, fotos] = await Promise.all([
      buscarTudo((de, ate) =>
        supabase
          .from('medicoes_obra')
          .select('*')
          .order('data_medicao', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      buscarTudo((de, ate) =>
        supabase
          .from('medicao_item_orcamento')
          .select('medicao_id, valor_aplicado')
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      buscarTudo((de, ate) =>
        supabase
          .from('medicao_fotos')
          .select('medicao_id, storage_path')
          .order('id', { ascending: true })
          .range(de, ate)
      ),
    ]);

    const valorByMedicao = new Map<string, number>();
    for (const a of aplicados) {
      valorByMedicao.set(a.medicao_id, (valorByMedicao.get(a.medicao_id) ?? 0) + a.valor_aplicado);
    }
    const fotosByMedicao = new Map<string, FotoMedicao[]>();
    for (const f of fotos) {
      const list = fotosByMedicao.get(f.medicao_id) ?? [];
      list.push({ nome: f.storage_path.split('/').pop() ?? f.storage_path, storagePath: f.storage_path });
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
      status: m.status,
      motivoRejeicao: m.motivo_rejeicao ?? undefined,
      aprovadoPor: m.aprovado_por ?? undefined,
      aprovadoEm: m.aprovado_em ?? undefined,
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

    /**
     * As fotos sobem em paralelo e, se qualquer uma falhar, a medição inteira é
     * desfeita.
     *
     * Antes era um laço sequencial sem rollback: um erro na terceira foto lançava
     * e deixava a medição GRAVADA com as duas primeiras. O usuário via o erro,
     * tentava de novo, e passava a ter duas medições — a segunda somando de novo
     * no orçamento quando aprovada. Um boletim de campo com 8 fotos de celular em
     * rede ruim é justamente onde isso acontece.
     *
     * Também deixa de ser sequencial: 8 fotos eram 16 idas ao servidor em fila.
     */
    const fotosCriadas: FotoMedicao[] = [];
    const caminhosEnviados: string[] = [];
    try {
      const enviadas = await Promise.all(
        fotos.map(async (file) => {
          const path = storagePathFor(med.projetoId, file.name);
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
          if (upErr) throw upErr;
          caminhosEnviados.push(path);
          return { nome: file.name, storagePath: path };
        })
      );
      if (enviadas.length > 0) {
        const { error: fotoErr } = await supabase
          .from('medicao_fotos')
          .insert(enviadas.map((f) => ({ medicao_id: medRow.id, storage_path: f.storagePath, tirada_por: userId })));
        if (fotoErr) throw fotoErr;
      }
      fotosCriadas.push(...enviadas);
    } catch (err) {
      // Ordem do desfazer: primeiro a medição (é o que o usuário vê e o que
      // contamina o orçamento), depois os bytes já enviados.
      await supabase.from('medicoes_obra').delete().eq('id', medRow.id);
      if (caminhosEnviados.length > 0) {
        await supabase.storage.from(BUCKET).remove(caminhosEnviados);
      }
      throw err;
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
      fotos: fotosCriadas,
      observacoes: medRow.observacoes ?? '',
      status: medRow.status,
      motivoRejeicao: medRow.motivo_rejeicao ?? undefined,
      aprovadoPor: medRow.aprovado_por ?? undefined,
      aprovadoEm: medRow.aprovado_em ?? undefined,
    };
  },

  /** URL temporária para exibir a foto do boletim (bucket privado). */
  async fotoUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  },

  // Aprovar dispara o fan-out server-side (trigger). permitirOverrun libera o
  // acumulado > 100% da etapa. Ver fn_aprovar_medicao.
  async aprovar(medicaoId: string, permitirOverrun = false): Promise<void> {
    const { error } = await supabase.rpc('fn_aprovar_medicao', {
      p_medicao_id: medicaoId,
      p_permitir_overrun: permitirOverrun,
    });
    if (error) throw error;
  },

  // `motivo` vai para o campo ver por que o boletim foi recusado. O banco
  // normaliza espaço em branco para null (fn_rejeitar_medicao).
  async rejeitar(medicaoId: string, motivo: string): Promise<void> {
    const { error } = await supabase.rpc('fn_rejeitar_medicao', {
      p_medicao_id: medicaoId,
      p_motivo: motivo,
    });
    if (error) throw error;
  },
};
