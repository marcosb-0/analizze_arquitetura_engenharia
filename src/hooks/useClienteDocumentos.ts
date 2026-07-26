import { useEffect, useState } from 'react';
import { ClienteDocumento } from '../types';
import { clienteDocumentosService } from '../services/clienteDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * `ativo` adia a busca até a aba que precisa destes dados ser aberta.
 *
 * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
 * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
 * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
 * idas ao servidor antes do primeiro pixel útil.
 *
 * Uma vez ativo, continua ativo (ver App.tsx): voltar a uma aba já visitada não
 * refaz a busca.
 */
export function useClienteDocumentos(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [clienteDocumentos, setClienteDocumentos] = useState<ClienteDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !ativo) {
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
  }, [session?.user.id, ativo]);

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
