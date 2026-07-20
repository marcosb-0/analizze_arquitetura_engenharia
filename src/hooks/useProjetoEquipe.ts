import { useEffect, useState } from 'react';
import { Acesso, ProjetoEquipeMembro } from '../types';
import { projetoEquipeService } from '../services/projetoEquipeService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useProjetoEquipe() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [projetoEquipe, setProjetoEquipe] = useState<ProjetoEquipeMembro[]>([]);
  const [perfisCampo, setPerfisCampo] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
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
  }, [session?.user.id]);

  const handleAddMembro = async (projetoId: string, profileId: string, papel: string) => {
    try {
      const created = await projetoEquipeService.add(projetoId, profileId, papel);
      setProjetoEquipe((prev) => [...prev, created]);
    } catch (err: any) {
      toast.error('Falha ao conceder acesso à obra.', err.message);
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

  return { projetoEquipe, perfisCampo, loading, handleAddMembro, handleRemoveMembro };
}
