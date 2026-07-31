import { useState } from 'react';
import { ClienteDocumento } from '../types';
import { clienteDocumentosService } from '../services/clienteDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useClienteDocumentos(ativo = true) {
  const { toast } = useFeedback();
  // `session` segue aqui por causa do upload, que grava quem enviou o arquivo.
  // A leitura não precisa mais dela.
  const { session } = useAuth();
  const [clienteDocumentos, setClienteDocumentos] = useState<ClienteDocumento[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => clienteDocumentosService.list(),
    aoChegar: setClienteDocumentos,
    aoLimpar: () => setClienteDocumentos([]),
    erro: 'Falha ao carregar documentos do cliente.',
  });

  const handleUploadClienteDocumento = async (clienteId: string, file: File) => {
    if (!session) return;
    try {
      const created = await clienteDocumentosService.upload(clienteId, file, session.user.id);
      setClienteDocumentos((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao enviar documento.', err.message);
    }
  };

  const handleDeleteClienteDocumento = async (id: string) => {
    const doc = clienteDocumentos.find((d) => d.id === id);
    if (!doc) return;
    const { aplicar, desfazer } = comRollback(setClienteDocumentos);
    aplicar((prev) => prev.filter((d) => d.id !== id));
    try {
      await clienteDocumentosService.remove(id, doc.storagePath);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir documento.', err.message);
    }
  };

  const handleDownloadClienteDocumento = async (doc: ClienteDocumento) => {
    try {
      const url = await clienteDocumentosService.getDownloadUrl(doc.storagePath);
      window.open(url, '_blank');
    } catch (err: any) {
      toast.error('Falha ao baixar documento.', err.message);
    }
  };

  return {
    clienteDocumentos,
    loading,
    handleUploadClienteDocumento,
    handleDeleteClienteDocumento,
    handleDownloadClienteDocumento,
  };
}
