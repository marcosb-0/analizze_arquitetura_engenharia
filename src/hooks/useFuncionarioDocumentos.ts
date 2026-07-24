import { useEffect, useState } from 'react';
import { FuncionarioDocumento } from '../types';
import { funcionarioDocumentosService } from '../services/funcionarioDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useFuncionarioDocumentos() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [funcionarioDocumentos, setFuncionarioDocumentos] = useState<FuncionarioDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setFuncionarioDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    funcionarioDocumentosService
      .list()
      .then(setFuncionarioDocumentos)
      .catch((err) => toast.error('Falha ao carregar documentos da equipe.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleUploadFuncionarioDocumento = async (
    funcionarioId: string,
    file: File,
    validade: string | null
  ): Promise<boolean> => {
    if (!session) return false;
    try {
      const created = await funcionarioDocumentosService.upload(funcionarioId, file, validade, session.user.id);
      setFuncionarioDocumentos((prev) => [created, ...prev]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao enviar documento.', err.message);
      return false;
    }
  };

  const handleUpdateValidadeDocumento = async (id: string, validade: string | null): Promise<boolean> => {
    const previous = funcionarioDocumentos;
    setFuncionarioDocumentos((prev) =>
      prev.map((d) => (d.id === id ? { ...d, validade: validade ?? undefined } : d))
    );
    try {
      await funcionarioDocumentosService.updateValidade(id, validade);
      return true;
    } catch (err: any) {
      setFuncionarioDocumentos(previous);
      toast.error('Falha ao atualizar validade.', err.message);
      return false;
    }
  };

  const handleDeleteFuncionarioDocumento = async (id: string) => {
    const doc = funcionarioDocumentos.find((d) => d.id === id);
    if (!doc) return;
    const previous = funcionarioDocumentos;
    setFuncionarioDocumentos((prev) => prev.filter((d) => d.id !== id));
    try {
      await funcionarioDocumentosService.remove(id, doc.storagePath);
    } catch (err: any) {
      setFuncionarioDocumentos(previous);
      toast.error('Falha ao excluir documento.', err.message);
    }
  };

  const handleDownloadFuncionarioDocumento = async (doc: FuncionarioDocumento) => {
    try {
      const url = await funcionarioDocumentosService.getDownloadUrl(doc.storagePath);
      window.open(url, '_blank');
    } catch (err: any) {
      toast.error('Falha ao baixar documento.', err.message);
    }
  };

  return {
    funcionarioDocumentos,
    loading,
    handleUploadFuncionarioDocumento,
    handleUpdateValidadeDocumento,
    handleDeleteFuncionarioDocumento,
    handleDownloadFuncionarioDocumento,
  };
}
