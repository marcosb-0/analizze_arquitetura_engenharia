import { supabase } from '../lib/supabaseClient';
import { buscarTudo } from './paginacao';
import { garantirEscrita, semPermissao } from './escrita';
import { Documento, DocumentoVersao } from '../types';

const BUCKET = 'documentos';

/** Prefixo de path para o que não pertence a nenhuma obra. */
const PASTA_EMPRESA = 'empresa';

export const TIPOS_ACEITOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/** O texto do modal prometia 50MB e nada era verificado. Agora é. */
export const TAMANHO_MAX_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB < 0.1 ? `${(bytes / 1024).toFixed(0)} KB` : `${sizeInMB.toFixed(1)} MB`;
}

/**
 * Versão como inteiro sequencial exibido em 'N.0'. Antes era
 * `parseFloat(atual) + 0.1`, que transformava qualquer rótulo digitado à mão
 * ("Rev A", "v1") em NaN e contaminava todas as versões seguintes.
 */
export function proximaVersao(atual: string): string {
  const n = Number.parseInt(atual, 10);
  return `${(Number.isFinite(n) ? n : 1) + 1}.0`;
}

function storagePathFor(projetoId: string | null, fileName: string): string {
  // Sem acento/espaço/barra: o Storage aceita, mas o path vaza para a URL
  // assinada e para o nome do arquivo baixado.
  const seguro = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_');
  return `${projetoId ?? PASTA_EMPRESA}/${Date.now()}_${seguro}`;
}

/** Motivo pelo qual o arquivo não serve, ou null se estiver tudo certo. */
export function recusaDoArquivo(file: File): string | null {
  if (file.size > TAMANHO_MAX_BYTES) {
    return `O arquivo tem ${formatBytes(file.size)} e o limite é ${formatBytes(TAMANHO_MAX_BYTES)}.`;
  }
  if (file.type && !TIPOS_ACEITOS.includes(file.type)) {
    return 'Formato não aceito. Envie PDF, imagem (JPG, PNG, WEBP), DOC/DOCX ou XLS/XLSX.';
  }
  return null;
}

export interface NovaVersaoInput {
  file: File;
  descricao: string;
  validade?: string;
}

export const documentosService = {
  /**
   * Traz documentos dos dois escopos de uma vez — a aba da empresa e o console
   * da obra filtram por `projetoId` em memória, e o volume aqui é o de uma
   * construtora, não o de um drive.
   */
  async list(): Promise<Documento[]> {
    const [documentos, versoes, profiles] = await Promise.all([
      buscarTudo((de, ate) =>
        supabase
          .from('documentos')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      // Antes: `.limit(10000)`. Era o mesmo teto do PostgREST com um número
      // diferente — acima de 10.000 versões o corte silencioso voltava, e o
      // sintoma é documento antigo aparecendo SEM versão nenhuma (logo sem
      // tamanho e sem arquivo para baixar).
      buscarTudo((de, ate) =>
        supabase
          .from('documento_versoes')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(de, ate)
      ),
      buscarTudo((de, ate) =>
        supabase.from('profiles').select('id, full_name, email').order('id', { ascending: true }).range(de, ate)
      ),
    ]);

    const nomePorId = new Map(profiles.map((p) => [p.id, p.full_name || p.email || 'Sistema']));

    // Como vem ordenado por created_at desc, a primeira versão de cada
    // documento é a atual.
    const versoesByDoc = new Map<string, DocumentoVersao[]>();
    const bytesByDoc = new Map<string, number>();
    for (const v of versoes) {
      const lista = versoesByDoc.get(v.documento_id) ?? [];
      lista.push({
        versao: v.versao,
        autor: (v.autor_id && nomePorId.get(v.autor_id)) || 'Sistema',
        data: v.created_at.split('T')[0],
        descricao: v.descricao ?? '',
        storagePath: v.storage_path,
        contentType: v.content_type ?? undefined,
        validade: v.validade ?? undefined,
      });
      versoesByDoc.set(v.documento_id, lista);
      // Todas as versões ocupam bucket, não só a atual.
      bytesByDoc.set(v.documento_id, (bytesByDoc.get(v.documento_id) ?? 0) + (v.tamanho_bytes ?? 0));
    }

    return documentos.map((d) => {
      const historico = versoesByDoc.get(d.id) ?? [];
      const atual = historico[0];
      return {
        id: d.id,
        nome: d.nome,
        tipo: d.tipo,
        projetoId: d.projeto_id,
        dataCriacao: d.created_at.split('T')[0],
        versao: atual?.versao ?? '1.0',
        tamanhoBytes: bytesByDoc.get(d.id) ?? 0,
        contentType: atual?.contentType,
        validade: atual?.validade,
        historicoVersoes: historico,
      };
    });
  },

  async upload(
    doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>,
    entrada: NovaVersaoInput,
    userId: string
  ): Promise<Documento> {
    const { file, validade } = entrada;
    const storagePath = storagePathFor(doc.projetoId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    // Desfaz o objeto recém-enviado em qualquer falha posterior, para que um
    // insert recusado não deixe arquivo órfão no bucket.
    const rollbackUpload = () => supabase.storage.from(BUCKET).remove([storagePath]);

    const { data: docRow, error: docError } = await supabase
      .from('documentos')
      .insert({ projeto_id: doc.projetoId, nome: doc.nome, tipo: doc.tipo, criado_por: userId })
      .select()
      .single();
    if (docError) {
      await rollbackUpload();
      throw docError;
    }

    const descricao = 'Arquivo inicial carregado no sistema.';
    const { data: verRow, error: verError } = await supabase
      .from('documento_versoes')
      .insert({
        documento_id: docRow.id,
        versao: '1.0',
        storage_path: storagePath,
        tamanho_bytes: file.size,
        content_type: file.type || null,
        validade: validade || null,
        descricao,
        autor_id: userId,
      })
      .select()
      .single();
    if (verError) {
      await rollbackUpload();
      // Compensação de melhor esforço, sem checar linhas de propósito: quem
      // acabou de inserir `docRow` tem permissão para apagá-lo, e o erro que
      // interessa relançar é o `verError`, não uma falha na limpeza.
      await supabase.from('documentos').delete().eq('id', docRow.id);
      throw verError;
    }

    return {
      id: docRow.id,
      nome: docRow.nome,
      tipo: docRow.tipo,
      projetoId: docRow.projeto_id,
      dataCriacao: docRow.created_at.split('T')[0],
      versao: '1.0',
      tamanhoBytes: file.size,
      contentType: file.type || undefined,
      validade: validade || undefined,
      historicoVersoes: [
        {
          versao: '1.0',
          autor: 'Você',
          data: verRow.created_at.split('T')[0],
          descricao,
          storagePath,
          contentType: file.type || undefined,
          validade: validade || undefined,
        },
      ],
    };
  },

  async addVersion(
    documentoId: string,
    entrada: NovaVersaoInput,
    userId: string,
    projetoId: string | null,
    versaoAtual: string
  ): Promise<{ versao: string; tamanho: number; historyEntry: DocumentoVersao }> {
    const { file, descricao, validade } = entrada;
    const storagePath = storagePathFor(projetoId, file.name);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
    if (uploadError) throw uploadError;

    const versao = proximaVersao(versaoAtual);
    const { data, error } = await supabase
      .from('documento_versoes')
      .insert({
        documento_id: documentoId,
        versao,
        storage_path: storagePath,
        tamanho_bytes: file.size,
        content_type: file.type || null,
        validade: validade || null,
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
      versao,
      tamanho: file.size,
      historyEntry: {
        versao,
        autor: 'Você',
        data: data.created_at.split('T')[0],
        descricao,
        storagePath,
        contentType: file.type || undefined,
        validade: validade || undefined,
      },
    };
  },

  /** Edita só os metadados; arquivo se troca registrando nova versão. */
  async updateMetadados(id: string, patch: { nome?: string; tipo?: string }): Promise<void> {
    const { data, error } = await supabase.from('documentos').update(patch).eq('id', id).select('id');
    if (error) throw error;
    garantirEscrita(data, semPermissao('editar este documento'));
  },

  async remove(id: string): Promise<void> {
    // A linha primeiro: se o delete falhar depois de limpar o bucket, sobraria
    // um documento listado cujos arquivos já não existem. Na ordem inversa, o
    // pior caso são bytes órfãos — invisíveis, mas recuperáveis.
    const { data: versoes } = await supabase.from('documento_versoes').select('storage_path').eq('documento_id', id);
    const { data: apagadas, error } = await supabase.from('documentos').delete().eq('id', id).select('id');
    if (error) throw error;
    // Antes de apagar bytes, confirme que a linha saiu: um delete recusado pela
    // RLS volta como sucesso, e limpar o bucket aí destruiria o arquivo de um
    // documento que continua listado.
    garantirEscrita(apagadas, semPermissao('excluir este documento'));

    if (versoes && versoes.length > 0) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(versoes.map((v) => v.storage_path));
      if (storageError) {
        // Não relança: o documento já saiu da vista do usuário e repetir a
        // exclusão não desfaria nada.
        console.warn('Documento excluído, mas os arquivos seguem no bucket:', storageError.message);
      }
    }
  },

  async getDownloadUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
