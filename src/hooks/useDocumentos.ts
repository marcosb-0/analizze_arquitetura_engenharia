import { useEffect, useState } from 'react';
import { Documento } from '../types';
import { documentosService, NovaVersaoInput, recusaDoArquivo } from '../services/documentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Documentos da empresa (projetoId null) e das obras (projetoId preenchido)
 * vivem na mesma lista; quem separa é a tela. Documento de funcionário e de
 * cliente têm hooks próprios.
 *
 * Todo handler devolve boolean: antes o erro era engolido aqui num toast e a
 * tela seguia comemorando sucesso, então o usuário via o toast de erro e o de
 * "salvo com sucesso" ao mesmo tempo.
 */
export function useDocumentos() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocumentos = () => {
    if (!session) {
      setDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    documentosService
      .list()
      .then(setDocumentos)
      .catch((err) => toast.error('Falha ao carregar documentos.', err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddDocumento = async (
    doc: Pick<Documento, 'nome' | 'tipo' | 'projetoId'>,
    entrada: NovaVersaoInput
  ): Promise<boolean> => {
    if (!session) return false;
    const recusa = recusaDoArquivo(entrada.file);
    if (recusa) {
      toast.error('Arquivo recusado.', recusa);
      return false;
    }
    try {
      const created = await documentosService.upload(doc, entrada, session.user.id);
      setDocumentos((prev) => [created, ...prev]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar documento.', mensagemDeErro(err));
      return false;
    }
  };

  const handleAddVersion = async (documentoId: string, entrada: NovaVersaoInput): Promise<boolean> => {
    if (!session) return false;
    const doc = documentos.find((d) => d.id === documentoId);
    if (!doc) return false;
    const recusa = recusaDoArquivo(entrada.file);
    if (recusa) {
      toast.error('Arquivo recusado.', recusa);
      return false;
    }
    try {
      const { versao, tamanho, historyEntry } = await documentosService.addVersion(
        documentoId,
        entrada,
        session.user.id,
        doc.projetoId,
        doc.versao
      );
      setDocumentos((prev) =>
        prev.map((d) =>
          d.id === documentoId
            ? {
                ...d,
                versao,
                // A versão nova soma ao que já estava no bucket; não substitui.
                tamanhoBytes: d.tamanhoBytes + tamanho,
                contentType: historyEntry.contentType,
                validade: historyEntry.validade,
                historicoVersoes: [historyEntry, ...(d.historicoVersoes ?? [])],
              }
            : d
        )
      );
      return true;
    } catch (err: any) {
      toast.error('Falha ao registrar nova versão.', mensagemDeErro(err));
      return false;
    }
  };

  const handleUpdateDocumento = async (id: string, patch: { nome?: string; tipo?: string }): Promise<boolean> => {
    if (!session) return false;
    const previous = documentos;
    setDocumentos((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    try {
      await documentosService.updateMetadados(id, patch);
      return true;
    } catch (err: any) {
      setDocumentos(previous);
      toast.error('Falha ao atualizar documento.', mensagemDeErro(err));
      return false;
    }
  };

  const handleDeleteDocumento = async (id: string): Promise<boolean> => {
    const previous = documentos;
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
    try {
      await documentosService.remove(id);
      return true;
    } catch (err: any) {
      setDocumentos(previous);
      toast.error('Falha ao excluir documento.', err.message);
      return false;
    }
  };

  /** Abre a versão mais recente; `versao` permite baixar uma antiga do histórico. */
  const handleDownloadDocumento = async (doc: Documento, storagePath?: string) => {
    const alvo = storagePath ?? doc.historicoVersoes?.[0]?.storagePath;
    if (!alvo) {
      toast.error('Arquivo não encontrado no armazenamento.');
      return;
    }
    try {
      const url = await documentosService.getDownloadUrl(alvo);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      toast.error('Falha ao baixar documento.', err.message);
    }
  };

  /**
   * URL assinada para exibir o arquivo dentro da tela. Devolve null em vez de
   * lançar: pré-visualização quebrada vira um quadro com aviso, não um toast
   * de erro sobre algo que o usuário não pediu explicitamente.
   */
  const handlePreviewUrlDocumento = async (storagePath: string): Promise<string | null> => {
    try {
      return await documentosService.getDownloadUrl(storagePath);
    } catch {
      return null;
    }
  };

  return {
    documentos,
    loading,
    handlePreviewUrlDocumento,
    handleAddDocumento,
    handleAddVersion,
    handleUpdateDocumento,
    handleDeleteDocumento,
    handleDownloadDocumento,
    refetch: loadDocumentos,
  };
}

/**
 * A trava de escopo (trg_documento_categoria_escopo) chega como check_violation
 * com a mensagem crua do Postgres; vale mais que "erro ao salvar".
 */
function mensagemDeErro(err: any): string {
  if (err?.code === '23514' || err?.code === '23503') {
    return err.message ?? 'Categoria inválida para este tipo de documento.';
  }
  return err?.message ?? 'Erro desconhecido.';
}
