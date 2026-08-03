import { useCallback, useMemo, useState } from 'react';
import { EdicaoObra, Projeto, ConversaoObraPayload } from '../types';
import { projetosService } from '../services/projetosService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useProjetos(ativo = true) {
  const { toast } = useFeedback();
  const [projetos, setProjetos] = useState<Projeto[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => projetosService.list(),
    aoChegar: setProjetos,
    aoLimpar: () => setProjetos([]),
    erro: 'Falha ao carregar projetos.',
  });

  const refreshProjetos = useCallback(
    () => projetosService.list().then(setProjetos).catch(avisoRefetch(toast, 'a lista de obras')),
    [toast]
  );

  // Atomic manual creation via fn_criar_projeto_manual — also creates the 5
  // default staggered etapas server-side in the same transaction, so this
  // reloads projetos afterward (the caller also refreshes cronograma).
  const handleCreateManualProjeto = useCallback(async (proj: Projeto): Promise<string | null> => {
    try {
      const { id } = await projetosService.createManual(proj);
      await refreshProjetos();
      return id;
    } catch (err: any) {
      toast.error('Falha ao criar projeto.', err.message);
      return null;
    }
  }, [refreshProjetos, toast]);

  // Wizard-driven conversion via fn_criar_projeto_from_proposta — persists the
  // reviewed orçamento/cronograma/vínculos server-side, then reloads projetos.
  const handleConvertFromProposta = useCallback(async (propostaId: string, payload: ConversaoObraPayload): Promise<string | null> => {
    try {
      const { id } = await projetosService.convertPropostaWithPayload(propostaId, payload);
      await refreshProjetos();
      return id;
    } catch (err: any) {
      toast.error('Falha ao converter proposta em obra.', err.message);
      return null;
    }
  }, [refreshProjetos, toast]);

  /**
   * Edição da obra. Recarrega a lista em vez de remendar o estado local porque
   * `responsavelInterno` é o nome resolvido a partir de `funcionarios` no
   * service — trocar o responsável sem recarregar deixaria o nome antigo na tela.
   */
  const handleUpdateProjeto = useCallback(async (id: string, patch: EdicaoObra): Promise<boolean> => {
    try {
      await projetosService.update(id, patch);
      await refreshProjetos();
      return true;
    } catch (err: any) {
      toast.error('Falha ao atualizar a obra.', err.message);
      return false;
    }
  }, [refreshProjetos, toast]);

  // Os dois writes otimistas abaixo devolvem se a escrita realmente aconteceu —
  // é o que permite à tela só confirmar depois do banco, em vez de anunciar
  // sucesso e desfazer o estado logo em seguida.
  const handleUpdateProjetoSituacao = useCallback(async (id: string, situacao: Projeto['situacao']): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setProjetos);
    aplicar((prev) => prev.map((p) => (p.id === id ? { ...p, situacao } : p)));
    try {
      await projetosService.updateSituacao(id, situacao);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar situação do projeto.', err.message);
      return false;
    }
  }, [toast]);

  const handleDeleteProjeto = useCallback(async (id: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setProjetos);
    aplicar((prev) => prev.filter((p) => p.id !== id));
    try {
      await projetosService.remove(id);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir projeto.', err.message);
      return false;
    }
  }, [toast]);

  return useMemo(() => ({
    projetos,
    loading,
    handleCreateManualProjeto,
    handleConvertFromProposta,
    handleUpdateProjeto,
    handleUpdateProjetoSituacao,
    handleDeleteProjeto,
  }), [projetos, loading, handleCreateManualProjeto, handleConvertFromProposta, handleUpdateProjeto, handleUpdateProjetoSituacao, handleDeleteProjeto]);
}
