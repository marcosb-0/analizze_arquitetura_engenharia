import { useEffect, useState } from 'react';
import { Acesso, ProjetoEquipeMembro } from '../types';
import { projetoEquipeService } from '../services/projetoEquipeService';
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
export function useProjetoEquipe(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [projetoEquipe, setProjetoEquipe] = useState<ProjetoEquipeMembro[]>([]);
  const [perfisCampo, setPerfisCampo] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !ativo) {
      setProjetoEquipe([]);
      setPerfisCampo([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([projetoEquipeService.list(), projetoEquipeService.listPerfisCampo()])
      .then(([equipe, perfis]) => {
        setProjetoEquipe(equipe);
        setPerfisCampo(perfis);
      })
      .catch((err) => toast.error('Falha ao carregar equipe das obras.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, ativo]);

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
    const previous = projetoEquipe;
    setProjetoEquipe((prev) => prev.filter((m) => m.id !== id));
    try {
      await projetoEquipeService.remove(id);
    } catch (err: any) {
      setProjetoEquipe(previous);
      toast.error('Falha ao remover acesso à obra.', err.message);
    }
  };

  const refreshProjetoEquipe = () => projetoEquipeService.list().then(setProjetoEquipe).catch(() => {});

  return { projetoEquipe, perfisCampo, loading, handleAddMembro, handleRemoveMembro, refreshProjetoEquipe };
}
