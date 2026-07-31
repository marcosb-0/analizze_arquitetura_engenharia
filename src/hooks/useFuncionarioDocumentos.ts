import { useState } from 'react';
import { FuncionarioDocumento } from '../types';
import { funcionarioDocumentosService } from '../services/funcionarioDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useFuncionarioDocumentos(ativo = true) {
  const { toast } = useFeedback();
  // `session` segue aqui por causa do upload, que grava quem enviou o arquivo.
  // A leitura não precisa mais dela.
  const { session } = useAuth();
  const [funcionarioDocumentos, setFuncionarioDocumentos] = useState<FuncionarioDocumento[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => funcionarioDocumentosService.list(),
    aoChegar: setFuncionarioDocumentos,
    aoLimpar: () => setFuncionarioDocumentos([]),
    erro: 'Falha ao carregar documentos da equipe.',
  });

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
    const { aplicar, desfazer } = comRollback(setFuncionarioDocumentos);
    aplicar((prev) =>
      prev.map((d) => (d.id === id ? { ...d, validade: validade ?? undefined } : d))
    );
    try {
      await funcionarioDocumentosService.updateValidade(id, validade);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar validade.', err.message);
      return false;
    }
  };

  const handleDeleteFuncionarioDocumento = async (id: string) => {
    const doc = funcionarioDocumentos.find((d) => d.id === id);
    if (!doc) return;
    const { aplicar, desfazer } = comRollback(setFuncionarioDocumentos);
    aplicar((prev) => prev.filter((d) => d.id !== id));
    try {
      await funcionarioDocumentosService.remove(id, doc.storagePath);
    } catch (err: any) {
      desfazer();
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
