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

  const refreshMedicoes = () => medicoesService.list().then(setMedicoes).catch(() => {});

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

  // 'overrun' means the etapa would exceed 100% — the UI re-calls with
  // permitirOverrun=true after an explicit confirm.
  const handleAprovarMedicao = async (
    medicaoId: string,
    permitirOverrun = false
  ): Promise<'ok' | 'overrun' | 'error'> => {
    try {
      await medicoesService.aprovar(medicaoId, permitirOverrun);
      await refreshMedicoes();
      return 'ok';
    } catch (err: any) {
      if (!permitirOverrun && typeof err?.message === 'string' && err.message.includes('ultrapassar 100%')) {
        return 'overrun';
      }
      toast.error('Falha ao aprovar medição.', err.message);
      return 'error';
    }
  };

  const handleRejeitarMedicao = async (medicaoId: string): Promise<boolean> => {
    try {
      await medicoesService.rejeitar(medicaoId);
      await refreshMedicoes();
      return true;
    } catch (err: any) {
      toast.error('Falha ao rejeitar medição.', err.message);
      return false;
    }
  };

  return { medicoes, loading, handleAddMedicao, handleAprovarMedicao, handleRejeitarMedicao, refreshMedicoes };
}
