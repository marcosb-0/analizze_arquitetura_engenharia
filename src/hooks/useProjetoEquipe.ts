import { useEffect, useState } from 'react';
import { Acesso, ProjetoEquipeMembro } from '../types';
import { projetoEquipeService } from '../services/projetoEquipeService';
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
export function useProjetoEquipe(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [projetoEquipe, setProjetoEquipe] = useState<ProjetoEquipeMembro[]>([]);
  const [perfisCampo, setPerfisCampo] = useState<Acesso[]>([]);
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
      setProjetoEquipe([]);
      setPerfisCampo([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => Promise.all([projetoEquipeService.list(), projetoEquipeService.listPerfisCampo()]),
      ([equipe, perfis]) => {
        setProjetoEquipe(equipe);
        setPerfisCampo(perfis);
      },
      (err) => toast.error('Falha ao carregar equipe das obras.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  const handleAddMembro = async (projetoId: string, profileId: string, papel: string): Promise<boolean> => {
    try {
      const created = await projetoEquipeService.add(projetoId, profileId, papel);
      setProjetoEquipe((prev) => [...prev, created]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao conceder acesso à obra.', err.message);
      return false;
    }
  };

  const handleRemoveMembro = async (id: string) => {
    const { aplicar, desfazer } = comRollback(setProjetoEquipe);
    aplicar((prev) => prev.filter((m) => m.id !== id));
    try {
      await projetoEquipeService.remove(id);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover acesso à obra.', err.message);
    }
  };

  const refreshProjetoEquipe = () => projetoEquipeService.list().then(setProjetoEquipe).catch(avisoRefetch(toast, 'a equipe da obra'));

  return { projetoEquipe, perfisCampo, loading, handleAddMembro, handleRemoveMembro, refreshProjetoEquipe };
}
