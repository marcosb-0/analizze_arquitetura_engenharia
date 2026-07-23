import { supabase } from '../lib/supabaseClient';
import { ClienteDocumento } from '../types';

const BUCKET = 'cliente-documentos';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB < 0.1 ? `${(bytes / 1024).toFixed(0)} KB` : `${sizeInMB.toFixed(1)} MB`;
}

function storagePathFor(clienteId: string, fileName: string): string {
  return `${clienteId}/${Date.now()}_${fileName}`;
}

function fromRow(row: {
  id: string; cliente_id: string; nome: string; storage_path: string;
  content_type: string; tamanho_bytes: number | null; created_at: string;
}): ClienteDocumento {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nome: row.nome,
    contentType: row.content_type,
    tamanho: formatBytes(row.tamanho_bytes),
    storagePath: row.storage_path,
    criadoEm: row.created_at,
  };
}

export const clienteDocumentosService = {
  async list(): Promise<ClienteDocumento[]> {
    const { data, error } = await supabase.from('cliente_documentos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  },

  async upload(clienteId: string, file: File, userId: string): Promise<ClienteDocumento> {
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      throw new Error('Formato não suportado. Envie uma imagem (JPG/PNG/WEBP/HEIC) ou um PDF.');
    }

    const storagePath = storagePathFor(clienteId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('cliente_documentos')
      .insert({
        cliente_id: clienteId,
        nome: file.name,
        storage_path: storagePath,
        content_type: file.type,
        tamanho_bytes: file.size,
        criado_por: userId,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw error;
    }

    return fromRow(data);
  },

  async remove(id: string, storagePath: string): Promise<void> {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    const { error } = await supabase.from('cliente_documentos').delete().eq('id', id);
    if (error) throw error;
  },

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
