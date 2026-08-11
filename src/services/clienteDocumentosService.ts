import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { ClienteDocumento } from '../types';
import { contentTypeDe, formatBytes, recusaDoAnexo } from './documentosRegras';

const BUCKET = 'cliente-documentos';

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
    const linhas = await buscarTudo((de, ate) =>
      supabase.from('cliente_documentos').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(de, ate)
    );
    return linhas.map(fromRow);
  },

  async upload(clienteId: string, file: File, userId: string): Promise<ClienteDocumento> {
    const recusa = recusaDoAnexo(file);
    if (recusa) throw new Error(recusa);

    // `contentType` explícito: o bucket tem lista de mime e o navegador manda
    // o tipo vazio com frequência. Ver `contentTypeDe` e §10.2 da auditoria.
    const contentType = contentTypeDe(file);
    const storagePath = storagePathFor(clienteId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('cliente_documentos')
      .insert({
        cliente_id: clienteId,
        nome: file.name,
        storage_path: storagePath,
        content_type: contentType,
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
    // A LINHA PRIMEIRO, o arquivo depois.
    //
    // Estava invertido: o `remove` do Storage vinha antes, então um `delete`
    // recusado pela RLS (que volta como sucesso com zero linhas — ver
    // `escrita.ts`) deixava o documento LISTADO com o arquivo já destruído.
    // Irrecuperável, e a tela não dava nenhum sinal.
    //
    // `documentosService.remove` já fazia na ordem certa e explicava o motivo;
    // este service e o de funcionário faziam o contrário. Na ordem correta o pior
    // caso são bytes órfãos no bucket — invisíveis, mas recuperáveis.
    const { data, error } = await supabase.from('cliente_documentos').delete().eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('excluir este documento'));

    const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (storageError) {
      // Não relança: a linha já saiu e repetir a exclusão não desfaria nada.
      console.warn('Documento excluído, mas o arquivo segue no bucket:', storageError.message);
    }
  },

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
