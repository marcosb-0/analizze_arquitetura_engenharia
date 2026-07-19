import { supabase } from '../lib/supabaseClient';
import { Documento, DocumentoVersao, TipoDocumento } from '../types';

const BUCKET = 'documentos';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB < 0.1 ? `${(bytes / 1024).toFixed(0)} KB` : `${sizeInMB.toFixed(1)} MB`;
}

function storagePathFor(projetoId: string, fileName: string): string {
  return `${projetoId}/${Date.now()}_${fileName}`;
}

export const documentosService = {
  async list(): Promise<Documento[]> {
    const [
      { data: documentos, error: docError },
      { data: versoes, error: verError },
      { data: profiles, error: profError },
    ] = await Promise.all([
      supabase.from('documentos').select('*').order('created_at', { ascending: false }),
      supabase.from('documento_versoes').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email'),
    ]);
    if (docError) throw docError;
    if (verError) throw verError;
    if (profError) throw profError;

    const authorName = (autorId: string | null) => {
      const p = profiles.find((x) => x.id === autorId);
      return p?.full_name || p?.email || 'Sistema';
    };

    const versoesByDoc = new Map<string, DocumentoVersao[]>();
    for (const v of versoes) {
      const list = versoesByDoc.get(v.documento_id) ?? [];
      list.push({
        versao: v.versao,
        autor: authorName(v.autor_id),
        data: v.created_at.split('T')[0],
        descricao: v.descricao ?? '',
        storagePath: v.storage_path,
      });
      versoesByDoc.set(v.documento_id, list);
    }

    // Latest version's tamanho isn't stored in the versoes selection above
    // (we only pulled display fields) — pull the raw rows again for bytes/latest.
    const latestRawByDoc = new Map<string, { versao: string; tamanho_bytes: number | null }>();
    for (const v of versoes) {
      if (!latestRawByDoc.has(v.documento_id)) {
        latestRawByDoc.set(v.documento_id, { versao: v.versao, tamanho_bytes: v.tamanho_bytes });
      }
    }

    return documentos.map((d) => {
      const latest = latestRawByDoc.get(d.id);
      return {
        id: d.id,
        nome: d.nome,
        tipo: d.tipo as TipoDocumento,
        projetoId: d.projeto_id,
        dataCriacao: d.created_at.split('T')[0],
        versao: latest?.versao ?? '1.0',
        tamanho: formatBytes(latest?.tamanho_bytes ?? null),
        historicoVersoes: versoesByDoc.get(d.id) ?? [],
      };
    });
  },

  async upload(doc: Documento, file: File, userId: string): Promise<Documento> {
    const storagePath = storagePathFor(doc.projetoId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    // Roll back the just-uploaded object on any later failure so a rejected
    // insert never leaves an orphaned file in the bucket.
    const rollbackUpload = () => supabase.storage.from(BUCKET).remove([storagePath]);

    const { data: docRow, error: docError } = await supabase
      .from('documentos')
      .insert({ id: doc.id, projeto_id: doc.projetoId, nome: doc.nome, tipo: doc.tipo, criado_por: userId })
      .select()
      .single();
    if (docError) {
      await rollbackUpload();
      throw docError;
    }

    const { error: verError } = await supabase.from('documento_versoes').insert({
      documento_id: docRow.id,
      versao: doc.versao || '1.0',
      storage_path: storagePath,
      tamanho_bytes: file.size,
      descricao: 'Arquivo inicial carregado no sistema.',
      autor_id: userId,
    });
    if (verError) {
      await rollbackUpload();
      await supabase.from('documentos').delete().eq('id', docRow.id);
      throw verError;
    }

    return {
      ...doc,
      id: docRow.id,
      dataCriacao: docRow.created_at.split('T')[0],
      tamanho: formatBytes(file.size),
      historicoVersoes: [
        { versao: doc.versao || '1.0', autor: 'Você', data: docRow.created_at.split('T')[0], descricao: 'Arquivo inicial carregado no sistema.', storagePath },
      ],
    };
  },

  async addVersion(
    documentoId: string,
    file: File,
    descricao: string,
    userId: string,
    projetoId: string,
    currentVersao: string
  ): Promise<{ versao: string; tamanho: string; historyEntry: DocumentoVersao }> {
    const storagePath = storagePathFor(projetoId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    const nextVersao = (parseFloat(currentVersao) + 0.1).toFixed(1);
    const { data, error } = await supabase
      .from('documento_versoes')
      .insert({
        documento_id: documentoId,
        versao: nextVersao,
        storage_path: storagePath,
        tamanho_bytes: file.size,
        descricao,
        autor_id: userId,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw error;
    }

    return {
      versao: nextVersao,
      tamanho: formatBytes(file.size),
      historyEntry: { versao: nextVersao, autor: 'Você', data: data.created_at.split('T')[0], descricao, storagePath },
    };
  },

  async remove(id: string): Promise<void> {
    const { data: versoes } = await supabase.from('documento_versoes').select('storage_path').eq('documento_id', id);
    if (versoes && versoes.length > 0) {
      await supabase.storage.from(BUCKET).remove(versoes.map((v) => v.storage_path));
    }
    const { error } = await supabase.from('documentos').delete().eq('id', id);
    if (error) throw error;
  },

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
