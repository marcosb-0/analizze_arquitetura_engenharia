import { supabase } from '../lib/supabaseClient';
import { FuncionarioDocumento } from '../types';

const BUCKET = 'funcionario-documentos';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB < 0.1 ? `${(bytes / 1024).toFixed(0)} KB` : `${sizeInMB.toFixed(1)} MB`;
}

function storagePathFor(funcionarioId: string, fileName: string): string {
  return `${funcionarioId}/${Date.now()}_${fileName}`;
}

function fromRow(row: {
  id: string; funcionario_id: string; nome: string; storage_path: string;
  content_type: string; tamanho_bytes: number | null; validade: string | null; created_at: string;
}): FuncionarioDocumento {
  return {
    id: row.id,
    funcionarioId: row.funcionario_id,
    nome: row.nome,
    contentType: row.content_type,
    tamanho: formatBytes(row.tamanho_bytes),
    storagePath: row.storage_path,
    validade: row.validade ?? undefined,
    criadoEm: row.created_at,
  };
}

export const funcionarioDocumentosService = {
  async list(): Promise<FuncionarioDocumento[]> {
    const { data, error } = await supabase
      .from('funcionario_documentos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  },

  async upload(
    funcionarioId: string,
    file: File,
    validade: string | null,
    userId: string
  ): Promise<FuncionarioDocumento> {
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      throw new Error('Formato não suportado. Envie uma imagem (JPG/PNG/WEBP/HEIC) ou um PDF.');
    }

    const storagePath = storagePathFor(funcionarioId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('funcionario_documentos')
      .insert({
        funcionario_id: funcionarioId,
        nome: file.name,
        storage_path: storagePath,
        content_type: file.type,
        tamanho_bytes: file.size,
        validade: validade || null,
        criado_por: userId,
      })
      .select()
      .single();
    if (error) {
      // Não deixa o arquivo órfão no bucket quando a linha não entra.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw error;
    }

    return fromRow(data);
  },

  async updateValidade(id: string, validade: string | null): Promise<FuncionarioDocumento> {
    const { data, error } = await supabase
      .from('funcionario_documentos')
      .update({ validade: validade || null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async remove(id: string, storagePath: string): Promise<void> {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    const { error } = await supabase.from('funcionario_documentos').delete().eq('id', id);
    if (error) throw error;
  },

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
