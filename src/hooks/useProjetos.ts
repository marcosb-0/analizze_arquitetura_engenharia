import { useEffect, useState } from 'react';
import { EdicaoObra, Projeto, ConversaoObraPayload } from '../types';
import { projetosService } from '../services/projetosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

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
export function useProjetos(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [projetos, setProjetos] = useState<Projeto[]>([]);
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
      setProjetos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => projetosService.list(),
      setProjetos,
      (err) => toast.error('Falha ao carregar projetos.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  const refreshProjetos = () => projetosService.list().then(setProjetos).catch(avisoRefetch(toast, 'a lista de obras'));

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
  };

  const handleDeleteProjeto = async (id: string): Promise<boolean> => {
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
