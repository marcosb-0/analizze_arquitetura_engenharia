import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { FotoMedicao, MedicaoObra, NovaMedicao } from '../types';

const BUCKET = 'medicao-fotos';

function storagePathFor(projetoId: string, fileName: string): string {
  return `${projetoId}/${Date.now()}_${fileName}`;
}

export const medicoesService = {
  /**
   * Os boletins de UMA obra, com valor aplicado e fotos — item 23, peça 2 (§4.2).
   *
   * Esta era de longe a leitura mais cara do app: TRÊS tabelas inteiras, e a do
   * meio (`medicao_item_orcamento`) tem uma linha por item de orçamento POR
   * medição — ela cresce como o produto das outras duas. O console é o único que
   * precisa do boletim linha a linha; o painel lê `v_medicao_recente` com limite
   * e o Financeiro lê só as que faltam faturar.
   *
   * As duas leituras de apoio são filtradas pelos ids dos boletins da obra, e
   * não por obra: nem `medicao_item_orcamento` nem `medicao_fotos` têm
   * `projeto_id` — a obra vem da medição.
   */
  async list(projetoId: string): Promise<MedicaoObra[]> {
    const medicoes = await buscarTudo((de, ate) =>
      supabase
        .from('medicoes_obra')
        .select('*')
        .eq('projeto_id', projetoId)
        .order('data_medicao', { ascending: false })
        .order('id', { ascending: true })
        .range(de, ate)
    );

    const ids = medicoes.map((m) => m.id);
    // Obra sem boletim: `.in('medicao_id', [])` seriam duas idas garantidamente
    // vazias, e obra nova é o caso mais comum de todos.
    const [aplicados, fotos] = ids.length === 0 ? [[], []] : await Promise.all([
      buscarTudo((de, ate) =>
        supabase
          .from('medicao_item_orcamento')
          .select('medicao_id, valor_aplicado')
          .in('medicao_id', ids)
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      buscarTudo((de, ate) =>
        supabase
          .from('medicao_fotos')
          .select('medicao_id, storage_path')
          .in('medicao_id', ids)
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
      quantidadeMedida: m.quantidade_medida ?? undefined,
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
   *
   * No modo quantidade, `percentual_medido` NÃO é enviado: quem o preenche é
   * `fn_medicao_deriva_percentual` (20260815100000), e mandar um valor junto
   * seria escrever um número que o trigger descarta — funcionaria, e esconderia
   * de quem lesse depois que a fonte do percentual é o servidor. É por isso que
   * os dois campos nunca viajam juntos, e o `.select().single()` logo abaixo é
   * o que traz de volta o percentual REAL para a tela mostrar.
   */
  async add(med: NovaMedicao, fotos: File[], userId: string): Promise<MedicaoObra> {
    const { data: medRow, error: medError } = await supabase
      .from('medicoes_obra')
      .insert({
        projeto_id: med.projetoId,
        etapa_id: med.etapaId,
        ...(med.quantidadeMedida !== undefined
          ? { quantidade_medida: med.quantidadeMedida }
          : { percentual_medido: med.percentualMedido }),
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
      quantidadeMedida: medRow.quantidade_medida ?? undefined,
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
