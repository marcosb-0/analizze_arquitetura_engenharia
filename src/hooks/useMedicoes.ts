import { useEffect, useState } from 'react';
import { MedicaoObra } from '../types';
import { medicoesService } from '../services/medicoesService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useMedicoes() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [medicoes, setMedicoes] = useState<MedicaoObra[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setMedicoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    medicoesService
      .list()
      .then(setMedicoes)
      .catch((err) => toast.error('Falha ao carregar medições.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddMedicao = async (
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[]
  ) => {
    if (!session) return;
    try {
      const created = await medicoesService.add(med, fotos, session.user.id);
      setMedicoes((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao registrar medição.', err.message);
    }
  };

  return { medicoes, loading, handleAddMedicao };
}
