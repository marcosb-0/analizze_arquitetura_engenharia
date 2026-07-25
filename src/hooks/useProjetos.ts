import { useEffect, useState } from 'react';
import { EdicaoObra, Projeto, ConversaoObraPayload } from '../types';
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

  // Wizard-driven conversion via fn_criar_projeto_from_proposta — persists the
  // reviewed orçamento/cronograma/vínculos server-side, then reloads projetos.
  const handleConvertFromProposta = async (propostaId: string, payload: ConversaoObraPayload): Promise<string | null> => {
    try {
      const { id } = await projetosService.convertPropostaWithPayload(propostaId, payload);
      await refreshProjetos();
      return id;
    } catch (err: any) {
      toast.error('Falha ao converter proposta em obra.', err.message);
      return null;
    }
  };

  /**
   * Edição da obra. Recarrega a lista em vez de remendar o estado local porque
   * `responsavelInterno` é o nome resolvido a partir de `funcionarios` no
   * service — trocar o responsável sem recarregar deixaria o nome antigo na tela.
   */
  const handleUpdateProjeto = async (id: string, patch: EdicaoObra): Promise<boolean> => {
    try {
      await projetosService.update(id, patch);
      await refreshProjetos();
      return true;
    } catch (err: any) {
      toast.error('Falha ao atualizar a obra.', err.message);
      return false;
    }
  };

  // Os dois writes otimistas abaixo devolvem se a escrita realmente aconteceu —
  // é o que permite à tela só confirmar depois do banco, em vez de anunciar
  // sucesso e desfazer o estado logo em seguida.
  const handleUpdateProjetoSituacao = async (id: string, situacao: Projeto['situacao']): Promise<boolean> => {
    const previous = projetos;
    setProjetos((prev) => prev.map((p) => (p.id === id ? { ...p, situacao } : p)));
    try {
      await projetosService.updateSituacao(id, situacao);
      return true;
    } catch (err: any) {
      setProjetos(previous);
      toast.error('Falha ao atualizar situação do projeto.', err.message);
      return false;
    }
  };

  const handleDeleteProjeto = async (id: string): Promise<boolean> => {
    const previous = projetos;
    setProjetos((prev) => prev.filter((p) => p.id !== id));
    try {
      await projetosService.remove(id);
      return true;
    } catch (err: any) {
      setProjetos(previous);
      toast.error('Falha ao excluir projeto.', err.message);
      return false;
    }
  };

  return {
    projetos,
    loading,
    handleCreateManualProjeto,
    handleConvertFromProposta,
    handleUpdateProjeto,
    handleUpdateProjetoSituacao,
    handleDeleteProjeto,
  };
}
