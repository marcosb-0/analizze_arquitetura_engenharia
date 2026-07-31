import { useState } from 'react';
import { Acesso, ProjetoEquipeMembro } from '../types';
import { projetoEquipeService } from '../services/projetoEquipeService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useProjetoEquipe(ativo = true) {
  const { toast } = useFeedback();
  const [projetoEquipe, setProjetoEquipe] = useState<ProjetoEquipeMembro[]>([]);
  const [perfisCampo, setPerfisCampo] = useState<Acesso[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => Promise.all([projetoEquipeService.list(), projetoEquipeService.listPerfisCampo()]),
    aoChegar: ([equipe, perfis]) => {
      setProjetoEquipe(equipe);
      setPerfisCampo(perfis);
    },
    aoLimpar: () => {
      setProjetoEquipe([]);
      setPerfisCampo([]);
    },
    erro: 'Falha ao carregar equipe das obras.',
  });

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
