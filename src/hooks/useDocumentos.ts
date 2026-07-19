import { useEffect, useState } from 'react';
import { Documento } from '../types';
import { documentosService } from '../services/documentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useDocumentos() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddDocumento = async (doc: Documento, file?: File) => {
    if (!session) return;
    if (!file) {
      // ProjetoConsole's quick-add still doesn't collect a real file (Stage 8
      // migration pending) — real Storage objects need real bytes, so this
      // path is a no-op with a clear message instead of a fake DB row.
      toast.error('Anexe o arquivo pela aba Gestão Documental.', 'O upload rápido pelo console da obra ainda não suporta arquivos reais.');
      return;
    }
    try {
      const created = await documentosService.upload(doc, file, session.user.id);
      setDocumentos((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao enviar documento.', err.message);
    }
  };

  const handleAddVersion = async (documentoId: string, file: File, descricao: string) => {
    if (!session) return;
    const doc = documentos.find((d) => d.id === documentoId);
    if (!doc) return;
    try {
      const { versao, tamanho, historyEntry } = await documentosService.addVersion(
        documentoId,
        file,
        descricao,
        session.user.id,
        doc.projetoId,
        doc.versao
      );
      setDocumentos((prev) =>
        prev.map((d) =>
          d.id === documentoId
            ? { ...d, versao, tamanho, historicoVersoes: [historyEntry, ...(d.historicoVersoes ?? [])] }
            : d
        )
      );
    } catch (err: any) {
      toast.error('Falha ao registrar nova versão.', err.message);
    }
  };

  const handleDeleteDocumento = async (id: string) => {
    const previous = documentos;
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
    try {
      await documentosService.remove(id);
    } catch (err: any) {
      setDocumentos(previous);
      toast.error('Falha ao excluir documento.', err.message);
    }
  };

  const handleDownloadDocumento = async (doc: Documento) => {
    const latestPath = doc.historicoVersoes?.[0]?.storagePath;
    if (!latestPath) {
      toast.error('Arquivo não encontrado no armazenamento.');
      return;
    }
    try {
      const url = await documentosService.getDownloadUrl(latestPath);
      window.open(url, '_blank');
    } catch (err: any) {
      toast.error('Falha ao baixar documento.', err.message);
    }
  };

  return { documentos, loading, handleAddDocumento, handleAddVersion, handleDeleteDocumento, handleDownloadDocumento };
}
