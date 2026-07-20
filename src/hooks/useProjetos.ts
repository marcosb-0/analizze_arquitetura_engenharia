import { useEffect, useState } from 'react';
import { Projeto } from '../types';
import { projetosService } from '../services/projetosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useProjetos() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setProjetos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    projetosService
      .list()
      .then(setProjetos)
      .catch((err) => toast.error('Falha ao carregar projetos.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const refreshProjetos = () => projetosService.list().then(setProjetos).catch(() => {});

  const handleAddProjeto = async (proj: Projeto) => {
    try {
      const created = await projetosService.add(proj);
      setProjetos((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao criar projeto.', err.message);
    }
  };

  // Atomic manual creation via fn_criar_projeto_manual — also creates the 5
  // default staggered etapas server-side in the same transaction, so this
  // reloads projetos afterward (the caller also refreshes cronograma).
  const handleCreateManualProjeto = async (proj: Projeto): Promise<string | null> => {
    try {
      const { id } = await projetosService.createManual(proj);
      await refreshProjetos();
      return id;
    } catch (err: any) {
      toast.error('Falha ao criar projeto.', err.message);
      return null;
    }
  };

  // Atomic conversion via fn_criar_projeto_padrao — also creates the default
  // orçamento/cronograma/vínculos server-side, so this just reloads projetos
  // afterward instead of trying to reconstruct the row optimistically.
  const handleConvertToProject = async (propostaId: string): Promise<string | null> => {
    try {
      const { id } = await projetosService.convertProposta(propostaId);
      await refreshProjetos();
      return id;
    } catch (err: any) {
      toast.error('Falha ao converter proposta em projeto.', err.message);
      return null;
    }
  };

  const handleUpdateProjetoSituacao = async (id: string, situacao: Projeto['situacao']) => {
    const previous = projetos;
    setProjetos((prev) => prev.map((p) => (p.id === id ? { ...p, situacao } : p)));
    try {
      await projetosService.updateSituacao(id, situacao);
    } catch (err: any) {
      setProjetos(previous);
      toast.error('Falha ao atualizar situação do projeto.', err.message);
    }
  };

  const handleDeleteProjeto = async (id: string) => {
    const previous = projetos;
    setProjetos((prev) => prev.filter((p) => p.id !== id));
    try {
      await projetosService.remove(id);
    } catch (err: any) {
      setProjetos(previous);
      toast.error('Falha ao excluir projeto.', err.message);
    }
  };

  return { projetos, loading, handleAddProjeto, handleCreateManualProjeto, handleConvertToProject, handleUpdateProjetoSituacao, handleDeleteProjeto };
}
