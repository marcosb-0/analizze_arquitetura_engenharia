import { useEffect, useState } from 'react';
import { ClienteDocumento } from '../types';
import { clienteDocumentosService } from '../services/clienteDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useClienteDocumentos() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [clienteDocumentos, setClienteDocumentos] = useState<ClienteDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setClienteDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    clienteDocumentosService
      .list()
      .then(setClienteDocumentos)
      .catch((err) => toast.error('Falha ao carregar documentos do cliente.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

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
    const previous = clienteDocumentos;
    setClienteDocumentos((prev) => prev.filter((d) => d.id !== id));
    try {
      await clienteDocumentosService.remove(id, doc.storagePath);
    } catch (err: any) {
      setClienteDocumentos(previous);
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
