import { useEffect, useState } from 'react';
import { FuncionarioDocumento } from '../types';
import { funcionarioDocumentosService } from '../services/funcionarioDocumentosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';

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
export function useFuncionarioDocumentos(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [funcionarioDocumentos, setFuncionarioDocumentos] = useState<FuncionarioDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * `userId` em vez de `session` nas dependências, de propósito.
   *
   * O supabase-js cria um OBJETO de sessão novo a cada renovação de token (~1h) e
   * a cada `onAuthStateChange`. Depender de `session` refaria todas as buscas do
   * app de hora em hora, sem nada ter mudado. O id é o que de fato identifica de
   * quem são os dados.
   *
   * Antes isto era um `// eslint-disable-next-line react-hooks/exhaustive-deps`,
   * que calava a regra sem registrar o motivo. Agora a lista está honesta e a
   * regra volta a proteger o efeito.
   */
  useEffect(() => {
    if (!userId || !ativo) {
      setFuncionarioDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => funcionarioDocumentosService.list(),
      setFuncionarioDocumentos,
      (err) => toast.error('Falha ao carregar documentos da equipe.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

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
